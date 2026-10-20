/**
 * Interactive — REPL terminal du CLI SoryOS-Code.
 *
 * Inspire du REPL d'opencode (prompt persistant, historique, slash commands)
 * mais reste un adaptateur texte : le moteur est @soryos/agent (runPipeline),
 * le rendu est framework/render.ts. Zéro dépendance, zéro TUI framework.
 */

import * as readline from "node:readline";
import { SessionData } from "@soryos/schema";
import { sessionStore } from "@soryos/session";
import { globalEventBus } from "@soryos/bus";
import { resolvePermissionRequest } from "@soryos/permissions";
import { bold, cyan, dim, green, red, warn, danger, println, requireInteractive, EXIT_OK, EXIT_ERROR, EXIT_INTERRUPT } from "./ui";
import { executeRun } from "./engine";
import { cliSessionStore } from "../cli-session-store";

export interface InteractiveOptions {
  session: SessionData;
  agentId: string;
  apiKey: string;
  formatJson: boolean;
  /** Auto-approuve les demandes de permission (--auto). */
  auto?: boolean;
}

interface SlashOutcome {
  action: "continue" | "exit";
  exitCode?: number;
  /** Nouvelle session courante (commande /new). */
  session?: SessionData;
  /** Nouvel agent (commande /agent). */
  agentId?: string;
  /** Nouveau modèle (commande /model). */
  model?: string;
}

const SLASH_HELP = [
  "/help, /h        Show this help",
  "/exit, /quit     Exit the session",
  "/new [title]     Start a new session",
  "/model <id>      Change model (e.g. /model gemini-2.5-flash)",
  "/agent <role>    Change agent (build|plan|explore|code-reviewer)",
  "/sessions        List recent sessions",
  "/clear           Clear the screen",
  "/history         Show the prompt history",
  "Ctrl+C / Ctrl+D  Exit",
];

/** Exécute une slash command. */
function handleSlash(
  cmd: string,
  args: string[],
  session: SessionData,
  agentId: string,
): SlashOutcome {
  switch (cmd) {
    case "help":
    case "h":
      println(bold(cyan("\nSlash commands:")));
      for (const line of SLASH_HELP) println(dim(`  ${line}`));
      println("");
      return { action: "continue" };

    case "exit":
    case "quit":
    case "q":
      return { action: "exit", exitCode: EXIT_OK };

    case "new": {
      const id = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const title = args.length ? args.join(" ") : "CLI Session";
      const fresh: SessionData = {
        ...session,
        id,
        title,
        sandbox_id: `sandbox-${id}`,
        created_at: new Date().toISOString(),
        messages: [],
        todos: undefined,
        errors: undefined,
      };
      sessionStore.getOrCreate(fresh.id);
      sessionStore.save(fresh);
      println(green(`✔ New session: ${fresh.id}`));
      return { action: "continue", session: fresh };
    }

    case "model": {
      if (!args.length) {
        println(dim(`Current model: ${session.model}`));
        return { action: "continue" };
      }
      return { action: "continue", model: args[0] };
    }

    case "agent": {
      const valid = ["build", "plan", "explore", "code-reviewer"];
      if (!args.length) {
        println(dim(`Current agent: ${agentId}`));
        return { action: "continue" };
      }
      const next = args[0].toLowerCase();
      if (!valid.includes(next)) {
        println(danger(`Invalid agent "${next}". Must be one of: ${valid.join(", ")}`));
        return { action: "continue" };
      }
      return { action: "continue", agentId: next };
    }

    case "sessions": {
      const sessions = sessionStore
        .list()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 10);
      if (!sessions.length) {
        println(dim("No sessions found."));
        return { action: "continue" };
      }
      println(bold(cyan("\nRecent sessions:")));
      for (const s of sessions) {
        const marker = s.id === session.id ? green(" (current)") : "";
        println(dim(`  ${s.id}${marker} — ${s.title}`));
      }
      println("");
      return { action: "continue" };
    }

    case "clear":
      process.stderr.write("\x1b[2J\x1b[0f");
      return { action: "continue" };

    default:
      println(danger(`Unknown command "/${cmd}". Type /help for the list.`));
      return { action: "continue" };
  }
}

/** Parse une slash command. */
function parseSlash(input: string): [string, string[]] | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const parts = trimmed.slice(1).trim().split(/\s+/);
  return [parts[0].toLowerCase(), parts.slice(1)];
}

/**
 * Boucle REPL. Le prompt est `soryos ›`, l'historique utilise les flèches
 * (readline natif), Ctrl+C sur ligne vide quitte (130), Ctrl+D quitte (0).
 */
export async function startInteractive(opts: InteractiveOptions): Promise<number> {
  const guard = requireInteractive("Interactive mode");
  if (guard !== null) return guard;

  if (!opts.apiKey) {
    return EXIT_ERROR;
  }

  let session = opts.session;
  let agentId = opts.agentId;
  let model = session.model;
  let exitCode = EXIT_OK;
  let running = false;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    prompt: bold(cyan("soryos › ")),
    terminal: true,
    historySize: 100,
    removeHistoryDuplicates: true,
  });

  // Auto-approbation des permissions (--auto)
  let unsubPerm: (() => void) | null = null;
  if (opts.auto) {
    unsubPerm = globalEventBus.on("permission.requested", (e: any) => {
      if (e.sessionId !== session.id) return;
      println(dim(`⚡ Auto-allow: ${e.toolName}`));
      resolvePermissionRequest(e.requestId, "allow-once");
    });
  }

  const promptFor = () => rl.prompt();

  rl.on("SIGINT", () => {
    if (rl.line.length === 0) {
      println(warn("\nInterrupted."));
      rl.close();
      return;
    }
    // Ligne en cours : on l'efface et on redemande.
    rl.write("\x15"); // Ctrl+U : efface la ligne courante
    process.stderr.write("\r\x1b[K");
    promptFor();
  });

  rl.on("line", (input) => {
    if (running) return; // sérialise les exécutions
    const text = input.trim();
    if (!text) {
      promptFor();
      return;
    }

    const slash = parseSlash(text);
    if (slash) {
      const [cmd, args] = slash;
      const outcome = handleSlash(cmd, args, session, agentId);
      if (outcome.session) session = outcome.session;
      if (outcome.agentId) agentId = outcome.agentId;
      if (outcome.model) {
        model = outcome.model;
        session.model = model;
        sessionStore.save(session);
        println(green(`✔ Model set to ${model}`));
      }
      if (outcome.action === "exit") {
        exitCode = outcome.exitCode ?? EXIT_OK;
        rl.close();
        return;
      }
      promptFor();
      return;
    }

    running = true;
    (async () => {
      try {
        const outcome = await executeRun({
          session,
          prompt: text,
          agentId,
          modelId: model,
          apiKey: opts.apiKey,
          formatJson: opts.formatJson,
        });

        if (outcome.status === "failed") {
          exitCode = EXIT_ERROR;
          if (!opts.formatJson) println(danger(`✖ ${outcome.error ?? "Unknown error"}`));
        }

        const latest = sessionStore.get(session.id);
        if (latest) await cliSessionStore.save(latest);
      } catch (err: any) {
        exitCode = EXIT_ERROR;
        if (!opts.formatJson) println(danger(`✖ ${err?.message ?? err}`));
      } finally {
        running = false;
        if (!opts.formatJson) println("");
        promptFor();
      }
    })();
  });

  println(bold(cyan("SoryOS-Code interactive")));
  println(dim(`Session: ${session.id}  Agent: ${agentId}  Model: ${model}`));
  println(dim("Type /help for slash commands, /exit to quit."));
  println("");
  promptFor();

  await new Promise<void>((resolve) => rl.on("close", () => resolve()));

  if (unsubPerm) unsubPerm();
  rl.close();

  return exitCode;
}
