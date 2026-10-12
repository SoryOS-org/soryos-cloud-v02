import { NextRequest, NextResponse } from "next/server";
import { sessionStore } from "@soryos/session";
import { ptyManager } from "@soryos/terminal";
import { execInCodespace, codespaceWorkdir } from "@soryos/sandbox";
import type { SessionData } from "@soryos/schema";


type TermState = ReturnType<typeof ptyManager.getOrCreateSessionState>;
type Term = NonNullable<ReturnType<TermState["terminals"]["get"]>>;

/** Resolve a terminal id sent by the UI; fall back to the active terminal when unknown. */
function resolveTerminal(state: TermState, terminalId?: string | null): Term | undefined {
  return (terminalId ? state.terminals.get(terminalId) : undefined) ?? state.terminals.get(state.activeTerminalId);
}

function isCodespace(session: SessionData): boolean {
  return session.providerId === "github-codespaces" && Boolean(session.codespaceId);
}

/** Attach every terminal of a Codespace session to the real remote machine (cwd /workspaces/<repo>). */
function attachCodespace(session: SessionData, state: TermState) {
  if (!isCodespace(session)) return;
  const target = `codespace:${session.codespaceId}`;
  const workdir = codespaceWorkdir(session.repository);
  for (const term of state.terminals.values()) {
    if (term.remote === target) continue;
    term.remote = target;
    term.cwd = workdir;
    term.gitBranch = session.branch || term.gitBranch || "main";
    term.gitStatus = "remote";
    term.title = (session.repository || "codespace").split("/").pop() || "codespace";
    term.buffer =
      `\x1b[1;36mGitHub Codespace\x1b[0m ${session.codespaceId}\r\n` +
      `Projet : \x1b[1;33m${session.repository || "?"}\x1b[0m (${term.gitBranch})\r\n` +
      `Dossier : ${workdir}\r\n` +
      `Les commandes s'exécutent sur la machine du Codespace (via gh codespace ssh).\r\n\r\n`;
  }
}

/**
 * Gestion du terminal pour une session.
 * Utilise UNIQUEMENT @soryos/* - Aucune logique métier ici.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session: SessionData | undefined = sessionStore.get(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const terminalId = searchParams.get("terminalId");
  const state = ptyManager.getOrCreateSessionState(id);
  attachCodespace(session, state);

  const terminalsList = Array.from(state.terminals.values()).map((t) => ({
    id: t.id,
    title: t.title,
    shell: t.shell,
    cwd: t.cwd,
    gitBranch: t.gitBranch,
    gitStatus: t.gitStatus,
    isRunning: Boolean(t.activeProcess),
    activeCommand: t.activeProcess?.command,
    detectedPort: t.detectedPort,
    remote: t.remote,
  }));

  const active = resolveTerminal(state, terminalId);

  return NextResponse.json({
    sessionId: id,
    activeTerminalId: state.activeTerminalId,
    terminals: terminalsList,
    activeTerminal: active
      ? {
          id: active.id,
          title: active.title,
          shell: active.shell,
          cwd: active.cwd,
          buffer: active.buffer,
          history: active.history,
          gitBranch: active.gitBranch,
          gitStatus: active.gitStatus,
          isRunning: Boolean(active.activeProcess),
          activeCommand: active.activeProcess?.command,
          exitCode: active.exitCode,
          detectedPort: active.detectedPort,
          remote: active.remote,
        }
      : null,
    repository: session.repository,
    codespaceId: session.codespaceId,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session: SessionData | undefined = sessionStore.get(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action || "exec";
  const state = ptyManager.getOrCreateSessionState(id);
  attachCodespace(session, state);
  const terminalId = resolveTerminal(state, body.terminalId)?.id || state.activeTerminalId;

  // 1. Create a new terminal tab
  if (action === "create") {
    const shell = body.shell || "/bin/bash";
    const newTerm = ptyManager.createTerminal(id, shell);
    attachCodespace(session, state);
    return NextResponse.json({
      success: true,
      terminal: {
        id: newTerm.id,
        title: newTerm.title,
        shell: newTerm.shell,
        cwd: newTerm.cwd,
        gitBranch: newTerm.gitBranch,
        gitStatus: newTerm.gitStatus,
      },
      activeTerminalId: newTerm.id,
    });
  }

  // 2. Close terminal tab
  if (action === "close") {
    const closed = ptyManager.closeTerminal(id, terminalId);
    return NextResponse.json({
      success: closed,
      activeTerminalId: state.activeTerminalId,
      terminals: Array.from(state.terminals.values()).map((t) => ({
        id: t.id,
        title: t.title,
        cwd: t.cwd,
      })),
    });
  }

  // 3. Clear terminal buffer
  if (action === "clear") {
    ptyManager.clearTerminal(id, terminalId);
    return NextResponse.json({ success: true });
  }

  // 4. Send signal (Ctrl+C / SIGINT)
  if (action === "signal") {
    const signal = body.signal || "SIGINT";
    const sent = ptyManager.sendSignal(id, terminalId, signal);
    return NextResponse.json({ success: sent });
  }

  // 5. Switch active terminal
  if (action === "switch") {
    if (state.terminals.has(terminalId)) {
      state.activeTerminalId = terminalId;
    }
    return NextResponse.json({ success: true, activeTerminalId: state.activeTerminalId });
  }

  // 6. Execute real command
  const command = (body.command || "").trim();
  if (!command) {
    const term = state.terminals.get(terminalId);
    return NextResponse.json({
      output: "",
      isError: false,
      cwd:
        isCodespace(session)
          ? term?.cwd?.startsWith("/workspaces") ? term.cwd : codespaceWorkdir(session.repository)
          : term?.cwd || session.cwd || `/workspaces/project`,
      gitBranch: term?.gitBranch || session.branch || "main",
      gitStatus: term?.gitStatus || "clean",
      exitCode: 0,
    });
  }

  // GitHub Codespace attached: run the command inside the real codespace
  if (isCodespace(session)) {
    const term = state.terminals.get(terminalId);
    const startCwd =
      term?.cwd && term.cwd.startsWith("/workspaces") ? term.cwd : codespaceWorkdir(session.repository);
    const result = await execInCodespace({
      codespaceName: session.codespaceId!,
      command,
      cwd: startCwd,
      sessionId: id,
      timeoutMs: 120_000,
    });
    const output = result.output ? result.output.replace(/\r?\n/g, "\r\n") + "\r\n" : "";
    if (term) {
      term.cwd = result.cwd;
      term.exitCode = result.exitCode;
      term.history.push(command);
      // Persist command + real output in the terminal buffer so the UI shows it.
      term.buffer +=
        `\x1b[32m${term.title}@codespace\x1b[0m \x1b[34m${startCwd}\x1b[0m $ ${command}\r\n` +
        (result.isError ? `\x1b[31m${output}\x1b[0m` : output);
    }
    return NextResponse.json({
      output,
      isError: result.isError,
      cwd: result.cwd,
      exitCode: result.exitCode,
      gitBranch: session.branch || "main",
      gitStatus: "remote",
      providerId: session.providerId,
      environment: `codespace:${session.codespaceId}`,
    });
  }

  try {
    const result = await ptyManager.executeCommand({
      sessionId: id,
      terminalId,
      command,
    });

    return NextResponse.json({
      output: result.output,
      isError: result.isError,
      cwd: result.cwd,
      exitCode: result.exitCode,
      gitBranch: result.gitBranch,
      gitStatus: result.gitStatus,
      detectedPort: result.detectedPort,
      providerId: session.providerId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Execution error";
    return NextResponse.json(
      {
        output: `\x1b[31mTerminal execution error: ${msg}\x1b[0m\r\n`,
        isError: true,
        cwd: session.cwd,
        exitCode: 1,
      },
      { status: 500 }
    );
  }
}
