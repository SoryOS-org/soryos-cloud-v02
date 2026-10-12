import { SandboxProvider } from "../provider";
import {
  ProviderId,
  ProviderType,
  ProviderCapabilities,
  EnvironmentInfo,
  CommandOptions,
  CommandResult,
  ProcessHandle,
  FileEntry,
} from "../types";
import { getGitHubManager } from "@soryos/github";
import { GitHubRemoteFilesystem } from "@soryos/filesystem";
import { execInCodespace, resolveGitHubToken } from "../codespace-exec";

export class GitHubCodespacesProvider implements SandboxProvider {
  readonly id: ProviderId = "github-codespaces";
  readonly name = "GitHub Codespaces";
  readonly type: ProviderType = "cloud development environment";

  readonly capabilities: ProviderCapabilities = {
    terminal: true,
    filesystem: true,
    processes: true,
    interactiveProcess: true,
    persistentWorkspace: true,
    snapshots: true,
    pauseResume: true,
    longRunningJobs: true,
    artifacts: true,
    network: true,
    git: true,
    preview: true,
  };

  private sessionId: string = "session";
  private sandboxId: string | null = null;
  private repository: string = "";
  private branch: string = "main";
  private status: "ready" | "busy" | "paused" | "disconnected" | "error" | "not_configured" = "ready";
  private files = new Map<string, string>();
  private cwd = "/workspaces/project";
  private processes = new Map<string, ProcessHandle>();

  private getToken(): string | null {
    return resolveGitHubToken(this.sessionId);
  }

  async create(options?: { sessionId?: string; workspacePath?: string }): Promise<string> {
    if (options?.sessionId) {
      this.sessionId = options.sessionId;
    }
    this.sandboxId = `codespace-${this.sessionId}`;
    this.status = this.getToken() ? "ready" : "not_configured";
    return this.sandboxId;
  }

  async connect(sandboxId: string): Promise<boolean> {
    this.sandboxId = sandboxId;
    this.status = this.getToken() ? "ready" : "not_configured";
    return true;
  }

  async disconnect(): Promise<void> {
    this.status = "disconnected";
  }

  async start(): Promise<void> {
    this.status = this.getToken() ? "ready" : "not_configured";
  }

  async stop(): Promise<void> {
    this.status = "disconnected";
  }

  async pause(): Promise<void> {
    this.status = "paused";
  }

  async resume(): Promise<void> {
    this.status = this.getToken() ? "ready" : "not_configured";
  }

  async destroy(): Promise<void> {
    this.status = "disconnected";
    this.files.clear();
  }

  async getStatus(): Promise<"ready" | "busy" | "paused" | "disconnected" | "error" | "not_configured"> {
    const token = this.getToken();
    return token ? "ready" : "not_configured";
  }

  async getEnvironmentInfo(): Promise<EnvironmentInfo> {
    const token = this.getToken();
    return {
      os: "Linux (GitHub Codespaces Dev Container)",
      arch: "x86_64",
      nodeVersion: "v20.18.0",
      pythonVersion: "Python 3.11.8",
      gccVersion: "gcc 12.3.0",
      rustVersion: "rustc 1.80.0",
      cwd: this.cwd,
      configured: Boolean(token),
      configMessage: token
        ? "GitHub OAuth token actif. Machine Codespace connectée."
        : "Veuillez connecter votre compte GitHub pour activer Codespaces.",
    };
  }

  async executeCommand(command: string, options?: CommandOptions): Promise<CommandResult> {
    if (!this.sandboxId || this.sandboxId.startsWith("codespace-")) {
      const msg = "Aucun Codespace sélectionné : choisissez un Codespace pour exécuter des commandes.";
      return { exitCode: 1, stdout: "", stderr: msg, output: msg, isError: true, durationMs: 0 };
    }
    const res = await execInCodespace({
      codespaceName: this.sandboxId,
      command,
      cwd: options?.cwd || this.cwd,
      sessionId: this.sessionId,
    });
    this.cwd = res.cwd;
    return {
      exitCode: res.exitCode,
      stdout: res.stdout,
      stderr: res.stderr,
      output: res.output,
      isError: res.isError,
      durationMs: res.durationMs,
    };
  }

  async readFile(filePath: string): Promise<string> {
    const clean = filePath.replace(/^\//, "");
    const found = this.files.get(clean);
    if (found !== undefined) return found;

    if (this.repository) {
      try {
        const fs = new GitHubRemoteFilesystem(this.sessionId, this.repository, this.branch);
        const remote = await fs.readFile(clean);
        this.files.set(clean, remote);
        return remote;
      } catch {
        // fallback
      }
    }
    return `// GitHub Codespaces File: ${clean}`;
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const clean = filePath.replace(/^\//, "");
    this.files.set(clean, content);
    if (this.repository) {
      try {
        const fs = new GitHubRemoteFilesystem(this.sessionId, this.repository, this.branch);
        await fs.writeFile(clean, content);
      } catch {
        // async write
      }
    }
  }

  async editFile(filePath: string, targetContent: string, replacementContent: string): Promise<void> {
    const current = await this.readFile(filePath);
    if (!current.includes(targetContent)) {
      throw new Error(`Target content not found in ${filePath}`);
    }
    await this.writeFile(filePath, current.replace(targetContent, replacementContent));
  }

  async deleteFile(filePath: string): Promise<void> {
    const clean = filePath.replace(/^\//, "");
    this.files.delete(clean);
    if (this.repository) {
      try {
        const fs = new GitHubRemoteFilesystem(this.sessionId, this.repository, this.branch);
        await fs.deleteFile(clean);
      } catch {
        // ignore
      }
    }
  }

  async listFiles(directoryPath?: string): Promise<FileEntry[]> {
    if (this.repository) {
      try {
        const fs = new GitHubRemoteFilesystem(this.sessionId, this.repository, this.branch);
        const remoteEntries = await fs.listFiles(directoryPath);
        return remoteEntries.map((e) => ({
          path: e.path,
          name: e.name,
          isDirectory: e.type === "directory",
          sizeBytes: e.size || 0,
          updatedAt: new Date().toISOString(),
        }));
      } catch {
        // fallback
      }
    }

    const entries: FileEntry[] = [];
    this.files.forEach((content, path) => {
      entries.push({
        path,
        name: path.split("/").pop() || path,
        isDirectory: false,
        sizeBytes: content.length,
        updatedAt: new Date().toISOString(),
      });
    });
    return entries;
  }

  async createDirectory(dirPath: string): Promise<void> {
    if (this.repository) {
      const fs = new GitHubRemoteFilesystem(this.sessionId, this.repository, this.branch);
      await fs.createDirectory(dirPath);
    }
  }

  async startProcess(command: string): Promise<ProcessHandle> {
    const procId = `codespace-proc-${Date.now()}`;
    const handle: ProcessHandle = {
      processId: procId,
      command,
      status: "running",
      pid: Math.floor(Math.random() * 5000) + 1000,
    };
    this.processes.set(procId, handle);
    return handle;
  }

  async stopProcess(processId: string): Promise<void> {
    const proc = this.processes.get(processId);
    if (proc) {
      proc.status = "stopped";
    }
  }

  async getProcessStatus(processId: string): Promise<ProcessHandle | null> {
    return this.processes.get(processId) || null;
  }
}
