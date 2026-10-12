/**
 * @soryos/database
 * Message Management with Real-time Streaming
 * 
 * Inspired by Vibra Code's message handling with streaming support
 * Provides message CRUD operations with real-time capabilities
 */

import { 
  Message, 
  MessageRole,
  MessageQueryOptions,
  QueryOptions 
} from './types';
import { getRealTimeDatabase } from './realtime';

// ============================================================================
// Message Manager
// ============================================================================

export class MessageManager {
  private database = getRealTimeDatabase();

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  /**
   * Add a new message to a session
   */
  async addMessage(data: Omit<Message, '_id' | '_creationTime' | 'id'>): Promise<Message> {
    const message = await this.database.addMessage(data);
    return message;
  }

  /**
   * Get a message by ID
   */
  async getMessage(id: string): Promise<Message | null> {
    return this.database.getMessage(id);
  }

  /**
   * Update a message
   */
  async updateMessage(id: string, updates: Partial<Message>): Promise<Message> {
    const message = await this.database.updateMessage(id, updates);
    return message;
  }

  /**
   * Update message content (for streaming)
   */
  async updateMessageContent(id: string, content: string): Promise<Message> {
    return this.updateMessage(id, { content });
  }

  /**
   * Append content to a message (for streaming)
   */
  async appendToMessage(id: string, content: string): Promise<Message> {
    const message = await this.getMessage(id);
    if (!message) {
      throw new Error(`Message ${id} not found`);
    }
    return this.updateMessage(id, {
      content: message.content + content
    });
  }

  /**
   * Delete a message
   */
  async deleteMessage(id: string): Promise<void> {
    await this.database.deleteMessage(id);
  }

  /**
   * List messages for a session
   */
  async listMessages(
    sessionId: string,
    options?: MessageQueryOptions
  ): Promise<Message[]> {
    return this.database.listMessages(sessionId, {
      limit: options?.limit,
      order: options?.order || 'asc'
    });
  }

  // ==========================================================================
  // User Message Operations
  // ==========================================================================

  /**
   * Add a user message
   */
  async addUserMessage(
    sessionId: string,
    content: string,
    attachments?: {
      images?: Array<{ fileName: string; path: string; storageId?: string }>;
      audios?: Array<{ fileName: string; path: string; storageId?: string }>;
      videos?: Array<{ fileName: string; path: string; storageId?: string }>;
    }
  ): Promise<Message> {
    const message: Omit<Message, '_id' | '_creationTime' | 'id'> = {
      sessionId: sessionId as any,
      role: 'user',
      content,
      ...attachments
    };
    return this.addMessage(message);
  }

  /**
   * Add an assistant message
   */
  async addAssistantMessage(
    sessionId: string,
    content: string,
    toolData?: {
      read?: { filePath: string };
      edit?: { filePath: string; oldString: string; newString: string };
      bash?: { command: string; output?: string; exitCode?: number };
      tool?: { toolName: string; command?: string; output?: string; exitCode?: number; status?: string };
      searchReplace?: { filePath: string; oldString: string; newString: string; replacements?: number };
      webSearch?: { query: string; results?: string };
      mcpTool?: { toolName: string; input?: any; output?: any; status?: string };
      codebaseSearch?: { query: string; results?: string; targetDirectories?: string[] };
      todos?: Array<{ id: string; content: string; status: string; priority: string }>;
    }
  ): Promise<Message> {
    const message: Omit<Message, '_id' | '_creationTime' | 'id'> = {
      sessionId: sessionId as any,
      role: 'assistant',
      content,
      ...toolData
    };
    return this.addMessage(message);
  }

  /**
   * Add a system message
   */
  async addSystemMessage(
    sessionId: string,
    content: string
  ): Promise<Message> {
    const message: Omit<Message, '_id' | '_creationTime' | 'id'> = {
      sessionId: sessionId as any,
      role: 'system',
      content
    };
    return this.addMessage(message);
  }

  // ==========================================================================
  // Streaming Message Operations
  // ==========================================================================

  /**
   * Start a streaming message
   */
  async startStreamingMessage(
    sessionId: string,
    role: MessageRole = 'assistant'
  ): Promise<Message> {
    const message: Omit<Message, '_id' | '_creationTime' | 'id'> = {
      sessionId: sessionId as any,
      role,
      content: ''
    };
    return this.addMessage(message);
  }

  /**
   * Append to a streaming message
   */
  async appendToStreamingMessage(
    messageId: string,
    content: string
  ): Promise<Message> {
    return this.appendToMessage(messageId, content);
  }

  /**
   * Complete a streaming message
   */
  async completeStreamingMessage(
    messageId: string,
    finalContent?: string
  ): Promise<Message> {
    if (finalContent) {
      return this.updateMessage(messageId, { content: finalContent });
    }
    return this.getMessage(messageId) as Promise<Message>;
  }

  // ==========================================================================
  // Tool Message Operations
  // ==========================================================================

  /**
   * Add a read tool message
   */
  async addReadMessage(
    sessionId: string,
    filePath: string
  ): Promise<Message> {
    return this.addAssistantMessage(sessionId, '', { read: { filePath } });
  }

  /**
   * Add an edit tool message
   */
  async addEditMessage(
    sessionId: string,
    filePath: string,
    oldString: string,
    newString: string
  ): Promise<Message> {
    return this.addAssistantMessage(sessionId, '', {
      edit: { filePath, oldString, newString }
    });
  }

  /**
   * Add a bash tool message
   */
  async addBashMessage(
    sessionId: string,
    command: string,
    output?: string,
    exitCode?: number
  ): Promise<Message> {
    return this.addAssistantMessage(sessionId, '', {
      bash: { command, output, exitCode }
    });
  }

  /**
   * Add a tool message
   */
  async addToolMessage(
    sessionId: string,
    toolName: string,
    command?: string,
    output?: string,
    exitCode?: number,
    status?: string
  ): Promise<Message> {
    return this.addAssistantMessage(sessionId, '', {
      tool: { toolName, command, output, exitCode, status }
    });
  }

  /**
   * Add a search/replace message
   */
  async addSearchReplaceMessage(
    sessionId: string,
    filePath: string,
    oldString: string,
    newString: string,
    replacements?: number
  ): Promise<Message> {
    return this.addAssistantMessage(sessionId, '', {
      searchReplace: { filePath, oldString, newString, replacements }
    });
  }

  /**
   * Add a web search message
   */
  async addWebSearchMessage(
    sessionId: string,
    query: string,
    results?: string
  ): Promise<Message> {
    return this.addAssistantMessage(sessionId, '', {
      webSearch: { query, results }
    });
  }

  /**
   * Add an MCP tool message
   */
  async addMcpToolMessage(
    sessionId: string,
    toolName: string,
    input?: any,
    output?: any,
    status?: string
  ): Promise<Message> {
    return this.addAssistantMessage(sessionId, '', {
      mcpTool: { toolName, input, output, status }
    });
  }

  /**
   * Add a codebase search message
   */
  async addCodebaseSearchMessage(
    sessionId: string,
    query: string,
    results?: string,
    targetDirectories?: string[]
  ): Promise<Message> {
    return this.addAssistantMessage(sessionId, '', {
      codebaseSearch: { query, results, targetDirectories }
    });
  }

  /**
   * Add a todo list message
   */
  async addTodoMessage(
    sessionId: string,
    todos: Array<{ id: string; content: string; status: string; priority: string }>
  ): Promise<Message> {
    return this.addAssistantMessage(sessionId, '', { todos });
  }

  // ==========================================================================
  // Message Query Operations
  // ==========================================================================

  /**
   * Get messages by role
   */
  async getMessagesByRole(
    sessionId: string,
    role: MessageRole
  ): Promise<Message[]> {
    const messages = await this.listMessages(sessionId);
    return messages.filter(m => m.role === role);
  }

  /**
   * Get user messages for a session
   */
  async getUserMessages(sessionId: string): Promise<Message[]> {
    return this.getMessagesByRole(sessionId, 'user');
  }

  /**
   * Get assistant messages for a session
   */
  async getAssistantMessages(sessionId: string): Promise<Message[]> {
    return this.getMessagesByRole(sessionId, 'assistant');
  }

  /**
   * Get the last message in a session
   */
  async getLastMessage(sessionId: string): Promise<Message | null> {
    const messages = await this.listMessages(sessionId, { order: 'desc', limit: 1 });
    return messages[0] || null;
  }

  /**
   * Get the last user message in a session
   */
  async getLastUserMessage(sessionId: string): Promise<Message | null> {
    const userMessages = await this.getUserMessages(sessionId);
    return userMessages[userMessages.length - 1] || null;
  }

  /**
   * Get the last assistant message in a session
   */
  async getLastAssistantMessage(sessionId: string): Promise<Message | null> {
    const assistantMessages = await this.getAssistantMessages(sessionId);
    return assistantMessages[assistantMessages.length - 1] || null;
  }

  // ==========================================================================
  // Message Metadata Operations
  // ==========================================================================

  /**
   * Update message cost tracking
   */
  async updateMessageCost(
    messageId: string,
    costUSD: number,
    modelUsed?: string,
    inputTokens?: number,
    outputTokens?: number,
    durationMs?: number
  ): Promise<Message> {
    return this.updateMessage(messageId, {
      costUSD,
      modelUsed,
      inputTokens,
      outputTokens,
      durationMs
    });
  }

  /**
   * Add thinking content to a message
   */
  async addThinkingContent(
    messageId: string,
    thinking: string
  ): Promise<Message> {
    const message = await this.getMessage(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }
    return this.updateMessage(messageId, {
      thinking: (message.thinking || '') + thinking
    });
  }

  // ==========================================================================
  // Message Filtering
  // ==========================================================================

  /**
   * Get messages with tool calls
   */
  async getToolMessages(sessionId: string): Promise<Message[]> {
    const messages = await this.listMessages(sessionId);
    return messages.filter(m =>
      m.read || m.edits || m.bash || m.tool || m.searchReplace || m.mcpTool
    );
  }

  /**
   * Get messages with attachments
   */
  async getMessagesWithAttachments(sessionId: string): Promise<Message[]> {
    const messages = await this.listMessages(sessionId);
    return messages.filter(m => 
      (m.images && m.images.length > 0) ||
      (m.audios && m.audios.length > 0) ||
      (m.videos && m.videos.length > 0)
    );
  }

  /**
   * Get messages with tasks
   */
  async getMessagesWithTasks(sessionId: string): Promise<Message[]> {
    const messages = await this.listMessages(sessionId);
    return messages.filter(m => m.todos && m.todos.length > 0);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get message count for a session
   */
  async getMessageCount(sessionId: string): Promise<number> {
    const messages = await this.listMessages(sessionId);
    return messages.length;
  }

  /**
   * Check if a session has messages
   */
  async hasMessages(sessionId: string): Promise<boolean> {
    const count = await this.getMessageCount(sessionId);
    return count > 0;
  }

  /**
   * Clear all messages for a session
   */
  async clearMessages(sessionId: string): Promise<void> {
    const messages = await this.listMessages(sessionId);
    for (const message of messages) {
      await this.deleteMessage(message.id);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let messageManagerInstance: MessageManager | null = null;

export function getMessageManager(): MessageManager {
  if (!messageManagerInstance) {
    messageManagerInstance = new MessageManager();
  }
  return messageManagerInstance;
}

export function createMessageManager(): MessageManager {
  return new MessageManager();
}
