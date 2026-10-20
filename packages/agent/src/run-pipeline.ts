import { SessionData, ChatImageAttachment } from "@soryos/schema";
import { sessionStore } from "@soryos/session";
import { workspaceManager } from "@soryos/workspace";
import { agentRuntime } from "./runtime";
import type { AgentRunOptions } from "./types";

export interface RunPipelineOptions {
  sessionId: string;
  /** Requête utilisateur (ajoutée à la session si fournie). */
  prompt?: string;
  /** Pièces jointes (vision) attachées au message utilisateur. */
  images?: ChatImageAttachment[];
  agentId?: string;
  modelId?: string;
  apiKey?: string;
}

export type RunPipelineResult =
  | { status: "completed"; session: SessionData }
  | { status: "failed"; session: SessionData | null; error: string };

export async function runPipeline(
  options: RunPipelineOptions,
  emit: (event: { type: string; [key: string]: any }) => void,
): Promise<RunPipelineResult> {
  const { sessionId, prompt, images, agentId, modelId, apiKey } = options;
  let lastErrorMessage: string | undefined;

  const session = sessionStore.get(sessionId);
  if (!session) {
    return {
      status: "failed",
      session: null,
      error: `Session not found: ${sessionId}`,
    };
  }

  // Le message utilisateur fait partie du pipeline : les adaptateurs (CLI, web)
  // ne font que le fournir, jamais l'ajouter eux-mêmes.
  if (prompt) {
    session.messages.push({
      id: `user-${Date.now()}`,
      role: "user",
      content: prompt,
      created_at: new Date().toISOString(),
      ...(images && images.length > 0 ? { images } : {}),
    });
  }

  session.confirmDangerous = session.confirmDangerous ?? false;
  sessionStore.save(session);

  if (!workspaceManager.getWorkspace(sessionId)) {
    workspaceManager.getOrCreateWorkspace(sessionId, {
      environment: session.environment ?? "local",
      providerId: session.providerId ?? "local",
      workspacePath: process.cwd(),
    });
  }

  const runOptions: AgentRunOptions = {
    sessionId,
    modelId: modelId ?? session.model,
    agentId: agentId ?? "build",
    apiKey,
    // On intercepte les événements d'erreur pour remonter le VRAI message
    // (le planner échoue sans lever d'exception : il émet `error` puis
    // retourne 'failed').
    emit: (event: any) => {
      if (event?.type === "error" && typeof event.message === "string" && event.message.trim()) {
        lastErrorMessage = event.message;
      }
      emit(event);
    },
  };

  try {
    const outcome = await agentRuntime.run(runOptions);
    const updated = sessionStore.get(sessionId);

    if (outcome === "failed") {
      return {
        status: "failed",
        session: updated ?? session,
        error: lastErrorMessage ?? "L'agent n'a pas pu terminer cette demande — voir les erreurs de la session.",
      };
    }

    return {
      status: "completed",
      session: updated ?? session,
    };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      status: "failed",
      session: sessionStore.get(sessionId) ?? null,
      error,
    };
  }
}