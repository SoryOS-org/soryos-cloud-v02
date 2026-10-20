/**
 * Interactive command — ouvre le REPL terminal du CLI.
 * Reprend la résolution de session du mode `run` (--session/--continue/--fork)
 * puis démarre la boucle interactive.
 */

import { SessionData } from "@soryos/schema";
import { sessionStore } from "@soryos/session";
import { cliSessionStore } from "../cli-session-store";
import { CommandHandler } from "../framework/spec";
import { startInteractive } from "../framework/interactive";
import { fail, EXIT_ERROR, requireInteractive } from "../framework/ui";
import { str, bool } from "../framework/flags";
import { detectProviderAndKey } from "./run";

interface InteractiveFlags {
  session?: string;
  continue?: boolean;
  fork?: boolean;
  model?: string;
  agent?: string;
  format?: "default" | "json";
  auto?: boolean;
  title?: string;
}

function newSession(flags: InteractiveFlags, model: string, provider: string): SessionData {
  const id = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  return {
    id,
    title: flags.title ?? "CLI Session",
    sandbox_id: `sandbox-${id}`,
    sandbox_state: "running",
    environment: "local",
    providerId: "local",
    model,
    provider,
    created_at: now,
    messages: [],
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

async function resolveSession(flags: InteractiveFlags, model: string, provider: string): Promise<SessionData> {
  if (flags.fork) {
    if (!flags.continue && !str(flags, "session")) {
      throw new Error("--fork requires --session or --continue");
    }
    const source = str(flags, "session")
      ? await cliSessionStore.get(flags.session!)
      : await cliSessionStore.newest();
    if (!source) throw new Error("No source session to fork");
    return {
      ...source,
      id: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: flags.title ?? `${source.title} (fork)`,
      created_at: new Date().toISOString(),
      messages: source.messages.slice(),
    };
  }

  if (str(flags, "session")) {
    const existing = await cliSessionStore.get(flags.session!);
    if (existing) return existing;
    return newSession(flags, model, provider);
  }

  if (bool(flags, "continue")) {
    const newest = await cliSessionStore.newest();
    if (!newest) return newSession(flags, model, provider);
    return newest;
  }

  return newSession(flags, model, provider);
}

export const interactiveHandler: CommandHandler = async (ctx) => {
  const flags = ctx.invocation.flags as unknown as InteractiveFlags;

  const formatJson = str(flags, "format") === "json";
  const model = str(flags, "model") ?? "gemini-2.5-flash";
  const agentId = str(flags, "agent") ?? "build";

  // Le garde-fou TTY passe avant la recherche de clé : hors terminal,
  // le message doit dire « terminal requis », pas « clé manquante ».
  const ttyGuard = requireInteractive("Interactive mode");
  if (ttyGuard !== null) return ttyGuard;

  const creds = detectProviderAndKey();
  if (!creds) {
    return fail("API key required: set GEMINI_API_KEY, OPENAI_API_KEY, or MISTRAL_API_KEY");
  }

  let session: SessionData;
  try {
    session = await resolveSession(flags, model, creds.provider);
  } catch (err: any) {
    return fail(err?.message ?? String(err));
  }

  // La session doit exister dans @soryos/session avant le premier run.
  sessionStore.getOrCreate(session.id);
  sessionStore.save(session);
  await cliSessionStore.save(session);

  return startInteractive({
    session,
    agentId,
    apiKey: creds.apiKey,
    formatJson,
    auto: bool(flags, "auto"),
  });
};
