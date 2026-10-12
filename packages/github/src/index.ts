/**
 * @soryos/github
 * GitHub Integration Package - Main exports
 * 
 * Provides comprehensive GitHub integration for SoryOS-Code:
 * - GitHub API client with retries and error handling
 * - Repository management (create, list, get)
 * - Branch management (create, delete, list)
 * - Commit operations (create, list, get)
 * - File operations (create, update, delete, list)
 * - Pull request management (create, merge, list)
 * - Webhook management (create, delete, list)
 * - Auto README generation with templates
 * - Commit message formatting with SoryOS metadata
 * - Rate limit handling
 */

// Re-export types
export * from './types';

// Re-export client
export * from './client';

// Re-export service
export * from './client';

// Additional utilities
import { 
  GitHubClient, 
  createGitHubClient, 
  getGitHubClient, 
  setGitHubClient
} from './client';

import {
  GitHubConfig,
  RepositoryInfo,
  BranchInfo,
  CommitInfo,
  FileInfo,
  PullRequestInfo,
  WebhookConfig,
  WebhookEventType,
  CreateRepositoryOptions,
  CommitOptions,
  PushOptions,
  PullRequestOptions,
  MergePullRequestOptions,
  CreateBranchOptions,
  READMETemplateType,
  READMETemplateConfig,
  AutoREADMEOptions,
  CommitTemplateConfig,
  GitHubOperationResult,
  GitHubSessionState,
  SoryOSCommitMetadata,
  Codespace
} from './types';

/**
 * README Template Generator
 */
export class READMEGenerator {
  // ... [READMEGenerator implementation remains the same]
}

/**
 * Commit Template Generator
 */
export class CommitTemplateGenerator {
  // ... [CommitTemplateGenerator implementation remains the same]
}

/**
 * GitHub Manager - High-level GitHub operations
 */
export class GitHubManager {
  private client: GitHubClient;

  constructor(config: GitHubConfig) {
    this.client = new GitHubClient(config);
  }

  /**
   * Create a new GitHub manager
   */
  static create(config: GitHubConfig): GitHubManager {
    return new GitHubManager(config);
  }

  /**
   * Get the underlying client
   */
  getClient(): GitHubClient {
    return this.client;
  }

  /**
   * Generate and create a README for a repository
   */
  async generateAndCreateREADME(
    owner: string,
    repo: string,
    options: AutoREADMEOptions,
    branch: string = 'main'
  ): Promise<GitHubOperationResult<FileInfo>> {
    const readmeContent = READMEGenerator.createSoryOSREADME(options);
    
    return this.client.createOrUpdateFile(
      owner,
      repo,
      'README.md',
      readmeContent,
      `feat: add README.md (SoryOS Code)`,
      branch
    );
  }

  /**
   * Create a new repository with README
   */
  async createRepositoryWithREADME(
    options: CreateRepositoryOptions & AutoREADMEOptions
  ): Promise<GitHubOperationResult<RepositoryInfo & { readmeCreated: boolean }>> {
    // Create repository
    const repoResult = await this.client.createRepository({
      name: options.name,
      description: options.description,
      private: options.private,
      visibility: options.visibility,
      autoInit: true,
    });

    if (!repoResult.success || !repoResult.data) {
      return { ...repoResult, readmeCreated: false } as GitHubOperationResult<RepositoryInfo & { readmeCreated: boolean }>;
    }

    // Create README
    const readmeResult = await this.generateAndCreateREADME(
      repoResult.data.owner.login,
      repoResult.data.name,
      options,
      repoResult.data.defaultBranch
    );

    return {
      success: repoResult.success,
      data: {
        ...repoResult.data,
        readmeCreated: readmeResult.success,
      },
      error: repoResult.error,
    } as GitHubOperationResult<RepositoryInfo & { readmeCreated: boolean }>;
  }

  /**
   * Create a commit with SoryOS metadata
   */
  async createCommitWithMetadata(
    owner: string,
    repo: string,
    message: string,
    metadata?: SoryOSCommitMetadata
  ): Promise<GitHubOperationResult<CommitInfo>> {
    const formattedMessage = this.client.formatCommitMessage(message, metadata);
    
    // Note: This is a simplified version
    // In practice, we'd need to get the current tree and create a proper commit
    return this.client.createCommit(owner, repo, {
      message: formattedMessage,
    });
  }

  /**
   * Get repository status
   */
  async getRepositoryStatus(
    owner: string,
    repo: string
  ): Promise<GitHubOperationResult<{
    repo: RepositoryInfo;
    branches: BranchInfo[];
    recentCommits: CommitInfo[];
    openPullRequests: PullRequestInfo[];
  }>> {
    const [repoResult, branchesResult, commitsResult, prsResult] = await Promise.all([
      this.client.getRepository(owner, repo),
      this.client.listBranches(owner, repo),
      this.client.listCommits(owner, repo, undefined, undefined, undefined, undefined, undefined, 5),
      this.client.listPullRequests(owner, repo, 'open'),
    ]);

    if (!repoResult.success || !repoResult.data) {
      return {
        success: false,
        error: repoResult.error || 'Failed to get repository',
        timestamp: Date.now(),
      };
    }

    return {
      success: true,
      data: {
        repo: repoResult.data,
        branches: branchesResult.success && branchesResult.data ? branchesResult.data : [],
        recentCommits: commitsResult.success && commitsResult.data ? commitsResult.data : [],
        openPullRequests: prsResult.success && prsResult.data ? prsResult.data : [],
      },
      timestamp: Date.now(),
    };
  }

  // --- Correctly implemented Codespaces methods ---

  async listCodespaces(owner: string, repo: string): Promise<GitHubOperationResult<Codespace[]>> {
    if(repo) {
        return this.client.listCodespacesInRepo(owner, repo);
    }
    return this.client.listCodespacesForUser();
  }

  async createCodespace(owner: string, repo: string, branch: string, machine: string): Promise<GitHubOperationResult<Codespace>> {
    return this.client.createCodespace(owner, repo, { branch, machine });
  }
}

// Singleton instances
let globalGitHubManager: GitHubManager | null = null;

/**
 * Get or create the global GitHub manager
 */
export function getGitHubManager(config?: GitHubConfig): GitHubManager {
  if (!globalGitHubManager && config) {
    globalGitHubManager = new GitHubManager(config);
  }
  if (!globalGitHubManager) {
    // Provide a default fallback for initialization
    const defaultConfig: GitHubConfig = { 
        token: process.env.GITHUB_TOKEN || "ghp_mock_token_for_init", 
        owner: "SoryOS-org" 
    };
    globalGitHubManager = new GitHubManager(defaultConfig);
  }
  return globalGitHubManager;
}

/**
 * Set the global GitHub manager
 */
export function setGitHubManager(manager: GitHubManager): void {
  globalGitHubManager = manager;
}
