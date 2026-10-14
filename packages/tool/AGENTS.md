# `@soryos/tool` Agent Operating Guidelines

## Overview
This package houses the **`ToolRegistry`** and **`ToolExecutor`** responsible for executing all file operations, shell commands, and searches.

## Responsibilities
- Register tool definitions with Gemini-compatible schemas.
- Validate tool parameters against Zod/JSON schemas.
- Delegate execution to the active `ExecutionProvider`.
- Enforce the invariant: *"NO REAL ACTION = NO SUCCESS"*. Every tool MUST perform physical disk/shell actions and verify results.

## Registered Tools (19 + dynamic MCP)
- `read_file`: Reads file content with 1-based line numbers.
- `write_file`: Overwrites/creates pristine files on disk.
- `edit_file`: Multi-tier matching (see below).
- `delete_file`: Safely deletes a file from disk.
- `shell_command`: Executes bash commands with a 60s timeout.
- `glob_files`: Matches files using glob patterns.
- `grep_search`: Searches regex or text patterns across files (ripgrep fast path, see below).
- `list_files`: Recursively lists directories and files.
- `git_status`, `git_diff`, `git_log`, `git_add`, `git_commit`: Git operations.
- `codebase_search`: Semantic search over the codebase.
- `todo_write` & `todo_read`: Manages task roadmaps.
- `webfetch`: Fetches an http(s) URL and returns status, headers and body (HTML → text).
- `patch_file`: Applies a multi-file OpenCode-format patch (see below).
- `question`: Asks the user interactive questions mid-run (see below).
- **MCP tools**: every connected MCP server contributes `mcp_<server>__<tool>` tools dynamically (see below).

## `patch_file` (`src/patch-tools.ts`)
Port of OpenCode's patch language: `*** Begin Patch` / `*** End Patch` envelope with `*** Add File:` (lines prefixed `+`), `*** Delete File:`, `*** Update File:` (optional `*** Move to:`, `@@` context chunks with ` `/`-`/`+` lines, `*** End of File` anchor). Parser + `deriveUpdate` are pure (`parsePatch`, `deriveUpdate` exported). Apply flow = prepare ALL hunks in memory (verify reads + context matches, 4-tier seek: exact→rstrip→trim→unicode-normalized) BEFORE any write; then sequential apply with physical re-read verification; honest partial-failure errors (`Completed before failure: …`).

## `question` (`src/question-tools.ts`)
Interactive ask (port of OpenCode's question tool): tool emits `question.asked` with a requestId + questions; UI/route answers via `resolveQuestionRequest(requestId, answers)` (or `cancelQuestionRequest`). 120s timeout → cancelled with an honest dismissal message. Free-form answer is implicit; planner prompt guides "(Recommended)" first-option convention. Web route: `POST /api/sessions/[id]/questions` (thin pass-through).

## `edit_file` Matching Strategy (`src/edit-matcher.ts`)
Port of OpenCode's edit strategy. `applyEdit(source, oldString, newString, replaceAll)` tries, in order:
1. **Exact bytes** match of `oldString` (LF view; CRLF preserved in the replacement region).
2. **Normalized match**: smart quotes (`'’‚‛` → `'`, `"”„‟` → `"`), dashes (`‐‑‒–—―−` → `-`), unicode spaces (`\u00A0\u2002-\u200A\u202F\u205F\u3000` → ` `). Uniqueness is required.
3. **Line-based match**: each line of `oldString` trimmed of trailing whitespace (tolerates indentation drift).

Uniqueness is STRICT: 0 matches → `Could not find the target…` with candidate lines; N>1 → `Found N matches…` with line numbers (agent must add context or set `allOccurrences`).
Canonical params: `path`, `targetContent`, `replacementContent`, `allOccurrences`.
ALIASES kept: `old_string`/`new_string`/`replace_all` (planner prompt compatibility).

## `webfetch` (`src/web-tools.ts`)
`WebFetchTool.fetchPage(url, {method?, body?})`: http/https only, 15s AbortController timeout, `User-Agent: SoryOS-Agent/1.0`, body truncated at 20 000 chars (`[truncated after 20000 characters]`), HTML → plain text via `stripHtml`. Emits `tool.started/completed/failed` on the bus.

## Interactive "Ask" Gate (`ToolExecutor.askGateDangerousTool`)
For `DANGEROUS_TOOLS` (`shell_command`, `delete_file`, `git_commit`) in build mode, when `SessionData.confirmDangerous === true` and no persistent grant exists, the executor emits `permission.requested` and waits on `createPermissionRequest()` (30s timeout → deny-once). Decisions `allow-always`/`deny-always` persist in `SessionData.permissionGrants`. Default (confirmDangerous off) = full autonomous access per AGENTS.md. Depends on `@soryos/session` (cycle-safe) for grant persistence.

## `grep_search` Ripgrep Fast Path (`src/ripgrep.ts`)
When the ExecutionProvider is `type: "local"` and a real `rg` binary is on PATH (cached detection via `isRipgrepAvailable()`), `grepSearch` runs ripgrep (`buildRgArgs`: `-F`/`-i`/`--line-number`, excludes node_modules/.git/dist…) and parses `path:line:content`. On rg exit 2 or crash it falls back to the portable recursive scan over `provider.listFiles` (flat recursive listing). `resetRipgrepCache()` for tests. Metadata tags `engine: "ripgrep"`.

## MCP (Model Context Protocol) (`src/mcp-client.ts`, `src/mcp-manager.ts`)
Port of OpenCode's MCP design on the official `@modelcontextprotocol/sdk`. Sessions declare servers in `SessionData.mcpServers` (`McpServerConfig`: `local` stdio command/args/env/cwd or `remote` Streamable HTTP url/headers). `mcpManager.ensureConnected(session)` is called at planner start; failures never block the run (honest `failed` status + `mcp.server.failed` bus event). Connected tools are registered as `mcp_<san(server)>__<san(tool)>` (category `mcp`, inputSchema passthrough normalized with empty `required`); handlers call `connection.callTool` (execution timeout 60s default) and map text parts joined, media parts described as `[media content: mime, ~N bytes base64 elided]` (never inlined). `isError` from the server → honest error result. Permissions: default deny outside build mode (plan/explore/code-reviewer refuse unknown MCP tools). One connection per server name, process-global; `disconnectServer` removes tools + handler overrides. Bus: `mcp.server.connected/failed/disconnected`, `mcp.tools.registered`. Web route: `POST/GET /api/sessions/[id]/mcp` (thin pass-through). OAuth not supported yet (remote = static headers only).

## Agent Guidelines
- When adding a new tool, declare its schema in `ToolRegistry` and add its execution handler in `ToolExecutor`.
- Never fake tool execution results. Return real stdout, stderr, or filesystem outputs.
- Tools that need runtime/context (LLM, subagents) are INJECTED via `toolRegistry.add()` + `ToolExecutor.registerHandler()` (static override map) from the owning package — never import `@soryos/agent` from here (dependency cycle).
