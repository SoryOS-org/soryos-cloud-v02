import { SessionData } from "@soryos/schema";
import { sessionStore } from "@soryos/session";
import { workspaceManager } from "@soryos/workspace";
import { agentRuntime } from "./runtime";
import type { AgentRunOptions } from "./types";

export interface RunPipelineOptions {
  sessionId: string;
  agentId?: string;
  modelId?: string;
  apiKey?: string;
}

export type RunPipelineResult =
  | { status: "completed"; session: SessionData }
  | { status: "failed"; session: SessionData | null; error: string };

export async function runPipeline(
  options: RunPipelineOptions,
  emit: (event: { type: string; sessionId: string; timestamp: number; data?: any }) => void,
): Promise<RunPipelineResult> {
  const { sessionId, agentId, modelId, apiKey } = options;

  const session = sessionStore.get(sessionId);
  if (!session) {
    return {
      status: "failed",
      session: null,
      error: `Session not found: ${sessionId}`,
    };
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
    emit,
  };

  try {
    await agentRuntime.run(runOptions);
    const updated = sessionStore.get(sessionId);
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