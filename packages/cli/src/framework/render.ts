/**
 * Renderer — mapping des événements du bus vers la sortie terminal.
 * UNIQUE source de rendu partagée par le mode `run` (non-interactif) et
 * le mode `interactive` (REPL). Aucun doublon de switch de rendu.
 */

import { globalEventBus } from "@soryos/bus";
import { bold, blue, cyan, dim, emitNdjson, green, println, red, yellow } from "./ui";

export interface RendererOptions {
  sessionId: string;
  formatJson: boolean;
  /** Émet le statut final (succès/échec) au rendu. */
  onFailure?: (message: string) => void;
}

/**
 * Branche le renderer sur le bus pour une session donnée.
 * @returns fonction de désabonnement
 */
export function attachRenderer(opts: RendererOptions): () => void {
  return globalEventBus.on("*", (event: any) => {
    if (event.sessionId && event.sessionId !== opts.sessionId) return;
    const { type, data = {} } = event;

    if (opts.formatJson) {
      emitNdjson({ type, sessionId: opts.sessionId, timestamp: event.timestamp, ...data });
      return;
    }

    switch (type) {
      case "agent.started":
        println(green("● Agent started"));
        break;

      case "agent.text":
      case "agent.streaming.text":
        // Le texte est écrit en streaming par l'appelant (executeRun).
        break;

      case "tool.started":
      case "agent.tool.started":
        println(yellow(`⚙ ${data.toolName}`));
        break;

      case "tool.completed":
      case "agent.tool.completed":
        println(green(`✔ ${data.toolName}`));
        break;

      case "tool.failed":
      case "agent.tool.failed":
        println(red(`✖ ${data.toolName} — ${data.error}`));
        break;

      case "file.changed":
        println(cyan(`📄 ${data.path} (${data.action})`));
        break;

      case "process.started":
        println(blue(`▶ ${data.command}`));
        break;

      case "process.exited": {
        const ec = Number(data.exitCode);
        println((ec === 0 ? green : red)(`◀ exited ${data.exitCode} (${data.durationMs}ms)`));
        break;
      }

      case "permission.requested":
        println(dim(`⚡ Permission asked: ${data.toolName}`));
        break;

      case "permission.granted":
        println(green(`✔ Permission granted: ${data.toolName}`));
        break;

      case "permission.denied":
        println(red(`✖ Permission denied: ${data.reason}`));
        break;

      case "agent.completed":
        println("");
        println(bold(green(`✔ Task finished (${data.stepsExecuted} steps, ${data.toolsExecuted} tools)`)));
        break;

      case "agent.failed":
        println(bold(red(`✖ Task failed: ${data.message ?? data.error ?? "unknown error"}`)));
        opts.onFailure?.(data.message ?? data.error ?? "unknown error");
        break;
    }
  });
}

/** Écrit un delta de texte en streaming (stderr en TTY, stdout sinon). */
export function writeTextDelta(delta: string): void {
  if (!process.stdout.isTTY) {
    process.stdout.write(delta);
  } else {
    process.stderr.write(delta);
  }
}
