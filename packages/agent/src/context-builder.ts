
import { sessionStore } from '@soryos/session';
import { workspaceManager } from '@soryos/workspace';
import { fileManager } from '@soryos/filesystem';
import { BuiltContext, ContextItem, ContextOptions } from './types';

const MAX_CONTEXT_ITEMS = 20;
const MAX_FILE_TOKENS = 2000; // This is a rough estimate

export class ContextBuilder {
  async buildContext(options: { sessionId: string, userRequest: string }): Promise<BuiltContext> {
    const session = sessionStore.get(options.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${options.sessionId}`);
    }

    const workspace = workspaceManager.getWorkspace(options.sessionId);
    if (!workspace) {
      throw new Error(`Workspace not found for session: ${options.sessionId}`);
    }

    const contextItems: ContextItem[] = [];

    // Add the user's request to the context
    contextItems.push({ type: 'user_request', content: options.userRequest, source: 'user' });

    // Add open files to the context
    for (const filePath of session.openFiles || []) {
      try {
        const content = await fileManager.readFile(filePath, options.sessionId);
        const truncatedContent = content.substring(0, MAX_FILE_TOKENS);
        contextItems.push({ type: 'file', content: `File: ${filePath}\n\n${truncatedContent}`, source: filePath });
      } catch (error) {
        if (error instanceof Error) {
          console.warn(`Could not read file ${filePath} for context: ${error.message}`);
        } else {
          console.warn(`Could not read file ${filePath} for context: ${String(error)}`);
        }
      }
    }

    // Add the currently active file to the context
    if (session.activeFile) {
      try {
        const content = await fileManager.readFile(session.activeFile, options.sessionId);
        const truncatedContent = content.substring(0, MAX_FILE_TOKENS);
        contextItems.push({ type: 'active_file', content: `Active File: ${session.activeFile}\n\n${truncatedContent}`, source: session.activeFile });
      } catch (error) {
        if (error instanceof Error) {
          console.warn(`Could not read active file ${session.activeFile} for context: ${error.message}`);
        } else {
          console.warn(`Could not read active file ${session.activeFile} for context: ${String(error)}`);
        }
      }
    }

    const tokenCount = contextItems.reduce((sum, item) => sum + item.content.length, 0); // Rough token count

    return {
      messages: [], // The messages will be constructed by the planner
      contextItems,
      tokenCount,
    };
  }
}

export const contextBuilder = new ContextBuilder();
