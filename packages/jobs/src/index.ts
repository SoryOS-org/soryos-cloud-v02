/**
 * @soryos/jobs
 * Inngest job queue integration for SoryOS Code.
 * 
 * This package provides background job processing using Inngest,
 * enabling reliable, scalable, and retriable job execution.
 */

// Re-export everything
export * from './client';
export * from './middleware';
export * from './types';
export * from './queue';

// Export job functions (will be imported dynamically)
export * from './functions/create-session';
export * from './functions/run-agent';
export * from './functions/push-to-github';

// Job registry
import { getInngest } from './client';

/**
 * Initialize the jobs package
 */
export function initializeJobs(): void {
  // This can be used to register all job functions
  // For now, we'll let Inngest auto-discover functions
  const inngest = getInngest();
  console.log('[Jobs] Inngest client initialized');
}

/**
 * Health check for the jobs system
 */
export async function checkJobsHealth(): Promise<{
  inngest: boolean;
  timestamp: number;
}> {
  const inngestHealth = await import('./client').then(m => m.checkInngestHealth());
  
  return {
    inngest: inngestHealth,
    timestamp: Date.now()
  };
}
