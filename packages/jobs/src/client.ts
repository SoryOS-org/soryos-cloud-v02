/**
 * @soryos/jobs
 * Inngest client configuration for SoryOS Code job queue.
 */

import { Inngest } from 'inngest';

/**
 * Inngest client singleton
 */
let inngestClient: Inngest | null = null;

/**
 * Get or create the Inngest client instance
 */
export function getInngest(): Inngest {
  if (!inngestClient) {
    if (!process.env.INNGEST_EVENT_KEY) {
      throw new Error('INNGEST_EVENT_KEY environment variable is required');
    }
    
    if (!process.env.INNGEST_SIGNING_KEY) {
      throw new Error('INNGEST_SIGNING_KEY environment variable is required');
    }

    inngestClient = new Inngest({
      id: 'soryos-code',
      eventKey: process.env.INNGEST_EVENT_KEY,
      signKey: process.env.INNGEST_SIGNING_KEY,
    });
  }
  
  return inngestClient;
}

/**
 * Reset the Inngest client (useful for testing)
 */
export function resetInngest(): void {
  inngestClient = null;
}

/**
 * Send an event to Inngest
 */
export async function sendEvent(eventName: string, data: Record<string, unknown>): Promise<void> {
  const inngest = getInngest();
  await inngest.send({ name: eventName, data });
}

/**
 * Create an Inngest function with standard configuration
 */
export function createJobFunction<EventData, ReturnType>(
  config: {
    id: string;
    event: string;
    retries?: number;
    concurrency?: number;
    onFailure?: (context: { error: Error; event: { data: EventData } }) => Promise<void>;
  },
  handler: (context: { event: { data: EventData }; step: any }) => Promise<ReturnType>
) {
  const inngest = getInngest();
  
  return inngest.createFunction(
    {
      id: config.id,
      retries: config.retries ?? 0,
      concurrency: config.concurrency ?? 25,
      onFailure: config.onFailure ? async (ctx) => {
        try {
          await config.onFailure?.({ 
            error: ctx.error as Error, 
            event: { data: ctx.event.data as EventData } 
          });
        } catch (failureError) {
          console.error(`[Inngest] Error in onFailure handler for ${config.id}:`, failureError);
        }
      } : undefined,
    },
    { event: config.event },
    handler
  );
}

/**
 * Health check for Inngest connection
 */
export async function checkInngestHealth(): Promise<boolean> {
  try {
    const inngest = getInngest();
    // Try to send a test event
    await inngest.send({ 
      name: 'soryos/test.health', 
      data: { timestamp: Date.now() } 
    });
    return true;
  } catch (error) {
    console.error('[Inngest] Health check failed:', error);
    return false;
  }
}
