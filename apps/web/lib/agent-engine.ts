
import { sessionStore } from "@soryos/session";
import { workspaceManager } from "@soryos/workspace";
import { agentRuntime, SUBAGENT_DEFINITIONS, getSubagentDefinition } from "@soryos/agent";
import type { SessionData, ChatMessage, MessageBlock, ToolStep, ProviderId, AgentEventType, AgentEvent, EnvironmentType } from "@soryos/schema";
import { executionManager } from "@soryos/execution";

export const getSessionData = sessionStore.getOrCreate;
export const saveSession = sessionStore.save;
export const deleteSessionData = sessionStore.delete;
export const listSessionsData = sessionStore.list;

export const updateSessionTitle = (id: string, title: string): boolean => {
  const session = sessionStore.get(id);
  if (!session) return false;
  session.title = title;
  sessionStore.save(session);
  return true;
};

export { workspaceManager, agentRuntime, SUBAGENT_DEFINITIONS as AGENT_MATRIX, getSubagentDefinition as getAgentDefinition, executionManager };
export type { SessionData, ChatMessage, MessageBlock, ToolStep, ProviderId, AgentEventType, AgentEvent, EnvironmentType };

export function createNewSession(
  title: string = "New Session",
  message?: string,
  model?: string,
  providerId: ProviderId = "local"
): SessionData {
  const id = `session-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const env = providerId === "local" ? "local" : "sandbox";
  const ws = workspaceManager.getOrCreateWorkspace(id, { environment: env, providerId: providerId });
  const session = sessionStore.getOrCreate(id);
  session.title = title;
  session.environment = ws.environment;
  session.providerId = ws.providerId;
  if (model) session.model = model;
  if (message) session.messages.push({ id: crypto.randomUUID(), role: "user", content: message, created_at: new Date().toISOString() });
  sessionStore.save(session);
  return session;
}

export * from "@soryos/schema";
