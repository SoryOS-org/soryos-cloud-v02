/**
 * @soryos/database/convex
 * Users API - REAL IMPLEMENTATION
 * 
 * Based on Vibra Code's Convex users with SoryOS-Cloud adaptations
 * Provides user management for SoryOS-Cloud
 */

import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { Id } from './_generated/dataModel';

// ============================================================================
// Queries
// ============================================================================

/**
 * Get a user by Clerk ID
 */
export const getByClerkId = query({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerkId', (q) => q.eq('clerkId', args.clerkId))
      .first();

    if (!user) return null;

    return {
      ...user,
      id: user._id,
    };
  },
});

/**
 * Get user by ID
 */
export const getById = query({
  args: {
    id: v.id('users'),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.id);
    if (!user) return null;

    return {
      ...user,
      id: user._id,
    };
  },
});

/**
 * List all users (admin only)
 */
export const listAll = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;

    const users = await ctx.db
      .query('users')
      .order('desc')
      .take(limit);

    return users.map((user) => ({
      ...user,
      id: user._id,
    }));
  },
});

/**
 * Get users by subscription plan
 */
export const getBySubscriptionPlan = query({
  args: {
    plan: v.union(
      v.literal('free'),
      v.literal('weekly_plus'),
      v.literal('pro'),
      v.literal('business'),
      v.literal('enterprise')
    ),
  },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query('users')
      .withIndex('by_subscriptionPlan', (q) => q.eq('subscriptionPlan', args.plan))
      .collect();

    return users.map((user) => ({
      ...user,
      id: user._id,
    }));
  },
});

/**
 * Get users by agent type
 */
export const getByAgentType = query({
  args: {
    agentType: v.union(
      v.literal('cursor'),
      v.literal('claude'),
      v.literal('gemini'),
      v.literal('rust')
    ),
  },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query('users')
      .withIndex('by_agentType', (q) => q.eq('agentType', args.agentType))
      .collect();

    return users.map((user) => ({
      ...user,
      id: user._id,
    }));
  },
});

/**
 * Get users by billing mode
 */
export const getByBillingMode = query({
  args: {
    billingMode: v.union(v.literal('tokens'), v.literal('credits')),
  },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query('users')
      .withIndex('by_billingMode', (q) => q.eq('billingMode', args.billingMode))
      .collect();

    return users.map((user) => ({
      ...user,
      id: user._id,
    }));
  },
});

/**
 * Check if a user has messages remaining
 */
export const hasMessages = query({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerkId', (q) => q.eq('clerkId', args.clerkId))
      .first();

    if (!user) return false;

    const messagesRemaining = user.messagesRemaining || 0;
    return messagesRemaining > 0;
  },
});

/**
 * Get user's message count and limit
 */
export const getUserMessages = query({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerkId', (q) => q.eq('clerkId', args.clerkId))
      .first();

    if (!user) {
      return {
        messagesRemaining: 0,
        messagesUsed: 0,
        subscriptionPlan: 'free',
        agentType: 'claude',
        billingMode: 'credits',
      };
    }

    return {
      messagesRemaining: user.messagesRemaining || 0,
      messagesUsed: user.messagesUsed || 0,
      subscriptionPlan: user.subscriptionPlan || 'free',
      agentType: user.agentType || 'claude',
      billingMode: user.billingMode || 'credits',
    };
  },
});

/**
 * Get user's credits
 */
export const getUserCredits = query({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerkId', (q) => q.eq('clerkId', args.clerkId))
      .first();

    if (!user) {
      return {
        creditsUSD: 0,
        creditsUsed: 0,
        totalPaidUSD: 0,
        realCostUSD: 0,
        profitUSD: 0,
      };
    }

    return {
      creditsUSD: user.creditsUSD || 0,
      creditsUsed: user.creditsUsed || 0,
      totalPaidUSD: user.totalPaidUSD || 0,
      realCostUSD: user.realCostUSD || 0,
      profitUSD: user.profitUSD || 0,
    };
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create or update a user
 */
export const createOrUpdate = mutation({
  args: {
    clerkId: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    fullName: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    subscriptionPlan: v.optional(v.union(
      v.literal('free'),
      v.literal('weekly_plus'),
      v.literal('pro'),
      v.literal('business'),
      v.literal('enterprise')
    )),
    subscriptionId: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    messagesRemaining: v.optional(v.number()),
    messagesUsed: v.optional(v.number()),
    lastMessageReset: v.optional(v.number()),
    creditsUSD: v.optional(v.number()),
    creditsUsed: v.optional(v.number()),
    totalPaidUSD: v.optional(v.number()),
    realCostUSD: v.optional(v.number()),
    profitUSD: v.optional(v.number()),
    lastCostUpdate: v.optional(v.number()),
    lastPaymentDate: v.optional(v.number()),
    agentType: v.optional(v.union(
      v.literal('cursor'),
      v.literal('claude'),
      v.literal('gemini'),
      v.literal('rust')
    )),
    billingMode: v.optional(v.union(v.literal('tokens'), v.literal('credits'))),
    accessExpiresAt: v.optional(v.number()),
    billingPeriodEnd: v.optional(v.number()),
    isCanceled: v.optional(v.boolean()),
    cancellationDate: v.optional(v.number()),
    isTrialPeriod: v.optional(v.boolean()),
    willRenew: v.optional(v.boolean()),
    originalProductId: v.optional(v.string()),
    lastGrantedTransactionId: v.optional(v.string()),
    notificationsEnabled: v.optional(v.boolean()),
    pushToken: v.optional(v.string()),
    rustEngineEnabled: v.optional(v.boolean()),
    rustEngineVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Try to find existing user
    const existing = await ctx.db
      .query('users')
      .withIndex('by_clerkId', (q) => q.eq('clerkId', args.clerkId))
      .first();

    if (existing) {
      // Update existing user
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    // Create new user
    const id = await ctx.db.insert('users', {
      clerkId: args.clerkId,
      firstName: args.firstName,
      lastName: args.lastName,
      fullName: args.fullName,
      email: args.email,
      imageUrl: args.imageUrl,
      subscriptionPlan: args.subscriptionPlan,
      subscriptionId: args.subscriptionId,
      subscriptionStatus: args.subscriptionStatus,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      messagesRemaining: args.messagesRemaining,
      messagesUsed: args.messagesUsed,
      lastMessageReset: args.lastMessageReset,
      creditsUSD: args.creditsUSD,
      creditsUsed: args.creditsUsed,
      totalPaidUSD: args.totalPaidUSD,
      realCostUSD: args.realCostUSD,
      profitUSD: args.profitUSD,
      lastCostUpdate: args.lastCostUpdate,
      lastPaymentDate: args.lastPaymentDate,
      agentType: args.agentType,
      billingMode: args.billingMode,
      accessExpiresAt: args.accessExpiresAt,
      billingPeriodEnd: args.billingPeriodEnd,
      isCanceled: args.isCanceled,
      cancellationDate: args.cancellationDate,
      isTrialPeriod: args.isTrialPeriod,
      willRenew: args.willRenew,
      originalProductId: args.originalProductId,
      lastGrantedTransactionId: args.lastGrantedTransactionId,
      notificationsEnabled: args.notificationsEnabled,
      pushToken: args.pushToken,
      rustEngineEnabled: args.rustEngineEnabled,
      rustEngineVersion: args.rustEngineVersion,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return id;
  },
});

/**
 * Update a user
 */
export const update = mutation({
  args: {
    id: v.id('users'),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    fullName: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    subscriptionPlan: v.optional(v.union(
      v.literal('free'),
      v.literal('weekly_plus'),
      v.literal('pro'),
      v.literal('business'),
      v.literal('enterprise')
    )),
    subscriptionId: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    messagesRemaining: v.optional(v.number()),
    messagesUsed: v.optional(v.number()),
    lastMessageReset: v.optional(v.number()),
    creditsUSD: v.optional(v.number()),
    creditsUsed: v.optional(v.number()),
    totalPaidUSD: v.optional(v.number()),
    realCostUSD: v.optional(v.number()),
    profitUSD: v.optional(v.number()),
    lastCostUpdate: v.optional(v.number()),
    lastPaymentDate: v.optional(v.number()),
    agentType: v.optional(v.union(
      v.literal('cursor'),
      v.literal('claude'),
      v.literal('gemini'),
      v.literal('rust')
    )),
    billingMode: v.optional(v.union(v.literal('tokens'), v.literal('credits'))),
    accessExpiresAt: v.optional(v.number()),
    billingPeriodEnd: v.optional(v.number()),
    isCanceled: v.optional(v.boolean()),
    cancellationDate: v.optional(v.number()),
    isTrialPeriod: v.optional(v.boolean()),
    willRenew: v.optional(v.boolean()),
    originalProductId: v.optional(v.string()),
    lastGrantedTransactionId: v.optional(v.string()),
    notificationsEnabled: v.optional(v.boolean()),
    pushToken: v.optional(v.string()),
    rustEngineEnabled: v.optional(v.boolean()),
    rustEngineVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error(`User not found: ${args.id}`);
    }

    await ctx.db.patch(args.id, {
      ...args,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * Delete a user
 */
export const remove = mutation({
  args: {
    id: v.id('users'),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error(`User not found: ${args.id}`);
    }

    // Delete all sessions owned by this user
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_createdBy', (q) => q.eq('createdBy', existing.clerkId))
      .collect();

    for (const session of sessions) {
      // Delete all messages in each session
      const messages = await ctx.db
        .query('messages')
        .withIndex('by_session', (q) => q.eq('sessionId', session._id))
        .collect();

      for (const msg of messages) {
        await ctx.db.delete(msg._id);
      }

      await ctx.db.delete(session._id);
    }

    // Delete the user
    await ctx.db.delete(args.id);

    return true;
  },
});

// ============================================================================
// Billing Mutations
// ============================================================================

/**
 * Consume a message token (for token-based billing)
 */
export const consumeMessage = mutation({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerkId', (q) => q.eq('clerkId', args.clerkId))
      .first();

    if (!user) {
      throw new Error(`User not found: ${args.clerkId}`);
    }

    const messagesRemaining = user.messagesRemaining || 0;
    if (messagesRemaining <= 0) {
      throw new Error('No messages remaining');
    }

    await ctx.db.patch(user._id, {
      messagesRemaining: messagesRemaining - 1,
      messagesUsed: (user.messagesUsed || 0) + 1,
      updatedAt: Date.now(),
    });

    return messagesRemaining - 1;
  },
});

/**
 * Reset message count (monthly reset)
 */
export const resetMessages = mutation({
  args: {
    clerkId: v.string(),
    messagesRemaining: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerkId', (q) => q.eq('clerkId', args.clerkId))
      .first();

    if (!user) {
      throw new Error(`User not found: ${args.clerkId}`);
    }

    await ctx.db.patch(user._id, {
      messagesRemaining: args.messagesRemaining,
      messagesUsed: 0,
      lastMessageReset: Date.now(),
      updatedAt: Date.now(),
    });

    return args.messagesRemaining;
  },
});

/**
 * Deduct credits for a message (for credit-based billing)
 */
export const deductCreditsForMessage = mutation({
  args: {
    clerkId: v.string(),
    messageCostUSD: v.number(),
    messageId: v.optional(v.id('messages')),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerkId', (q) => q.eq('clerkId', args.clerkId))
      .first();

    if (!user) {
      throw new Error(`User not found: ${args.clerkId}`);
    }

    const creditsUSD = user.creditsUSD || 0;
    if (creditsUSD < args.messageCostUSD) {
      throw new Error('Insufficient credits');
    }

    // Deduct credits (SoryOS uses 2x multiplier like Vibra Code)
    const actualCostUSD = args.messageCostUSD * 2;

    await ctx.db.patch(user._id, {
      creditsUSD: creditsUSD - actualCostUSD,
      creditsUsed: (user.creditsUsed || 0) + actualCostUSD,
      realCostUSD: (user.realCostUSD || 0) + args.messageCostUSD,
      lastCostUpdate: Date.now(),
      updatedAt: Date.now(),
    });

    // Update message with cost if provided
    if (args.messageId) {
      await ctx.db.patch(args.messageId, {
        costUSD: args.messageCostUSD,
      });
    }

    return {
      remainingCredits: creditsUSD - actualCostUSD,
      deductedAmount: actualCostUSD,
    };
  },
});

/**
 * Deduct credits (generic)
 */
export const deductCredits = mutation({
  args: {
    clerkId: v.string(),
    amountUSD: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerkId', (q) => q.eq('clerkId', args.clerkId))
      .first();

    if (!user) {
      throw new Error(`User not found: ${args.clerkId}`);
    }

    const creditsUSD = user.creditsUSD || 0;
    if (creditsUSD < args.amountUSD) {
      throw new Error('Insufficient credits');
    }

    // Deduct credits (SoryOS uses 2x multiplier)
    const actualAmount = args.amountUSD * 2;

    await ctx.db.patch(user._id, {
      creditsUSD: creditsUSD - actualAmount,
      creditsUsed: (user.creditsUsed || 0) + actualAmount,
      realCostUSD: (user.realCostUSD || 0) + args.amountUSD,
      lastCostUpdate: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      remainingCredits: creditsUSD - actualAmount,
      deductedAmount: actualAmount,
    };
  },
});

/**
 * Add credits to user
 */
export const addCredits = mutation({
  args: {
    clerkId: v.string(),
    amountUSD: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerkId', (q) => q.eq('clerkId', args.clerkId))
      .first();

    if (!user) {
      throw new Error(`User not found: ${args.clerkId}`);
    }

    await ctx.db.patch(user._id, {
      creditsUSD: (user.creditsUSD || 0) + args.amountUSD,
      totalPaidUSD: (user.totalPaidUSD || 0) + args.amountUSD,
      lastCostUpdate: Date.now(),
      lastPaymentDate: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      newCredits: (user.creditsUSD || 0) + args.amountUSD,
      addedAmount: args.amountUSD,
    };
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get billing status for a user
 */
export async function getBillingStatus(
  ctx: any,
  clerkId: string
): Promise<{
  agentType: string;
  billingMode: string;
  messagesRemaining: number;
  creditsUSD: number;
  hasTokens: boolean;
  hasCredits: boolean;
} | null> {
  const user = await ctx.db
    .query('users')
    .withIndex('by_clerkId', (q) => q.eq('clerkId', clerkId))
    .first();

  if (!user) {
    return null;
  }

  return {
    agentType: user.agentType || 'claude',
    billingMode: user.billingMode || 'credits',
    messagesRemaining: user.messagesRemaining || 0,
    creditsUSD: user.creditsUSD || 0,
    hasTokens: (user.messagesRemaining || 0) > 0,
    hasCredits: (user.creditsUSD || 0) > 0,
  };
}

// ============================================================================
// Exports
// ============================================================================

export {
  getBillingStatus,
};
