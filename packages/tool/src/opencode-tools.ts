/**
 * opencode — outils d'auto-gestion de l'agent.
 * Renomme/déplace les sessions, liste les modèles disponibles, etc.
 */

import { globalEventBus } from "@soryos/bus";
import { sessionStore } from "@soryos/session";
import { resolve } from "node:path";
import { existsSync, statSync } from "node:fs";

export interface OpenCodeResult {
  success: boolean;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description?: string;
}

/**
 * Built-in model registry.
 * In a full implementation, this would come from the provider registry.
 */
const AVAILABLE_MODELS: ModelInfo[] = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google", description: "Fast and efficient model for most tasks" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google", description: "Advanced reasoning and coding" },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", description: "Multimodal flagship model" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", description: "Fast and cost-effective" },
  { id: "claude-sonnet-4", name: "Claude Sonnet 4", provider: "anthropic", description: "Balanced performance and cost" },
  { id: "claude-opus-4", name: "Claude Opus 4", provider: "anthropic", description: "Most capable Claude model" },
  { id: "mistral-large", name: "Mistral Large", provider: "mistral", description: "European flagship model" },
];

export interface ModelPage {
  providers: { id: string; name: string; models: ModelInfo[] }[];
  total: number;
  next: number | null;
}

export function searchModels(
  query?: string,
  provider?: string,
  opts?: { all?: boolean; limit?: number; offset?: number },
): { models: ModelInfo[]; total: number } {
  let models = AVAILABLE_MODELS;

  if (provider) {
    const lower = provider.toLowerCase();
    models = models.filter((m) => m.provider.toLowerCase() === lower);
  }

  if (query) {
    const lower = query.toLowerCase();
    models = models.filter(
      (m) =>
        m.id.toLowerCase().includes(lower) ||
        m.name.toLowerCase().includes(lower) ||
        m.provider.toLowerCase().includes(lower) ||
        m.description?.toLowerCase().includes(lower)
    );
  }

  const total = models.length;
  const offset = opts?.offset ?? 0;
  const limit = opts?.limit ?? 20;
  return { models: models.slice(offset, offset + limit), total };
}

export class OpenCodeTools {
  /**
   * Rename a session.
   */
  async renameSession(sessionId: string, title: string): Promise<OpenCodeResult> {
    const callId = `opencode-rename-${Date.now()}`;
    const trimmed = title.trim();

    if (!trimmed) {
      return { success: false, error: "Session title must not be empty." };
    }

    globalEventBus.emit("tool.started", { toolName: "session_rename", input: { sessionId, title: trimmed }, callId });

    try {
      const session = sessionStore.get(sessionId);
      if (!session) {
        const message = `Session "${sessionId}" not found.`;
        globalEventBus.emit("tool.failed", { toolName: "session_rename", error: message, callId });
        return { success: false, error: message };
      }

      sessionStore.update(sessionId, { title: trimmed });

      const output = `Renamed session ${sessionId} to "${trimmed}".`;
      const metadata = { sessionId, title: trimmed };

      globalEventBus.emit("tool.completed", { toolName: "session_rename", output, callId, metadata });
      return { success: true, output, metadata };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      globalEventBus.emit("tool.failed", { toolName: "session_rename", error: message, callId });
      return { success: false, error: `Failed to rename session: ${message}` };
    }
  }

  /**
   * Move a session to another directory.
   */
  async moveSession(sessionId: string, directory: string): Promise<OpenCodeResult> {
    const callId = `opencode-move-${Date.now()}`;
    const trimmed = directory.trim();

    if (!trimmed) {
      return { success: false, error: "Directory must not be empty." };
    }

    globalEventBus.emit("tool.started", { toolName: "session_move", input: { sessionId, directory: trimmed }, callId });

    try {
      const session = sessionStore.get(sessionId);
      if (!session) {
        const message = `Session "${sessionId}" not found.`;
        globalEventBus.emit("tool.failed", { toolName: "session_move", error: message, callId });
        return { success: false, error: message };
      }

      const target = resolve(trimmed.startsWith("~") ? trimmed.replace("~", process.env.HOME ?? "~") : trimmed);
      if (!existsSync(target)) {
        const message = `Directory "${target}" does not exist.`;
        globalEventBus.emit("tool.failed", { toolName: "session_move", error: message, callId });
        return { success: false, error: message };
      }
      if (!statSync(target).isDirectory()) {
        const message = `"${target}" is not a directory.`;
        globalEventBus.emit("tool.failed", { toolName: "session_move", error: message, callId });
        return { success: false, error: message };
      }

      sessionStore.update(sessionId, { cwd: target });

      const output = `Moved session ${sessionId} to ${target}.`;
      const metadata = { sessionId, directory: target };

      globalEventBus.emit("tool.completed", { toolName: "session_move", output, callId, metadata });
      return { success: true, output, metadata };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      globalEventBus.emit("tool.failed", { toolName: "session_move", error: message, callId });
      return { success: false, error: `Failed to move session: ${message}` };
    }
  }

  /**
   * List available models with optional filtering and paging.
   */
  listModels(query?: string, provider?: string, opts?: { all?: boolean; limit?: number; offset?: number }): OpenCodeResult {
    const callId = `opencode-models-${Date.now()}`;

    globalEventBus.emit("tool.started", { toolName: "models", input: { query, provider, ...opts }, callId });

    const { models, total } = searchModels(query, provider, opts);

    if (models.length === 0) {
      const output = `No models found${query ? ` matching "${query}"` : ""}${provider ? ` from provider "${provider}"` : ""}.`;
      globalEventBus.emit("tool.completed", { toolName: "models", output, callId, metadata: { count: 0 } });
      return { success: true, output, metadata: { count: 0, total } };
    }

    const byProvider = new Map<string, ModelInfo[]>();
    for (const model of models) {
      const list = byProvider.get(model.provider) ?? [];
      list.push(model);
      byProvider.set(model.provider, list);
    }

    const sections: string[] = [];
    for (const [providerId, providerModels] of byProvider) {
      const modelLines = providerModels
        .map((m) => `  - ${m.name} (${m.id})${m.description ? ` — ${m.description}` : ""}`)
        .join("\n");
      sections.push(`## ${providerId}\n${modelLines}`);
    }

    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? 20;
    const next = offset + limit < total ? offset + limit : null;
    const header = `Available models (${models.length} of ${total})${next !== null ? ` — next page at offset ${next}` : ""}:`;
    const output = `${header}\n\n${sections.join("\n\n")}`;
    const metadata = { count: models.length, total, next, providers: Array.from(byProvider.keys()) };

    globalEventBus.emit("tool.completed", { toolName: "models", output, callId, metadata });
    return { success: true, output, metadata };
  }

  /**
   * Get information about the current session.
   */
  getSessionInfo(sessionId: string): OpenCodeResult {
    const callId = `opencode-session-info-${Date.now()}`;

    globalEventBus.emit("tool.started", { toolName: "session_info", input: { sessionId }, callId });

    const session = sessionStore.get(sessionId);
    if (!session) {
      const message = `Session "${sessionId}" not found.`;
      globalEventBus.emit("tool.failed", { toolName: "session_info", error: message, callId });
      return { success: false, error: message };
    }

    const info = {
      id: session.id,
      title: session.title ?? "(untitled)",
      model: session.model ?? "(default)",
      agentRunning: session.agent_running ?? false,
      cwd: session.cwd ?? process.cwd(),
      messageCount: session.messages?.length ?? 0,
    };

    const output = [
      `Session: ${info.id}`,
      `Title: ${info.title}`,
      `Model: ${info.model}`,
      `Running: ${info.agentRunning ? "yes" : "no"}`,
      `Directory: ${info.cwd}`,
      `Messages: ${info.messageCount}`,
    ].join("\n");

    globalEventBus.emit("tool.completed", { toolName: "session_info", output, callId, metadata: info });
    return { success: true, output, metadata: info };
  }
}
