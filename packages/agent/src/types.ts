/**
 * @soryos/agent
 * Core types for the Agent Runtime.
 */

/**
 * Agent definition
 */
export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  model: string;
  provider: string;
  capabilities: string[];
  systemPrompt?: string;
}

/**
 * Agent run options
 */
export interface AgentRunOptions {
  sessionId?: string;
  input: string;
  model?: string;
  provider?: string;
  streaming?: boolean;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
  onToolCall?: (toolCall: ToolCall) => Promise<ToolResult>;
  onMessage?: (message: AgentMessage) => void;
  onError?: (error: Error) => void;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  context?: Record<string, unknown>;
}

/**
 * Agent run result
 */
export interface AgentRunResult {
  id: string;
  sessionId?: string;
  input: string;
  output: string;
  steps: AgentStep[];
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  model: string;
  provider: string;
  costUSD?: number;
  inputTokens?: number;
  outputTokens?: number;
  timestamp: number;
  // Error classification fields
  errorType?: string;
  errorCode?: string;
  isRetryable?: boolean;
  recoverySuggestions?: string[];
}

/**
 * Agent step (for streaming)
 */
export interface AgentStep {
  type: 'text' | 'tool' | 'result' | 'init' | 'error';
  text?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  result?: unknown;
  error?: string;
  timestamp: number;
}

/**
 * Agent message
 */
export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  steps?: AgentStep[];
  timestamp: number;
  model?: string;
  provider?: string;
}

/**
 * Tool call interface
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  type?: 'function' | 'code' | 'bash' | 'read' | 'write' | 'edit' | 'search';
}

/**
 * Tool result interface
 */
export interface ToolResult {
  id: string;
  toolCallId: string;
  name: string;
  success: boolean;
  output?: string;
  result?: unknown;
  error?: string;
  durationMs?: number;
}

/**
 * Streaming chunk interface
 */
export interface StreamingChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'error';
  data: unknown;
  timestamp: number;
}

/**
 * Conversation context
 */
export interface ConversationContext {
  sessionId: string;
  messages: AgentMessage[];
  currentModel: string;
  currentProvider: string;
  tools: string[];
  capabilities: string[];
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  model: string;
  provider: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  systemPrompt?: string;
  tools?: string[];
  streaming?: boolean;
}

/**
 * Session context for agent
 */
export interface AgentSessionContext {
  sessionId: string;
  userId?: string;
  workspaceId?: string;
  projectId?: string;
  sandboxId?: string;
  tunnelUrl?: string;
  status: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Agent state
 */
export interface AgentState {
  isRunning: boolean;
  currentSessionId?: string;
  currentMessageId?: string;
  isStreaming: boolean;
  lastError?: Error;
  lastErrorClassification?: any; // ClassifiedError from error-handler
}
