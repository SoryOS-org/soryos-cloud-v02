# Plan — Shared CLI / GUI Interface Layer

> **Goal**: the terminal CLI and the web GUI must drive the **same engine** and render the
> **same events**, without duplicating logic in either adapter.
>
> **Status**: Phase 0 (CLI v2) ✅ · Phase 1 (`runPipeline` extracted) ✅ · Phases 2-4 pending.

---

## 0. Context: what exists today

```
apps/web (Next.js)                        packages/cli (Node/tsx)
  ├─ POST /api/sessions/:id/run    ─┐      ├─ src/index.ts
  ├─ POST /api/sessions/:id/messages ─┤   ├─ src/framework/{spec,ui,flags,render,engine,interactive}.ts
  │   → runPipeline()                │   ├─ src/cli-session-store.ts
  │   → SSE route writes events      │   └─ src/commands/*
  └───────────────────────────────┘        │
              │                             │
              └──────────────┬──────────────┘
                             ▼
              @soryos/agent  →  @soryos/tool  →  @soryos/execution
                             ▼
                       @soryos/bus  (globalEventBus)
```

Both sides call the **same** `runPipeline()` from `@soryos/agent`. The duplication today is
**not** in the engine — it is in the *adapters*:

| Concern | Web (`apps/web`) | CLI (`packages/cli`) | Should be shared? |
|---|---|---|---|
| Run invocation | route handler calls `runPipeline()` | `framework/engine.ts` calls `runPipeline()` | ✅ **done** |
| Session resolution | route resolves session from store | `--session/--continue/--fork` in `commands/*.ts` | **YES** (Phase 2) |
| Event → UI mapping | SSE route writes `status/text/tool_start/tool_end/done/error` | `framework/render.ts` (shared renderer) | **YES** (Phase 3) |
| Permission answers | `POST /api/sessions/:id/permissions` | `--auto` auto-approves in `commands/run.ts` | **YES** (Phase 3) |
| Question answers | `POST /api/sessions/:id/questions` | not handled yet | **YES** (Phase 3) |
| Rendering | React components | ANSI text | NO (presentation) |
| Transport | HTTP + SSE | stdout/stderr | NO (transport) |

---

## Phase 1 — Extract the run pipeline into `@soryos/agent` ✅ DONE

**Objective**: one function owns "prepare session → attach user message → run → persist".

### 1.1 New module `packages/agent/src/run-pipeline.ts`

```ts
export interface RunPipelineOptions {
  sessionId: string;
  /** Requête utilisateur (ajoutée à la session si fournie). */
  prompt?: string;
  /** Pièces jointes (vision) attachées au message utilisateur. */
  images?: ChatImageAttachment[];
  agentId?: string;
  modelId?: string;
  apiKey?: string;
}

export type RunPipelineResult =
  | { status: "completed"; session: SessionData }
  | { status: "failed"; session: SessionData | null; error: string };

export async function runPipeline(
  options: RunPipelineOptions,
  emit: (event: { type: string; [key: string]: any }) => void,
): Promise<RunPipelineResult>;
```

Responsibilities (moved **verbatim** from the adapters, not rewritten):
- validate prompt / credentials (honest errors)
- load the session from the store, append the user message
- ensure a workspace exists for the session (local ⇒ `process.cwd()`)
- call `agentRuntime.run({ sessionId, modelId, agentId, apiKey, emit })`
- catch failures → `status: "failed"` with the real error message
- return the updated session (caller decides where to persist it)

> `AgentRuntime.run()` now returns `'completed' | 'failed' | 'paused'` (it used to return
> `void`), so a planner failure that does **not** throw is honestly reported as
> `status: "failed"` instead of a false success.

### 1.2 Adapt the web route

`apps/web/app/api/sessions/[id]/messages/route.ts` and `.../run/route.ts` now call
`runPipeline()` and only write the SSE transport.

### 1.3 Adapt the CLI

`packages/cli/src/framework/engine.ts#executeRun` is the **single** CLI call site of
`runPipeline()`. It is used by both `commands/run.ts` (non-interactive) and
`framework/interactive.ts` (REPL), so the terminal modes cannot drift apart.

### Acceptance criteria
- [x] `npm run typecheck` → 0 errors
- [x] `npm run test:engine` → all green
- [x] `soryos-code run "x"` produces the same event sequence as before the refactor
- [x] the web `/run` route still streams `status/text/tool_start/tool_end/done/error`
- [x] **no** duplicated run logic left in `apps/web` or `packages/cli`

---

## Phase 2 — Shared session resolution

**Objective**: `--session` / `--continue` / `--fork` behave identically in CLI and GUI.

### 2.1 New module `packages/session/src/target.ts`

```ts
export type SessionTarget =
  | { kind: "new"; id?: string }
  | { kind: "resume"; id: string }
  | { kind: "fork"; sourceId: string; id: string };

export async function resolveSessionTarget(
  opts: { sessionId?: string; continueLast?: boolean; fork?: boolean; title?: string },
  store: SessionStore,
): Promise<SessionTarget>;
```

Rules (ported from opencode `session-target.ts`, adapted to our store):
- `--fork` without `--session`/`--continue` → honest error
- `--session <id>` on a missing session → **that id becomes the new session's id** (CLI) / error (GUI, where the id is chosen by the client)
- `--continue` → most recent session for the current location
- `--fork` → copy of the source session with a new id and the same message history

### 2.2 Use it in both adapters
- CLI: `commands/run.ts` replaces its local `resolveSession()`
- Web: the `/run` route uses it when the client asks for "continue" or "fork"

### Acceptance criteria
- [ ] `soryos-code run "x" -c` resumes the newest session
- [ ] `soryos-code run "x" --fork` creates a copy with a new id
- [ ] the GUI can trigger the same three modes
- [ ] both adapters share **one** implementation (no copy)

---

## Phase 3 — Shared event contract + renderer

**Objective**: one canonical event shape, two renderers.

### 3.1 Canonical event contract (`packages/schema/src/events.ts`)

```ts
export type SoryOSEvent =
  | { type: "status"; message: string }
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_end"; id: string; output: string; isError: boolean }
  | { type: "permission_requested"; requestId: string; toolName: string }
  | { type: "question_asked"; requestId: string; questions: unknown[] }
  | { type: "file_changed"; path: string; action: string }
  | { type: "error"; message: string }
  | { type: "done"; usage?: { input: number; output: number } };
```

The bus already emits granular types (`tool.started`, `agent.tool.*`, `permission.requested`…).
Phase 3 adds a **translator** `toSoryOSEvent(busEvent): SoryOSEvent[]` in `@soryos/schema`
(or a new `@soryos/events` package) so the GUI and the CLI consume the same vocabulary.

### 3.2 Two renderers over the same contract
- **CLI renderer** (`packages/cli/src/framework/render.ts`): ANSI to stderr, NDJSON to stdout
- **GUI renderer** (`apps/web/lib/events.ts`): maps to the existing React chat blocks

### 3.3 Questions & permissions parity
- CLI: on `question_asked` → cancel the question with feedback (non-interactive), same as opencode
- CLI: on `permission_requested` → `--auto` allows, otherwise denies with feedback
- GUI: keeps its existing interactive route

### Acceptance criteria
- [ ] `--format json` NDJSON events match the canonical contract exactly
- [ ] the GUI's chat blocks are produced by the shared translator
- [ ] a question asked during a CLI run is cancelled honestly (never hangs)

---

## Phase 4 — One core, two front-ends (the "same heart" guarantee)

**Objective**: a single source of truth for *what runs*, with adapters that only render.

### 4.1 Rule
> The engine decides **what** happens. The adapter decides only **how it is displayed**.

Concretely:
- `@soryos/agent` = the only place that orchestrates a run
- `@soryos/session` = the only place that stores/loads sessions
- `@soryos/tool` + `@soryos/permissions` = the only place that executes actions
- `apps/web` and `packages/cli` = **adapters** (transport + rendering only)

### 4.2 Verification harness (new package tests)
`packages/agent/__tests__/parity.test.ts`:
1. run a deterministic fake provider through `runPipeline`
2. capture the emitted events
3. assert the **same sequence** is produced regardless of the adapter
4. assert the CLI renderer and the GUI renderer consume the same contract

### 4.3 CI guard
Add a test that fails if any adapter re-implements run logic:
- grep guard: `apps/web` and `packages/cli` must not call `agentRuntime.run()` directly
  (they must call `runPipeline()`), except inside the shared adapter helper.

### Acceptance criteria
- [ ] `grep -r "agentRuntime.run" apps/web packages/cli` → only the shared adapter
- [ ] parity test green
- [ ] `npm run typecheck` + `npm run test:engine` green

---

## Roadmap (order + effort)

| Phase | Scope | Effort | Depends on |
|---|---|---|---|
| 0 | CLI v2 (declarative tree, `run`/`session`/`models`/`auth`/`debug`/`plugin`, NDJSON, disk sessions) | ✅ done | — |
| 0.5 | CLI interactive REPL (`interactive`/`i`/`chat`: prompt, history, slash commands) | ✅ done | 0, 1 |
| 1 | `runPipeline` extracted into `@soryos/agent` | ✅ done | — |
| 2 | `resolveSessionTarget` in `@soryos/session` | S | Phase 1 |
| 3 | Canonical event contract + 2 renderers + questions/permissions parity | M | Phase 1, 2 |
| 4 | Parity test harness + CI grep guard | S | Phase 3 |

## Explicit non-goals

- **No TUI framework port** (opencode uses `@opentui` + Solid; we stay text-first).
  The interactive mode is a plain `readline` REPL — no second rendering engine.
- **No Effect** (the Spec tree is hand-rolled, Promise-based — matches the repo style)
- **No daemon / background service** (opencode spawns `opencode serve`; the CLI runs in-process)
- **No remote auth proxy** (opencode stores credentials server-side; we read env vars)

## Risk register

| Risk | Mitigation |
|---|---|
| Refactor breaks the web SSE contract | Keep the SSE event names stable; add a route-level test before switching |
| Two session stores (web in-memory, CLI on disk) drift | Phase 2 makes the target resolution shared; a later phase can back the web store with the same JSON store |
| CLI grows a private fork of the engine | Phase 4 grep guard fails the build |
