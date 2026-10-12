/**
 * @soryos/jobs
 * Create Session Function - REAL IMPLEMENTATION
 * 
 * Based on Vibra Code's create-session Inngest function
 * Creates a new E2B sandbox and starts the development environment
 */

import { inngest } from '../inngest';
import { E2BProvider } from '@soryos/sandbox';
import { Id } from 'convex/_generated/dataModel';

// Define the template type
export interface Template {
  id: string;
  name: string;
  description: string;
  repository: string;
  logos: string[];
  image?: string;
  startCommands: {
    command: string;
    status: "INSTALLING_DEPENDENCIES" | "STARTING_DEV_SERVER";
    background?: boolean;
  }[];
  secrets?: Record<string, string>;
  systemPrompt: string;
}

// Default templates for SoryOS-Cloud
const defaultTemplates: Template[] = [
  {
    id: "expo",
    name: "Expo React Native",
    description: "Build cross-platform mobile apps with Expo SDK, TypeScript, and NativeWind styling.",
    repository: "https://github.com/sa4hnd/expo-template",
    logos: ["expo.svg"],
    image: process.env.E2B_TEMPLATE_ID || "code-interpreter-v1",
    startCommands: [
      {
        command: "echo fs.inotify.max_user_watches=524288 >> /etc/sysctl.conf && sysctl -p && npx expo start --tunnel --port 3000",
        status: "STARTING_DEV_SERVER",
        background: true,
      },
    ],
    systemPrompt: "You are an AI assistant helping to build a React Native mobile app with Expo. The Expo dev server is running on port 3000.",
  },
  {
    id: "nextjs",
    name: "Next.js",
    description: "Build scalable web applications with server-side rendering, static site generation, and API routes",
    repository: "https://github.com/superagent-ai/e2b-nextjs",
    logos: ["nextjs.svg"],
    startCommands: [
      {
        command: "npm i",
        status: "INSTALLING_DEPENDENCIES",
      },
      {
        command: "npm run dev",
        status: "STARTING_DEV_SERVER",
        background: true,
      },
    ],
    systemPrompt: "You are an AI assistant helping to build a Next.js web application. The Next.js dev server is running on port 3000.",
  },
  {
    id: "fastapi-nextjs",
    name: "FastAPI + Next.js",
    description: "Build modern full-stack apps with FastAPI backend and Next.js frontend.",
    repository: "tiangolo/full-stack-fastapi-template",
    logos: ["nextjs.svg", "fastapi.jpg"],
    startCommands: [
      {
        command: "npm i",
        status: "INSTALLING_DEPENDENCIES",
      },
      {
        command: "npm run dev",
        status: "STARTING_DEV_SERVER",
        background: true,
      },
    ],
    systemPrompt: "You are an AI assistant helping to build a FastAPI and Next.js full-stack application. The Next.js dev server is running on port 3000 and the FastAPI server on port 8000.",
  },
];

/**
 * Get templates - can be extended with custom templates
 */
export function getTemplates(): Template[] {
  // Try to get templates from environment
  try {
    const customTemplates = process.env.SORYOS_TEMPLATES;
    if (customTemplates) {
      return [...defaultTemplates, ...JSON.parse(customTemplates)];
    }
  } catch (error) {
    console.warn('Failed to parse custom templates from environment:', error);
  }
  return defaultTemplates;
}

/**
 * Get template by ID
 */
export function getTemplateById(templateId: string): Template | undefined {
  return getTemplates().find((t) => t.id === templateId);
}

/**
 * Generate a session title from the user's message
 */
async function generateSessionTitle(message: string): Promise<string> {
  // Simple title generation based on the first few words
  const words = message.split(/\s+/).slice(0, 5);
  return words.join(' ') + (words.length < 5 ? '' : '...');
}

/**
 * Create Session Inngest Function
 * 
 * This function:
 * 1. Creates a new E2B sandbox
 * 2. Triggers the agent immediately (if message provided)
 * 3. Starts the dev server in parallel
 * 4. Updates the session with tunnel URL
 */
export const createSession = inngest.createFunction(
  {
    id: "soryos/create.session",
    retries: 0, // No retries to avoid duplicate sandboxes
    concurrency: 25, // Limit concurrent session creations
    timeout: '15m', // 15 minutes timeout for session creation
  },
  { event: "soryos/create.session" },
  async ({ event, step }) => {
    const {
      sessionId: id,
      message,
      repository,
      token,
      template: templateParam,
      userId,
      sandboxProvider = 'e2b',
    }: {
      sessionId: Id<"sessions">;
      message: string;
      repository: string;
      token: string;
      template: Template;
      userId: string;
      sandboxProvider: string;
    } = event.data;

    console.log(`[Inngest:createSession] Starting session creation for user ${userId}`);
    console.log(`[Inngest:createSession] Template: ${templateParam?.id || 'default'}`);
    console.log(`[Inngest:createSession] Repository: ${repository || 'none'}`);

    // Resolve template
    let template: Template;
    if (templateParam) {
      template = templateParam;
    } else {
      // Default to expo template
      template = getTemplates().find((t) => t.id === 'expo') || defaultTemplates[0];
    }

    // Step 1: Create sandbox and trigger agent immediately
    const sandboxData = await step.run("create sandbox", async () => {
      console.log(`[Inngest:createSession] Creating sandbox with template: ${template.id}`);

      // Initialize the appropriate sandbox provider
      let sandbox: E2BProvider | null = null;
      
      if (sandboxProvider === 'e2b') {
        sandbox = new E2BProvider({
          templateId: template.image,
          envVars: template.secrets || {},
        });
      } else {
        // For now, only E2B is fully implemented
        // Other providers can be added later
        console.warn(`[Inngest:createSession] Sandbox provider ${sandboxProvider} not yet fully implemented, using E2B`);
        sandbox = new E2BProvider({
          templateId: template.image,
          envVars: template.secrets || {},
        });
      }

      if (!sandbox) {
        throw new Error(`Unsupported sandbox provider: ${sandboxProvider}`);
      }

      // Generate session title
      const title = await generateSessionTitle(message);

      // Create the sandbox
      const sandboxId = await sandbox.create({
        sessionId: id,
      });

      return {
        sandboxId,
        title,
        sandbox,
      };
    });

    // Step 2: Trigger agent IMMEDIATELY after sandbox creation (don't wait for dev server)
    if (message) {
      await step.run("run agent early", async () => {
        console.log(`[Inngest:createSession] Triggering agent immediately after sandbox creation`);
        
        await inngest.send({
          name: "soryos/run.agent",
          data: {
            sessionId: sandboxData.sandboxId,
            id,
            message,
            template,
            repository: repository || null,
            token,
            userId,
            sandboxProvider,
          },
        });
      });
    }

    // Step 3: Start dev server in parallel (Agent is already working)
    const data = await step.run("start dev server", async () => {
      console.log(`[Inngest:createSession] Starting dev server`);
      
      // Reconnect to sandbox for dev server setup
      const sandbox = sandboxData.sandbox as E2BProvider;
      await sandbox.connect(sandboxData.sandboxId);

      if (!repository && template) {
        // For custom templates, everything is pre-configured
        console.log(`[Inngest:createSession] Starting dev server for template: ${template.id}`);

        // Start the dev server (dependencies are already installed)
        for (const command of template.startCommands) {
          console.log(`[Inngest:createSession] Running command: ${command.command.substring(0, 50)}...`);
          await sandbox.executeCommand(command.command, {
            background: command.background,
          });
        }

        // Get tunnel URL
        const host = await sandbox.getHost(3000);

        return {
          sandboxId: sandboxData.sandboxId,
          tunnelUrl: host,
          repository: null,
        };
      } else {
        // Clone repo if provided
        if (repository) {
          console.log(`[Inngest:createSession] Cloning repository: ${repository}`);
          await sandbox.executeCommand(
            `git clone https://${token}@github.com/${repository}.git .`
          );
        }

        console.log(`[Inngest:createSession] Starting dev server for custom repo`);

        // Start expo dev server (dependencies are pre-baked, skip npm i)
        await sandbox.executeCommand(
          "echo fs.inotify.max_user_watches=524288 >> /etc/sysctl.conf && sysctl -p && npx expo start --tunnel --port 3000",
          {
            background: true,
          }
        );

        // Wait for tunnel
        let host: string;
        let attempts = 0;
        const maxAttempts = 30;
        const delayMs = 2000;

        while (attempts < maxAttempts) {
          try {
            host = await sandbox.getHost(3000);
            if (host) {
              break;
            }
          } catch {
            // Tunnel not ready yet
          }
          attempts++;
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }

        if (attempts >= maxAttempts) {
          throw new Error('Failed to get tunnel URL after maximum attempts');
        }

        return {
          sandboxId: sandboxData.sandboxId,
          tunnelUrl: host,
          repository: repository,
        };
      }
    });

    // Step 4: Update session with tunnel URL
    await step.run("update session", async () => {
      console.log(`[Inngest:createSession] Updating session with tunnel URL: ${data.tunnelUrl}`);
      
      // Import Convex client
      const { ConvexClient } = await import('convex/browser');
      const convex = new ConvexClient(process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL!);
      
      // Update session status
      await convex.mutation('sessions:update', {
        id,
        status: 'RUNNING',
        tunnelUrl: data.tunnelUrl,
        sessionId: data.sandboxId,
        statusMessage: 'Session ready',
        autoPauseEnabled: true,
        autoPauseTimeoutMs: parseInt(process.env.AUTO_PAUSE_TIMEOUT_MS || '900000'),
      });
    });

    console.log(`[Inngest:createSession] Session creation completed: ${data.sandboxId}`);

    return {
      sandboxId: data.sandboxId,
      tunnelUrl: data.tunnelUrl,
      sessionId: id,
      repository: data.repository,
    };
  }
);

/**
 * Resume Session Inngest Function
 * 
 * Resumes a paused session by reconnecting to the sandbox
 */
export const resumeSession = inngest.createFunction(
  {
    id: "soryos/resume.session",
    retries: 3,
    timeout: '5m',
  },
  { event: "soryos/resume.session" },
  async ({ event, step }) => {
    const { sessionId, userId, sandboxId } = event.data as {
      sessionId: Id<"sessions">;
      userId: string;
      sandboxId: string;
    };

    console.log(`[Inngest:resumeSession] Resuming session: ${sessionId}`);

    // Step 1: Reconnect to sandbox
    const sandbox = await step.run("reconnect sandbox", async () => {
      const e2b = new E2BProvider();
      const connected = await e2b.connect(sandboxId);
      if (!connected) {
        throw new Error(`Failed to reconnect to sandbox: ${sandboxId}`);
      }
      return e2b;
    });

    // Step 2: Reset timeout
    await step.run("reset timeout", async () => {
      await sandbox.setTimeout(parseInt(process.env.AUTO_PAUSE_TIMEOUT_MS || '900000'));
    });

    // Step 3: Update session status
    await step.run("update session", async () => {
      const { ConvexClient } = await import('convex/browser');
      const convex = new ConvexClient(process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL!);
      
      await convex.mutation('sessions:update', {
        id: sessionId,
        status: 'RUNNING',
        agentStopped: false,
        statusMessage: 'Session resumed',
      });
    });

    console.log(`[Inngest:resumeSession] Session resumed: ${sessionId}`);

    return { success: true, sandboxId };
  }
);

/**
 * Stop Session Inngest Function
 * 
 * Stops a running session and pauses the sandbox
 */
export const stopSession = inngest.createFunction(
  {
    id: "soryos/stop.session",
    retries: 3,
    timeout: '2m',
  },
  { event: "soryos/stop.session" },
  async ({ event, step }) => {
    const { sessionId, userId, sandboxId } = event.data as {
      sessionId: Id<"sessions">;
      userId: string;
      sandboxId: string;
    };

    console.log(`[Inngest:stopSession] Stopping session: ${sessionId}`);

    // Step 1: Stop the sandbox
    await step.run("stop sandbox", async () => {
      const e2b = new E2BProvider();
      try {
        await e2b.connect(sandboxId);
        await e2b.pause();
      } catch (error) {
        console.error(`[Inngest:stopSession] Error stopping sandbox: ${error}`);
        // Try to kill if pause fails
        try {
          await e2b.destroy();
        } catch {
          // Ignore
        }
      }
    });

    // Step 2: Update session status
    await step.run("update session", async () => {
      const { ConvexClient } = await import('convex/browser');
      const convex = new ConvexClient(process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL!);
      
      await convex.mutation('sessions:update', {
        id: sessionId,
        status: 'PAUSED',
        agentStopped: true,
        statusMessage: 'Session paused by user',
      });
    });

    console.log(`[Inngest:stopSession] Session stopped: ${sessionId}`);

    return { success: true, sandboxId };
  }
);

// Export all functions
export {
  getTemplates,
  getTemplateById,
  generateSessionTitle,
};
