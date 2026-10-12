/**
 * @soryos/database
 * Type Definitions for Real-time Database
 */

import { Id } from './schema';
import type { Session as SessionSchemaType, Message as MessageSchemaType } from './schema';
import type { SessionStatus, MessageRole } from './schema';

// `Session`, `SessionStatus`, `Message` and `MessageRole` are derived from the
// Zod schemas in ./schema and re-exported below so there is a single source of
// truth. Only the types Zod does not model (query options, subscriptions,
// events, tool payload shapes) are declared in this file.
export type {
  Session,
  SessionStatus,
  Message,
  MessageRole,
} from './schema';

// The Zod schemas mark `_id` and `_creationTime` optional because the backing
// store injects them. Once a record has been persisted those fields are always
// present, so reads and in-memory storage use these narrowed types.
export type StoredSession = SessionSchemaType & {
  _id: Id<'sessions'>;
  _creationTime: number;
};

export type StoredMessage = MessageSchemaType & {
  _id: Id<'messages'>;
  _creationTime: number;
};

// ============================================================================
// Session Types
// ============================================================================
// `Session` and `SessionStatus` come from ./schema (see re-export above).

// ============================================================================
// Message Types
// ============================================================================
// `Message` and `MessageRole` come from ./schema (see re-export above).

export type ToolType = 
  | 'read'
  | 'edit'
  | 'bash'
  | 'grep'
  | 'searchReplace'
  | 'webSearch'
  | 'mcpTool'
  | 'tool'
  | 'codebaseSearch';

export interface MessageEdit {
  filePath: string;
  oldString: string;
  newString: string;
}

export interface MessageRead {
  filePath: string;
}

export interface MessageBash {
  command: string;
  output?: string;
  exitCode?: number;
}

export interface MessageTool {
  toolName: string;
  command?: string;
  output?: string;
  exitCode?: number;
  status?: string;
}

export interface MessageSearchReplace {
  filePath: string;
  oldString: string;
  newString: string;
  replacements?: number;
}

export interface MessageWebSearch {
  query: string;
  results?: string;
}

export interface MessageMcpTool {
  toolName: string;
  input?: any;
  output?: any;
  status?: string;
}

export interface MessageCodebaseSearch {
  query: string;
  results?: string;
  targetDirectories?: string[];
}

// ============================================================================
// Subscription Types
// ============================================================================

export interface SubscriptionOptions {
  sessionId?: string;
  /** Max number of records returned by the initial fetch. */
  limit?: number;
  messageLimit?: number;
  includeMessages?: boolean;
  includeFiles?: boolean;
}

export interface SubscriptionCallback<T> {
  (data: T, error?: Error): void;
}

export interface Subscription {
  unsubscribe: () => void;
  isActive: boolean;
}

// ============================================================================
// Event Types
// ============================================================================

export type DatabaseEventType =
  | 'message.added'
  | 'message.updated'
  | 'message.removed'
  | 'session.created'
  | 'session.updated'
  | 'session.removed'
  | 'error';

export interface DatabaseEvent {
  type: DatabaseEventType;
  timestamp: string;
  data?: any;
  error?: Error;
}

export interface DatabaseEventListener {
  (event: DatabaseEvent): void;
}

// ============================================================================
// Query Types
// ============================================================================

export interface QueryOptions {
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
}

export interface SessionQueryOptions extends QueryOptions {
  createdBy?: string;
  status?: SessionStatus;
  templateId?: string;
}

export interface MessageQueryOptions extends QueryOptions {
  sessionId?: string;
  role?: MessageRole;
}
