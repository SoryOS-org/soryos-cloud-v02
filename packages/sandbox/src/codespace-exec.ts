/**
 * @soryos/sandbox
 * Real command execution inside a GitHub Codespace through `gh codespace ssh`
 * (the same SSH channel VS Code uses). No simulation: if the GitHub CLI is
 * missing or the token lacks the `codespace` scope, the real error is returned.
 */
import { credentialManager } from "@soryos/credentials";

export interface CodespaceExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  output: string;
  isError: boolean;
  durationMs: number;
  cwd: string;
}

export function resolveGitHubToken(sessionId?: string): string | null {
  const resolved = credentialManager.resolveCredentials("github-codespaces", sessionId);
  return resolved?.apiKey || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
}

function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Default working directory of a codespace for a repo: /workspaces/<repo-name>. */
export function codespaceWorkdir(repository?: string): string {
  const name = (repository || "").split("/").pop()?.trim();
  return name ? `/workspaces/${name}` : "/workspaces";
}

export async function execInCodespace(opts: {
  codespaceName: string;
  command: string;
  cwd: string;
  sessionId?: string;
  timeoutMs?: number;
}): Promise<CodespaceExecResult> {
  const start = Date.now();
  const token = resolveGitHubToken(opts.sessionId);
  if (!token) {
    return fail("Compte GitHub non connecté : connectez un token avec le scope « codespace ».", opts.cwd, start);
  }

  // Dynamic require so client bundles never pull Node built-ins.
  // eslint-disable-next-line no-eval
  const { execFile } = eval("require")("child_process") as typeof import("child_process");

  // Run the command, then print the final directory so `cd` persists between calls.
  const marker = "__SORYOS_CWD__";
  const script = `cd ${shQuote(opts.cwd)} 2>/dev/null || cd /workspaces; ${opts.command}; __rc=$?; echo; echo "${marker}$(pwd)"; exit $__rc`;

  return new Promise((resolve) => {
    execFile(
      "gh",
      ["codespace", "ssh", "-c", opts.codespaceName, "--", "bash", "-lc", shQuote(script)],
      {
        env: { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token },
        timeout: opts.timeoutMs ?? 60_000,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const err = error as (NodeJS.ErrnoException & { code?: number | string }) | null;
        if (err && err.code === "ENOENT") {
          resolve(
            fail(
              "Le GitHub CLI (gh) n'est pas installé sur le serveur SoryOS. Installez-le (https://cli.github.com) pour exécuter des commandes dans le Codespace.",
              opts.cwd,
              start,
            ),
          );
          return;
        }
        let out = String(stdout || "");
        let cwd = opts.cwd;
        const idx = out.lastIndexOf(marker);
        if (idx >= 0) {
          cwd = out.slice(idx + marker.length).trim() || cwd;
          out = out.slice(0, idx).replace(/\n$/, "");
        }
        const exitCode = err ? (typeof err.code === "number" ? err.code : 1) : 0;
        const errText = String(stderr || "");
        resolve({
          exitCode,
          stdout: out,
          stderr: errText,
          output: [out, errText].filter(Boolean).join("\n"),
          isError: exitCode !== 0,
          durationMs: Date.now() - start,
          cwd,
        });
      },
    );
  });
}

function fail(message: string, cwd: string, start: number): CodespaceExecResult {
  return { exitCode: 1, stdout: "", stderr: message, output: message, isError: true, durationMs: Date.now() - start, cwd };
}
