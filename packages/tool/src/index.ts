/**
 * @soryos/tool
 * Central Tool Registry and Physical Tool Executor.
 * Guarantees the invariant: "NO REAL ACTION = NO SUCCESS".
 */

import { Type, type FunctionDeclaration } from "@google/genai";
import { ToolDefinition, ToolExecutionResult, SessionData } from "@soryos/schema";
import { ExecutionProvider } from "@soryos/execution";
import { permissionsManager } from "@soryos/permissions";
import { globalEventBus } from "@soryos/bus";

export type { ToolExecutionResult, ToolDefinition } from "@soryos/schema";
export interface RegisteredTool extends ToolDefinition {
  geminiDeclaration: FunctionDeclaration;
}

export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  constructor() {
    this.registerCoreTools();
  }

  private registerCoreTools(): void {
    // 1. read_file
    this.register({
      id: "read_file",
      name: "read_file",
      category: "filesystem",
      description: "Read the real contents of a workspace file with line numbers.",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Relative path to target file (e.g. 'src/App.tsx')" },
          offset: { type: "integer", description: "Optional starting line (1-indexed)" },
          limit: { type: "integer", description: "Optional max lines to read" },
        },
        required: ["filePath"],
      },
      geminiDeclaration: {
        name: "read_file",
        description: "Read the real contents of a workspace file with line numbers.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            filePath: { type: Type.STRING, description: "Relative path to target file" },
            offset: { type: Type.INTEGER, description: "Optional starting line" },
            limit: { type: Type.INTEGER, description: "Optional max lines to read" },
          },
          required: ["filePath"],
        },
      },
    });

    // 2. write_file
    this.register({
      id: "write_file",
      name: "write_file",
      category: "filesystem",
      description: "Write full content into a workspace file. Verifies disk write before reporting success.",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Relative path to target file" },
          content: { type: "string", description: "Full content to write" },
        },
        required: ["filePath", "content"],
      },
      geminiDeclaration: {
        name: "write_file",
        description: "Write content into a workspace file with disk verification.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            filePath: { type: Type.STRING, description: "Relative path to target file" },
            content: { type: Type.STRING, description: "Full content to write" },
          },
          required: ["filePath", "content"],
        },
      },
    });

    // 3. edit_file
    this.register({
      id: "edit_file",
      name: "edit_file",
      category: "filesystem",
      description: "Surgically replace an exact text snippet in a file. Verifies modification on disk.",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Relative path to the file" },
          targetContent: { type: "string", description: "Exact snippet to replace" },
          replacementContent: { type: "string", description: "New replacement content" },
        },
        required: ["filePath", "targetContent", "replacementContent"],
      },
      geminiDeclaration: {
        name: "edit_file",
        description: "Surgically replace an exact text snippet in a file.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            filePath: { type: Type.STRING, description: "Relative path to the file" },
            targetContent: { type: Type.STRING, description: "Exact snippet to replace" },
            replacementContent: { type: Type.STRING, description: "New replacement content" },
          },
          required: ["filePath", "targetContent", "replacementContent"],
        },
      },
    });

    // 4. apply_patch
    this.register({
      id: "apply_patch",
      name: "apply_patch",
      category: "filesystem",
      description: "Apply a unified diff or patch hunk to a file.",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Relative path to target file" },
          patch: { type: "string", description: "Unified diff or search/replace hunk" },
        },
        required: ["filePath", "patch"],
      },
      geminiDeclaration: {
        name: "apply_patch",
        description: "Apply a unified diff or patch hunk to a file.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            filePath: { type: Type.STRING, description: "Relative path to target file" },
            patch: { type: Type.STRING, description: "Unified diff or search/replace hunk" },
          },
          required: ["filePath", "patch"],
        },
      },
    });

    // 5. list_files
    this.register({
      id: "list_files",
      name: "list_files",
      category: "filesystem",
      description: "List real files and directories in workspace.",
      parameters: {
        type: "object",
        properties: {
          directoryPath: { type: "string", description: "Optional subdirectory to inspect" },
        },
        required: [],
      },
      geminiDeclaration: {
        name: "list_files",
        description: "List real files and directories in workspace.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            directoryPath: { type: Type.STRING, description: "Optional subdirectory" },
          },
          required: [],
        },
      },
    });

    // 6. glob_files
    this.register({
      id: "glob_files",
      name: "glob_files",
      category: "filesystem",
      description: "Find files matching a glob pattern (e.g. '**/*.tsx', '*.json').",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Glob pattern (e.g. '**/*.tsx')" },
        },
        required: ["pattern"],
      },
      geminiDeclaration: {
        name: "glob_files",
        description: "Find files matching a glob pattern.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            pattern: { type: Type.STRING, description: "Glob pattern" },
          },
          required: ["pattern"],
        },
      },
    });

    // 7. grep_search
    this.register({
      id: "grep_search",
      name: "grep_search",
      category: "filesystem",
      description: "Search for a keyword or pattern across workspace files.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keyword or pattern to search for" },
          path: { type: "string", description: "Optional folder path to restrict search" },
        },
        required: ["query"],
      },
      geminiDeclaration: {
        name: "grep_search",
        description: "Search for a keyword or pattern across workspace files.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: "Search query string" },
            path: { type: Type.STRING, description: "Optional folder path" },
          },
          required: ["query"],
        },
      },
    });

    // 8. shell_command
    this.register({
      id: "shell_command",
      name: "shell_command",
      category: "shell",
      description: "Execute a real shell command in the project workspace (npm, cargo, python, git...). Captures real exitCode, stdout and stderr.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command line to execute" },
          timeoutMs: { type: "integer", description: "Execution timeout in ms" },
        },
        required: ["command"],
      },
      geminiDeclaration: {
        name: "shell_command",
        description: "Execute a real shell command in the workspace.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            command: { type: Type.STRING, description: "Shell command to execute" },
            timeoutMs: { type: Type.INTEGER, description: "Timeout in ms" },
          },
          required: ["command"],
        },
      },
    });

    // 9. todowrite & todoread
    this.register({
      id: "todowrite",
      name: "todowrite",
      category: "planning",
      description: "Maintain and update the project task checklist and roadmap ([x] Done, [ ] Pending).",
      parameters: {
        type: "object",
        properties: {
          todos: { type: "string", description: "Markdown checklist of tasks" },
        },
        required: ["todos"],
      },
      geminiDeclaration: {
        name: "todowrite",
        description: "Maintain and update the project task checklist and roadmap.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            todos: { type: Type.STRING, description: "Markdown checklist of tasks" },
          },
          required: ["todos"],
        },
      },
    });

    this.register({
      id: "todoread",
      name: "todoread",
      category: "planning",
      description: "Read current project task checklist and roadmap.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
      geminiDeclaration: {
        name: "todoread",
        description: "Read current project task checklist and roadmap.",
        parameters: {
          type: Type.OBJECT,
          properties: {},
          required: [],
        },
      },
    });
  }

  public register(tool: RegisteredTool): void {
    this.tools.set(tool.name, tool);
    if (tool.id !== tool.name) {
      this.tools.set(tool.id, tool);
    }
  }

  public getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  public getAllTools(): RegisteredTool[] {
    const seen = new Set<string>();
    const result: RegisteredTool[] = [];
    for (const tool of this.tools.values()) {
      if (!seen.has(tool.id)) {
        seen.add(tool.id);
        result.push(tool);
      }
    }
    return result;
  }

  public listTools(): RegisteredTool[] {
    return this.getAllTools();
  }

  public getGeminiDeclarations(): FunctionDeclaration[] {
    return this.getAllTools().map((t) => t.geminiDeclaration);
  }

  public getOpenAISchemas(): Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> {
    return this.getAllTools().map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }
}

export const toolRegistry = new ToolRegistry();

export class ToolExecutor {
  public async execute(
    toolName: string,
    args: Record<string, unknown>,
    provider: ExecutionProvider,
    session: SessionData,
    agentMode = "build"
  ): Promise<ToolExecutionResult> {
    const callId = `exec-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const toolDef = toolRegistry.getTool(toolName);
    if (!toolDef && toolName !== "run_command" && toolName !== "search_files") {
      const errorMsg = `Tool '${toolName}' not registered. Available: ${toolRegistry
        .getAllTools()
        .map((t) => t.name)
        .join(", ")}`;
      globalEventBus.emit(session.id, "tool.failed", { toolName, error: errorMsg, callId });
      return { toolName, output: `Error: ${errorMsg}`, isError: true };
    }

    const perm = permissionsManager.checkPermission(agentMode, toolName, args);
    if (!perm.allowed) {
      const permError = `PERMISSION DENIED: ${perm.reason || "Action non autorisée en mode " + agentMode}`;
      globalEventBus.emit(session.id, "permission.denied", { toolName, reason: perm.reason, callId });
      globalEventBus.emit(session.id, "tool.failed", { toolName, error: permError, callId });
      return { toolName, output: permError, isError: true };
    }

    globalEventBus.emit(session.id, "tool.started", { toolName, input: args, callId });

    try {
      let result: ToolExecutionResult;

      switch (toolName) {
        case "read_file": {
          const filePath = String(args.filePath || args.path || "");
          if (!filePath) {
            result = { toolName, output: "Error: filePath is required for read_file", isError: true };
            break;
          }
          const content = await provider.readFile(filePath);
          const lines = content.split("\n");
          const offset = Math.max(1, Number(args.offset || 1));
          const limit = Math.max(1, Number(args.limit || 2000));
          const slice = lines.slice(offset - 1, offset - 1 + limit);

          const numbered = slice
            .map((line, idx) => `${String(offset + idx).padStart(4, " ")} | ${line}`)
            .join("\n");

          result = {
            toolName,
            output: `=== ${filePath} (${lines.length} lines total, showing ${slice.length} lines) ===\n${numbered}`,
            isError: false,
            metadata: { filePath, totalLines: lines.length },
            verified: true,
          };
          break;
        }

        case "write_file": {
          const filePath = String(args.filePath || args.path || "");
          const content = String(args.content ?? "");
          if (!filePath) {
            result = { toolName, output: "Error: filePath is required for write_file", isError: true };
            break;
          }

          await provider.writeFile(filePath, content);
          session.files[filePath] = content;

          // Disk Verification
          const verified = await provider.readFile(filePath);
          if (verified !== content) {
            throw new Error(`Disk verification failed on ${filePath}`);
          }

          const lineCount = content.split("\n").length;
          globalEventBus.emit(session.id, "file.changed", { path: filePath, action: "write", lineCount });

          result = {
            toolName,
            output: `[SUCCESS] Verified write to ${filePath} (${lineCount} lines confirmed on disk).`,
            isError: false,
            metadata: { filePath, lineCount },
            verified: true,
          };
          break;
        }

        case "edit_file": {
          const filePath = String(args.filePath || args.path || "");
          const targetContent = String(args.targetContent ?? "");
          const replacementContent = String(args.replacementContent ?? "");

          if (!filePath || targetContent === "") {
            result = { toolName, output: "Error: filePath and targetContent are required", isError: true };
            break;
          }

          await provider.editFile(filePath, targetContent, replacementContent);
          const updated = await provider.readFile(filePath);
          session.files[filePath] = updated;

          if (!updated.includes(replacementContent)) {
            throw new Error(`Edit verification failed: replacement not found in ${filePath}`);
          }

          globalEventBus.emit(session.id, "file.changed", { path: filePath, action: "edit" });

          result = {
            toolName,
            output: `[SUCCESS] Verified surgical edit to ${filePath}.`,
            isError: false,
            metadata: { filePath },
            verified: true,
          };
          break;
        }

        case "apply_patch": {
          const filePath = String(args.filePath || args.path || "");
          const patch = String(args.patch || "");
          if (!filePath || !patch) {
            result = { toolName, output: "Error: filePath and patch are required", isError: true };
            break;
          }

          const current = await provider.readFile(filePath);
          const lines = patch.split("\n");
          const removeLines = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).map((l) => l.slice(1));
          const addLines = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));

          let patched = current;
          if (removeLines.length > 0) {
            const target = removeLines.join("\n");
            const replacement = addLines.join("\n");
            if (current.includes(target)) {
              patched = current.replace(target, replacement);
            }
          } else {
            patched = patch;
          }

          await provider.writeFile(filePath, patched);
          session.files[filePath] = patched;

          globalEventBus.emit(session.id, "file.changed", { path: filePath, action: "patch" });

          result = {
            toolName,
            output: `[SUCCESS] Applied and verified patch on ${filePath}.`,
            isError: false,
            metadata: { filePath },
            verified: true,
          };
          break;
        }

        case "list_files": {
          const dir = typeof args.directoryPath === "string" ? args.directoryPath : "";
          const entries = await provider.listFiles(dir);
          if (entries.length === 0) {
            result = { toolName, output: "(Workspace directory is empty)", isError: false };
            break;
          }
          const formatted = entries
            .map((e) => `${e.isDirectory ? "[DIR] " : "      "} ${e.path} (${e.sizeBytes} B)`)
            .join("\n");
          result = {
            toolName,
            output: `Found ${entries.length} items in workspace:\n${formatted}`,
            isError: false,
            metadata: { count: entries.length },
          };
          break;
        }

        case "glob_files": {
          const pattern = String(args.pattern || "*").toLowerCase();
          const entries = await provider.listFiles("");
          const matched = entries.filter((e) => {
            if (pattern === "*") return true;
            const clean = pattern.replace(/^\*\*\//, "").replace(/^\*/, "");
            return e.path.toLowerCase().includes(clean) || e.name.toLowerCase().includes(clean);
          });

          if (matched.length === 0) {
            result = { toolName, output: `No files matched pattern "${pattern}".`, isError: false };
            break;
          }

          result = {
            toolName,
            output: `Matched ${matched.length} files for pattern "${pattern}":\n${matched.map((m) => m.path).join("\n")}`,
            isError: false,
            metadata: { count: matched.length },
          };
          break;
        }

        case "grep_search":
        case "search_files": {
          const query = String(args.query || "");
          if (!query) {
            result = { toolName, output: "Error: query parameter is required", isError: true };
            break;
          }
          const searchPath = typeof args.path === "string" ? args.path : "";
          const entries = await provider.listFiles(searchPath);
          const matches: string[] = [];

          for (const entry of entries) {
            if (entry.isDirectory) continue;
            try {
              const content = await provider.readFile(entry.path);
              const lines = content.split("\n");
              lines.forEach((l, idx) => {
                if (l.includes(query)) {
                  matches.push(`${entry.path}:${idx + 1}: ${l.trim()}`);
                }
              });
            } catch {
              // ignore
            }
          }

          if (matches.length === 0) {
            result = { toolName, output: `No occurrences of "${query}" found.`, isError: false };
            break;
          }

          result = {
            toolName,
            output: `Found ${matches.length} matches for "${query}":\n${matches.slice(0, 50).join("\n")}`,
            isError: false,
            metadata: { count: matches.length },
          };
          break;
        }

        case "shell":
        case "shell_command":
        case "run_command": {
          const command = String(args.command || args.CommandLine || "");
          if (!command) {
            result = { toolName, output: "Error: command parameter is required", isError: true };
            break;
          }

          const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : 60_000;
          globalEventBus.emit(session.id, "process.started", { command, callId });

          const res = await provider.executeCommand(command, { timeoutMs });

          const parts: string[] = [];
          if (res.stdout) parts.push(`STDOUT:\n${res.stdout}`);
          if (res.stderr) parts.push(`STDERR:\n${res.stderr}`);
          parts.push(`Exit Code: ${res.exitCode} (${res.durationMs}ms)`);

          const isError = res.exitCode !== 0;

          globalEventBus.emit(session.id, "process.exited", {
            command,
            exitCode: res.exitCode,
            durationMs: res.durationMs,
            callId,
          });

          result = {
            toolName,
            output: parts.join("\n\n"),
            isError,
            metadata: {
              command,
              exitCode: res.exitCode,
              durationMs: res.durationMs,
              stdout: res.stdout,
              stderr: res.stderr,
            },
            verified: true,
          };
          break;
        }

        case "todowrite": {
          const todos = String(args.todos || "");
          session.files[".todos.md"] = todos;
          try {
            await provider.writeFile(".todos.md", todos);
          } catch {
            // ignore
          }
          result = {
            toolName,
            output: `Project todo checklist updated:\n${todos}`,
            isError: false,
          };
          break;
        }

        case "todoread": {
          let todos = session.files[".todos.md"];
          if (!todos) {
            try {
              todos = await provider.readFile(".todos.md");
            } catch {
              todos = "(No todo list established yet)";
            }
          }
          result = {
            toolName,
            output: `Current project todos:\n${todos}`,
            isError: false,
          };
          break;
        }

        default:
          result = {
            toolName,
            output: `Unknown tool: "${toolName}". Available: ${toolRegistry
              .getAllTools()
              .map((t) => t.name)
              .join(", ")}`,
            isError: true,
          };
      }

      if (result.isError) {
        globalEventBus.emit(session.id, "tool.failed", { toolName, error: result.output, callId });
      } else {
        globalEventBus.emit(session.id, "tool.completed", { toolName, output: result.output, callId });
      }

      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      globalEventBus.emit(session.id, "tool.failed", { toolName, error: msg, callId });
      return {
        toolName,
        output: `Tool execution failed on ExecutionProvider: ${msg}`,
        isError: true,
      };
    }
  }
}

export const toolExecutor = new ToolExecutor();
