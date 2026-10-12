/**
 * @soryos/jobs
 * Inngest Client Configuration - REAL IMPLEMENTATION
 * 
 * Based on Vibra Code's Inngest setup
 * Provides background job processing for SoryOS-Cloud
 */

import { Inngest } from 'inngest';

// Initialize Inngest client
// This is the main client used for sending events and defining functions
const inngest = new Inngest({
  id: 'soryos-cloud',
  eventKey: process.env.INNGEST_EVENT_KEY,
  baseUrl: process.env.INNGEST_BASE_URL,
  // Enable dev mode in development
  isDev: process.env.NODE_ENV === 'development',
});

// Re-export the client
export { inngest };

// Export Inngest types for TypeScript support
export type { InngestFunction, ServeHandler } from 'inngest';

// Helper to send events
export function sendEvent(event: {
  name: string;
  data: Record<string, any>;
  user?: { id: string; email?: string };
}) {
  return inngest.send(event as any);
}

// Helper to send events with retry
export async function sendEventWithRetry(
  event: {
    name: string;
    data: Record<string, any>;
    user?: { id: string; email?: string };
  },
  maxRetries: number = 3,
  baseDelayMs: number = 100
): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await inngest.send(event as any);
      return;
    } catch (error) {
      if (attempt === maxRetries - 1) {
        console.error(`Failed to send event after ${maxRetries} attempts:`, error);
        throw error;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.log(`Event send failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
