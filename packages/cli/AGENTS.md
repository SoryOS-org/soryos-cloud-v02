# `@soryos/cli` — Agent Operating Guidelines

## Overview
The SoryOS-Code CLI is a standalone engine that runs the same **`@soryos/agent` runtime** as the Next.js web app, but in a non-interactive terminal. It shares the exact same code path: session store → agent runtime → tools → execution provider → event bus. There is **no duplicate implementation** — the CLI and the web app both call `@soryos/agent` directly.

## Architecture

```
CLI (packages/cli/src/index.ts)
  ├── framework/spec.ts       # declarative command tree + lazy handler registry
  ├── framework/ui.ts         # stdout/stderr discipline, NDJSON, exit codes
  ├── framework/flags.ts      # shared flag groups (session, model, format, auto)
  ├── cli-session-store.ts    # real JSON persistence on disk
  └── commands/
      ├── run.ts              # non-interactive engine (the core)
      ├── session/{list,delete,export,import}.ts
      ├── models.ts           # @soryos/provider registry
      ├── auth.ts             # env key detection
      ├── debug/{paths,config}.ts
      └── plugin.ts           # skill listing
```

## Output Conventions (opencode-style, adapted)
- **stdout = DATA only** (NDJSON `--format json`, lists, exports)
- **stderr = chrome** (progress, errors, human rendering)
- **Exit codes**: `0` ok · `1` error · `130` SIGINT (user interrupt)
- **`--format json`** → NDJSON events with `{type, timestamp, sessionId, ...}` envelope
- **`--help`/`-h`** → help on stdout, exit 0

## Commands

| Command | Subcommands | Purpose |
|---------|-------------|---------|
| `run` | — | Non-interactive single prompt (the core) |
| `session` | `list`, `delete`, `export`, `import` | Disk-backed session management |
| `models` | — | List available models from `@soryos/provider` |
| `auth` | — | Detect API keys by provider (env vars) |
| `debug` | `paths`, `config` | Diagnostic info |
| `plugin` | — | List available skills (`packages/tool/skills/*.md`) |
| `help` | — | Show help |

## `run` Flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--session` | `-s` | Session id (created if missing) |
| `--continue` | `-c` | Resume the most recent session |
| `--fork` | — | Fork a copy of the target session |
| `--model` | `-m` | Model id (e.g. `gemini-2.5-flash`) |
| `--agent` | — | Agent role: `build` \| `plan` \| `explore` \| `code-reviewer` |
| `--format` | — | `default` \| `json` |
| `--auto` | — | Auto-approve permission prompts |
| `--title` | — | Session title |

## Session Persistence

Sessions are stored as JSON files under `.soryos/cli-sessions/` (one file per session). This is **real disk I/O** — not in-memory only. Sessions persist across CLI invocations.

- `session list` shows all sessions on disk
- `session export <id>` dumps a session as JSON
- `session import <file>` restores a session from JSON
- `--continue` resumes the most recent session
- `--fork` clones a session with a new id

The `.soryos/` directory is **gitignored** (local state, not source).

### Contracts to respect (do not violate)
- `@soryos/session`: always call `sessionStore.getOrCreate(id)` **before** `sessionStore.save(session)` — `save()` throws if the id is unknown to the in-memory store.
- `@soryos/workspace`: the agent runtime requires a workspace for the session. The CLI creates a **local** workspace rooted at `process.cwd()` (a terminal agent works in the current project), via `workspaceManager.getOrCreateWorkspace(session.id, { environment: "local", providerId: "local", workspacePath: process.cwd() })`.
- `@soryos/bus`: the CLI subscribes to `globalEventBus.on("*")` and filters by `sessionId`.

## Shared Engine with the Web App

The CLI and the web app share the **exact same runtime path**:

```
CLI run → @soryos/agent (agentRuntime.run) → @soryos/tool → @soryos/execution → @soryos/bus → events
Web run → @soryos/agent (agentRuntime.run) → @soryos/tool → @soryos/execution → @soryos/bus → SSE routes
```

Both call `agentRuntime.run()` with the same `AgentRunOptions` shape. The only difference is the **event sink**: the web app streams events via SSE routes (`apps/web/app/api/sessions/[id]/run/route.ts`), while the CLI renders them to stderr/stdout.

## Future: Shared CLI/GUI Interface

The current CLI is a thin terminal wrapper. The next phase is to extract a **shared interface layer** that both the CLI and the web app can use, so they look and behave the same:

1. **Extract `run` logic** into a reusable function in `@soryos/agent` (or a new `@soryos/run` package) that accepts an event sink callback.
2. **Make the CLI a thin adapter** that calls the shared `run` function and renders events to the terminal.
3. **Make the web app use the same `run` function** and render events to SSE.
4. **Shared session resolution** (`--session/--continue/--fork`) in `@soryos/session` or a new `@soryos/run` package.
5. **Shared output formatting** — the NDJSON event format is already the same for both CLI (`--format json`) and web (SSE events).

## Dependencies
- `@soryos/agent`, `@soryos/bus`, `@soryos/core`, `@soryos/execution`, `@soryos/permissions`, `@soryos/schema`, `@soryos/session`, `@soryos/tool`

## Testing
- `npm run typecheck` — must pass with 0 errors
- `npm run test:engine` — engine test suite
- Manual smoke:
  ```bash
  npx tsx packages/cli/src/index.ts --help
  npx tsx packages/cli/src/index.ts auth
  npx tsx packages/cli/src/index.ts session list
  npx tsx packages/cli/src/index.ts run "hello"   # exit 1 (honest) if no API key
  ```

## Agent Guidelines
- **NO FAKE EXECUTION**: every command must perform real disk/model I/O
- **NO DUPLICATE IMPLEMENTATIONS**: the CLI must reuse `@soryos/agent`, not reimplement the runtime
- **stdout/stderr discipline**: data on stdout, chrome on stderr
- **Exit codes**: 0/1/130 as documented
- **Real persistence**: sessions are written to disk, not mocked