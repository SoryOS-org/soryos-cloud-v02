/**
 * @soryos/jobs
 * Shared middleware functions for Inngest job processing.
 * 
 * Includes:
 * - OCC (Optimistic Concurrency Control) retry mechanism
 * - Session status updates
 * - Message management
 * - Error handling utilities
 */

import { Id } from '@soryos/schema';
import { JobData } from './types';

/**
 * Retry a function with exponential backoff for OCC failures
 */
export async function retryMutation<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 100
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if it's an OCC failure
      if (error?.message?.includes('OptimisticConcurrencyControlFailure') ||
          error?.code === 'OptimisticConcurrencyControlFailure') {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.log(`[OCC] Conflict detected, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Not an OCC error, throw immediately
      throw error;
    }
  }

  throw lastError;
}

/**
 * Update session status with OCC retry
 */
export async function updateSessionStatus(
  sessionId: string | Id<'sessions'>,
  status: string,
  statusMessage?: string,
  tunnelUrl?: string,
  sandboxId?: string
): Promise<void> {
  // Import here to avoid circular dependencies
  const { SessionStore } = await import('@soryos/session');

  await retryMutation(async () => {
    await SessionStore.update(sessionId as string, {
      status,
      statusMessage,
      tunnelUrl,
      sandboxId,
      updatedAt: Date.now()
    });
  });

  // Send real-time event
  sendSandboxEvent(sessionId as string, {
    type: 'sandbox.status.changed',
    status,
    statusMessage,
    tunnelUrl,
    sandboxId
  });
}

/**
 * Add a message to the session with OCC retry
 */
export async function addMessage(
  sessionId: string | Id<'sessions'>,
  content: string,
  role: 'user' | 'assistant',
  additionalData?: Record<string, unknown>,
  createdAt?: number
): Promise<string> {
  // Import here to avoid circular dependencies
  const { MessageStore } = await import('@soryos/session');

  const messageId = await retryMutation(async () => {
    return await MessageStore.add({
      sessionId: sessionId as string,
      content,
      role,
      ...additionalData,
      createdAt: createdAt ?? Date.now()
    });
  });

  // Send real-time event
  sendSandboxEvent(sessionId as string, {
    type: 'sandbox.message.added',
    messageId,
    content,
    role,
    ...additionalData
  });

  return messageId;
}

/**
 * Update an existing message
 */
export async function updateMessage(
  messageId: string,
  content: string,
  additionalData?: Record<string, unknown>
): Promise<void> {
  // Import here to avoid circular dependencies
  const { MessageStore } = await import('@soryos/session');

  await retryMutation(async () => {
    await MessageStore.update(messageId, {
      content,
      ...additionalData,
      updatedAt: Date.now()
    });
  });

  // Send real-time event
  sendSandboxEventFromMessage(messageId, {
    type: 'sandbox.message.updated',
    content,
    ...additionalData
  });
}

/**
 * Get session data
 */
export async function getSessionData(sessionId: string | Id<'sessions'>): Promise<Record<string, unknown> | null> {
  // Import here to avoid circular dependencies
  const { SessionStore } = await import('@soryos/session');
  return await SessionStore.get(sessionId as string);
}

/**
 * Get all messages for a session
 */
export async function getSessionMessages(sessionId: string | Id<'sessions'>): Promise<Array<Record<string, unknown>>> {
  // Import here to avoid circular dependencies
  const { MessageStore } = await import('@soryos/session');
  return await MessageStore.getBySession(sessionId as string);
}

/**
 * Send a sandbox event to the global event bus
 */
export function sendSandboxEvent(sessionId: string, data: Record<string, unknown>): void {
  try {
    // Import here to avoid circular dependencies
    import('@soryos/bus').then(({ GlobalEventBus }) => {
      GlobalEventBus.emit('sandbox.event', {
        sessionId,
        ...data,
        timestamp: Date.now()
      });
    });
  } catch (error) {
    console.error('[Jobs] Error sending sandbox event:', error);
  }
}

/**
 * Send a sandbox event from a message
 */
export function sendSandboxEventFromMessage(messageId: string, data: Record<string, unknown>): void {
  try {
    // Import here to avoid circular dependencies
    import('@soryos/bus').then(({ GlobalEventBus }) => {
      import('@soryos/session').then(({ MessageStore }) => {
        MessageStore.get(messageId).then(message => {
          if (message) {
            GlobalEventBus.emit('sandbox.event', {
              sessionId: message.sessionId,
              messageId,
              ...data,
              timestamp: Date.now()
            });
          }
        });
      });
    });
  } catch (error) {
    console.error('[Jobs] Error sending message event:', error);
  }
}

/**
 * Send push notification when app is ready
 */
export async function sendAppReadyNotification(sessionId: string, tunnelUrl: string): Promise<void> {
  try {
    const session = await getSessionData(sessionId);
    if (!session) return;

    const sessionName = (session as any).name || 'Your app';

    // Import here to avoid circular dependencies
    const { NotificationService } = await import('@soryos/web/lib/services/notifications');
    
    await NotificationService.send({
      userId: (session as any).createdBy,
      title: 'App Ready! 🚀',
      body: `Your app "${sessionName}" is ready to preview. Tap to open it.`,
      data: {
        type: 'app_ready',
        sessionId,
        sessionName,
        tunnelUrl
      }
    });

    console.log(`[Jobs] App ready notification sent for session ${sessionId}`);
  } catch (error) {
    console.error('[Jobs] Failed to send app ready notification:', error);
    // Don't throw - notification failure shouldn't break the session
  }
}

/**
 * Sanitize error messages to remove sensitive information
 */
export function sanitizeError(errorMessage: string): string {
  const secretPatterns = [
    /sk-ant-[a-zA-Z0-9-]+/g,           // Anthropic API keys
    /sk-[a-zA-Z0-9-]{20,}/g,           // Stripe API keys
    /ctx7sk-[a-zA-Z0-9-]+/g,           // Context7 API keys
    /ghp_[a-zA-Z0-9]+/g,               // GitHub personal access tokens
    /gho_[a-zA-Z0-9]+/g,               // GitHub OAuth tokens
    /xai-[a-zA-Z0-9-]+/g,              // xAI API keys
    /Bearer\s+[a-zA-Z0-9._-]+/gi,      // Bearer tokens
    /Authorization:\s*[^\s,}]+/gi,    // Authorization headers
    /api[_-]?key["\s:=]+[a-zA-Z0-9._-]+/gi, // Generic API keys
    /token["\s:=]+[a-zA-Z0-9._-]+/gi,       // Generic tokens
    /secret["\s:=]+[a-zA-Z0-9._-]+/gi,       // Generic secrets
    /password["\s:=]+[^\s,}]+/gi,           // Passwords
    /atk_[a-zA-Z0-9._-]+/gi,              // Generic tokens
    /https?:\/\/[a-zA-Z0-9-]+\.ngrok[a-zA-Z0-9.-]*\.[a-z]+[^\s'"]*/gi, // Ngrok URLs
    /ngrok[a-zA-Z0-9.-]*\.[a-z]+/gi,        // Ngrok domains
  ];

  let sanitized = errorMessage;
  for (const pattern of secretPatterns) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  
  return sanitized;
}

/**
 * Check if an error is a timeout error
 */
export function isTimeoutError(error: Error | string): boolean {
  const errorMessage = typeof error === 'string' ? error : error.message;
  return errorMessage.includes('FUNCTION_INVOCATION_TIMEOUT') ||
         errorMessage.includes('timeout') ||
         errorMessage.includes('Timeout') ||
         errorMessage.includes('timed out') ||
         errorMessage.includes('ETIMEDOUT') ||
         errorMessage.includes('deadline exceeded');
}

/**
 * Check if an error is a sandbox termination error
 */
export function isSandboxTerminatedError(error: Error | string): boolean {
  const errorMessage = typeof error === 'string' ? error : error.message;
  return errorMessage.includes('terminated') ||
         errorMessage.includes('[unknown]') ||
         errorMessage.includes('SandboxError') ||
         errorMessage.includes('unavailable') ||
         errorMessage.includes('sandbox not found');
}

/**
 * Parse streaming JSON output from AI agents
 */
export function parseStreamingJson(
  data: string,
  callback: (parsed: Record<string, unknown>) => void
): void {
  // This function would be used to parse newline-delimited JSON
  // Implementation depends on the specific streaming format
  
  // For now, this is a placeholder
  try {
    const parsed = JSON.parse(data);
    callback(parsed);
  } catch {
    // Not valid JSON, ignore
  }
}
