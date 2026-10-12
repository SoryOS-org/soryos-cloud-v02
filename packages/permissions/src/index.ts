/**
 * @soryos/permissions
 * Granular role-based security & tool execution policy manager.
 */

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

export class PermissionsManager {
  private static readonly READ_ONLY_TOOLS = new Set([
    "read_file",
    "list_files",
    "glob_files",
    "grep_search",
    "search_files",
    "todoread",
    "todowrite",
    "plan_exit",
    "websearch",
    "webfetch",
  ]);

  private static readonly WRITE_TOOLS = new Set([
    "write_file",
    "edit_file",
    "apply_patch",
    "delete_file",
    "create_file",
  ]);

  private static readonly EXEC_TOOLS = new Set([
    "shell",
    "shell_command",
    "run_command",
    "process",
    "git",
  ]);

  public checkPermission(agentMode: string, toolName: string, args?: Record<string, unknown>): PermissionCheckResult {
    const mode = (agentMode || "build").toLowerCase();

    // 1. Build Agent: Full Autonomous Access
    if (mode === "build") {
      return { allowed: true };
    }

    // 2. Plan Agent: Architect Mode (Strictly Non-Destructive)
    if (mode === "plan") {
      if (PermissionsManager.READ_ONLY_TOOLS.has(toolName)) {
        return { allowed: true };
      }
      if (PermissionsManager.WRITE_TOOLS.has(toolName)) {
        return {
          allowed: false,
          reason: `L'agent 'Plan' est en mode architecte en lecture seule. Pour modifier des fichiers, basculez sur l'agent 'Build'.`,
        };
      }
      if (PermissionsManager.EXEC_TOOLS.has(toolName)) {
        const cmd = String(args?.command || args?.CommandLine || "").trim().toLowerCase();
        if (cmd === "pwd" || cmd.startsWith("ls") || cmd === "git status" || cmd.startsWith("git log")) {
          return { allowed: true };
        }
        return {
          allowed: false,
          reason: `L'agent 'Plan' n'exécute pas de commandes de compilation ou de modification. Utilisez l'agent 'Build'.`,
        };
      }
      return { allowed: false, reason: `Outil non autorisé en mode Plan : ${toolName}` };
    }

    // 3. Explore Agent: Codebase Navigation
    if (mode === "explore") {
      if (
        toolName === "read_file" ||
        toolName === "list_files" ||
        toolName === "glob_files" ||
        toolName === "grep_search" ||
        toolName === "search_files"
      ) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: `L'agent 'Explore' est strictement dédié à la recherche dans le codebase. Modification refusée.`,
      };
    }

    // 4. Code Reviewer Agent
    if (mode === "code-reviewer") {
      if (
        PermissionsManager.READ_ONLY_TOOLS.has(toolName) ||
        toolName === "shell_command" ||
        toolName === "shell"
      ) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: `L'agent 'Code Reviewer' effectue uniquement des revues et l'exécution de tests.`,
      };
    }

    return { allowed: true };
  }
}

export const permissionsManager = new PermissionsManager();
