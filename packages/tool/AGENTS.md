# `@soryos/tool` Agent Operating Guidelines

## Overview
This package houses the **`ToolRegistry`** and **`ToolExecutor`** responsible for executing all file operations, shell commands, and searches.

## Responsibilities
- Register tool definitions with Gemini-compatible schemas.
- Validate tool parameters against Zod/JSON schemas.
- Delegate execution to the active `ExecutionProvider`.
- Enforce the invariant: *"NO REAL ACTION = NO SUCCESS"*. Every tool MUST perform physical disk/shell actions and verify results.

## Registered Tools (17)
- `read_file`: Reads file content with 1-based line numbers.
- `write_file`: Overwrites/creates pristine files on disk.
- `edit_file`: Multi-tier matching (see below).
- `delete_file`: Safely deletes a file from disk.
- `shell_command`: Executes bash commands with a 60s timeout.
- `glob_files`: Matches files using glob patterns.
- `grep_search`: Searches regex or text patterns across files.
- `list_files`: Recursively lists directories and files.
- `git_status`, `git_diff`, `git_log`, `git_add`, `git_commit`: Git operations.
- `codebase_search`: Semantic search over the codebase.
- `todo_write` & `todo_read`: Manages task roadmaps.
- `webfetch`: Fetches an http(s) URL and returns status, headers and body (HTML → text).

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

## Agent Guidelines
- When adding a new tool, declare its schema in `ToolRegistry` and add its execution handler in `ToolExecutor`.
- Never fake tool execution results. Return real stdout, stderr, or filesystem outputs.
- Tools that need runtime/context (LLM, subagents) are INJECTED via `toolRegistry.add()` + `ToolExecutor.registerHandler()` (static override map) from the owning package — never import `@soryos/agent` from here (dependency cycle).
