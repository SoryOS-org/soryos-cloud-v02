/**
 * @soryos/jobs
 * Types for Inngest job queue integration.
 */

import { Id } from '@soryos/schema';

/**
 * Inngest event types for SoryOS Code
 */
export type JobEventType =
  | 'soryos/create.session'
  | 'soryos/run.agent'
  | 'soryos/push.github'
  | 'soryos/generate.image'
  | 'soryos/generate.audio'
  | 'soryos/generate.video'
  | 'soryos/destroy.session';

/**
 * Base job data interface
 */
export interface JobData {
  sessionId: string;
  id?: Id<'sessions'>;
  timestamp?: number;
}

/**
 * Create session job data
 */
export interface CreateSessionJobData extends JobData {
  message?: string;
  repository?: string;
  token?: string;
  template?: string;
  providerId?: string;
}

/**
 * Run agent job data
 */
export interface RunAgentJobData extends JobData {
  message: string;
  template?: string;
  repository?: string;
  token?: string;
  model?: string;
  provider?: string;
}

/**
 * Push to GitHub job data
 */
export interface PushToGitHubJobData extends JobData {
  convexId: Id<'sessions'>;
  repository: string;
  isInitialPush: boolean;
}

/**
 * Job result interface
 */
export interface JobResult {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

/**
 * Inngest step context
 */
export interface StepContext {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
}

/**
 * Inngest function context
 */
export interface JobContext {
  event: {
    name: JobEventType;
    data: JobData;
  };
  step: StepContext;
}

/**
 * Retry configuration for jobs
 */
export interface JobConfig {
  id: string;
  retries?: number;
  concurrency?: number;
  onFailure?: (context: { error: Error; event: { data: JobData } }) => Promise<void>;
}

/**
 * Message data for streaming
 */
export interface StreamingMessage {
  type: 'text' | 'tool' | 'result' | 'init' | 'error';
  content?: string;
  role?: 'user' | 'assistant';
  delta?: boolean;
  toolName?: string;
  toolCall?: any;
  result?: any;
  status?: string;
  timestamp?: number;
}

/**
 * Cost tracking data
 */
export interface CostData {
  sessionId: string;
  messageId?: string;
  costUSD: number;
  model: string;
  provider: string;
  inputTokens?: number;
  outputTokens?: number;
  timestamp: number;
}
