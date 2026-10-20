/**
 * Engine — logique d'exécution partagée entre le mode `run` et le REPL `interactive`.
 * Appelle le pipeline @soryos/agent (unique source de ce qui tourne) et un
 * renderer @soryos/bus conçu pour être shared.
 */

import { SessionData } from "@soryos/schema";
import { workspaceManager } from "@soryos/workspace";
import { runPipeline, type RunPipelineResult } from "@soryos/agent";
import { attachRenderer, writeTextDelta } from "./render";

export interface RunInput {
  session: SessionData;
  prompt: string;
  agentId?: string;
  modelId?: string;
  apiKey?: string;
  formatJson: boolean;
}

export interface RunOutput {
  status: "completed" | "failed";
  error?: string;
  session: SessionData | null;
}

/** Assure que le workspace existe pour la session (une seule fois). */
function ensureWorkspace(session: SessionData): void {
  if (!workspaceManager.getWorkspace(session.id)) {
    workspaceManager.getOrCreateWorkspace(session.id, {
      environment: session.environment ?? "local",
      providerId: session.providerId ?? "local",
      workspacePath: process.cwd(),
    });
  }
}

/**
 * Lancement unique : attache le renderer au bus, appelle le pipeline, nettoyage.
 */
export async function executeRun(input: RunInput): Promise<RunOutput> {
  const { session, prompt, agentId, modelId, apiKey, formatJson } = input;

  ensureWorkspace(session);

  const unsubscribe = attachRenderer({
    sessionId: session.id,
    formatJson,
  });

  try {
    const result: RunPipelineResult = await runPipeline(
      {
        sessionId: session.id,
        prompt,
        agentId: agentId ?? "build",
        modelId: modelId ?? session.model,
        apiKey,
      },
      (event: { type: string; [key: string]: any }) => {
        // Le planner émet des événements plats : { type: 'text', delta }
        if (event.type === "text" && event.delta && !formatJson) {
          writeTextDelta(event.delta as string);
        }
      },
    );

    if (result.status === "failed") {
      return {
        status: "failed",
        error: result.error,
        session: result.session,
      };
    }

    return {
      status: "completed",
      session: result.session,
    };
  } finally {
    unsubscribe();
  }
}