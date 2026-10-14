import { ToolDefinition, ToolExecutionResult, SessionData, TodoItem } from "@soryos/schema";
import { ExecutionProvider } from "@soryos/execution";
import {
  permissionsManager,
  DANGEROUS_TOOLS,
  createPermissionRequest,
  type PermissionDecision,
} from "@soryos/permissions";
import { sessionStore } from "@soryos/session";
import { globalEventBus } from "@soryos/bus";
import { FilesystemTools } from "./filesystem-tools";
import { ShellTools, ShellCommandOptions } from "./shell-tools";
import { GitTools } from "./git-tools";
import { CodebaseTools } from "./codebase-tools";
import { WebFetchTool } from "./web-tools";
import { PatchTools } from "./patch-tools";
import { WorktreeTools } from "./worktree-tools";
import { CodemodeTools, DEFAULT_CODEMODE_TIMEOUT_MS } from "./codemode-tools";
import {
  createQuestionRequest,
  resolveQuestionRequest,
  cancelQuestionRequest,
  hasPendingQuestionRequest,
  formatAnswers,
  validateQuestions,
  type QuestionPrompt,
} from "./question-tools";

export * from "./question-tools";
export { parsePatch, deriveUpdate, PatchTools } from "./patch-tools";
export type { PatchHunk, UpdateFileChunk, ParsePatchResult, PatchApplyResult } from "./patch-tools";
export { isRipgrepAvailable, resetRipgrepCache, buildRgArgs, ripgrepSearch } from "./ripgrep";
export type { RipgrepResult } from "./ripgrep";
export { McpConnection, McpConnectError, DEFAULT_MCP_STARTUP_TIMEOUT_MS, DEFAULT_MCP_EXECUTION_TIMEOUT_MS } from "./mcp-client";
export type { McpToolInfo, McpCallToolResult } from "./mcp-client";
export { mcpManager, mcpToolName } from "./mcp-manager";
export { WorktreeTools } from "./worktree-tools";
export type { WorktreeResult, WorktreeInfo } from "./worktree-tools";
export { CodemodeTools, DEFAULT_CODEMODE_TIMEOUT_MS, MAX_CODEMODE_TIMEOUT_MS } from "./codemode-tools";

export { LRUCache } from "./cache";

export type { CodemodeResult } from "./codemode-tools";
export type ToolArgs = Record<string, any>;

const ALIASES: Record<string, Record<string, string[]>> = {
  read_file: { path: ["filePath", "file", "filename"] },
  write_file: { path: ["filePath", "file", "filename"] },
  edit_file: {
    path: ["filePath", "file", "filename"],
    targetContent: ["old_string", "oldText", "old", "target", "find"],
    replacementContent: ["new_string", "newText", "new", "replacement", "replace"],
  },
  delete_file: { path: ["filePath", "file", "filename"] },
  list_files: { path: ["directoryPath", "dir", "directory"] },
  glob_files: { pattern: ["glob", "query"], path: ["directoryPath", "dir", "directory"] },
  grep_search: { query: ["pattern", "regex", "search"], path: ["dir", "directory"] },
  shell_command: { command: ["cmd", "bash"], cwd: ["path", "directory"] },
  git_status: { path: ["dir", "directory"] },
  git_diff: { path: ["dir", "directory"] },
  git_log: { path: ["dir", "directory"] },
  git_add: { path: ["dir", "directory"] },
  git_commit: { path: ["dir", "directory"] },
  codebase_search: { query: ["question", "search", "pattern"] },
  webfetch: { url: ["link", "href", "uri", "address"] },
  patch_file: { patch: ["patchText", "patch_text", "diff", "patchTextContent"] },
  question: { questions: ["prompts", "asks"] },
};

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    id: "read_file",
    name: "read_file",
    description: "Reads a file from the workspace and returns its content with 1-based line numbers.",
    category: "filesystem",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path of the file to read, relative to the workspace root" },
        offset: { type: "number", description: "1-based line number to start reading from (optional)" },
        limit: { type: "number", description: "Maximum number of lines to read (optional)" },
      },
      required: ["path"],
    },
  },
  {
    id: "write_file",
    name: "write_file",
    description: "Creates or completely overwrites a file with the given content.",
    category: "filesystem",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path of the file to write, relative to the workspace root" },
        content: { type: "string", description: "Full content to write into the file" },
      },
      required: ["path", "content"],
    },
  },
  {
    id: "edit_file",
    name: "edit_file",
    description:
      "Edit a file by finding and replacing exact text. Preserve the exact indentation (tabs or spaces) and omit the line-number prefix such as '1: '. If there is no exact match, the edit retries while ignoring typographic quote, dash, and space variants, then trailing whitespace on each line. By default the target must identify a UNIQUE location; multiple matches FAIL unless allOccurrences is true. Add more surrounding context to disambiguate, or set allOccurrences to rename a variable everywhere.",
    category: "filesystem",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path of the file to edit" },
        targetContent: { type: "string", description: "Exact text to find in the file" },
        replacementContent: { type: "string", description: "Text that replaces the target (must differ from the target)" },
        allOccurrences: { type: "boolean", description: "Replace every occurrence instead of requiring a unique match" },
      },
      required: ["path", "targetContent", "replacementContent"],
    },
  },
  {
    id: "delete_file",
    name: "delete_file",
    description: "Deletes a file from the workspace.",
    category: "filesystem",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path of the file to delete" },
      },
      required: ["path"],
    },
  },
  {
    id: "list_files",
    name: "list_files",
    description: "Lists files and directories at a given path.",
    category: "filesystem",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory to list (defaults to the workspace root)" },
        recursive: { type: "boolean", description: "Recurse into subdirectories" },
        includeHidden: { type: "boolean", description: "Include hidden files (dotfiles)" },
      },
      required: [],
    },
  },
  {
    id: "glob_files",
    name: "glob_files",
    description: "Matches files using a glob pattern such as **/*.ts or apps/**/*.tsx.",
    category: "filesystem",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern to match" },
        path: { type: "string", description: "Directory to search in (defaults to the workspace root)" },
        caseSensitive: { type: "boolean", description: "Case-sensitive matching" },
      },
      required: ["pattern"],
    },
  },
  {
    id: "grep_search",
    name: "grep_search",
    description: "Searches for a text or regex pattern inside project files.",
    category: "filesystem",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text or regex pattern to search for" },
        path: { type: "string", description: "Directory to search in (defaults to the workspace root)" },
        useRegex: { type: "boolean", description: "Treat the query as a regular expression" },
        caseSensitive: { type: "boolean", description: "Case-sensitive matching" },
        maxMatches: { type: "number", description: "Maximum number of matches to return" },
      },
      required: ["query"],
    },
  },
  {
    id: "shell_command",
    name: "shell_command",
    description: "Executes a bash command on the active execution environment and returns stdout, stderr and the exit code. Timeout: 60s.",
    category: "shell",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The bash command to execute" },
        cwd: { type: "string", description: "Working directory for the command" },
        timeoutMs: { type: "number", description: "Timeout in milliseconds (default 60000)" },
      },
      required: ["command"],
    },
  },
  {
    id: "git_status",
    name: "git_status",
    description: "Shows the working tree status of the git repository.",
    category: "git",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Repository path (defaults to the workspace root)" },
      },
      required: [],
    },
  },
  {
    id: "git_diff",
    name: "git_diff",
    description: "Shows file changes in the working tree (optionally for a single file).",
    category: "git",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "Restrict the diff to this file" },
        path: { type: "string", description: "Repository path (defaults to the workspace root)" },
      },
      required: [],
    },
  },
  {
    id: "git_log",
    name: "git_log",
    description: "Shows recent commit history.",
    category: "git",
    parameters: {
      type: "object",
      properties: {
        maxCount: { type: "number", description: "Number of commits to show (default 10)" },
        path: { type: "string", description: "Repository path (defaults to the workspace root)" },
      },
      required: [],
    },
  },
  {
    id: "git_add",
    name: "git_add",
    description: "Stages files for the next commit.",
    category: "git",
    parameters: {
      type: "object",
      properties: {
        files: { type: "array", description: "File paths to stage, or ['*'] for all changes" },
        path: { type: "string", description: "Repository path (defaults to the workspace root)" },
      },
      required: ["files"],
    },
  },
  {
    id: "git_commit",
    name: "git_commit",
    description: "Commits staged changes with a message.",
    category: "git",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "Commit message" },
        path: { type: "string", description: "Repository path (defaults to the workspace root)" },
      },
      required: ["message"],
    },
  },
  {
    id: "git_worktree_create",
    name: "git_worktree_create",
    description:
      "Creates an isolated git worktree (own directory + branch) under .soryos-worktrees/ so parallel work never conflicts with the main checkout.",
    category: "git",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Worktree name (sanitized; defaults to worktree-<timestamp>)" },
        branch: { type: "string", description: "Branch name to create (defaults to soryos/<name>)" },
      },
      required: [],
    },
  },
  {
    id: "git_worktree_list",
    name: "git_worktree_list",
    description: "Lists all git worktrees of the current repository (path + branch).",
    category: "git",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    id: "git_worktree_remove",
    name: "git_worktree_remove",
    description: "Removes a git worktree by path. Uncommitted changes require force=true.",
    category: "git",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path of the worktree to remove" },
        force: { type: "boolean", description: "Discard uncommitted changes (git worktree remove --force)" },
      },
      required: ["path"],
    },
  },
  {
    id: "codemode",
    name: "codemode",
    description:
      "Executes a JavaScript program that chains MANY tool calls in one step. Inside the script use `await tools.<tool_name>({...})` (returns {output, isError, metadata}) and console.log; the script's final expression/return value becomes the result. Prefer codemode over several separate tool steps when the task is a deterministic multi-step sequence.",
    category: "agent",
    parameters: {
      type: "object",
      properties: {
        script: { type: "string", description: "JavaScript program body (async allowed). Only tools/console are available — no require, process, fs or network." },
        timeoutMs: { type: "number", description: `Wall-clock timeout (default ${DEFAULT_CODEMODE_TIMEOUT_MS}ms, max 120000ms)` },
      },
      required: ["script"],
    },
  },
  {
    id: "codebase_search",
    name: "codebase_search",
    description: "Searches the codebase for code related to a natural-language query and returns matching files.",
    category: "filesystem",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language query describing what to find" },
        path: { type: "string", description: "Directory to search in (defaults to the workspace root)" },
        maxResults: { type: "number", description: "Maximum number of results to return" },
      },
      required: ["query"],
    },
  },
  {
    id: "todo_write",
    name: "todo_write",
    description: "Replaces the session task roadmap with a new list of todos. Use this to track multi-step work.",
    category: "planning",
    parameters: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          description: "The full list of todos: [{ id, content, status: pending | in_progress | completed }]",
        },
      },
      required: ["todos"],
    },
  },
  {
    id: "todo_read",
    name: "todo_read",
    description: "Reads the current session task roadmap.",
    category: "planning",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    id: "webfetch",
    name: "webfetch",
    description:
      "Fetches a URL over HTTP(S) and returns the status, headers and body (HTML is converted to plain text). Use it to read documentation, APIs, or any public page. Only http and https URLs are allowed; the body is truncated after 20000 characters.",
    category: "web",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to fetch (http or https)" },
        method: { type: "string", description: "HTTP method, defaults to GET" },
        body: { type: "string", description: "Optional request body for POST/PUT" },
      },
      required: ["url"],
    },
  },
  {
    id: "patch_file",
    name: "patch_file",
    description:
      "Applies a multi-file patch in the OpenCode patch format. The patch language is a file-oriented envelope: *** Begin Patch / *** End Patch, with operations '*** Add File: {path}' (following lines start with '+'), '*** Delete File: {path}' (nothing follows), and '*** Update File: {path}' (optional '*** Move to: {path}', then @@ context chunks where lines start with ' ' context, '-' removed, '+' added; '*** End of File' anchors the last chunk). Every hunk is verified in memory BEFORE any write, so a bad hunk leaves the workspace untouched.",
    category: "filesystem",
    parameters: {
      type: "object",
      properties: {
        patch: { type: "string", description: "The full patch text (*** Begin Patch … *** End Patch)" },
      },
      required: ["patch"],
    },
  },
  {
    id: "question",
    name: "question",
    description:
      "Use this tool when you need to ask the user questions during execution. This allows you to: 1. Gather user preferences or requirements, 2. Clarify ambiguous instructions, 3. Get decisions on implementation choices as you work, 4. Offer choices to the user about what direction to take. Usage notes: a free-form answer option is added automatically — do not include a separate option for it; set multiple=true to allow selecting more than one option; if you recommend a specific option, make it the FIRST option and add '(Recommended)' at the end of the label.",
    category: "agent",
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          description:
            'Non-empty array of questions, e.g. [{"question":"Which UI library?","header":"UI","options":[{"label":"Tailwind (Recommended)"}],"multiple":false}]',
          items: { type: "object" },
        },
      },
      required: ["questions"],
    },
  },
];

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor(definitions: ToolDefinition[] = TOOL_DEFINITIONS) {
    for (const tool of definitions) {
      this.tools.set(tool.name, tool);
    }
  }

  add(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  remove(name: string): boolean {
    return this.tools.delete(name);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}

export const toolRegistry = new ToolRegistry();

export interface ToolBundle {
  fs: FilesystemTools;
  shell: ShellTools;
  git: GitTools;
  codebase: CodebaseTools;
  web: WebFetchTool;
  patch: PatchTools;
  worktree: WorktreeTools;
}

export interface HandlerContext {
  provider: ExecutionProvider;
  session: SessionData;
  /** Active agent mode (build/plan/explore/…) — enforced on dispatched calls. */
  mode: string;
  /** The live executor, so meta-tools (codemode) dispatch through the real pipeline. */
  executor: ToolExecutor;
  fs: FilesystemTools;
  shell: ShellTools;
  git: GitTools;
  codebase: CodebaseTools;
  web: WebFetchTool;
  patch: PatchTools;
  worktree: WorktreeTools;
}

export type ToolHandler = (args: ToolArgs, ctx: HandlerContext) => Promise<ToolExecutionResult>;

class ToolInputError extends Error {}

function pick(args: ToolArgs, toolName: string, canonical: string): unknown {
  const keys = [canonical, ...(ALIASES[toolName]?.[canonical] ?? [])];
  for (const key of keys) {
    const value = args?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function requireValue(args: ToolArgs, toolName: string, canonical: string): unknown {
  const value = pick(args, toolName, canonical);
  if (value === undefined) {
    throw new ToolInputError(`Missing required parameter "${canonical}" for tool "${toolName}".`);
  }
  return value;
}

function asString(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new ToolInputError(`Parameter "${name}" must be a string.`);
  }
  return value;
}

function asOptionalNumber(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) {
    throw new ToolInputError(`Parameter "${name}" must be a number.`);
  }
  return num;
}

function asOptionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ToolInputError(`Parameter "${name}" must be a boolean.`);
}

function normalizeSuccess(
  toolName: string,
  ok: boolean,
  output: string,
  metadata?: Record<string, unknown>,
  verified?: boolean,
): ToolExecutionResult {
  return {
    toolName,
    output,
    isError: !ok,
    metadata,
    verified,
  };
}

function fromFilesystem(toolName: string, r: { success: boolean; output?: string; error?: string; metadata?: Record<string, any>; verified?: boolean }): ToolExecutionResult {
  if (r.success) {
    return normalizeSuccess(toolName, true, r.output ?? "", r.metadata, r.verified);
  }
  return normalizeSuccess(toolName, false, r.error ?? `Tool "${toolName}" failed without an error message.`);
}

function fromShell(r: {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
  command?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}): ToolExecutionResult {
  const parts: string[] = [];
  if (r.stdout) parts.push(r.stdout);
  if (r.stderr) parts.push(r.stderr);
  if (typeof r.exitCode === "number") parts.push(`[exit code ${r.exitCode}]`);
  if (!parts.length && r.error) parts.push(r.error);
  const failed = !r.success || (typeof r.exitCode === "number" && r.exitCode !== 0);
  return {
    toolName: "shell_command",
    output: parts.join("\n").trim() || "(no output)",
    isError: failed,
    metadata: {
      exitCode: r.exitCode,
      durationMs: r.durationMs,
      command: r.command ?? r.metadata?.command,
      ...r.metadata,
    },
    verified: true,
  };
}

function fromGit(toolName: string, r: { success: boolean; output?: string; error?: string; metadata?: Record<string, any>; verified?: boolean }): ToolExecutionResult {
  if (r.success) {
    return normalizeSuccess(toolName, true, r.output ?? "", r.metadata, r.verified);
  }
  return normalizeSuccess(toolName, false, r.error ?? `Git tool "${toolName}" failed without an error message.`, r.metadata);
}

function fromCodebase(r: { success: boolean; results?: any[]; error?: string; metadata?: Record<string, any>; verified?: boolean }): ToolExecutionResult {
  if (!r.success) {
    return normalizeSuccess("codebase_search", false, r.error ?? "Codebase search failed.", r.metadata);
  }
  const results = r.results ?? [];
  const rendered = results.length
    ? results.map((item, index) => `--- result ${index + 1} ---\n${JSON.stringify(item, null, 2)}`).join("\n\n")
    : "(no matching files found)";
  return normalizeSuccess("codebase_search", true, rendered, { ...(r.metadata ?? {}), count: results.length }, r.verified);
}

function normalizeTodos(raw: unknown): TodoItem[] {
  if (!Array.isArray(raw)) {
    throw new ToolInputError(`Parameter "todos" must be an array.`);
  }
  return raw.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new ToolInputError(`todos[${index}] must be an object with a "content" field.`);
    }
    const content = (item as any).content;
    if (typeof content !== "string" || !content.trim()) {
      throw new ToolInputError(`todos[${index}].content must be a non-empty string.`);
    }
    const rawStatus = (item as any).status;
    const status =
      rawStatus === "in_progress" || rawStatus === "completed" || rawStatus === "pending"
        ? rawStatus
        : "pending";
    const rawId = (item as any).id;
    return {
      id: typeof rawId === "string" && rawId ? rawId : `todo-${Date.now()}-${index}`,
      content: content.trim(),
      status,
    };
  });
}

const HANDLERS: Record<string, ToolHandler> = {
  read_file: async (args, ctx) => {
    const path = asString(requireValue(args, "read_file", "path"), "path");
    const offset = asOptionalNumber(pick(args, "read_file", "offset"), "offset");
    const limit = asOptionalNumber(pick(args, "read_file", "limit"), "limit");
    const r = await ctx.fs.readFile(path, offset, limit);
    return fromFilesystem("read_file", r);
  },
  write_file: async (args, ctx) => {
    const path = asString(requireValue(args, "write_file", "path"), "path");
    const content = asString(requireValue(args, "write_file", "content"), "content");
    const r = await ctx.fs.writeFile(path, content);
    return fromFilesystem("write_file", r);
  },
  edit_file: async (args, ctx) => {
    const path = asString(requireValue(args, "edit_file", "path"), "path");
    const targetContent = asString(requireValue(args, "edit_file", "targetContent"), "targetContent");
    const replacementContent = asString(requireValue(args, "edit_file", "replacementContent"), "replacementContent");
    const replaceAll = asOptionalBoolean(
      pick(args, "edit_file", "allOccurrences"),
      "allOccurrences",
    );
    const r = await ctx.fs.editFile(path, targetContent, replacementContent, replaceAll ?? false);
    return fromFilesystem("edit_file", r);
  },
  delete_file: async (args, ctx) => {
    const path = asString(requireValue(args, "delete_file", "path"), "path");
    const r = await ctx.fs.deleteFile(path);
    return fromFilesystem("delete_file", r);
  },
  list_files: async (args, ctx) => {
    const path = asString(pick(args, "list_files", "path") ?? "", "path");
    const recursive = asOptionalBoolean(pick(args, "list_files", "recursive"), "recursive") ?? false;
    const includeHidden =
      asOptionalBoolean(pick(args, "list_files", "includeHidden"), "includeHidden") ?? false;
    const r = await ctx.fs.listFiles(path, recursive, includeHidden);
    return fromFilesystem("list_files", r);
  },
  glob_files: async (args, ctx) => {
    const pattern = asString(requireValue(args, "glob_files", "pattern"), "pattern");
    const path = asString(pick(args, "glob_files", "path") ?? "", "path");
    const caseSensitive =
      asOptionalBoolean(pick(args, "glob_files", "caseSensitive"), "caseSensitive") ?? false;
    const r = await ctx.fs.globFiles(pattern, path, caseSensitive);
    return fromFilesystem("glob_files", r);
  },
  grep_search: async (args, ctx) => {
    const query = asString(requireValue(args, "grep_search", "query"), "query");
    const path = asString(pick(args, "grep_search", "path") ?? "", "path");
    const caseSensitive =
      asOptionalBoolean(pick(args, "grep_search", "caseSensitive"), "caseSensitive") ?? false;
    const useRegex = asOptionalBoolean(pick(args, "grep_search", "useRegex"), "useRegex") ?? false;
    const maxMatches =
      asOptionalNumber(pick(args, "grep_search", "maxMatches"), "maxMatches") ?? 50;
    const r = await ctx.fs.grepSearch(query, path, caseSensitive, useRegex, maxMatches);
    return fromFilesystem("grep_search", r);
  },
  shell_command: async (args, ctx) => {
    const command = asString(requireValue(args, "shell_command", "command"), "command");
    const cwd = asString(pick(args, "shell_command", "cwd") ?? "", "cwd");
    const timeoutMs = asOptionalNumber(pick(args, "shell_command", "timeoutMs"), "timeoutMs");
    const options: ShellCommandOptions = { cwd, timeoutMs: timeoutMs ?? 60000 };
    const r = await ctx.shell.shellCommand(command, options);
    return fromShell(r);
  },
  git_status: async (args, ctx) => {
    const path = asString(pick(args, "git_status", "path") ?? "", "path");
    return fromGit("git_status", await ctx.git.gitStatus(path));
  },
  git_diff: async (args, ctx) => {
    const file = asString(pick(args, "git_diff", "file") ?? "", "file");
    const path = asString(pick(args, "git_diff", "path") ?? "", "path");
    return fromGit("git_diff", await ctx.git.gitDiff(file || undefined, path));
  },
  git_log: async (args, ctx) => {
    const maxCount = asOptionalNumber(pick(args, "git_log", "maxCount"), "maxCount") ?? 10;
    const path = asString(pick(args, "git_log", "path") ?? "", "path");
    return fromGit("git_log", await ctx.git.gitLog(maxCount, path));
  },
  git_add: async (args, ctx) => {
    const filesRaw = requireValue(args, "git_add", "files");
    if (!Array.isArray(filesRaw) || filesRaw.length === 0) {
      throw new ToolInputError(`Parameter "files" must be a non-empty array of file paths.`);
    }
    const files = filesRaw.map((f) => asString(f, "files[]"));
    const path = asString(pick(args, "git_add", "path") ?? "", "path");
    return fromGit("git_add", await ctx.git.gitAdd(files, path));
  },
  git_commit: async (args, ctx) => {
    const message = asString(requireValue(args, "git_commit", "message"), "message");
    const path = asString(pick(args, "git_commit", "path") ?? "", "path");
    return fromGit("git_commit", await ctx.git.gitCommit({ message }, path));
  },
  git_worktree_create: async (args, ctx) => {
    const name = asString(pick(args, "git_worktree_create", "name") ?? "", "name");
    const branch = asString(pick(args, "git_worktree_create", "branch") ?? "", "branch");
    const r = await ctx.worktree.createWorktree({
      ...(name ? { name } : {}),
      ...(branch ? { branch } : {}),
    });
    return fromGit("git_worktree_create", r);
  },
  git_worktree_list: async (_args, ctx) => {
    const r = await ctx.worktree.listWorktrees();
    return fromGit("git_worktree_list", r);
  },
  git_worktree_remove: async (args, ctx) => {
    const path = asString(requireValue(args, "git_worktree_remove", "path"), "path");
    const force = asOptionalBoolean(pick(args, "git_worktree_remove", "force"), "force") ?? false;
    const r = await ctx.worktree.removeWorktree(path, force);
    return fromGit("git_worktree_remove", r);
  },
  codemode: async (args, ctx) => {
    const script = asString(requireValue(args, "codemode", "script"), "script");
    const timeoutMs =
      asOptionalNumber(pick(args, "codemode", "timeoutMs"), "timeoutMs") ?? DEFAULT_CODEMODE_TIMEOUT_MS;
    const codemode = new CodemodeTools((toolName, toolArgs) =>
      ctx.executor.execute(toolName, toolArgs, ctx.provider, ctx.session, ctx.mode)
    );
    const r = await codemode.runScript(script, timeoutMs);
    return {
      toolName: "codemode",
      output: r.success ? r.output : r.error ?? "Codemode failed without an error message.",
      isError: !r.success,
      metadata: { toolCalls: r.toolCalls, logs: r.logs.length },
    };
  },
  codebase_search: async (args, ctx) => {
    const query = asString(requireValue(args, "codebase_search", "query"), "query");
    const path = asString(pick(args, "codebase_search", "path") ?? "", "path");
    const maxResults = asOptionalNumber(pick(args, "codebase_search", "maxResults"), "maxResults");
    return fromCodebase(
      await ctx.codebase.codebaseSearch({ query, path: path || undefined, maxResults: maxResults ?? 20 }),
    );
  },
  webfetch: async (args, ctx) => {
    const url = asString(requireValue(args, "webfetch", "url"), "url");
    const method = pick(args, "webfetch", "method");
    const body = pick(args, "webfetch", "body");
    const r = await ctx.web.fetchPage(url, {
      method: typeof method === "string" ? method : undefined,
      body: typeof body === "string" ? body : undefined,
    });
    if (!r.success) {
      return { toolName: "webfetch", output: r.error ?? "webfetch failed", isError: true, metadata: r.metadata };
    }
    return normalizeSuccess("webfetch", true, r.output ?? "", r.metadata);
  },
  patch_file: async (args, ctx) => {
    const patch = asString(requireValue(args, "patch_file", "patch"), "patch");
    const r = await ctx.patch.applyPatch(patch);
    if (!r.success) {
      return { toolName: "patch_file", output: r.error ?? "patch failed", isError: true, metadata: r.metadata };
    }
    return normalizeSuccess("patch_file", true, r.output ?? "", r.metadata, true);
  },
  question: async (args, ctx) => {
    const rawQuestions = pick(args, "question", "questions");
    const validated = validateQuestions(rawQuestions);
    if (!validated.ok) {
      return { toolName: "question", output: validated.error, isError: true };
    }
    const questions: QuestionPrompt[] = validated.questions;

    const { requestId, answers } = createQuestionRequest(ctx.session.id, questions);
    globalEventBus.emit("question.asked", {
      requestId,
      sessionId: ctx.session.id,
      questions: questions.map((q) => ({
        question: q.question,
        header: q.header,
        options: q.options,
        multiple: q.multiple,
      })),
    });

    const resolved = await answers;
    if (resolved === null) {
      return {
        toolName: "question",
        output:
          "The user dismissed this question (or did not answer in time). Continue with your best judgement and state your assumption.",
        isError: true,
        metadata: { requestId, cancelled: true },
      };
    }
    return normalizeSuccess("question", true, formatAnswers(questions, resolved), { requestId, answers: resolved });
  },
  todo_write: async (args, ctx) => {
    const todos = normalizeTodos(requireValue(args, "todo_write", "todos"));
    ctx.session.todos = todos;
    const pending = todos.filter((t) => t.status === "pending").length;
    const done = todos.filter((t) => t.status === "completed").length;
    return normalizeSuccess(
      "todo_write",
      true,
      `Updated task roadmap: ${todos.length} todos (${done} completed, ${pending} pending).`,
      { total: todos.length, completed: done, pending },
      true,
    );
  },
  todo_read: async (_args, ctx) => {
    const todos = ctx.session.todos ?? [];
    return normalizeSuccess("todo_read", true, JSON.stringify(todos, null, 2), { count: todos.length }, true);
  },
};

export class ToolExecutor {
  private bundles: WeakMap<ExecutionProvider, ToolBundle> = new WeakMap();

  /**
   * Handler overrides shared by every ToolExecutor instance.
   * Owning packages (e.g. @soryos/agent) inject context-aware tools here
   * instead of creating parallel executors (dependency-cycle safe).
   */
  private static handlerOverrides: Map<string, ToolHandler> = new Map();

  static registerHandler(toolName: string, handler: ToolHandler): void {
    ToolExecutor.handlerOverrides.set(toolName, handler);
  }

  static unregisterHandler(toolName: string): void {
    ToolExecutor.handlerOverrides.delete(toolName);
  }

  static hasOverride(toolName: string): boolean {
    return ToolExecutor.handlerOverrides.has(toolName);
  }

  constructor(private toolRegistry: ToolRegistry) {}

  private getBundle(provider: ExecutionProvider): ToolBundle {
    let bundle = this.bundles.get(provider);
    if (!bundle) {
      bundle = {
        fs: new FilesystemTools(provider),
        shell: new ShellTools(provider),
        git: new GitTools(provider),
        codebase: new CodebaseTools(provider),
        web: new WebFetchTool(),
        patch: new PatchTools(provider),
        worktree: new WorktreeTools(provider),
      };
      this.bundles.set(provider, bundle);
    }
    return bundle;
  }

  async execute(
    toolName: string,
    args: any,
    executionProvider: ExecutionProvider,
    session: SessionData,
    mode: string
  ): Promise<ToolExecutionResult> {
    const definition = this.toolRegistry.getTool(toolName);
    if (!definition) {
      const available = this.toolRegistry
        .getToolDefinitions()
        .map((t) => t.name)
        .join(", ");
      return {
        toolName,
        output: `Unknown tool "${toolName}". Available tools: ${available}`,
        isError: true,
      };
    }

    const handler = ToolExecutor.handlerOverrides.get(toolName) ?? HANDLERS[toolName];
    if (!handler) {
      return {
        toolName,
        output: `Tool "${toolName}" is registered but has no execution handler.`,
        isError: true,
      };
    }

    const toolArgs = args && typeof args === "object" ? args : {};
    try {
      this.validateParameters(definition, toolArgs);
    } catch (error) {
      return {
        toolName,
        output: error instanceof Error ? error.message : String(error),
        isError: true,
      };
    }

    const permission = permissionsManager.checkPermission(mode, toolName, toolArgs);
    if (!permission.allowed) {
      globalEventBus.emit("permission.denied", {
        toolName,
        reason: permission.reason,
        mode,
        callId: `tool-${Date.now()}`,
      });
      return {
        toolName,
        output: `PERMISSION DENIED: ${permission.reason}`,
        isError: true,
        metadata: { mode, reason: permission.reason },
      };
    }

    const askGate = await this.askGateDangerousTool(session, toolName, toolArgs, mode);
    if (askGate) {
      return askGate;
    }

    try {
      const bundle = this.getBundle(executionProvider);
      return await handler(toolArgs, {
        provider: executionProvider,
        session,
        mode,
        executor: this,
        ...bundle,
      });
    } catch (error) {
      if (error instanceof ToolInputError) {
        return { toolName, output: error.message, isError: true };
      }
      const message = error instanceof Error ? error.message : String(error);
      globalEventBus.emit("tool.failed", { toolName, error: message });
      return {
        toolName,
        output: `Tool "${toolName}" failed: ${message}`,
        isError: true,
      };
    }
  }

  /**
   * OpenCode-style interactive "ask" for dangerous tools.
   * Only active in build mode when the session has confirmDangerous enabled
   * and no persistent grant exists (build stays full-access by default).
   * Resolves via the `permission.request` bus event + resolvePermissionRequest();
   * timeout → deny-once (safe default). Grants (allow-always/deny-always) persist
   * in SessionData.permissionGrants.
   */
  private async askGateDangerousTool(
    session: SessionData,
    toolName: string,
    toolArgs: ToolArgs,
    mode: string
  ): Promise<ToolExecutionResult | null> {
    if (mode !== "build") return null;
    if (!DANGEROUS_TOOLS.has(toolName)) return null;

    const grant = session.permissionGrants?.[toolName];
    if (grant === "allow") return null;
    if (grant === "deny") {
      return {
        toolName,
        output: `Permission denied by user (always deny for this session).`,
        isError: true,
        metadata: { ask: "denied-always" },
      };
    }
    if (!session.confirmDangerous) return null;

    const { requestId, decision } = createPermissionRequest(session.id, toolName, toolArgs);
    globalEventBus.emit("permission.requested", {
      requestId,
      sessionId: session.id,
      toolName,
      args: toolArgs,
    });

    const resolved: PermissionDecision = await decision;
    if (resolved === "allow-once" || resolved === "allow-always") {
      if (resolved === "allow-always") {
        sessionStore.update(session.id, {
          permissionGrants: { ...(session.permissionGrants ?? {}), [toolName]: "allow" },
        });
      }
      return null;
    }

    if (resolved === "deny-always") {
      sessionStore.update(session.id, {
        permissionGrants: { ...(session.permissionGrants ?? {}), [toolName]: "deny" },
      });
    }
    globalEventBus.emit("permission.denied", {
      toolName,
      reason: "Denied by user",
      requestId,
    });
    return {
      toolName,
      output: `Permission denied by user.`,
      isError: true,
      metadata: { ask: resolved },
    };
  }

  private validateParameters(definition: ToolDefinition, args: ToolArgs): void {
    for (const requiredKey of definition.parameters.required) {
      const value = pick(args, definition.name, requiredKey);
      if (value === undefined) {
        throw new ToolInputError(
          `Missing required parameter "${requiredKey}" for tool "${definition.name}".`,
        );
      }
    }
    for (const [key, schema] of Object.entries(definition.parameters.properties)) {
      const value = pick(args, definition.name, key);
      if (value === undefined) continue;
      switch (schema.type) {
        case "string":
          if (typeof value !== "string") {
            throw new ToolInputError(`Parameter "${key}" of tool "${definition.name}" must be a string.`);
          }
          break;
        case "number":
          if (!Number.isFinite(typeof value === "number" ? value : Number(value))) {
            throw new ToolInputError(`Parameter "${key}" of tool "${definition.name}" must be a number.`);
          }
          break;
        case "boolean":
          if (typeof value !== "boolean" && value !== "true" && value !== "false") {
            throw new ToolInputError(`Parameter "${key}" of tool "${definition.name}" must be a boolean.`);
          }
          break;
        case "array":
          if (!Array.isArray(value)) {
            throw new ToolInputError(`Parameter "${key}" of tool "${definition.name}" must be an array.`);
          }
          break;
        default:
          break;
      }
    }
  }
}
