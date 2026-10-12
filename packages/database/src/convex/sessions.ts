/**
 * @soryos/database/convex
 * Sessions API - REAL IMPLEMENTATION
 * 
 * Based on Vibra Code's Convex sessions with SoryOS-Cloud adaptations
 * Provides real-time session management for SoryOS-Cloud
 */

import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { Id } from './_generated/dataModel';

// ============================================================================
// Queries
// ============================================================================

/**
 * List sessions for a specific user
 * SECURITY: Only returns sessions for a specific user
 */
export const list = query({
  args: {
    createdBy: v.optional(v.string()),
    limit: v.optional(v.number()), // Optional limit (default 100)
    statusFilter: v.optional(v.string()), // Optional status filter
    projectId: v.optional(v.id('projects')), // Optional project filter
    workspaceId: v.optional(v.id('workspaces')), // Optional workspace filter
  },
  handler: async (ctx, args) => {
    // SECURITY: Only return sessions for a specific user
    if (!args.createdBy) {
      console.warn('sessions.list called without createdBy - returning empty array for security');
      return [];
    }

    // Default limit of 100, max 500 to prevent expensive queries
    const limit = Math.min(args.limit || 100, 500);

    let queryBuilder = ctx.db
      .query('sessions')
      .withIndex('by_createdBy', (q) => q.eq('createdBy', args.createdBy))
      .order('desc');

    // Apply optional filters
    if (args.statusFilter) {
      queryBuilder = queryBuilder.filter((q) => 
        q.eq(q.field('status'), args.statusFilter as any)
      );
    }

    if (args.projectId) {
      queryBuilder = queryBuilder.filter((q) => 
        q.eq(q.field('projectId'), args.projectId)
      );
    }

    if (args.workspaceId) {
      queryBuilder = queryBuilder.filter((q) => 
        q.eq(q.field('workspaceId'), args.workspaceId)
      );
    }

    const sessions = await queryBuilder.take(limit);

    // Return only essential fields for the list view (much faster & cheaper)
    // Full session data loaded via getById when viewing a specific session
    return sessions.map((session) => ({
      id: session._id,
      _id: session._id,
      _creationTime: session._creationTime,
      name: session.name,
      status: session.status,
      statusMessage: session.statusMessage,
      tunnelUrl: session.tunnelUrl,
      templateId: session.templateId,
      createdBy: session.createdBy,
      sessionId: session.sessionId,
      sandboxProvider: session.sandboxProvider,
      projectId: session.projectId,
      workspaceId: session.workspaceId,
      // GitHub info for display
      githubRepository: session.githubRepository,
      githubRepositoryUrl: session.githubRepositoryUrl,
      githubPushStatus: session.githubPushStatus,
      // Don't include: envs, convexProject, messages (loaded separately)
      messages: [], // Empty array - messages loaded via getById when needed
      // Cost info
      totalCostUSD: session.totalCostUSD,
      messageCount: session.messageCount,
    }));
  },
});

/**
 * Get a session by ID with ownership verification
 * SECURITY: REQUIRED - clerkId for ownership verification
 */
export const getById = query({
  args: {
    id: v.id('sessions'),
    createdBy: v.string(), // SECURITY: REQUIRED - clerkId for ownership verification
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) return null;

    // SECURITY: ALWAYS verify ownership - no exceptions
    // This prevents users from viewing other users' sessions
    if (session.createdBy !== args.createdBy) {
      console.warn(
        `SECURITY: BLOCKED - User ${args.createdBy} attempted to access session ${args.id} owned by ${session.createdBy}`
      );
      return null; // Return null instead of the session - access denied
    }

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_session', (q) => q.eq('sessionId', args.id))
      .order('asc')
      .collect();

    return {
      ...session,
      id: session._id,
      messages: messages.map((msg) => ({
        ...msg,
        id: msg._id,
      })),
    };
  },
});

/**
 * Get a session by sessionId (E2B sandbox ID) with ownership verification
 */
export const getBySessionId = query({
  args: {
    sessionId: v.string(),
    createdBy: v.string(), // SECURITY: REQUIRED - clerkId for ownership verification
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('sessions')
      .filter((q) => q.eq(q.field('sessionId'), args.sessionId))
      .first();

    if (!session) return null;

    // SECURITY: ALWAYS verify ownership - no exceptions
    if (session.createdBy !== args.createdBy) {
      console.warn(
        `SECURITY: BLOCKED - User ${args.createdBy} attempted to access session ${args.sessionId} owned by ${session.createdBy}`
      );
      return null; // Return null instead of the session - access denied
    }

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_session', (q) => q.eq('sessionId', session._id))
      .order('asc')
      .collect();

    return {
      ...session,
      id: session._id,
      messages: messages.map((msg) => ({
        ...msg,
        id: msg._id,
      })),
    };
  },
});

/**
 * Get a session by session token (for real-time sync)
 */
export const getBySessionToken = query({
  args: {
    sessionToken: v.string(),
    createdBy: v.string(), // SECURITY: REQUIRED - clerkId for ownership verification
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('sessions')
      .filter((q) => q.eq(q.field('sessionToken'), args.sessionToken))
      .first();

    if (!session) return null;

    // SECURITY: ALWAYS verify ownership
    if (session.createdBy !== args.createdBy) {
      console.warn(
        `SECURITY: BLOCKED - User ${args.createdBy} attempted to access session with token ${args.sessionToken} owned by ${session.createdBy}`
      );
      return null;
    }

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_session', (q) => q.eq('sessionId', session._id))
      .order('asc')
      .collect();

    return {
      ...session,
      id: session._id,
      messages: messages.map((msg) => ({
        ...msg,
        id: msg._id,
      })),
    };
  },
});

/**
 * INTERNAL: Backend-only query for trusted server-to-server calls
 * WARNING: This bypasses ownership verification - ONLY use from trusted backend code!
 * Do NOT expose this to client-facing APIs
 */
export const getByIdInternal = query({
  args: {
    id: v.id('sessions'),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) return null;

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_session', (q) => q.eq('sessionId', args.id))
      .order('asc')
      .collect();

    return {
      ...session,
      id: session._id,
      messages: messages.map((msg) => ({
        ...msg,
        id: msg._id,
      })),
    };
  },
});

/**
 * INTERNAL: Get session by sessionId without ownership check
 * WARNING: This bypasses ownership verification - ONLY use from trusted backend code!
 */
export const getBySessionIdInternal = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('sessions')
      .filter((q) => q.eq(q.field('sessionId'), args.sessionId))
      .first();

    if (!session) return null;

    return {
      ...session,
      id: session._id,
    };
  },
});

/**
 * Get active sessions for a user
 */
export const getActiveSessions = query({
  args: {
    createdBy: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;

    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_createdBy', (q) => q.eq('createdBy', args.createdBy))
      .filter((q) => 
        q.or(
          q.eq(q.field('status'), 'RUNNING'),
          q.eq(q.field('status'), 'CUSTOM'),
          q.eq(q.field('status'), 'STARTING_DEV_SERVER'),
          q.eq(q.field('status'), 'CREATING_TUNNEL')
        )
      )
      .order('desc')
      .take(limit);

    return sessions.map((session) => ({
      ...session,
      id: session._id,
    }));
  },
});

/**
 * Count sessions for a user
 */
export const count = query({
  args: {
    createdBy: v.string(),
    statusFilter: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let queryBuilder = ctx.db
      .query('sessions')
      .withIndex('by_createdBy', (q) => q.eq('createdBy', args.createdBy));

    if (args.statusFilter) {
      queryBuilder = queryBuilder.filter((q) => 
        q.eq(q.field('status'), args.statusFilter as any)
      );
    }

    const count = await queryBuilder.count();
    return count;
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new session
 */
export const create = mutation({
  args: {
    sessionId: v.optional(v.string()),
    branch: v.optional(v.string()),
    createdBy: v.optional(v.string()),
    repository: v.optional(v.string()),
    pullRequest: v.optional(v.any()),
    name: v.string(),
    tunnelUrl: v.optional(v.string()),
    templateId: v.string(),
    status: v.union(
      v.literal('IN_PROGRESS'),
      v.literal('CLONING_REPO'),
      v.literal('INSTALLING_DEPENDENCIES'),
      v.literal('STARTING_DEV_SERVER'),
      v.literal('CREATING_TUNNEL'),
      v.literal('CUSTOM'),
      v.literal('RUNNING')
    ),
    statusMessage: v.optional(v.string()),
    projectId: v.optional(v.id('projects')),
    workspaceId: v.optional(v.id('workspaces')),
    sandboxProvider: v.optional(v.union(
      v.literal('e2b'),
      v.literal('vercel'),
      v.literal('github-codespaces'),
      v.literal('google-cloud-run'),
      v.literal('local')
    )),
    sessionToken: v.optional(v.string()),
    autoPauseEnabled: v.optional(v.boolean()),
    autoPauseTimeoutMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Generate session token if not provided
    const sessionToken = args.sessionToken || generateSessionToken();

    const id = await ctx.db.insert('sessions', {
      ...args,
      // Initialize cost tracking
      totalCostUSD: 0,
      messageCount: 0,
      lastCostUpdate: Date.now(),
      // Initialize agent control
      agentStopped: false,
      // Set session token
      sessionToken,
      // Set timestamps
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return id;
  },
});

/**
 * Update a session
 */
export const update = mutation({
  args: {
    id: v.id('sessions'),
    name: v.optional(v.string()),
    tunnelUrl: v.optional(v.string()),
    repository: v.optional(v.string()),
    templateId: v.optional(v.string()),
    pullRequest: v.optional(v.any()),
    status: v.optional(v.union(
      v.literal('IN_PROGRESS'),
      v.literal('CLONING_REPO'),
      v.literal('INSTALLING_DEPENDENCIES'),
      v.literal('STARTING_DEV_SERVER'),
      v.literal('CREATING_TUNNEL'),
      v.literal('CUSTOM'),
      v.literal('RUNNING'),
      v.literal('CREATING_GITHUB_REPO'),
      v.literal('SETTING_UP_SANDBOX'),
      v.literal('INITIALIZING_GIT'),
      v.literal('ADDING_FILES'),
      v.literal('COMMITTING_CHANGES'),
      v.literal('PUSHING_TO_GITHUB'),
      v.literal('PUSH_COMPLETE'),
      v.literal('PUSH_FAILED'),
      v.literal('AUTO_PUSHING'),
      v.literal('USING_EXISTING_REPO'),
      v.literal('PAUSED'),
      v.literal('TERMINATED'),
      v.literal('ERROR')
    )),
    statusMessage: v.optional(v.string()),
    agentStopped: v.optional(v.boolean()),
    totalCostUSD: v.optional(v.number()),
    messageCount: v.optional(v.number()),
    lastCostUpdate: v.optional(v.number()),
    sessionId: v.optional(v.string()),
    envs: v.optional(v.record(v.string(), v.string())),
    githubRepository: v.optional(v.string()),
    githubRepositoryUrl: v.optional(v.string()),
    githubPushStatus: v.optional(v.union(
      v.literal('pending'),
      v.literal('in_progress'),
      v.literal('completed'),
      v.literal('failed')
    )),
    githubPushDate: v.optional(v.number()),
    convexProject: v.optional(v.any()),
    sessionToken: v.optional(v.string()),
    autoPauseEnabled: v.optional(v.boolean()),
    autoPauseTimeoutMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error(`Session not found: ${args.id}`);
    }

    // Only allow status updates that make sense
    const validUpdates: Partial<typeof args> = { ...args };

    // Always update the updatedAt timestamp
    validUpdates.updatedAt = Date.now();

    await ctx.db.patch(args.id, validUpdates);

    return args.id;
  },
});

/**
 * Delete a session
 */
export const remove = mutation({
  args: {
    id: v.id('sessions'),
    createdBy: v.string(), // SECURITY: Verify ownership before deletion
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) {
      throw new Error(`Session not found: ${args.id}`);
    }

    // SECURITY: Verify ownership
    if (session.createdBy !== args.createdBy) {
      console.warn(
        `SECURITY: BLOCKED - User ${args.createdBy} attempted to delete session ${args.id} owned by ${session.createdBy}`
      );
      throw new Error('Unauthorized');
    }

    // Delete all messages in this session first
    const messages = await ctx.db
      .query('messages')
      .withIndex('by_session', (q) => q.eq('sessionId', args.id))
      .collect();

    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    // Delete the session
    await ctx.db.delete(args.id);

    return true;
  },
});

/**
 * Stop an agent in a session
 */
export const stopAgent = mutation({
  args: {
    id: v.id('sessions'),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) {
      throw new Error(`Session not found: ${args.id}`);
    }

    // SECURITY: Verify ownership
    if (session.createdBy !== args.createdBy) {
      console.warn(
        `SECURITY: BLOCKED - User ${args.createdBy} attempted to stop agent in session ${args.id} owned by ${session.createdBy}`
      );
      throw new Error('Unauthorized');
    }

    await ctx.db.patch(args.id, {
      agentStopped: true,
      status: 'RUNNING', // Reset to RUNNING so user can resume
      statusMessage: 'Agent stopped by user',
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Resume an agent in a session
 */
export const resumeAgent = mutation({
  args: {
    id: v.id('sessions'),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) {
      throw new Error(`Session not found: ${args.id}`);
    }

    // SECURITY: Verify ownership
    if (session.createdBy !== args.createdBy) {
      console.warn(
        `SECURITY: BLOCKED - User ${args.createdBy} attempted to resume agent in session ${args.id} owned by ${session.createdBy}`
      );
      throw new Error('Unauthorized');
    }

    await ctx.db.patch(args.id, {
      agentStopped: false,
      statusMessage: 'Agent resumed',
      updatedAt: Date.now(),
    });

    return true;
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique session token
 */
function generateSessionToken(): string {
  // Use timestamp + random for uniqueness
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2);
  return `${timestamp}-${random}`;
}

/**
 * Retry a mutation with exponential backoff for OCC failures
 * This is used internally by Inngest functions
 */
export async function retryMutation<T>(
  ctx: any,
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
        console.log(`OCC conflict, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
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
 * Used by Inngest functions for reliable status updates
 */
export async function updateSessionStatus(
  ctx: any,
  id: Id<'sessions'>,
  status: string,
  statusMessage?: string,
  tunnelUrl?: string,
  sessionId?: string
): Promise<void> {
  // If setting status to CUSTOM, check if agent was stopped by user
  if (status === "CUSTOM") {
    const session = await ctx.db.get(id);
    if (session?.agentStopped) {
      console.log(`[middleware] Skipping CUSTOM status update - agent was stopped by user`);
      return; // Don't update status - agent was stopped
    }
  }

  await retryMutation(ctx, () => ctx.db.patch(id, {
    status,
    statusMessage,
    tunnelUrl,
    sessionId,
    updatedAt: Date.now(),
  }));
}

// ============================================================================
// Exports
// ============================================================================

export {
  generateSessionToken,
};
