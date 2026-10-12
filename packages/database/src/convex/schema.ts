/**
 * @soryos/database/convex
 * Convex Schema Definitions - REAL IMPLEMENTATION
 * 
 * Based on Vibra Code's Convex schema with SoryOS-Cloud adaptations
 * This provides real-time database capabilities for SoryOS-Cloud
 */

import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// ============================================================================
// Database Schema
// ============================================================================

export default defineSchema({
  // Users table - extended from Vibra Code with SoryOS-specific fields
  users: defineTable({
    clerkId: v.string(),

    // USER PROFILE (from Clerk)
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    fullName: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),

    // SUBSCRIPTION & BILLING
    subscriptionPlan: v.optional(v.union(
      v.literal('free'),
      v.literal('weekly_plus'),
      v.literal('pro'),
      v.literal('business'),
      v.literal('enterprise')
    )),
    subscriptionId: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),

    // STRIPE INTEGRATION
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    migrationDate: v.optional(v.number()),
    migrationStatus: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('in_progress'),
        v.literal('completed'),
        v.literal('failed')
      )
    ),

    // BILLING PERIOD & ACCESS CONTROL
    accessExpiresAt: v.optional(v.number()),
    billingPeriodEnd: v.optional(v.number()),
    isCanceled: v.optional(v.boolean()),
    cancellationDate: v.optional(v.number()),
    isTrialPeriod: v.optional(v.boolean()),
    willRenew: v.optional(v.boolean()),
    originalProductId: v.optional(v.string()),
    lastGrantedTransactionId: v.optional(v.string()),

    // MESSAGE SYSTEM (what users see - TOKEN MODE for Cursor agent)
    messagesRemaining: v.optional(v.number()),
    messagesUsed: v.optional(v.number()),
    lastMessageReset: v.optional(v.number()),

    // AGENT TYPE & BILLING MODE
    agentType: v.optional(v.union(
      v.literal('cursor'),
      v.literal('claude'),
      v.literal('gemini'),
      v.literal('rust')
    )),
    billingMode: v.optional(v.union(v.literal('tokens'), v.literal('credits'))),

    // CREDIT SYSTEM (for Claude agent - tracks real costs with 2x multiplier)
    creditsUSD: v.optional(v.number()),
    creditsUsed: v.optional(v.number()),
    totalPaidUSD: v.optional(v.number()),
    realCostUSD: v.optional(v.number()),
    profitUSD: v.optional(v.number()),
    lastCostUpdate: v.optional(v.number()),
    lastPaymentDate: v.optional(v.number()),

    // SORYOS-SPECIFIC: Rust Engine configuration
    rustEngineEnabled: v.optional(v.boolean()),
    rustEngineVersion: v.optional(v.string()),

    // MOBILE APP
    notificationsEnabled: v.optional(v.boolean()),
    pushToken: v.optional(v.string()),
  })
    .index('by_clerkId', ['clerkId'])
    .index('by_subscriptionPlan', ['subscriptionPlan'])
    .index('by_messagesRemaining', ['messagesRemaining'])
    .index('by_lastMessageReset', ['lastMessageReset'])
    .index('by_agentType', ['agentType'])
    .index('by_billingMode', ['billingMode']),

  // Sessions table - core functionality for SoryOS-Cloud
  sessions: defineTable({
    createdBy: v.optional(v.string()),
    sessionId: v.optional(v.string()), // E2B sandbox ID or other provider ID
    name: v.string(),
    tunnelUrl: v.optional(v.string()),
    repository: v.optional(v.string()),
    templateId: v.string(),
    pullRequest: v.optional(v.any()),
    
    // GitHub repository information
    githubRepository: v.optional(v.string()), // Full repository name (owner/repo)
    githubRepositoryUrl: v.optional(v.string()), // GitHub repository URL
    githubPushStatus: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('in_progress'),
        v.literal('completed'),
        v.literal('failed')
      )
    ),
    githubPushDate: v.optional(v.number()), // Timestamp when pushed to GitHub
    
    // SORYOS-SPECIFIC: Project/Workspace hierarchy
    projectId: v.optional(v.id('projects')),
    workspaceId: v.optional(v.id('workspaces')),
    
    // Status - extended from Vibra Code
    status: v.union(
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
    ),
    statusMessage: v.optional(v.string()),
    
    // Agent control
    agentStopped: v.optional(v.boolean()), // True when user manually stops the agent
    
    // Cost tracking
    totalCostUSD: v.optional(v.number()), // Total cost for this session
    messageCount: v.optional(v.number()), // Number of messages in this session
    lastCostUpdate: v.optional(v.number()), // Timestamp of last cost update

    // Environment Variables
    envs: v.optional(v.record(v.string(), v.string())), // Key-value pairs for environment variables

    // SORYOS-SPECIFIC: Sandbox provider information
    sandboxProvider: v.optional(v.union(
      v.literal('e2b'),
      v.literal('vercel'),
      v.literal('github-codespaces'),
      v.literal('google-cloud-run'),
      v.literal('local')
    )),
    
    // Convex Project Information
    convexProject: v.optional(
      v.object({
        deploymentName: v.string(),
        deploymentUrl: v.string(),
        adminKey: v.string(),
        projectSlug: v.optional(v.string()),
        teamSlug: v.optional(v.string()),
      })
    ),
    
    // SORYOS-SPECIFIC: Session token for real-time sync
    sessionToken: v.optional(v.string()),
    
    // SORYOS-SPECIFIC: Auto-pause configuration
    autoPauseEnabled: v.optional(v.boolean()),
    autoPauseTimeoutMs: v.optional(v.number()),
  })
    .index('by_createdBy', ['createdBy'])
    .index('by_status', ['status'])
    .index('by_totalCostUSD', ['totalCostUSD'])
    .index('by_templateId', ['templateId'])
    .index('by_projectId', ['projectId'])
    .index('by_workspaceId', ['workspaceId'])
    .index('by_sandboxProvider', ['sandboxProvider'])
    .index('by_sessionToken', ['sessionToken']),

  // Messages table - chat history with tool information
  messages: defineTable({
    sessionId: v.id('sessions'),
    role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system')),
    edits: v.optional(
      v.object({
        filePath: v.string(),
        oldString: v.string(),
        newString: v.string(),
      })
    ),
    todos: v.optional(
      v.array(
        v.object({
          id: v.string(),
          content: v.string(),
          status: v.string(),
          priority: v.string(),
        })
      )
    ),
    read: v.optional(
      v.object({
        filePath: v.string(),
      })
    ),
    bash: v.optional(
      v.object({
        command: v.string(),
        output: v.optional(v.string()),
        exitCode: v.optional(v.number()),
      })
    ),
    webSearch: v.optional(
      v.object({
        query: v.string(),
        results: v.optional(v.string()),
      })
    ),
    mcpTool: v.optional(
      v.object({
        toolName: v.string(),
        input: v.optional(v.any()),
        output: v.optional(v.any()),
        status: v.optional(v.string()),
      })
    ),
    tool: v.optional(
      v.object({
        toolName: v.string(),
        command: v.optional(v.string()),
        output: v.optional(v.string()),
        exitCode: v.optional(v.number()),
        status: v.optional(v.string()),
      })
    ),
    codebaseSearch: v.optional(
      v.object({
        query: v.string(),
        results: v.optional(v.string()),
        targetDirectories: v.optional(v.array(v.string())),
      })
    ),
    grep: v.optional(
      v.object({
        pattern: v.string(),
        filePath: v.string(),
        matches: v.optional(v.array(v.string())),
        lineCount: v.optional(v.number()),
      })
    ),
    searchReplace: v.optional(
      v.object({
        filePath: v.string(),
        oldString: v.string(),
        newString: v.string(),
        replacements: v.optional(v.number()),
      })
    ),
    image: v.optional(
      v.object({
        fileName: v.string(),
        path: v.string(),
        storageId: v.optional(v.id('_storage')),
      })
    ),
    // Multiple images array - paths stored here are NOT visible to users in chat
    // Agent reads from this field to get image paths without displaying them
    images: v.optional(
      v.array(
        v.object({
          fileName: v.string(),
          path: v.string(),
          storageId: v.optional(v.id('_storage')),
        })
      )
    ),
    // Multiple audios array - audio files attached to messages
    audios: v.optional(
      v.array(
        v.object({
          fileName: v.string(),
          path: v.string(),
          storageId: v.optional(v.id('_storage')),
        })
      )
    ),
    // Multiple videos array - video files attached to messages
    videos: v.optional(
      v.array(
        v.object({
          fileName: v.string(),
          path: v.string(),
          storageId: v.optional(v.id('_storage')),
        })
      )
    ),
    checkpoint: v.optional(
      v.object({
        branch: v.string(),
        patch: v.optional(v.string()),
      })
    ),
    content: v.string(),
    // Thinking/reasoning content (from Claude's extended thinking) - kept for backward compatibility
    thinking: v.optional(v.string()),
    // Stream ID for real-time updates - kept for backward compatibility
    streamId: v.optional(v.string()),
    // Cost tracking
    costUSD: v.optional(v.number()), // Cost for this specific message
    modelUsed: v.optional(v.string()), // Model used (e.g., "claude-sonnet-4-20250514")
    inputTokens: v.optional(v.number()), // Input tokens used
    outputTokens: v.optional(v.number()), // Output tokens used
    cacheReadTokens: v.optional(v.number()), // Cache read tokens
    cacheCreationTokens: v.optional(v.number()), // Cache creation tokens
    durationMs: v.optional(v.number()), // Duration in milliseconds
    createdAt: v.optional(v.number()), // Timestamp when message was created
  })
    .index('by_session', ['sessionId'])
    .index('by_createdAt', ['createdAt'])
    .index('by_role', ['role'])
    .index('by_costUSD', ['costUSD'])
    .index('by_modelUsed', ['modelUsed']),

  // Projects table - SORYOS-SPECIFIC
  projects: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    createdBy: v.string(), // Clerk user ID
    organizationId: v.optional(v.string()),
    
    // Configuration
    defaultTemplateId: v.optional(v.string()),
    defaultSandboxProvider: v.optional(v.union(
      v.literal('e2b'),
      v.literal('vercel'),
      v.literal('github-codespaces'),
      v.literal('google-cloud-run'),
      v.literal('local')
    )),
    
    // State
    isActive: v.optional(v.boolean()),
    isArchived: v.optional(v.boolean()),
    
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_createdBy', ['createdBy'])
    .index('by_organizationId', ['organizationId'])
    .index('by_isActive', ['isActive'])
    .index('by_createdAt', ['createdAt']),

  // Workspaces table - SORYOS-SPECIFIC
  workspaces: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    projectId: v.id('projects'),
    createdBy: v.string(), // Clerk user ID
    
    // Configuration
    sandboxProvider: v.optional(v.union(
      v.literal('e2b'),
      v.literal('vercel'),
      v.literal('github-codespaces'),
      v.literal('google-cloud-run'),
      v.literal('local')
    )),
    templateId: v.optional(v.string()),
    
    // Environment variables
    envs: v.optional(v.record(v.string(), v.string())),
    
    // State
    isActive: v.optional(v.boolean()),
    lastUsedAt: v.optional(v.number()),
    
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_projectId', ['projectId'])
    .index('by_createdBy', ['createdBy'])
    .index('by_sandboxProvider', ['sandboxProvider'])
    .index('by_isActive', ['isActive'])
    .index('by_lastUsedAt', ['lastUsedAt']),

  // Payment Transactions table
  paymentTransactions: defineTable({
    userId: v.string(), // Clerk user ID
    transactionId: v.string(), // Stripe/Clerk transaction ID
    type: v.union(
      v.literal('payment'), // Successful payment
      v.literal('refund'), // Refund issued
      v.literal('chargeback'), // Chargeback/dispute
      v.literal('adjustment'), // Manual adjustment
      v.literal('subscription_change'), // Plan upgrade/downgrade
      v.literal('failed_payment') // Failed payment attempt
    ),
    amount: v.number(), // Amount in USD (positive for payments, negative for refunds)
    currency: v.string(), // Currency code (e.g., "usd")
    status: v.union(
      v.literal('pending'), // Payment processing
      v.literal('succeeded'), // Payment successful
      v.literal('failed'), // Payment failed
      v.literal('refunded'), // Refunded
      v.literal('disputed') // Under dispute
    ),
    description: v.optional(v.string()), // Human-readable description
    metadata: v.optional(v.any()), // Additional data (Stripe metadata, etc.)
    messagesAdded: v.optional(v.number()), // Messages added from this transaction
    subscriptionPlan: v.optional(v.string()), // Plan associated with transaction
    processedAt: v.number(), // Timestamp when transaction was processed
    createdAt: v.number(), // Timestamp when record was created

    // STRIPE INTEGRATION
    stripePaymentIntentId: v.optional(v.string()),
    stripeInvoiceId: v.optional(v.string()),
    stripeChargeId: v.optional(v.string()),
    stripeSessionId: v.optional(v.string()),
  })
    .index('by_userId', ['userId'])
    .index('by_transactionId', ['transactionId'])
    .index('by_type', ['type'])
    .index('by_status', ['status'])
    .index('by_processedAt', ['processedAt'])
    .index('by_subscriptionPlan', ['subscriptionPlan']),

  // Global Configuration (admin-controlled settings)
  globalConfig: defineTable({
    key: v.string(), // e.g., "agentType"
    value: v.string(), // e.g., "cursor" | "claude" | "gemini" | "rust"
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()), // Admin who made the change
  }).index('by_key', ['key']),

  // GitHub OAuth credentials storage
  githubCredentials: defineTable({
    clerkId: v.string(), // Clerk user ID
    accessToken: v.string(), // GitHub OAuth access token
    username: v.string(), // GitHub username
    connectedAt: v.number(), // When the connection was made
    updatedAt: v.number(), // Last token update
  }).index('by_clerkId', ['clerkId']),

  // RevenueCat OAuth credentials storage (for MCP integration)
  revenuecatCredentials: defineTable({
    clerkId: v.string(), // Clerk user ID
    accessToken: v.string(), // RevenueCat OAuth access token
    refreshToken: v.string(), // RevenueCat OAuth refresh token
    expiresAt: v.number(), // When the access token expires
    scope: v.string(), // OAuth scopes granted
    connectedAt: v.number(), // When the connection was made
    updatedAt: v.number(), // Last token update
  }).index('by_clerkId', ['clerkId']),

  // Convex OAuth credentials storage (same as chef)
  convexProjectCredentials: defineTable({
    userId: v.string(), // Clerk user ID
    projectSlug: v.string(),
    teamSlug: v.string(),
    projectDeployKey: v.string(), // OAuth token for creating projects
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_slugs', ['teamSlug', 'projectSlug']),

  // Templates table - SORYOS-SPECIFIC
  templates: defineTable({
    id: v.string(),
    name: v.string(),
    description: v.string(),
    repository: v.optional(v.string()),
    logos: v.optional(v.array(v.string())),
    image: v.optional(v.string()), // E2B template ID
    startCommands: v.optional(v.array(
      v.object({
        command: v.string(),
        status: v.string(),
        background: v.optional(v.boolean()),
      })
    )),
    secrets: v.optional(v.record(v.string(), v.string())),
    systemPrompt: v.optional(v.string()),
    
    // SORYOS-SPECIFIC
    provider: v.optional(v.union(
      v.literal('e2b'),
      v.literal('vercel'),
      v.literal('github-codespaces'),
      v.literal('google-cloud-run'),
      v.literal('local')
    )),
    
    // Metadata
    createdBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_id', ['id'])
    .index('by_provider', ['provider'])
    .index('by_createdBy', ['createdBy']),

  // Generated Images table
  generatedImages: defineTable({
    clerkId: v.string(), // User who generated the image
    sessionId: v.optional(v.id('sessions')), // Optional: link to session
    name: v.string(), // Unique name (gen-1, upload-1, etc.)
    prompt: v.optional(v.string()), // Original prompt
    revisedPrompt: v.optional(v.string()), // AI-revised prompt
    storageId: v.optional(v.id('_storage')), // Convex storage ID (optional during generation)
    url: v.optional(v.string()), // Download URL (optional during generation)
    isUploaded: v.optional(v.boolean()), // Whether this was uploaded (vs generated)
    status: v.union(v.literal('generating'), v.literal('completed'), v.literal('error')),
    errorMessage: v.optional(v.string()), // Error message if failed
    createdAt: v.number(), // When the image was created
  })
    .index('by_clerkId', ['clerkId'])
    .index('by_sessionId', ['sessionId'])
    .index('by_status', ['status'])
    .index('by_createdAt', ['createdAt']),

  // Generated Audios table
  generatedAudios: defineTable({
    clerkId: v.string(), // User who generated the audio
    sessionId: v.optional(v.id('sessions')), // Optional: link to session
    name: v.string(), // Unique name (audio-1, audio-2, etc.)
    text: v.optional(v.string()), // Text description for sound effect
    voiceId: v.optional(v.string()), // ElevenLabs voice ID (legacy, optional)
    storageId: v.id('_storage'), // Convex storage ID
    url: v.string(), // Download URL
    status: v.union(v.literal('generating'), v.literal('completed'), v.literal('error')),
    errorMessage: v.optional(v.string()), // Error message if failed
    createdAt: v.number(), // When the audio was created
  })
    .index('by_clerkId', ['clerkId'])
    .index('by_sessionId', ['sessionId'])
    .index('by_status', ['status'])
    .index('by_createdAt', ['createdAt']),

  // Generated Videos table
  generatedVideos: defineTable({
    clerkId: v.string(), // User who generated the video
    sessionId: v.optional(v.id('sessions')), // Optional: link to session
    name: v.string(), // Unique name (video-1, video-2, etc.)
    prompt: v.optional(v.string()), // Prompt used to generate video
    storageId: v.optional(v.id('_storage')), // Convex storage ID (optional during generation)
    url: v.optional(v.string()), // Download URL (optional during generation)
    status: v.union(v.literal('generating'), v.literal('completed'), v.literal('error')),
    errorMessage: v.optional(v.string()), // Error message if failed
    createdAt: v.number(), // When the video was created
  })
    .index('by_clerkId', ['clerkId'])
    .index('by_sessionId', ['sessionId'])
    .index('by_status', ['status'])
    .index('by_createdAt', ['createdAt']),
});
