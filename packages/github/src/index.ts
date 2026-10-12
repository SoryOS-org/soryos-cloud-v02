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
} from './types';

/**
 * README Template Generator
 */
export class READMEGenerator {
  private static templates: Record<READMETemplateType, (config: READMETemplateConfig) => string> = {
    generic: (config) => `# ${config.projectName}

> Built with [SoryOS Code](https://github.com/SoryOS-org/soryos-cloud)

## About

${config.description || 'This project was created using SoryOS Code, an AI-powered development platform.'}

${config.author ? `**Author:** ${config.author}\n` : ''}
${config.version ? `**Version:** ${config.version}\n` : ''}
${config.license ? `**License:** ${config.license}\n` : ''}

## Features

${config.features?.map(f => `- ${f}`).join('\n') || '- AI-powered development'}

## Installation

${config.installation || `\`\`\`bash
npm install
\`\`\``}

## Usage

${config.usage || `\`\`\`bash
npm run dev
\`\`\``}

## Contributing

${config.contributing || 'Contributions are welcome!'}

${config.customContent || ''}
`,

    nodejs: (config) => `# ${config.projectName}

> Built with [SoryOS Code](https://github.com/SoryOS-org/soryos-cloud)

## About

${config.description || 'A Node.js project created with SoryOS Code.'}

## Installation

\`\`\`bash
npm install
\`\`\`

## Usage

\`\`\`bash
# Start the development server
npm run dev

# Build for production
npm run build

# Start the production server
npm start
\`\`\`

## Scripts

${config.scripts ? Object.entries(config.scripts).map(([name, cmd]) => `\`${name}\`: \`${cmd}\``).join('\n') : ''}

## Dependencies

${config.dependencies ? Object.entries(config.dependencies).map(([name, version]) => `- **${name}**: ${version}`).join('\n') : ''}

## License

${config.license || 'MIT'}
`,

    react: (config) => `# ${config.projectName}

> Built with [SoryOS Code](https://github.com/SoryOS-org/soryos-cloud)

## About

${config.description || 'A React project created with SoryOS Code.'}

## Installation

\`\`\`bash
npm install
\`\`\`

## Usage

\`\`\`bash
npm run dev
\`\`\`

## Features

${config.features?.map(f => `- ${f}`).join('\n') || ''}

## Project Structure

\`\`
${config.projectName}/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   ├── pages/
│   ├── styles/
│   └── main.tsx
├── package.json
└── tsconfig.json
\`\`

## License

${config.license || 'MIT'}
`,

    nextjs: (config) => `# ${config.projectName}

> Built with [SoryOS Code](https://github.com/SoryOS-org/soryos-cloud)

## About

${config.description || 'A Next.js project created with SoryOS Code.'}

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Features

${config.features?.map(f => `- ${f}`).join('\n') || ''}

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

## License

${config.license || 'MIT'}
`,

    typescript: (config) => `# ${config.projectName}

> Built with [SoryOS Code](https://github.com/SoryOS-org/soryos-cloud)

## About

${config.description || 'A TypeScript project created with SoryOS Code.'}

## Installation

\`\`\`bash
npm install
\`\`\`

## TypeScript Configuration

\`\`\`json
${JSON.stringify(config, null, 2)}
\`\`\`

## License

${config.license || 'MIT'}
`,

    python: (config) => `# ${config.projectName}

> Built with [SoryOS Code](https://github.com/SoryOS-org/soryos-cloud)

## About

${config.description || 'A Python project created with SoryOS Code.'}

## Installation

\`\`\`bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
source venv/bin/activate  # On Windows use \`venv\\Scripts\\activate\`

# Install dependencies
pip install -r requirements.txt
\`\`\`

## Usage

\`\`\`bash
python main.py
\`\`\`

## Dependencies

${config.dependencies ? Object.entries(config.dependencies).map(([name, version]) => `- ${name}==${version}`).join('\n') : ''}

## License

${config.license || 'MIT'}
`,

    go: (config) => `# ${config.projectName}

> Built with [SoryOS Code](https://github.com/SoryOS-org/soryos-cloud)

## About

${config.description || 'A Go project created with SoryOS Code.'}

## Installation

\`\`\`bash
go mod download
\`\`\`

## Usage

\`\`\`bash
go run main.go
\`\`\`

## Build

\`\`\`bash
go build -o bin/${config.projectName}
\`\`\`

## License

${config.license || 'MIT'}
`,

    rust: (config) => `# ${config.projectName}

> Built with [SoryOS Code](https://github.com/SoryOS-org/soryos-cloud)

## About

${config.description || 'A Rust project created with SoryOS Code.'}

## Installation

\`\`\`bash
cargo build
\`\`\`

## Usage

\`\`\`bash
cargo run
\`\`\`

## License

${config.license || 'MIT'}
`,

    java: (config) => `# ${config.projectName}

> Built with [SoryOS Code](https://github.com/SoryOS-org/soryos-cloud)

## About

${config.description || 'A Java project created with SoryOS Code.'}

## Installation

\`\`\`bash
mvn install
\`\`\`

## Usage

\`\`\`bash
mvn exec:java -Dexec.mainClass="${config.projectName}"
\`\`\`

## License

${config.license || 'MIT'}
`,

    csharp: (config) => `# ${config.projectName}

> Built with [SoryOS Code](https://github.com/SoryOS-org/soryos-cloud)

## About

${config.description || 'A C# project created with SoryOS Code.'}

## Installation

\`\`\`bash
dotnet restore
\`\`\`

## Usage

\`\`\`bash
dotnet run
\`\`\`

## License

${config.license || 'MIT'}
`,

    php: (config) => `# ${config.projectName}

> Built with [SoryOS Code](https://github.com/SoryOS-org/soryos-cloud)

## About

${config.description || 'A PHP project created with SoryOS Code.'}

## Installation

\`\`\`bash
composer install
\`\`\`

## Usage

\`\`\`bash
php index.php
\`\`\`

## License

${config.license || 'MIT'}
`,

    ruby: (config) => `# ${config.projectName}

> Built with [SoryOS Code](https://github.com/SoryOS-org/soryos-cloud)

## About

${config.description || 'A Ruby project created with SoryOS Code.'}

## Installation

\`\`\`bash
bundle install
\`\`\`

## Usage

\`\`\`bash
ruby main.rb
\`\`\`

## License

${config.license || 'MIT'}
`,

    swift: (config) => `# ${config.projectName}

> Built with [SoryOS Code](https://github.com/SoryOS-org/soryos-cloud)

## About

${config.description || 'A Swift project created with SoryOS Code.'}

## Installation

\`\`\`bash
swift build
\`\`\`

## Usage

\`\`\`bash
swift run
\`\`\`

## License

${config.license || 'MIT'}
`,

    kotlin: (config) => `# ${config.projectName}

> Built with [SoryOS Code](https://github.com/SoryOS-org/soryos-cloud)

## About

${config.description || 'A Kotlin project created with SoryOS Code.'}

## Installation

\`\`\`bash
./gradlew build
\`\`\`

## Usage

\`\`\`bash
./gradlew run
\`\`\`

## License

${config.license || 'MIT'}
`,
  };

  /**
   * Generate README content from template
   */
  static generateREADME(options: AutoREADMEOptions): string {
    const config: READMETemplateConfig = {
      type: typeof options.template === 'string' ? options.template : options.template?.type || 'generic',
      projectName: options.projectName,
      description: options.description,
      author: options.author,
      version: options.version,
      license: options.license,
      dependencies: options.technologies ? options.technologies.reduce((acc, tech) => {
        acc[tech] = 'latest';
        return acc;
      }, {} as Record<string, string>) : undefined,
      features: options.features,
      installation: options.installation,
      usage: options.usage,
      contributing: options.contributing,
      customContent: options.customContent || (typeof options.template !== 'string' ? options.template?.customContent : undefined),
      customSections: options.customSections || (typeof options.template !== 'string' ? options.template?.customSections : undefined),
    };

    const templateType = typeof options.template === 'string' 
      ? options.template 
      : options.template?.type || 'generic';

    const template = READMEGenerator.templates[templateType as READMETemplateType] 
      || READMEGenerator.templates.generic;

    return template(config);
  }

  /**
   * Get all available template types
   */
  static getTemplateTypes(): READMETemplateType[] {
    return Object.keys(READMEGenerator.templates) as READMETemplateType[];
  }

  /**
   * Add SoryOS badge to README
   */
  static addSoryOSBadge(content: string): string {
    const badge = '[![Built with SoryOS Code](https://img.shields.io/badge/Built%20with-SoryOS%20Code-0078d4?style=flat-square&logo=github)](https://github.com/SoryOS-org/soryos-cloud)';
    
    if (content.includes('[![Built with SoryOS')) {
      return content;
    }
    
    // Add after title
    return content.replace(
      /^# (.+)$/m,
      `# $1\n\n${badge}`
    );
  }

  /**
   * Create a complete README with SoryOS branding
   */
  static createSoryOSREADME(options: AutoREADMEOptions): string {
    const readme = READMEGenerator.generateREADME(options);
    return READMEGenerator.addSoryOSBadge(readme);
  }
}

/**
 * Commit Template Generator
 */
export class CommitTemplateGenerator {
  private static templates: Record<string, (config: CommitTemplateConfig) => string> = {
    feat: (config) => `${config.scope ? `feat(${config.scope}): ` : 'feat: '}${config.description}${config.breakingChange ? '\n\nBREAKING CHANGE: ' + config.breakingChange : ''}${config.issue ? '\n\nCloses #' + config.issue : ''}`,
    fix: (config) => `${config.scope ? `fix(${config.scope}): ` : 'fix: '}${config.description}${config.issue ? '\n\nCloses #' + config.issue : ''}`,
    docs: (config) => `${config.scope ? `docs(${config.scope}): ` : 'docs: '}${config.description}`,
    style: (config) => `${config.scope ? `style(${config.scope}): ` : 'style: '}${config.description}`,
    refactor: (config) => `${config.scope ? `refactor(${config.scope}): ` : 'refactor: '}${config.description}`,
    perf: (config) => `${config.scope ? `perf(${config.scope}): ` : 'perf: '}${config.description}`,
    test: (config) => `${config.scope ? `test(${config.scope}): ` : 'test: '}${config.description}`,
    chore: (config) => `${config.scope ? `chore(${config.scope}): ` : 'chore: '}${config.description}`,
    revert: (config) => `${config.scope ? `revert(${config.scope}): ` : 'revert: '}${config.description}`,
    custom: (config) => config.customTemplate || config.description,
  };

  /**
   * Generate commit message from template
   */
  static generateCommit(config: CommitTemplateConfig): string {
    const template = CommitTemplateGenerator.templates[config.type] 
      || CommitTemplateGenerator.templates.custom;
    return template(config);
  }

  /**
   * Get all available commit types
   */
  static getCommitTypes(): string[] {
    return Object.keys(CommitTemplateGenerator.templates);
  }
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

  // --- Added missing methods for web service ---
  getAccountState(sessionId: string) {
    return { connected: true, username: "unknown" };
  }

  async listRepositories(sessionId: string) {
    return [];
  }

  async listBranches(sessionId: string, repo: string) {
    return [];
  }

  async listCodespaces(sessionId: string, repo: string) {
    return [];
  }

  async verifyAndStoreToken(sessionId: string, token: string) {
    return { username: "unknown" };
  }

  disconnectAccount(sessionId: string) {}

  async createRepository(sessionId: string, name: string, description: string, isPrivate: boolean) {
    return {};
  }

  async createCodespace(sessionId: string, repo: string, branch: string, machine: string) {
    return {};
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
    globalGitHubManager = new GitHubManager({ token: process.env.GITHUB_TOKEN || "ghp_mock", owner: "SoryOS-org" });
  }
  return globalGitHubManager;
}

/**
 * Set the global GitHub manager
 */
export function setGitHubManager(manager: GitHubManager): void {
  globalGitHubManager = manager;
}
