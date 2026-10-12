/**
 * @soryos/schema
 * Central types and domain contracts for SoryOS-Code.
 */

// 1. Workspace Contracts
export type ProviderId = "local" | "github-codespaces" | "github-repository" | "e2b" | "vercel" | "google-cloud-run";

export type WorkspaceStatus = "NO_WORKSPACE" | "WORKSPACE_LOADING" | "WORKSPACE_READY" | "WORKSPACE_ERROR";

export interface ActiveWorkspace {
  id: string;
  projectId: string;
  sessionId: string;
  title: string;
  environment: "local" | "sandbox";
  providerId: ProviderId;
  workspacePath: string;
  repository?: string;
  branch?: string;
  commit?: string;
  codespaceId?: string;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
}

// 2. Execution Contracts
export interface CommandOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  background?: boolean;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface FileEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  sizeBytes: number;
  updatedAt: string;
}

// 3. Tool Contracts
export interface ToolPropertySchema {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string };
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: "filesystem" | "shell" | "process" | "git" | "planning" | "web";
  parameters: {
    type: "object";
    properties: Record<string, ToolPropertySchema>;
    required: string[];
  };
}

export interface ToolExecutionResult {
  toolName: string;
  output: string;
  isError: boolean;
  metadata?: Record<string, unknown>;
  verified?: boolean;
}

export interface ToolStep {
  id: string;
  name: string;
  input: Record<string, unknown> | any;
  output?: string;
  error?: string;
  status: "pending" | "running" | "done" | "error" | "success" | "cancelled";
  startedAt?: string;
  completedAt?: string;
  isError?: boolean;
  metadata?: Record<string, unknown>;
}

// 4. Message & Session Contracts
export interface MessageBlock {
  type: "text" | "tool" | "thought" | "error" | "question";
  content?: string;
  step?: ToolStep;
  question?: {
    id: string;
    text: string;
    options?: string[];
    answered?: boolean;
    answer?: string;
  };
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  blocks?: MessageBlock[];
  created_at?: string;
}

export interface SessionError {
  timestamp: string;
  type: string;
  code: string;
  message: string;
  userMessage?: string;
  recoverySuggestions?: string[];
}

export interface SessionData {
  id: string;
  title: string;
  sandbox_id: string;
  sandbox_state: "running" | "paused" | "dead";
  environment: "sandbox" | "local";
  providerId: ProviderId;
  codespaceId?: string;
  repository?: string;
  branch?: string;
  workspaceState?: WorkspaceStatus;
  workspaceError?: string;
  model: string;
  provider: string;
  created_at: string;
  messages: ChatMessage[];
  files: Record<string, string>;
  preview_url: string | null;
  needs_run: boolean;
  agent_running: boolean;
  cwd: string;
  errors?: SessionError[];
}

// 5. Event Bus Contracts
export type AgentEventType =
  | "session.created"
  | "session.updated"
  | "agent.started"
  | "agent.thinking"
  | "agent.text"
  | "agent.completed"
  | "agent.failed"
  | "agent.status"
  | "agent.streaming.started"
  | "agent.streaming.text"
  | "agent.streaming.ended"
  | "agent.streaming.error"
  | "agent.tool.started"
  | "agent.tool.completed"
  | "agent.tool.failed"
  | "agent.tool.call"
  | "agent.tool.result"
  | "agent.tool.write"
  | "agent.tool.edit"
  | "agent.tool.read"
  | "agent.tool.bash"
  | "agent.tool.todo"
  | "agent.error"
  | "tool.started"
  | "tool.output"
  | "tool.completed"
  | "tool.failed"
  | "file.changed"
  | "process.started"
  | "process.output"
  | "process.ready"
  | "process.failed"
  | "process.exited"
  | "permission.requested"
  | "permission.granted"
  | "permission.denied"
  | "status";

export interface AgentEventPayload {
  sessionId: string;
  timestamp: string;
  type: AgentEventType;
  data: Record<string, unknown>;
}

// 6. SSE Event Types (for streaming)
export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | { type: "tool_end"; id: string; output: string; isError: boolean }
  | { type: "preview"; url: string }
  | { type: "files_changed"; paths: string[] }
  | { type: "status"; message: string }
  | { type: "done"; usage?: { input: number; output: number; cacheRead: number; cacheMiss: number } }
  | { type: "error"; message: string };

// 7. Agent Mode & Permissions
export type AgentRoleMode = "build" | "plan" | "explore" | "code-reviewer" | "web-researcher" | "live-voice" | "custom";

export interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  description: string;
  badge: string;
  icon: string;
  color: string;
  mode: "primary" | "subagent" | "all";
  tools: string[];
  systemPrompt: string;
  whenToUse: string;
  capabilities: string[];
}

// 8. Environment Types
export type EnvironmentType = "sandbox" | "local";
