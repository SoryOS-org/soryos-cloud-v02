/**
 * @soryos/database/convex
 * Messages API - REAL IMPLEMENTATION
 * 
 * Based on Vibra Code's Convex messages with SoryOS-Cloud adaptations
 * Provides real-time message management for SoryOS-Cloud
 */

import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { Id } from './_generated/dataModel';

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all messages for a session
 */
export const getBySession = query({
  args: {
    sessionId: v.id('sessions'),
    createdBy: v.string(), // SECURITY: Verify ownership
  },
  handler: async (ctx, args) => {
    // Verify session ownership
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      console.warn(`Session not found: ${args.sessionId}`);
      return [];
    }

    if (session.createdBy !== args.createdBy) {
      console.warn(
        `SECURITY: BLOCKED - User ${args.createdBy} attempted to access messages for session ${args.sessionId} owned by ${session.createdBy}`
      );
      return [];
    }

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .order('asc')
      .collect();

    return messages.map((msg) => ({
      ...msg,
      id: msg._id,
    }));
  },
});

/**
 * Get recent messages for a session (with limit)
 */
export const getRecentBySession = query({
  args: {
    sessionId: v.id('sessions'),
    createdBy: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    // Verify session ownership
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      console.warn(`Session not found: ${args.sessionId}`);
      return [];
    }

    if (session.createdBy !== args.createdBy) {
      console.warn(
        `SECURITY: BLOCKED - User ${args.createdBy} attempted to access messages for session ${args.sessionId} owned by ${session.createdBy}`
      );
      return [];
    }

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .order('desc')
      .take(limit)
      .collect();

    // Reverse to get ascending order
    return messages.reverse().map((msg) => ({
      ...msg,
      id: msg._id,
    }));
  },
});

/**
 * Get a specific message by ID
 */
export const getById = query({
  args: {
    id: v.id('messages'),
    createdBy: v.string(), // SECURITY: Verify ownership
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.id);
    if (!message) return null;

    // Verify session ownership
    const session = await ctx.db.get(message.sessionId);
    if (!session || session.createdBy !== args.createdBy) {
      console.warn(
        `SECURITY: BLOCKED - User ${args.createdBy} attempted to access message ${args.id} in session owned by ${session?.createdBy}`
      );
      return null;
    }

    return {
      ...message,
      id: message._id,
    };
  },
});

/**
 * Get messages by role (user or assistant)
 */
export const getByRole = query({
  args: {
    sessionId: v.id('sessions'),
    role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system')),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify session ownership
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      console.warn(`Session not found: ${args.sessionId}`);
      return [];
    }

    if (session.createdBy !== args.createdBy) {
      console.warn(
        `SECURITY: BLOCKED - User ${args.createdBy} attempted to access messages for session ${args.sessionId} owned by ${session.createdBy}`
      );
      return [];
    }

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .filter((q) => q.eq(q.field('role'), args.role))
      .order('asc')
      .collect();

    return messages.map((msg) => ({
      ...msg,
      id: msg._id,
    }));
  },
});

/**
 * Count messages in a session
 */
export const countBySession = query({
  args: {
    sessionId: v.id('sessions'),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify session ownership
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      console.warn(`Session not found: ${args.sessionId}`);
      return 0;
    }

    if (session.createdBy !== args.createdBy) {
      console.warn(
        `SECURITY: BLOCKED - User ${args.createdBy} attempted to count messages for session ${args.sessionId} owned by ${session.createdBy}`
      );
      return 0;
    }

    const count = await ctx.db
      .query('messages')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .count();

    return count;
  },
});

/**
 * Get the last message in a session
 */
export const getLastBySession = query({
  args: {
    sessionId: v.id('sessions'),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify session ownership
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      console.warn(`Session not found: ${args.sessionId}`);
      return null;
    }

    if (session.createdBy !== args.createdBy) {
      console.warn(
        `SECURITY: BLOCKED - User ${args.createdBy} attempted to access messages for session ${args.sessionId} owned by ${session.createdBy}`
      );
      return null;
    }

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .order('desc')
      .take(1)
      .collect();

    if (messages.length === 0) return null;

    return {
      ...messages[0],
      id: messages[0]._id,
    };
  },
});

/**
 * INTERNAL: Get messages by session without ownership check
 * WARNING: This bypasses ownership verification - ONLY use from trusted backend code!
 */
export const getBySessionInternal = query({
  args: {
    sessionId: v.id('sessions'),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query('messages')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .order('asc')
      .collect();

    return messages.map((msg) => ({
      ...msg,
      id: msg._id,
    }));
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Add a new message to a session
 */
export const add = mutation({
  args: {
    sessionId: v.id('sessions'),
    role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system')),
    content: v.string(),
    createdAt: v.optional(v.number()),
    // Tool data
    edits: v.optional(v.any()),
    read: v.optional(v.any()),
    bash: v.optional(v.any()),
    tool: v.optional(v.any()),
    searchReplace: v.optional(v.any()),
    webSearch: v.optional(v.any()),
    mcpTool: v.optional(v.any()),
    codebaseSearch: v.optional(v.any()),
    grep: v.optional(v.any()),
    // Attachments
    images: v.optional(v.array(v.any())),
    audios: v.optional(v.array(v.any())),
    videos: v.optional(v.array(v.any())),
    // Tasks
    todos: v.optional(v.array(v.any())),
    // Metadata
    checkpoint: v.optional(v.any()),
    thinking: v.optional(v.string()),
    streamId: v.optional(v.string()),
    // Cost tracking
    costUSD: v.optional(v.number()),
    modelUsed: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    cacheReadTokens: v.optional(v.number()),
    cacheCreationTokens: v.optional(v.number()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verify session exists
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${args.sessionId}`);
    }

    // Generate unique message ID
    const id = await ctx.db.insert('messages', {
      sessionId: args.sessionId,
      role: args.role,
      content: args.content,
      createdAt: args.createdAt || Date.now(),
      updatedAt: Date.now(),
      // Tool data
      edits: args.edits,
      read: args.read,
      bash: args.bash,
      tool: args.tool,
      searchReplace: args.searchReplace,
      webSearch: args.webSearch,
      mcpTool: args.mcpTool,
      codebaseSearch: args.codebaseSearch,
      grep: args.grep,
      // Attachments
      images: args.images,
      audios: args.audios,
      videos: args.videos,
      // Tasks
      todos: args.todos,
      // Metadata
      checkpoint: args.checkpoint,
      thinking: args.thinking,
      streamId: args.streamId,
      // Cost tracking
      costUSD: args.costUSD,
      modelUsed: args.modelUsed,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      cacheReadTokens: args.cacheReadTokens,
      cacheCreationTokens: args.cacheCreationTokens,
      durationMs: args.durationMs,
    });

    // Update session message count
    await ctx.db.patch(args.sessionId, {
      messageCount: (session.messageCount || 0) + 1,
      updatedAt: Date.now(),
    });

    return id;
  },
});

/**
 * Update a message
 */
export const update = mutation({
  args: {
    id: v.id('messages'),
    content: v.optional(v.string()),
    // Tool data
    edits: v.optional(v.any()),
    read: v.optional(v.any()),
    bash: v.optional(v.any()),
    tool: v.optional(v.any()),
    searchReplace: v.optional(v.any()),
    webSearch: v.optional(v.any()),
    mcpTool: v.optional(v.any()),
    codebaseSearch: v.optional(v.any()),
    grep: v.optional(v.any()),
    // Attachments
    images: v.optional(v.array(v.any())),
    audios: v.optional(v.array(v.any())),
    videos: v.optional(v.array(v.any())),
    // Tasks
    todos: v.optional(v.array(v.any())),
    // Metadata
    checkpoint: v.optional(v.any()),
    thinking: v.optional(v.string()),
    streamId: v.optional(v.string()),
    // Cost tracking
    costUSD: v.optional(v.number()),
    modelUsed: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    cacheReadTokens: v.optional(v.number()),
    cacheCreationTokens: v.optional(v.number()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error(`Message not found: ${args.id}`);
    }

    // Only allow updates to certain fields
    const updates: any = {
      updatedAt: Date.now(),
    };

    if (args.content !== undefined) updates.content = args.content;
    if (args.edits !== undefined) updates.edits = args.edits;
    if (args.read !== undefined) updates.read = args.read;
    if (args.bash !== undefined) updates.bash = args.bash;
    if (args.tool !== undefined) updates.tool = args.tool;
    if (args.searchReplace !== undefined) updates.searchReplace = args.searchReplace;
    if (args.webSearch !== undefined) updates.webSearch = args.webSearch;
    if (args.mcpTool !== undefined) updates.mcpTool = args.mcpTool;
    if (args.codebaseSearch !== undefined) updates.codebaseSearch = args.codebaseSearch;
    if (args.grep !== undefined) updates.grep = args.grep;
    if (args.images !== undefined) updates.images = args.images;
    if (args.audios !== undefined) updates.audios = args.audios;
    if (args.videos !== undefined) updates.videos = args.videos;
    if (args.todos !== undefined) updates.todos = args.todos;
    if (args.checkpoint !== undefined) updates.checkpoint = args.checkpoint;
    if (args.thinking !== undefined) updates.thinking = args.thinking;
    if (args.streamId !== undefined) updates.streamId = args.streamId;
    if (args.costUSD !== undefined) updates.costUSD = args.costUSD;
    if (args.modelUsed !== undefined) updates.modelUsed = args.modelUsed;
    if (args.inputTokens !== undefined) updates.inputTokens = args.inputTokens;
    if (args.outputTokens !== undefined) updates.outputTokens = args.outputTokens;
    if (args.cacheReadTokens !== undefined) updates.cacheReadTokens = args.cacheReadTokens;
    if (args.cacheCreationTokens !== undefined) updates.cacheCreationTokens = args.cacheCreationTokens;
    if (args.durationMs !== undefined) updates.durationMs = args.durationMs;

    await ctx.db.patch(args.id, updates);

    return args.id;
  },
});

/**
 * Delete a message
 */
export const remove = mutation({
  args: {
    id: v.id('messages'),
    createdBy: v.string(), // SECURITY: Verify ownership
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.id);
    if (!message) {
      throw new Error(`Message not found: ${args.id}`);
    }

    // Verify session ownership
    const session = await ctx.db.get(message.sessionId);
    if (!session || session.createdBy !== args.createdBy) {
      console.warn(
        `SECURITY: BLOCKED - User ${args.createdBy} attempted to delete message ${args.id} in session owned by ${session?.createdBy}`
      );
      throw new Error('Unauthorized');
    }

    await ctx.db.delete(args.id);

    // Update session message count
    await ctx.db.patch(message.sessionId, {
      messageCount: Math.max((session.messageCount || 0) - 1, 0),
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Delete all messages in a session
 */
export const removeAllBySession = mutation({
  args: {
    sessionId: v.id('sessions'),
    createdBy: v.string(), // SECURITY: Verify ownership
  },
  handler: async (ctx, args) => {
    // Verify session ownership
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${args.sessionId}`);
    }

    if (session.createdBy !== args.createdBy) {
      console.warn(
        `SECURITY: BLOCKED - User ${args.createdBy} attempted to delete all messages in session ${args.sessionId} owned by ${session.createdBy}`
      );
      throw new Error('Unauthorized');
    }

    // Delete all messages
    const messages = await ctx.db
      .query('messages')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .collect();

    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    // Update session message count
    await ctx.db.patch(args.sessionId, {
      messageCount: 0,
      updatedAt: Date.now(),
    });

    return messages.length;
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Add a message with retry for OCC conflicts
 * Used by Inngest functions for reliable message creation
 */
export async function addMessage(
  ctx: any,
  args: {
    sessionId: Id<'sessions'>;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt?: number;
    // Additional data
    edits?: any;
    read?: any;
    bash?: any;
    tool?: any;
    todos?: any;
    images?: any;
    audios?: any;
    videos?: any;
    costUSD?: number;
    modelUsed?: string;
  }
): Promise<Id<'messages'>> {
  // Retry with exponential backoff for OCC conflicts
  const maxRetries = 3;
  const baseDelayMs = 100;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const id = await ctx.db.insert('messages', {
        sessionId: args.sessionId,
        role: args.role,
        content: args.content,
        createdAt: args.createdAt || Date.now(),
        updatedAt: Date.now(),
        edits: args.edits,
        read: args.read,
        bash: args.bash,
        tool: args.tool,
        todos: args.todos,
        images: args.images,
        audios: args.audios,
        videos: args.videos,
        costUSD: args.costUSD,
        modelUsed: args.modelUsed,
      });

      // Update session message count
      const session = await ctx.db.get(args.sessionId);
      if (session) {
        await ctx.db.patch(args.sessionId, {
          messageCount: (session.messageCount || 0) + 1,
          updatedAt: Date.now(),
        });
      }

      return id;
    } catch (error: any) {
      // Check if it's an OCC failure
      if (error?.message?.includes('OptimisticConcurrencyControlFailure') ||
          error?.code === 'OptimisticConcurrencyControlFailure') {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.log(`OCC conflict on message creation, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Not an OCC error, throw immediately
      throw error;
    }
  }

  throw new Error('Failed to create message after maximum retries');
}

/**
 * Get session messages with retry for OCC conflicts
 */
export async function getSessionMessages(
  ctx: any,
  sessionId: Id<'sessions'>
): Promise<any[]> {
  const maxRetries = 3;
  const baseDelayMs = 100;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const messages = await ctx.db
        .query('messages')
        .withIndex('by_session', (q) => q.eq('sessionId', sessionId))
        .order('asc')
        .collect();

      return messages.map((msg) => ({
        ...msg,
        id: msg._id,
      }));
    } catch (error: any) {
      // Check if it's an OCC failure
      if (error?.message?.includes('OptimisticConcurrencyControlFailure') ||
          error?.code === 'OptimisticConcurrencyControlFailure') {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.log(`OCC conflict on message read, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Not an OCC error, throw immediately
      throw error;
    }
  }

  throw new Error('Failed to read messages after maximum retries');
}

/**
 * Get session data with retry for OCC conflicts
 */
export async function getSessionData(
  ctx: any,
  id: Id<'sessions'>
): Promise<any | null> {
  const maxRetries = 3;
  const baseDelayMs = 100;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const session = await ctx.db.get(id);
      return session;
    } catch (error: any) {
      // Check if it's an OCC failure
      if (error?.message?.includes('OptimisticConcurrencyControlFailure') ||
          error?.code === 'OptimisticConcurrencyControlFailure') {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.log(`OCC conflict on session read, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Not an OCC error, throw immediately
      throw error;
    }
  }

  throw new Error('Failed to read session after maximum retries');
}

// ============================================================================
// Exports
// ============================================================================

export {
  addMessage,
  getSessionMessages,
  getSessionData,
};
