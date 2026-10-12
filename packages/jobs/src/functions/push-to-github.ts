/**
 * @soryos/jobs
 * Inngest function: push-to-github
 * 
 * Handles GitHub auto-push operations from the sandbox.
 */

import { getInngest } from '../client';
import { updateSessionStatus, getSessionData, addMessage } from '../middleware';
import { PushToGitHubJobData, JobResult } from '../types';
import { sandboxRegistry } from '@soryos/sandbox';
import { SessionStore } from '@soryos/session';

/**
 * Push to GitHub job function
 */
export const pushToGitHub = getInngest().createFunction(
  {
    id: 'soryos/push.github',
    retries: 0,
    concurrency: 10,
    onFailure: async ({ error, event }) => {
      const { convexId, repository } = event.data as PushToGitHubJobData;
      console.error('[Jobs] Push to GitHub failure:', error);

      try {
        await updateSessionStatus(convexId, 'PUSH_FAILED', 'Failed to push to GitHub');
        await addMessage(convexId, 
          `⚠️ **GitHub Push Failed**\n\nFailed to push to repository: ${repository}\n\nError: ${error instanceof Error ? error.message : String(error)}`,
          'assistant');
      } catch (failureError) {
        console.error('[Jobs] Failed to handle push failure:', failureError);
      }
    }
  },
  { event: 'soryos/push.github' },
  async ({ event, step }) => {
    const {
      sessionId,
      convexId,
      repository,
      isInitialPush
    } = event.data as PushToGitHubJobData;

    console.log('[Jobs] Push to GitHub started:', { sessionId, convexId, repository, isInitialPush });

    try {
      // Step 1: Get session data and GitHub token
      const sessionData = await step.run('get session data', async () => {
        const data = await getSessionData(convexId);
        if (!data) {
          throw new Error(`Session ${convexId} not found`);
        }
        return data;
      });

      // Get GitHub token from session or user
      const githubToken = (sessionData as any)?.token || 
                         (sessionData as any)?.githubToken ||
                         process.env.GITHUB_TOKEN;

      if (!githubToken) {
        throw new Error('No GitHub token found for push operation');
      }

      // Step 2: Connect to sandbox
      await step.run('connect to sandbox', async () => {
        const sandboxId = (sessionData as any).sandboxId || sessionId;
        if (!sandboxId) {
          throw new Error('No sandbox ID found for session');
        }

        const provider = await sandboxRegistry.createProvider('e2b', sessionId);
        await provider.connect(sandboxId);
        
        // Store provider for later use
        (sessionData as any)._provider = provider;
      });

      // Step 3: Initialize git and push
      const result = await step.run('commit and push', async () => {
        const provider = (sessionData as any)._provider;
        if (!provider) {
          throw new Error('Provider not initialized');
        }

        // Update session status
        await updateSessionStatus(convexId, 'PUSHING_TO_GITHUB', 'Pushing to GitHub...');

        // Generate commit message
        const sessionName = (sessionData as any).name || 'App update';
        const commitMessage = `SoryOS Code: ${sessionName}`;

        // Initialize git and push
        const pushResult = await (provider as any).commitAndPush(
          githubToken,
          repository,
          commitMessage,
          isInitialPush
        );

        if (!pushResult.success) {
          throw new Error(pushResult.error || 'Push failed');
        }

        return pushResult;
      });

      // Step 4: Update session status
      await step.run('update session', async () => {
        await updateSessionStatus(convexId, 'PUSH_COMPLETE', 'Push to GitHub completed');
        
        // Update session with push info
        await SessionStore.update(convexId, {
          githubRepository: repository,
          githubPushStatus: 'completed',
          githubPushDate: Date.now(),
          githubPushError: null
        } as any);

        // Add success message
        await addMessage(convexId, 
          `✅ **Successfully Pushed to GitHub**\n\nYour code has been pushed to: https://github.com/${repository}`,
          'assistant');
      });

      console.log('[Jobs] Push to GitHub completed successfully');
      return result;

    } catch (error) {
      console.error('[Jobs] Push to GitHub error:', error);
      
      // Update session status on error
      try {
        await updateSessionStatus(convexId, 'PUSH_FAILED', 'Push to GitHub failed');
        await SessionStore.update(convexId, {
          githubPushStatus: 'failed',
          githubPushError: error instanceof Error ? error.message : String(error)
        } as any);
      } catch (updateError) {
        console.error('[Jobs] Failed to update session status on push error:', updateError);
      }
      
      throw error;
    }
  }
);

/**
 * Helper function to push to GitHub directly
 */
export async function pushToGitHubDirectly(data: PushToGitHubJobData): Promise<JobResult> {
  try {
    const { sendEvent } = await import('../client');
    await sendEvent('soryos/push.github', data);
    return { success: true };
  } catch (error) {
    console.error('[Jobs] Failed to push to GitHub:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}
