/**
 * @soryos/web
 * Agent Engine Adapter - WRAPPER ONLY
 * 
 * Ce fichier est UNIQUEMENT un wrapper qui délègue toute la logique 
 * vers les packages officiels @soryos/*.
 * 
 * NE JAMAIS mettre de logique métier ici.
 * TOUTE la logique doit être dans packages/@soryos/*
 */

// ============================================================================
// RE-EXPORTS DES PACKAGES OFFICIELS
// ============================================================================

// 1. Session Management (from @soryos/session)
import { sessionStore } from "@soryos/session";
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

// 2. Workspace Management (from @soryos/workspace)
import { workspaceManager } from "@soryos/workspace";
export { workspaceManager };

// 3. Agent Runtime (from @soryos/agent)
import { agentRuntime, AGENT_MATRIX, getAgentDefinition } from "@soryos/agent";
export { agentRuntime, AGENT_MATRIX, getAgentDefinition };

// 4. Types (from @soryos/schema)
import type {
  SessionData,
  ChatMessage,
  MessageBlock,
  ToolStep,
  ProviderId,
  AgentEventType,
  AgentEvent,
  EnvironmentType,
} from "@soryos/schema";
export type {
  SessionData,
  ChatMessage,
  MessageBlock,
  ToolStep,
  ProviderId,
  AgentEventType,
  AgentEvent,
  EnvironmentType,
};

// 5. Execution (from @soryos/execution)
import { executionManager } from "@soryos/execution";
export { executionManager };

// ============================================================================
// FONCTIONS DE CRÉATION (pour compatibilité avec l'API existante)
// ============================================================================

/**
 * Crée une nouvelle session avec un workspace.
 * @param title - Titre de la session
 * @param message - Message initial (optionnel)
 * @param model - Modèle IA (optionnel)
 * @returns La session créée
 */
export function createNewSession(
  title: string = "New Session",
  message?: string,
  model?: string,
  providerId: ProviderId = "local"
): SessionData {
  const id = `session-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  // Créer le workspace (default local, never force e2b unless requested)
  const env = providerId === "local" ? "local" : "sandbox";
  const ws = workspaceManager.getOrCreateWorkspace(id, {
    environment: env,
    providerId: providerId,
  });
  
  // Créer la session
  const session = sessionStore.getOrCreate(id, title);
  session.environment = ws.environment;
  session.providerId = ws.providerId;
  
  if (model) {
    session.model = model;
  }
  
  if (message) {
    session.messages.push({
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      created_at: new Date().toISOString(),
    });
  }
  
  sessionStore.save(session);
  return session;
}

// ============================================================================
// EXPORT DES TYPES POUR COMPATIBILITÉ
// ============================================================================

// Réexporter tout depuis @soryos/schema pour compatibilité
export * from "@soryos/schema";
