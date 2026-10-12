/**
 * @soryos/database
 * Database Schema Definitions
 * 
 * Inspired by Vibra Code's Convex schema
 * Defines the data model for SoryOS-Cloud
 */

import { z } from 'zod';

// ============================================================================
// ID Types
// ============================================================================

export const IdSchema = <T extends string>(table: T) => z.string().brand<T>();

export type Id<T extends string> = z.infer<ReturnType<typeof IdSchema<T>>>;

// ============================================================================
// User Schema
// ============================================================================

export const UserSchema = z.object({
  // Clerk authentication
  clerkId: z.string(),
  
  // Profile
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  fullName: z.string().optional(),
  email: z.string().optional(),
  imageUrl: z.string().optional(),
  
  // Billing (optional - can be disabled for self-hosting)
  subscriptionPlan: z.enum(['free', 'weekly_plus', 'pro', 'business', 'enterprise']).optional(),
  subscriptionId: z.string().optional(),
  subscriptionStatus: z.string().optional(),
  
  // Stripe integration (optional)
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  
  // Token-based billing (Cursor agent)
  messagesRemaining: z.number().optional(),
  messagesUsed: z.number().optional(),
  lastMessageReset: z.number().optional(),
  
  // Credit-based billing (Claude agent)
  creditsUSD: z.number().optional(),
  creditsUsed: z.number().optional(),
  totalPaidUSD: z.number().optional(),
  realCostUSD: z.number().optional(),
  profitUSD: z.number().optional(),
  lastCostUpdate: z.number().optional(),
  lastPaymentDate: z.number().optional(),
  
  // Agent configuration
  agentType: z.enum(['cursor', 'claude', 'gemini', 'rust']).optional().default('claude'),
  billingMode: z.enum(['tokens', 'credits']).optional(),
  
  // Mobile app
  notificationsEnabled: z.boolean().optional(),
  pushToken: z.string().optional(),
  
  // Timestamps
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});

export type User = z.infer<typeof UserSchema>;

// ============================================================================
// Session Schema
// ============================================================================

export const SessionStatusSchema = z.enum([
  'IN_PROGRESS',
  'CLONING_REPO',
  'INSTALLING_DEPENDENCIES',
  'STARTING_DEV_SERVER',
  'CREATING_TUNNEL',
  'CUSTOM',
  'RUNNING',
  'CREATING_GITHUB_REPO',
  'SETTING_UP_SANDBOX',
  'INITIALIZING_GIT',
  'ADDING_FILES',
  'COMMITTING_CHANGES',
  'PUSHING_TO_GITHUB',
  'PUSH_COMPLETE',
  'PUSH_FAILED',
  'AUTO_PUSHING',
  'USING_EXISTING_REPO',
  'PAUSED',
  'TERMINATED',
  'ERROR'
]);

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionSchema = z.object({
  // Identification
  _id: IdSchema('sessions').optional(),
  _creationTime: z.number().optional(),
  id: z.string(),
  sessionId: z.string(), // E2B sandbox ID
  name: z.string(),
  
  // Ownership
  createdBy: z.string(), // Clerk user ID
  
  // Configuration
  templateId: z.string(),
  repository: z.string().optional(),
  pullRequest: z.any().optional(),
  
  // State
  status: SessionStatusSchema,
  statusMessage: z.string().optional(),
  
  // Environment
  tunnelUrl: z.string().optional(),
  envs: z.record(z.string(), z.string()).optional(),
  
  // GitHub
  githubRepository: z.string().optional(),
  githubRepositoryUrl: z.string().optional(),
  githubPushStatus: z.enum(['pending', 'in_progress', 'completed', 'failed']).optional(),
  githubPushDate: z.number().optional(),
  
  // Agent
  agentStopped: z.boolean().optional(),
  
  // Cost tracking
  totalCostUSD: z.number().optional(),
  messageCount: z.number().optional(),
  lastCostUpdate: z.number().optional(),
  
  // Convex project (optional)
  convexProject: z.object({
    deploymentName: z.string(),
    deploymentUrl: z.string(),
    adminKey: z.string(),
    projectSlug: z.string().optional(),
    teamSlug: z.string().optional(),
  }).optional(),
  
  // Timestamps
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});

export type Session = z.infer<typeof SessionSchema>;

// ============================================================================
// Message Schema
// ============================================================================

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageEditSchema = z.object({
  filePath: z.string(),
  oldString: z.string(),
  newString: z.string(),
});

export const MessageReadSchema = z.object({
  filePath: z.string(),
});

export const MessageBashSchema = z.object({
  command: z.string(),
  output: z.string().optional(),
  exitCode: z.number().optional(),
});

export const MessageToolSchema = z.object({
  toolName: z.string(),
  command: z.string().optional(),
  output: z.string().optional(),
  exitCode: z.number().optional(),
  status: z.string().optional(),
});

export const MessageSearchReplaceSchema = z.object({
  filePath: z.string(),
  oldString: z.string(),
  newString: z.string(),
  replacements: z.number().optional(),
});

export const MessageWebSearchSchema = z.object({
  query: z.string(),
  results: z.string().optional(),
});

export const MessageMcpToolSchema = z.object({
  toolName: z.string(),
  input: z.any().optional(),
  output: z.any().optional(),
  status: z.string().optional(),
});

export const MessageCodebaseSearchSchema = z.object({
  query: z.string(),
  results: z.string().optional(),
  targetDirectories: z.array(z.string()).optional(),
});

export const MessageTodoSchema = z.object({
  id: z.string(),
  content: z.string(),
  status: z.string(),
  priority: z.string(),
});

export const MessageImageSchema = z.object({
  fileName: z.string(),
  path: z.string(),
  storageId: z.string().optional(),
});

export const MessageAudioSchema = z.object({
  fileName: z.string(),
  path: z.string(),
  storageId: z.string().optional(),
});

export const MessageVideoSchema = z.object({
  fileName: z.string(),
  path: z.string(),
  storageId: z.string().optional(),
});

export const MessageSchema = z.object({
  // Identification
  _id: IdSchema('messages').optional(),
  _creationTime: z.number().optional(),
  id: z.string(),
  sessionId: IdSchema('sessions'),
  
  // Content
  role: MessageRoleSchema,
  content: z.string(),
  
  // Tools
  edits: MessageEditSchema.optional(),
  read: MessageReadSchema.optional(),
  bash: MessageBashSchema.optional(),
  tool: MessageToolSchema.optional(),
  searchReplace: MessageSearchReplaceSchema.optional(),
  webSearch: MessageWebSearchSchema.optional(),
  mcpTool: MessageMcpToolSchema.optional(),
  codebaseSearch: MessageCodebaseSearchSchema.optional(),
  
  // Attachments
  images: z.array(MessageImageSchema).optional(),
  audios: z.array(MessageAudioSchema).optional(),
  videos: z.array(MessageVideoSchema).optional(),
  
  // Tasks
  todos: z.array(MessageTodoSchema).optional(),
  
  // Metadata
  checkpoint: z.object({
    branch: z.string(),
    patch: z.string().optional(),
  }).optional(),
  thinking: z.string().optional(),
  streamId: z.string().optional(),
  
  // Cost tracking
  costUSD: z.number().optional(),
  modelUsed: z.string().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  cacheReadTokens: z.number().optional(),
  cacheCreationTokens: z.number().optional(),
  durationMs: z.number().optional(),
  createdAt: z.number().optional(),
  
  // Timestamps
  updatedAt: z.number().optional(),
});

export type Message = z.infer<typeof MessageSchema>;

// ============================================================================
// GitHub Credentials Schema
// ============================================================================

export const GitHubCredentialsSchema = z.object({
  clerkId: z.string(),
  accessToken: z.string(),
  username: z.string(),
  connectedAt: z.number(),
  updatedAt: z.number(),
});

export type GitHubCredentials = z.infer<typeof GitHubCredentialsSchema>;

// ============================================================================
// Payment Transaction Schema
// ============================================================================

export const PaymentTransactionSchema = z.object({
  userId: z.string(),
  transactionId: z.string(),
  type: z.enum(['payment', 'refund', 'chargeback', 'adjustment', 'subscription_change', 'failed_payment']),
  amount: z.number(),
  currency: z.string(),
  status: z.enum(['pending', 'succeeded', 'failed', 'refunded', 'disputed']),
  description: z.string().optional(),
  metadata: z.any().optional(),
  messagesAdded: z.number().optional(),
  subscriptionPlan: z.string().optional(),
  processedAt: z.number(),
  createdAt: z.number(),
  
  // Stripe integration
  stripePaymentIntentId: z.string().optional(),
  stripeInvoiceId: z.string().optional(),
  stripeChargeId: z.string().optional(),
  stripeSessionId: z.string().optional(),
});

export type PaymentTransaction = z.infer<typeof PaymentTransactionSchema>;

// ============================================================================
// Template Schema
// ============================================================================

export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  repository: z.string(),
  logos: z.array(z.string()).optional(),
  image: z.string().optional(), // E2B template ID
  startCommands: z.array(z.object({
    command: z.string(),
    status: z.string(),
    background: z.boolean().optional(),
  })),
  secrets: z.record(z.string(), z.string()).optional(),
  systemPrompt: z.string(),
});

export type Template = z.infer<typeof TemplateSchema>;

// ============================================================================
// Global Config Schema
// ============================================================================

export const GlobalConfigSchema = z.object({
  key: z.string(),
  value: z.string(),
  updatedAt: z.number(),
  updatedBy: z.string().optional(),
});

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

// ============================================================================
// Schema Validation
// ============================================================================

export function validateUser(user: unknown): User {
  return UserSchema.parse(user);
}

export function validateSession(session: unknown): Session {
  return SessionSchema.parse(session);
}

export function validateMessage(message: unknown): Message {
  return MessageSchema.parse(message);
}

export function validateGitHubCredentials(creds: unknown): GitHubCredentials {
  return GitHubCredentialsSchema.parse(creds);
}

export function validatePaymentTransaction(tx: unknown): PaymentTransaction {
  return PaymentTransactionSchema.parse(tx);
}

export function validateTemplate(template: unknown): Template {
  return TemplateSchema.parse(template);
}

export function validateGlobalConfig(config: unknown): GlobalConfig {
  return GlobalConfigSchema.parse(config);
}

// ============================================================================
// Type Guards
// ============================================================================

export function isSession(obj: unknown): obj is Session {
  return SessionSchema.safeParse(obj).success;
}

export function isMessage(obj: unknown): obj is Message {
  return MessageSchema.safeParse(obj).success;
}

export function isUser(obj: unknown): obj is User {
  return UserSchema.safeParse(obj).success;
}

// ============================================================================
// Exports
// ============================================================================
// All schemas above are declared with `export const` and therefore already
// exported from this module. No re-export block is required here.
