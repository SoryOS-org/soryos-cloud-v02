/**
 * Run command — moteur non-interactif (style opencode run/runNonInteractive).
 * Sortie : stderr=chrome humain, stdout=NDJSON --format json.
 * Session cible : --session/-s id, --continue/-c newest, --fork (copie), défaut=new.
 * --auto : active confirmDangerous + auto-approuve les demandes de permission.
 * Exit codes : 0 ok, 1 erreur, 130 SIGINT.
 */

import { SessionData } from "@soryos/schema";
import { globalEventBus } from "@soryos/bus";
import { sessionStore } from "@soryos/session";
import { workspaceManager } from "@soryos/workspace";
import { resolvePermissionRequest } from "@soryos/permissions";
import { executeRun, type RunOutput } from "../framework/engine";
import { runPipeline, type RunPipelineResult } from "@soryos/agent";
import { cliSessionStore } from "../cli-session-store";
import { CommandContext, CommandHandler } from "../framework/spec";
import { bold, cyan, dim, green, yellow, red, blue, warn, danger, println, fail, emitNdjson, EXIT_OK, EXIT_ERROR, EXIT_INTERRUPT, readStdinIfPiped } from "../framework/ui";
import { SessionTargetFlags, ModelFlags, FormatFlags, PermissionFlags, str, bool } from "../framework/flags";

interface RunFlags {
  session?: string;
  continue?: boolean;
  fork?: boolean;
  model?: string;
  agent?: string;
  format?: "default" | "json";
  auto?: boolean;
  title?: string;
  __?: string[];
}

export function detectProviderAndKey(): { provider: string; apiKey: string } | null {
  const keys: Array<{ name: string; env: string }> = [
    { name: "Google Gemini", env: "GEMINI_API_KEY" },
    { name: "Google", env: "GOOGLE_API_KEY" },
    { name: "OpenAI", env: "OPENAI_API_KEY" },
    { name: "Mistral", env: "MISTRAL_API_KEY" },
  ];
  for (const k of keys) {
    const v = process.env[k.env];
    if (v) return { provider: k.name, apiKey: v };
  }
  return null;
}

async function resolveSession(flags: RunFlags): Promise<SessionData> {
  let session: SessionData | null = null;

  if (flags.fork) {
    if (!flags.continue && !str(flags, "session")) {
      throw new Error("--fork requires --session or --continue");
    }
    const source = str(flags, "session")
      ? await cliSessionStore.get(flags.session!)
      : await cliSessionStore.newest();
    if (!source) throw new Error("No source session to fork");
    session = {
      ...source,
      id: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: flags.title ?? `${source.title} (fork)`,
      created_at: new Date().toISOString(),
      messages: source.messages.slice(),
    };
  } else if (str(flags, "session")) {
    session = await cliSessionStore.get(flags.session!);
    if (!session) {
      session = newSession(flags.session!, flags);
    }
    // DO NOT push user message here — runPipeline does that
  } else if (bool(flags, "continue")) {
    session = await cliSessionStore.newest();
    if (!session) throw new Error("No existing session to continue");
    // DO NOT push user message here — runPipeline does that
  } else {
    session = newSession(undefined, flags);
  }

  return session!;
}

function newSession(explicitId: string | undefined, flags: RunFlags): SessionData {
  const id = explicitId ?? `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  return {
    id,
    title: flags.title ?? "CLI Session",
    sandbox_id: `sandbox-${id}`,
    sandbox_state: "running",
    environment: "local",
    providerId: "local",
    model: str(flags, "model") ?? "gemini-2.5-flash",
    provider: detectProviderAndKey()?.provider ?? "Google Gemini",
    created_at: now,
    messages: [], // user message appended by runPipeline
    files: {},
    preview_url: null,
    needs_run: false,
    agent_running: false,
    cwd: process.cwd(),
    openFiles: [],
    activeFile: "",
    confirmDangerous: bool(flags, "auto"),
  };
}

export const runHandler: CommandHandler = async (ctx) => {
  const inv = ctx.invocation;
  const flags = inv.flags as unknown as RunFlags;
  const positionals = inv.positionals;

  let prompt = positionals.join(" ");
  const stdin = await readStdinIfPiped();
  if (stdin) prompt = prompt ? `${prompt}\n${stdin}` : stdin;

  if (!prompt) return fail("Prompt is required (positional args or piped stdin).");

  const creds = detectProviderAndKey();
  if (!creds) return fail("API key required: set GEMINI_API_KEY, OPENAI_API_KEY, or MISTRAL_API_KEY");

  const session = await resolveSession(flags);
  session.confirmDangerous = bool(flags, "auto");

  // Persist session BEFORE run (so session exists for listeners)
  sessionStore.getOrCreate(session.id);
  sessionStore.save(session);
  await cliSessionStore.save(session);

  const formatJson = str(flags, "format") === "json";
  const agentId = str(flags, "agent") ?? "build";

  if (!formatJson) {
    println(bold(cyan(`=== SoryOS-Code Run ===`)));
    println(dim(`Session: ${session.id}  Agent: ${agentId}  Model: ${session.model}`));
    println("");
  } else {
    emitNdjson({ type: "session_started", sessionId: session.id, agent: agentId, model: session.model });
  }

  let unsubPerm: (() => void) | null = null;
  if (bool(flags, "auto")) {
    unsubPerm = globalEventBus.on("permission.requested", (e: any) => {
      if (e.sessionId !== session.id) return;
      println(dim(`⚡ Auto-allow: ${e.toolName}`));
      resolvePermissionRequest(e.requestId, "allow-once");
    });
  }

  let sigintCount = 0;
  const sigintHandler = () => {
    sigintCount++;
    if (sigintCount === 1) {
      println(warn("\n⚠ Interrupt received — finishing current step… (Ctrl+C again to force exit)"));
      process.exitCode = EXIT_INTERRUPT;
    } else {
      process.exit(EXIT_INTERRUPT);
    }
  };
  process.on("SIGINT", sigintHandler);

  let resultCode = EXIT_OK;

  try {
    const outcome: RunOutput = await executeRun({
      session,
      prompt,
      agentId,
      apiKey: creds.apiKey,
      formatJson,
    });

    if (outcome.status === "completed") {
      await cliSessionStore.save(outcome.session!);
      if (!formatJson) {
        println(bold(green(`✔ Task completed`)));
      }
      resultCode = EXIT_OK;
    } else {
      const failMessage = outcome.error ?? "Unknown error";
      if (!formatJson) {
        println(danger(`Error: ${failMessage}`));
      } else {
        emitNdjson({ type: "error", sessionId: session.id, message: failMessage });
      }
      resultCode = EXIT_ERROR;
    }
  } catch (err: any) {
    if (!formatJson) println(danger(`Error: ${err?.message ?? err}`));
    else emitNdjson({ type: "error", sessionId: session.id, message: err?.message ?? String(err) });
    resultCode = EXIT_ERROR;
  } finally {
    process.off("SIGINT", sigintHandler);
    if (unsubPerm) unsubPerm();
  }

  return resultCode;
};