/**
 * @soryos/session
 * Session lifecycle, persistence, message history, and state management.
 */

import { SessionData, ChatMessage } from "@soryos/schema";
import { workspaceManager } from "@soryos/workspace";
import { globalEventBus } from "@soryos/bus";

declare global {
  var __soryos_sessions: Map<string, SessionData> | undefined;
}

const sessionsStore: Map<string, SessionData> =
  globalThis.__soryos_sessions ?? new Map();
globalThis.__soryos_sessions = sessionsStore;

export class SessionStore {
  public get(id: string): SessionData | undefined {
    return sessionsStore.get(id);
  }

  public getOrCreate(id: string, initialTitle?: string): SessionData {
    let session = sessionsStore.get(id);

    if (!session) {
      const ws = workspaceManager.getOrCreateWorkspace(id);

      session = {
        id,
        title: initialTitle || "Workspace Session",
        sandbox_id: `sandbox-${id}`,
        sandbox_state: "running",
        environment: ws.environment,
        providerId: ws.providerId,
        model: "gemini-3.8-flash",
        provider: "Google Gemini",
        created_at: new Date().toISOString(),
        messages: [],
        files: {},
        preview_url: `/api/preview/${id}`,
        needs_run: false,
        agent_running: false,
        cwd: ws.workspacePath,
      };

      sessionsStore.set(id, session);
      globalEventBus.emit(id, "session.created", { sessionId: id });
    }

    return session;
  }

  public save(session: SessionData): void {
    sessionsStore.set(session.id, session);
    globalEventBus.emit(session.id, "session.updated", { sessionId: session.id });
  }

  public delete(id: string): boolean {
    return sessionsStore.delete(id);
  }

  public list(): Array<{ id: string; title: string; created_at: string }> {
    const list: Array<{ id: string; title: string; created_at: string }> = [];
    for (const s of sessionsStore.values()) {
      list.push({ id: s.id, title: s.title, created_at: s.created_at });
    }
    return list.reverse();
  }

  public addMessage(sessionId: string, message: Omit<ChatMessage, "id" | "created_at">): ChatMessage {
    const session = this.getOrCreate(sessionId);
    const fullMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: message.role,
      content: message.content,
      blocks: message.blocks,
      created_at: new Date().toISOString(),
    };
    session.messages.push(fullMsg);
    this.save(session);
    return fullMsg;
  }

  public update(id: string, updates: Partial<SessionData>): SessionData | undefined {
    const s = this.get(id);
    if (!s) return undefined;
    Object.assign(s, updates);
    this.save(s);
    return s;
  }

  // Static convenience methods matching direct SessionStore.get / SessionStore.update calls
  public static get(id: string): SessionData | undefined {
    return sessionStore.get(id);
  }

  public static getOrCreate(id: string, initialTitle?: string): SessionData {
    return sessionStore.getOrCreate(id, initialTitle);
  }

  public static save(session: SessionData): void {
    sessionStore.save(session);
  }

  public static delete(id: string): boolean {
    return sessionStore.delete(id);
  }

  public static list(): Array<{ id: string; title: string; created_at: string }> {
    return sessionStore.list();
  }

  public static addMessage(sessionId: string, message: Omit<ChatMessage, "id" | "created_at">): ChatMessage {
    return sessionStore.addMessage(sessionId, message);
  }

  public static update(id: string, updates: Partial<SessionData>): SessionData | undefined {
    return sessionStore.update(id, updates);
  }
}

export const sessionStore = new SessionStore();

export class MessageStore {
  public getBySession(sessionId: string): ChatMessage[] {
    const s = sessionStore.get(sessionId);
    return s?.messages || [];
  }

  public add(message: { sessionId: string; role: 'user' | 'assistant' | 'system'; content: string; blocks?: any[]; id?: string; createdAt?: number }): ChatMessage {
    return sessionStore.addMessage(message.sessionId, {
      role: message.role,
      content: message.content,
      blocks: message.blocks,
    });
  }

  public update(messageId: string, updates: Partial<ChatMessage>): void {
    for (const session of sessionsStore.values()) {
      const msg = session.messages.find((m) => m.id === messageId);
      if (msg) {
        if (updates.content !== undefined) msg.content = updates.content;
        if (updates.blocks !== undefined) msg.blocks = updates.blocks;
        sessionStore.save(session);
        break;
      }
    }
  }
}

export const messageStore = new MessageStore();

export { workspaceManager } from "@soryos/workspace";
