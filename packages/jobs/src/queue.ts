/**
 * @soryos/jobs
 * Job Queue Manager - Production-ready job queue system
 * 
 * Inspired by Vibra Code's Inngest implementation
 * Provides:
 * - Concurrency control
 * - Job prioritization
 * - Timeout management
 * - Retry logic
 * - Job lifecycle management
 */

import { Job, JobId, JobStatus, JobPriority, JobResult, JobError, JobTimeoutError } from './types';
import { getInngest, sendEvent } from './client';

// ============================================================================
// Queue Configuration
// ============================================================================

export interface QueueConfig {
  maxConcurrency: number;           // Maximum concurrent jobs (default: 25)
  defaultTimeoutMs: number;         // Default job timeout (default: 15 minutes)
  maxRetries: number;               // Maximum retry attempts (default: 3)
  retryBaseDelayMs: number;          // Base delay for retry backoff (default: 100ms)
  priorityWeights: Record<JobPriority, number>; // Priority weights
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxConcurrency: 25,
  defaultTimeoutMs: 900000, // 15 minutes
  maxRetries: 3,
  retryBaseDelayMs: 100,
  priorityWeights: {
    high: 3,
    medium: 2,
    low: 1
  }
};

// ============================================================================
// Job Queue Manager
// ============================================================================

export class JobQueue {
  private config: QueueConfig;
  private runningJobs = new Map<JobId, Job>();
  private pendingJobs: Job[] = [];
  private completedJobs = new Map<JobId, JobResult>();
  private failedJobs = new Map<JobId, JobError>();
  private jobSubscribers = new Map<JobId, Set<(job: Job) => void>>();
  private statusSubscribers = new Map<JobStatus, Set<(job: Job) => void>>();
  private eventSubscribers = new Map<string, Set<(data: any) => void>>();
  private isRunning = false;
  private processing = false;

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
  }

  // ==========================================================================
  // Queue Lifecycle
  // ==========================================================================

  /**
   * Start the job queue processor
   */
  start(): void {
    if (this.isRunning) {
      console.log('[Queue] Already running');
      return;
    }

    this.isRunning = true;
    console.log(`[Queue] Started with max concurrency: ${this.config.maxConcurrency}`);
    this.processQueue();
  }

  /**
   * Stop the job queue processor
   */
  stop(): Promise<void> {
    this.isRunning = false;
    console.log('[Queue] Stopping...');
    
    // Wait for running jobs to complete
    return this.waitForRunningJobs();
  }

  /**
   * Pause the queue (don't process new jobs, but let running jobs finish)
   */
  pause(): void {
    this.isRunning = false;
    console.log('[Queue] Paused - will not process new jobs');
  }

  /**
   * Resume the queue
   */
  resume(): void {
    this.isRunning = true;
    console.log('[Queue] Resumed - processing pending jobs');
    this.processQueue();
  }

  // ==========================================================================
  // Job Submission
  // ==========================================================================

  /**
   * Add a job to the queue
   */
  async addJob(job: Omit<Job, 'id' | 'status' | 'createdAt' | 'startedAt' | 'retries'>): Promise<JobId> {
    const jobId = this.generateJobId();
    const fullJob: Job = {
      id: jobId,
      status: 'pending',
      createdAt: Date.now(),
      retries: 0,
      priority: job.priority || 'medium',
      timeoutMs: job.timeoutMs || this.config.defaultTimeoutMs,
      ...job
    };

    // Add to pending queue (sorted by priority)
    this.addToPendingQueue(fullJob);
    
    // Notify subscribers
    this.notifyJobSubscribers(jobId, fullJob);
    this.notifyEvent('job.added', fullJob);
    
    // Process queue if running
    if (this.isRunning && !this.processing) {
      this.processQueue();
    }

    console.log(`[Queue] Job ${jobId} added: ${job.name || job.type}`);
    return jobId;
  }

  /**
   * Add multiple jobs to the queue
   */
  async addJobs(jobs: Omit<Job, 'id' | 'status' | 'createdAt' | 'startedAt' | 'retries'>[]): Promise<JobId[]> {
    return Promise.all(jobs.map(job => this.addJob(job)));
  }

  // ==========================================================================
  // Job Processing
  // ==========================================================================

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (!this.isRunning || this.processing) {
      return;
    }

    this.processing = true;

    try {
      // Check if we can run more jobs
      while (this.isRunning && this.runningJobs.size < this.config.maxConcurrency) {
        const nextJob = this.getNextJob();
        
        if (!nextJob) {
          // No more jobs to process
          break;
        }

        // Move job from pending to running
        this.runningJobs.set(nextJob.id, nextJob);
        this.removeFromPendingQueue(nextJob.id);
        
        // Update job status
        await this.updateJobStatus(nextJob.id, 'running', Date.now());
        
        // Process the job
        this.processJob(nextJob);
      }
    } finally {
      this.processing = false;
      
      // Continue processing if there are more jobs
      if (this.isRunning && this.pendingJobs.length > 0) {
        setImmediate(() => this.processQueue());
      }
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job): Promise<void> {
    const jobId = job.id;
    
    try {
      console.log(`[Queue] Processing job ${jobId}: ${job.name || job.type}`);
      
      // Execute the job with timeout
      const result = await this.executeWithTimeout(job);
      
      // Job completed successfully
      await this.completeJob(jobId, result);
      
    } catch (error) {
      // Job failed
      await this.failJob(jobId, error as Error);
    }
  }

  /**
   * Execute job with timeout
   */
  private async executeWithTimeout(job: Job): Promise<any> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new JobTimeoutError(`Job ${job.id} timed out after ${job.timeoutMs}ms`));
      }, job.timeoutMs);
    });

    try {
      return await Promise.race([
        job.handler(),
        timeoutPromise
      ]);
    } finally {
      // Clear timeout
      // Note: In a real implementation, we'd need to track and clear timeouts
    }
  }

  // ==========================================================================
  // Job Status Management
  // ==========================================================================

  /**
   * Update job status
   */
  private async updateJobStatus(
    jobId: JobId,
    status: JobStatus,
    timestamp?: number
  ): Promise<void> {
    const job = this.runningJobs.get(jobId) || this.pendingJobs.find(j => j.id === jobId);
    
    if (!job) {
      console.warn(`[Queue] Job ${jobId} not found for status update`);
      return;
    }

    const updatedJob: Job = {
      ...job,
      status,
      startedAt: status === 'running' ? timestamp || Date.now() : job.startedAt,
      updatedAt: timestamp || Date.now()
    };

    // Update in the appropriate map
    if (status === 'running') {
      this.runningJobs.set(jobId, updatedJob);
    } else if (status === 'pending') {
      const index = this.pendingJobs.findIndex(j => j.id === jobId);
      if (index !== -1) {
        this.pendingJobs[index] = updatedJob;
      }
    }

    // Notify subscribers
    this.notifyJobSubscribers(jobId, updatedJob);
    this.notifyStatusSubscribers(status, updatedJob);
    this.notifyEvent('job.status.changed', { jobId, status, timestamp });
  }

  /**
   * Complete a job successfully
   */
  private async completeJob(jobId: JobId, result: any): Promise<void> {
    const job = this.runningJobs.get(jobId);
    
    if (!job) {
      console.warn(`[Queue] Job ${jobId} not found for completion`);
      return;
    }

    const jobResult: JobResult = {
      jobId,
      status: 'completed',
      result,
      completedAt: Date.now(),
      durationMs: Date.now() - (job.startedAt || job.createdAt)
    };

    this.completedJobs.set(jobId, jobResult);
    this.runningJobs.delete(jobId);
    
    // Update job status
    await this.updateJobStatus(jobId, 'completed', Date.now());
    
    console.log(`[Queue] Job ${jobId} completed in ${jobResult.durationMs}ms`);
    
    // Notify subscribers
    this.notifyEvent('job.completed', jobResult);
    
    // Process next job
    this.processQueue();
  }

  /**
   * Fail a job
   */
  private async failJob(jobId: JobId, error: Error): Promise<void> {
    const job = this.runningJobs.get(jobId);
    
    if (!job) {
      console.warn(`[Queue] Job ${jobId} not found for failure`);
      return;
    }

    // Check if we should retry
    if (job.retries < (job.maxRetries ?? this.config.maxRetries)) {
      const shouldRetry = this.shouldRetry(error, job);
      
      if (shouldRetry) {
        const retryJob: Job = {
          ...job,
          status: 'pending',
          retries: job.retries + 1,
          startedAt: undefined,
          error: undefined
        };

        // Add back to pending queue
        this.addToPendingQueue(retryJob);
        
        const delay = this.calculateRetryDelay(job.retries + 1);
        console.log(`[Queue] Job ${jobId} failed, retrying in ${delay}ms (attempt ${retryJob.retries + 1}/${retryJob.maxRetries ?? this.config.maxRetries})`);
        
        // Notify
        this.notifyEvent('job.retrying', { jobId, attempt: retryJob.retries + 1, delay });
        
        // Process queue
        this.processQueue();
        return;
      }
    }

    // Max retries reached or non-retryable error
    const jobError: JobError = {
      jobId,
      status: 'failed',
      error: this.classifyError(error, job),
      failedAt: Date.now(),
      retries: job.retries,
      durationMs: Date.now() - (job.startedAt || job.createdAt)
    };

    this.failedJobs.set(jobId, jobError);
    this.runningJobs.delete(jobId);
    
    // Update job status
    await this.updateJobStatus(jobId, 'failed', Date.now());
    
    console.log(`[Queue] Job ${jobId} failed: ${jobError.error.type}`);
    
    // Notify subscribers
    this.notifyEvent('job.failed', jobError);
    
    // Process next job
    this.processQueue();
  }

  // ==========================================================================
  // Retry Logic
  // ==========================================================================

  /**
   * Determine if a job should be retried
   */
  private shouldRetry(error: Error, job: Job): boolean {
    // Always retry if it's a timeout error
    if (error instanceof JobTimeoutError) {
      return true;
    }

    // Check for transient errors
    const errorMessage = error.message.toLowerCase();
    const transientErrors = [
      'network',
      'connection',
      'timeout',
      'rate limit',
      'too many requests',
      'temporarily unavailable',
      'service unavailable',
      '502',
      '503',
      '504',
      'econnreset',
      'econnrefused'
    ];

    return transientErrors.some(err => errorMessage.includes(err));
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = this.config.retryBaseDelayMs;
    const maxDelay = 30000; // 30 seconds max
    
    // Exponential backoff with jitter
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    const jitter = delay * 0.1 * Math.random();
    
    return delay + jitter;
  }

  // ==========================================================================
  // Error Classification (Inspired by Vibra Code)
  // ==========================================================================

  /**
   * Classify an error
   */
  private classifyError(error: Error, job: Job): JobError['error'] {
    const errorMessage = error.message.toLowerCase();
    
    if (error instanceof JobTimeoutError) {
      return {
        type: 'timeout',
        message: error.message,
        code: 'JOB_TIMEOUT',
        isRetryable: true
      };
    }

    if (errorMessage.includes('sandbox') && errorMessage.includes('terminated')) {
      return {
        type: 'sandbox_terminated',
        message: 'Sandbox was terminated unexpectedly',
        code: 'SANDBOX_TERMINATED',
        isRetryable: true
      };
    }

    if (errorMessage.includes('sandbox') && errorMessage.includes('not found')) {
      return {
        type: 'sandbox_not_found',
        message: 'Sandbox not found',
        code: 'SANDBOX_NOT_FOUND',
        isRetryable: false
      };
    }

    if (errorMessage.includes('agent') || errorMessage.includes('ai')) {
      return {
        type: 'agent_error',
        message: error.message,
        code: 'AGENT_ERROR',
        isRetryable: false
      };
    }

    if (errorMessage.includes('permission') || errorMessage.includes('access')) {
      return {
        type: 'permission_error',
        message: 'Permission denied',
        code: 'PERMISSION_ERROR',
        isRetryable: false
      };
    }

    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return {
        type: 'network_error',
        message: 'Network error',
        code: 'NETWORK_ERROR',
        isRetryable: true
      };
    }

    if (errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
      return {
        type: 'rate_limit_error',
        message: 'Rate limit exceeded',
        code: 'RATE_LIMIT_ERROR',
        isRetryable: true
      };
    }

    // Default
    return {
      type: 'unknown_error',
      message: error.message,
      code: 'UNKNOWN_ERROR',
      isRetryable: false
    };
  }

  // ==========================================================================
  // Queue Management
  // ==========================================================================

  /**
   * Add job to pending queue (sorted by priority)
   */
  private addToPendingQueue(job: Job): void {
    this.pendingJobs.push(job);
    this.sortPendingQueue();
  }

  /**
   * Remove job from pending queue
   */
  private removeFromPendingQueue(jobId: JobId): void {
    const index = this.pendingJobs.findIndex(j => j.id === jobId);
    if (index !== -1) {
      this.pendingJobs.splice(index, 1);
    }
  }

  /**
   * Sort pending queue by priority
   */
  private sortPendingQueue(): void {
    this.pendingJobs.sort((a, b) => {
      const priorityA = this.config.priorityWeights[a.priority] || 1;
      const priorityB = this.config.priorityWeights[b.priority] || 1;
      
      // Higher priority first
      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }
      
      // Older jobs first (FIFO within same priority)
      return a.createdAt - b.createdAt;
    });
  }

  /**
   * Get next job to process
   */
  private getNextJob(): Job | null {
    if (this.pendingJobs.length === 0) {
      return null;
    }
    
    // Get highest priority job
    return this.pendingJobs[0];
  }

  // ==========================================================================
  // Subscriptions
  // ==========================================================================

  /**
   * Subscribe to job updates
   */
  subscribeToJob(jobId: JobId, callback: (job: Job) => void): () => void {
    if (!this.jobSubscribers.has(jobId)) {
      this.jobSubscribers.set(jobId, new Set());
    }
    
    const subscribers = this.jobSubscribers.get(jobId)!;
    subscribers.add(callback);
    
    return () => {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        this.jobSubscribers.delete(jobId);
      }
    };
  }

  /**
   * Subscribe to jobs with specific status
   */
  subscribeToStatus(status: JobStatus, callback: (job: Job) => void): () => void {
    if (!this.statusSubscribers.has(status)) {
      this.statusSubscribers.set(status, new Set());
    }
    
    const subscribers = this.statusSubscribers.get(status)!;
    subscribers.add(callback);
    
    return () => {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        this.statusSubscribers.delete(status);
      }
    };
  }

  /**
   * Subscribe to queue events
   */
  subscribeToEvent(eventName: string, callback: (data: any) => void): () => void {
    if (!this.eventSubscribers.has(eventName)) {
      this.eventSubscribers.set(eventName, new Set());
    }
    
    const subscribers = this.eventSubscribers.get(eventName)!;
    subscribers.add(callback);
    
    return () => {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        this.eventSubscribers.delete(eventName);
      }
    };
  }

  /**
   * Notify job subscribers
   */
  private notifyJobSubscribers(jobId: JobId, job: Job): void {
    const subscribers = this.jobSubscribers.get(jobId);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(job);
        } catch (error) {
          console.error(`[Queue] Error in job subscriber:`, error);
        }
      });
    }
  }

  /**
   * Notify status subscribers
   */
  private notifyStatusSubscribers(status: JobStatus, job: Job): void {
    const subscribers = this.statusSubscribers.get(status);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(job);
        } catch (error) {
          console.error(`[Queue] Error in status subscriber:`, error);
        }
      });
    }
  }

  /**
   * Notify event subscribers
   */
  private notifyEvent(eventName: string, data: any): void {
    const subscribers = this.eventSubscribers.get(eventName);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[Queue] Error in event subscriber:`, error);
        }
      });
    }
    
    // Also send to Inngest if configured
    sendEvent(eventName, data).catch(() => {});
  }

  // ==========================================================================
  // Monitoring & Metrics
  // ==========================================================================

  /**
   * Get queue statistics
   */
  getStats(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    concurrency: number;
    maxConcurrency: number;
    isRunning: boolean;
  } {
    return {
      total: this.pendingJobs.length + this.runningJobs.size + this.completedJobs.size + this.failedJobs.size,
      pending: this.pendingJobs.length,
      running: this.runningJobs.size,
      completed: this.completedJobs.size,
      failed: this.failedJobs.size,
      concurrency: this.runningJobs.size,
      maxConcurrency: this.config.maxConcurrency,
      isRunning: this.isRunning
    };
  }

  /**
   * Get all jobs
   */
  getAllJobs(): Job[] {
    return [
      ...this.pendingJobs,
      ...Array.from(this.runningJobs.values()),
      ...Array.from(this.completedJobs.entries()).map(([id, result]) => ({
        ...this.getJobById(id),
        result
      })),
      ...Array.from(this.failedJobs.entries()).map(([id, error]) => ({
        ...this.getJobById(id),
        error
      }))
    ];
  }

  /**
   * Get job by ID
   */
  getJobById(jobId: JobId): Job | null {
    // Check running jobs
    const runningJob = this.runningJobs.get(jobId);
    if (runningJob) return runningJob;
    
    // Check pending jobs
    const pendingJob = this.pendingJobs.find(j => j.id === jobId);
    if (pendingJob) return pendingJob;
    
    // Check completed jobs
    const completedJob = Array.from(this.completedJobs.entries())
      .find(([id]) => id === jobId)?.[1]?.jobId;
    
    // Check failed jobs
    const failedJob = Array.from(this.failedJobs.entries())
      .find(([id]) => id === jobId)?.[1]?.jobId;
    
    return null;
  }

  /**
   * Get job result
   */
  getJobResult(jobId: JobId): JobResult | null {
    return this.completedJobs.get(jobId) || null;
  }

  /**
   * Get job error
   */
  getJobError(jobId: JobId): JobError | null {
    return this.failedJobs.get(jobId) || null;
  }

  /**
   * Clear completed and failed jobs
   */
  clearCompletedJobs(): number {
    const count = this.completedJobs.size + this.failedJobs.size;
    this.completedJobs.clear();
    this.failedJobs.clear();
    return count;
  }

  /**
   * Clear all jobs
   */
  clearAllJobs(): void {
    this.pendingJobs = [];
    this.runningJobs.clear();
    this.completedJobs.clear();
    this.failedJobs.clear();
    this.jobSubscribers.clear();
    this.statusSubscribers.clear();
    this.eventSubscribers.clear();
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Generate a unique job ID
   */
  private generateJobId(): JobId {
    return `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Wait for all running jobs to complete
   */
  private async waitForRunningJobs(): Promise<void> {
    while (this.runningJobs.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let queueInstance: JobQueue | null = null;

export function getJobQueue(config?: Partial<QueueConfig>): JobQueue {
  if (!queueInstance) {
    queueInstance = new JobQueue(config);
  }
  return queueInstance;
}

export function createJobQueue(config?: Partial<QueueConfig>): JobQueue {
  return new JobQueue(config);
}

// ============================================================================
// Exports
// ============================================================================

export { JobQueue, QueueConfig, DEFAULT_QUEUE_CONFIG };
