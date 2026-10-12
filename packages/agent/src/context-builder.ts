/**
 * @soryos/agent
 * Context Builder - Inspiré de Vibra Code
 * 
 * Fonctionnalités:
 * - Sélection intelligente du contexte
 * - Gestion progressive du contexte
 * - Optimisation de l'envoi au modèle
 * - Intégration avec Session/Workspace/Project
 * - Support multi-sources (fichiers, git, historique, etc.)
 */

import { GlobalEventBus } from '@soryos/bus';
import { sessionStore, messageStore } from '@soryos/session';
import { WorkspaceStore, ProjectStore } from '@soryos/workspace';
import { FileSystem } from '@soryos/filesystem';
import { GitManager } from '@soryos/git';

export interface ContextOptions {
  sessionId: string;
  workspaceId?: string;
  projectId?: string;
  userRequest?: string;
  maxTokens?: number;
  includeHistory?: boolean;
  includeFiles?: boolean;
  includeGit?: boolean;
  includeTodos?: boolean;
  includeConfig?: boolean;
}

export interface ContextItem {
  type: 'system' | 'user' | 'assistant' | 'file' | 'git' | 'todo' | 'config' | 'metadata';
  role?: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
  path?: string;
  priority: number;
  tokenCount: number;
  metadata?: Record<string, any>;
}

export interface BuiltContext {
  messages: Array<{ role: string; content: string }>;
  systemPrompt: string;
  contextItems: ContextItem[];
  totalTokens: number;
  stats: {
    filesIncluded: number;
    historyMessages: number;
    gitInfo: boolean;
    todosIncluded: boolean;
    configIncluded: boolean;
  };
}

export interface ContextConfig {
  maxContextTokens: number;
  maxHistoryMessages: number;
  maxFileSizeTokens: number;
  maxFiles: number;
  fileExtensions: string[];
  excludedDirectories: string[];
  systemPromptTemplate: string;
}

const DEFAULT_CONFIG: ContextConfig = {
  maxContextTokens: 32000,
  maxHistoryMessages: 20,
  maxFileSizeTokens: 4000,
  maxFiles: 10,
  fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.json', '.yaml', '.yml', '.md', '.txt'],
  excludedDirectories: ['node_modules', '.git', 'dist', 'build', 'target', 'tmp'],
  systemPromptTemplate: `You are an AI coding assistant. Help the user with their request.

Current project context:
- Project: {projectName}
- Workspace: {workspacePath}
- Session: {sessionId}

Guidelines:
- Always verify your changes by reading files after modification
- Use appropriate tools for each task
- Provide clear explanations for your actions
- If you encounter errors, try to understand and fix them
- Always check that files exist before trying to modify them

Available tools: read_file, write_file, edit_file, shell_command, list_files, grep_search, glob_files, todowrite, todoread`
};

export class ContextBuilder {
  private config: ContextConfig;
  private fs: FileSystem;
  private gitManager: GitManager;

  constructor(
    config: Partial<ContextConfig> = {},
    fs?: FileSystem,
    gitManager?: GitManager
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.fs = fs || new FileSystem();
    this.gitManager = gitManager || new GitManager();
  }

  /**
   * Construire le contexte complet pour une requête
   */
  async buildContext(options: ContextOptions): Promise<BuiltContext> {
    const startTime = Date.now();
    const {
      sessionId,
      workspaceId,
      projectId,
      userRequest,
      maxTokens = this.config.maxContextTokens,
      includeHistory = true,
      includeFiles = true,
      includeGit = true,
      includeTodos = true,
      includeConfig = true
    } = options;

    console.log(`[ContextBuilder] Building context for session ${sessionId}`);

    // Initialiser le contexte
    const context: BuiltContext = {
      messages: [],
      systemPrompt: '',
      contextItems: [],
      totalTokens: 0,
      stats: {
        filesIncluded: 0,
        historyMessages: 0,
        gitInfo: false,
        todosIncluded: false,
        configIncluded: false
      }
    };

    try {
      // 1. Obtenir les informations de base
      const [session, workspace, project] = await Promise.all([
        sessionStore.get(sessionId),
        workspaceId ? WorkspaceStore.get(workspaceId) : Promise.resolve(null),
        projectId ? ProjectStore.get(projectId) : Promise.resolve(null)
      ]);

      // 2. Construire le system prompt
      context.systemPrompt = this.buildSystemPrompt(session, workspace, project, userRequest);

      // 3. Ajouter l'historique des messages (si demandé)
      if (includeHistory) {
        await this.addHistoryMessages(sessionId, context, maxTokens);
      }

      // 4. Ajouter les fichiers pertinents (si demandé)
      if (includeFiles && workspaceId) {
        await this.addRelevantFiles(workspaceId, project, userRequest, context, maxTokens);
      }

      // 5. Ajouter les informations Git (si demandé)
      if (includeGit && workspaceId) {
        await this.addGitInfo(workspaceId, context);
      }

      // 6. Ajouter les todos (si demandé)
      if (includeTodos && workspaceId) {
        await this.addTodos(workspaceId, context);
      }

      // 7. Ajouter les fichiers de configuration (si demandé)
      if (includeConfig && workspaceId) {
        await this.addConfigFiles(workspaceId, context);
      }

      // 8. Ajouter la requête utilisateur
      if (userRequest) {
        context.messages.push({
          role: 'user',
          content: userRequest
        });
        context.totalTokens += this.estimateTokenCount(userRequest);
      }

      // 9. Optimiser le contexte (troncature si nécessaire)
      this.optimizeContext(context, maxTokens);

      console.log(`[ContextBuilder] Context built in ${Date.now() - startTime}ms`);
      console.log(`[ContextBuilder] Total tokens: ${context.totalTokens}, items: ${context.contextItems.length}`);

    } catch (error) {
      console.error('[ContextBuilder] Error building context:', error);
      // Retourner un contexte minimal en cas d'erreur
      return this.buildMinimalContext(sessionId, userRequest);
    }

    return context;
  }

  /**
   * Construire un contexte minimal (fallback)
   */
  private buildMinimalContext(sessionId: string, userRequest?: string): BuiltContext {
    const context: BuiltContext = {
      messages: [],
      systemPrompt: 'You are an AI coding assistant. Help the user with their request.',
      contextItems: [],
      totalTokens: 0,
      stats: {
        filesIncluded: 0,
        historyMessages: 0,
        gitInfo: false,
        todosIncluded: false,
        configIncluded: false
      }
    };

    if (userRequest) {
      context.messages.push({
        role: 'user',
        content: userRequest
      });
      context.totalTokens += this.estimateTokenCount(userRequest);
    }

    return context;
  }

  /**
   * Construire le system prompt
   */
  private buildSystemPrompt(
    session: any,
    workspace: any,
    project: any,
    userRequest?: string
  ): string {
    const projectName = project?.name || workspace?.name || 'Unknown Project';
    const workspacePath = workspace?.path || session?.workspacePath || '/workspace';
    const sessionId = session?.id || 'unknown';

    // Remplacer les placeholders dans le template
    let systemPrompt = this.config.systemPromptTemplate
      .replace('{projectName}', projectName)
      .replace('{workspacePath}', workspacePath)
      .replace('{sessionId}', sessionId);

    // Ajouter des informations spécifiques basées sur la requête
    if (userRequest) {
      const lowerRequest = userRequest.toLowerCase();
      
      if (lowerRequest.includes('bug') || lowerRequest.includes('error') || lowerRequest.includes('fix')) {
        systemPrompt += '\n\nDebugging Mode: Focus on identifying and fixing issues.';
      } else if (lowerRequest.includes('create') || lowerRequest.includes('new') || lowerRequest.includes('build')) {
        systemPrompt += '\n\nCreation Mode: Focus on creating new files and features.';
      } else if (lowerRequest.includes('test') || lowerRequest.includes('verify')) {
        systemPrompt += '\n\nTesting Mode: Focus on verifying correctness and writing tests.';
      }
    }

    return systemPrompt;
  }

  /**
   * Ajouter l'historique des messages
   */
  private async addHistoryMessages(
    sessionId: string,
    context: BuiltContext,
    maxTokens: number
  ): Promise<void> {
    try {
      const messages = await messageStore.getBySession(sessionId);
      
      // Filtrer les messages récents (limité par config)
      const recentMessages = messages.slice(-this.config.maxHistoryMessages);
      
      // Ajouter au contexte
      for (const msg of recentMessages) {
        const content = (msg as any).content || '';
        const role = (msg as any).role || (msg as any)._id.startsWith('user') ? 'user' : 'assistant';
        
        // Vérifier si on a assez de tokens
        const tokenCount = this.estimateTokenCount(content);
        if (context.totalTokens + tokenCount > maxTokens * 0.8) {
          // Arrêter si on atteint 80% du max (garder de la place pour le reste)
          break;
        }
        
        context.messages.push({
          role,
          content
        });
        context.totalTokens += tokenCount;
      }
      
      context.stats.historyMessages = recentMessages.length;
      
    } catch (error) {
      console.error('[ContextBuilder] Error adding history messages:', error);
    }
  }

  /**
   * Ajouter les fichiers pertinents
   */
  private async addRelevantFiles(
    workspaceId: string,
    project: any,
    userRequest: string | undefined,
    context: BuiltContext,
    maxTokens: number
  ): Promise<void> {
    try {
      // Obtenir la liste des fichiers dans le workspace
      const files = await this.fs.listFiles(workspaceId);
      
      // Filtrer les fichiers pertinents
      const relevantFiles = this.filterRelevantFiles(files, userRequest);
      
      // Trier par pertinence
      const sortedFiles = this.sortFilesByRelevance(relevantFiles, userRequest);
      
      // Ajouter les fichiers au contexte (limité par le nombre max)
      for (let i = 0; i < Math.min(sortedFiles.length, this.config.maxFiles); i++) {
        const file = sortedFiles[i];
        
        // Vérifier la taille du fichier
        if (file.sizeBytes > this.config.maxFileSizeTokens * 4) {
          // Fichier trop grand, ajouter seulement le nom
          context.contextItems.push({
            type: 'file',
            name: file.name,
            path: file.path,
            content: `[FILE TOO LARGE] ${file.path} (${file.sizeBytes} bytes) - Use read_file to view contents`,
            priority: 5 - i, // Priorité décroissante
            tokenCount: this.estimateTokenCount(file.path) + 20,
            metadata: {
              size: file.sizeBytes,
              isDirectory: file.isDirectory
            }
          });
          context.totalTokens += context.contextItems[context.contextItems.length - 1].tokenCount;
        } else {
          // Lire le contenu du fichier
          const content = await this.fs.readFile(file.path);
          const tokenCount = this.estimateTokenCount(content);
          
          // Vérifier si on a assez de tokens
          if (context.totalTokens + tokenCount > maxTokens * 0.7) {
            // Arrêter si on atteint 70% du max
            break;
          }
          
          context.contextItems.push({
            type: 'file',
            name: file.name,
            path: file.path,
            content: `=== ${file.path} ===\n${content}`,
            priority: 10 - i, // Priorité plus élevée pour les fichiers
            tokenCount,
            metadata: {
              size: file.sizeBytes,
              isDirectory: file.isDirectory
            }
          });
          context.totalTokens += tokenCount;
        }
        
        context.stats.filesIncluded++;
      }
      
    } catch (error) {
      console.error('[ContextBuilder] Error adding relevant files:', error);
    }
  }

  /**
   * Filtrer les fichiers pertinents
   */
  private filterRelevantFiles(files: any[], userRequest?: string): any[] {
    const relevantExtensions = this.config.fileExtensions;
    const excludedDirs = this.config.excludedDirectories;
    
    return files.filter(file => {
      // Exclure les répertoires
      if (file.isDirectory) {
        return excludedDirs.includes(file.name);
      }
      
      // Inclure les fichiers avec des extensions pertinentes
      const hasRelevantExtension = relevantExtensions.some(ext => 
        file.name.endsWith(ext) || file.path.endsWith(ext)
      );
      
      // Inclure les fichiers de configuration courants
      const isConfigFile = [
        'package.json',
        'tsconfig.json',
        'webpack.config.js',
        'vite.config.ts',
        'next.config.js',
        '.gitignore',
        'README.md',
        'AGENTS.md',
        '.env.example'
      ].includes(file.name);
      
      // Inclure les fichiers mentionnés dans la requête
      const isMentionedInRequest = userRequest && 
        (file.name.includes(userRequest) || 
         file.path.includes(userRequest) ||
         userRequest.includes(file.name));
      
      return hasRelevantExtension || isConfigFile || isMentionedInRequest;
    });
  }

  /**
   * Trier les fichiers par pertinence
   */
  private sortFilesByRelevance(files: any[], userRequest?: string): any[] {
    const sorted = [...files];
    
    sorted.sort((a, b) => {
      // Priorité aux fichiers mentionnés dans la requête
      if (userRequest) {
        const aMentioned = a.name.includes(userRequest) || a.path.includes(userRequest);
        const bMentioned = b.name.includes(userRequest) || b.path.includes(userRequest);
        
        if (aMentioned && !bMentioned) return -1;
        if (!aMentioned && bMentioned) return 1;
      }
      
      // Priorité aux fichiers de configuration
      const configFiles = [
        'package.json',
        'tsconfig.json',
        'AGENTS.md',
        'README.md'
      ];
      
      const aIsConfig = configFiles.includes(a.name);
      const bIsConfig = configFiles.includes(b.name);
      
      if (aIsConfig && !bIsConfig) return -1;
      if (!aIsConfig && bIsConfig) return 1;
      
      // Priorité aux fichiers plus petits (plus faciles à lire)
      return (a.sizeBytes || 0) - (b.sizeBytes || 0);
    });
    
    return sorted;
  }

  /**
   * Ajouter les informations Git
   */
  private async addGitInfo(workspaceId: string, context: BuiltContext): Promise<void> {
    try {
      const gitStatus = await this.gitManager.getStatus(workspaceId);
      
      if (gitStatus) {
        const gitInfo = `Git Status:\n${gitStatus.branch ? `Branch: ${gitStatus.branch}\n` : ''}` +
                        `${gitStatus.commitsBehind > 0 ? `Commits behind: ${gitStatus.commitsBehind}\n` : ''}` +
                        `${gitStatus.commitsAhead > 0 ? `Commits ahead: ${gitStatus.commitsAhead}\n` : ''}` +
                        `${gitStatus.changedFiles.length > 0 ? `Changed files: ${gitStatus.changedFiles.join(', ')}\n` : ''}` +
                        `${gitStatus.untrackedFiles.length > 0 ? `Untracked files: ${gitStatus.untrackedFiles.join(', ')}\n` : ''}`;
        
        context.contextItems.push({
          type: 'git',
          name: 'git_status',
          content: gitInfo,
          priority: 8,
          tokenCount: this.estimateTokenCount(gitInfo)
        });
        context.totalTokens += context.contextItems[context.contextItems.length - 1].tokenCount;
        context.stats.gitInfo = true;
      }
      
    } catch (error) {
      console.error('[ContextBuilder] Error adding Git info:', error);
    }
  }

  /**
   * Ajouter les todos
   */
  private async addTodos(workspaceId: string, context: BuiltContext): Promise<void> {
    try {
      // Lire le fichier .todos.md
      const todosContent = await this.fs.readFile('.todos.md');
      
      if (todosContent && todosContent.trim()) {
        context.contextItems.push({
          type: 'todo',
          name: 'todos',
          content: `Project Todos:\n${todosContent}`,
          priority: 7,
          tokenCount: this.estimateTokenCount(todosContent)
        });
        context.totalTokens += context.contextItems[context.contextItems.length - 1].tokenCount;
        context.stats.todosIncluded = true;
      }
      
    } catch (error) {
      // Le fichier n'existe pas, ignorer
      console.debug('[ContextBuilder] No .todos.md file found');
    }
  }

  /**
   * Ajouter les fichiers de configuration
   */
  private async addConfigFiles(workspaceId: string, context: BuiltContext): Promise<void> {
    try {
      const configFiles = [
        'package.json',
        'tsconfig.json',
        'webpack.config.js',
        'vite.config.ts',
        'next.config.js',
        '.gitignore',
        'AGENTS.md',
        '.env.example'
      ];
      
      for (const configFile of configFiles) {
        try {
          const content = await this.fs.readFile(configFile);
          const tokenCount = this.estimateTokenCount(content);
          
          // Vérifier si on a assez de tokens
          if (context.totalTokens + tokenCount > this.config.maxContextTokens * 0.8) {
            break;
          }
          
          context.contextItems.push({
            type: 'config',
            name: configFile,
            path: configFile,
            content: `=== ${configFile} ===\n${content}`,
            priority: 9,
            tokenCount
          });
          context.totalTokens += tokenCount;
        } catch (error) {
          // Le fichier n'existe pas, ignorer
          console.debug(`[ContextBuilder] Config file not found: ${configFile}`);
        }
      }
      
      context.stats.configIncluded = true;
      
    } catch (error) {
      console.error('[ContextBuilder] Error adding config files:', error);
    }
  }

  /**
   * Optimiser le contexte (troncature si nécessaire)
   */
  private optimizeContext(context: BuiltContext, maxTokens: number): void {
    // Si on dépasse le nombre max de tokens, tronquer
    if (context.totalTokens > maxTokens) {
      console.log(`[ContextBuilder] Optimizing context (${context.totalTokens} > ${maxTokens})`);
      
      // Trier les context items par priorité (décroissante)
      const sortedItems = [...context.contextItems].sort((a, b) => b.priority - a.priority);
      
      // Garder les items les plus prioritaires
      let newTotalTokens = context.totalTokens;
      let itemsToKeep: ContextItem[] = [];
      
      for (const item of sortedItems) {
        if (newTotalTokens - item.tokenCount >= maxTokens * 0.9) {
          itemsToKeep.push(item);
          newTotalTokens -= item.tokenCount;
        } else {
          // Ajouter une version tronquée
          const truncatedItem: ContextItem = {
            ...item,
            content: `[TRUNCATED] ${item.name || item.path || item.type} - Content truncated to fit context`,
            tokenCount: this.estimateTokenCount(`[TRUNCATED] ${item.name || item.path || item.type}`)
          };
          itemsToKeep.push(truncatedItem);
          newTotalTokens -= truncatedItem.tokenCount;
          break;
        }
      }
      
      context.contextItems = itemsToKeep;
      context.totalTokens = newTotalTokens + this.estimateTokenCount(context.systemPrompt);
      
      // Ajouter une note sur la tronquature
      context.contextItems.push({
        type: 'metadata',
        content: `[CONTEXT TRUNCATED] Some content was removed to fit the token limit.`,
        priority: 0,
        tokenCount: 10
      });
      context.totalTokens += 10;
    }
  }

  /**
   * Estimer le nombre de tokens pour un texte
   */
  private estimateTokenCount(text: string): number {
    // Estimation simple: environ 4 caractères par token
    return Math.ceil(text.length / 4);
  }

  /**
   * Construire un contexte pour une requête spécifique
   */
  async buildContextForRequest(
    sessionId: string,
    userRequest: string,
    options: Partial<ContextOptions> = {}
  ): Promise<BuiltContext> {
    return this.buildContext({
      sessionId,
      userRequest,
      includeHistory: true,
      includeFiles: true,
      includeGit: true,
      includeTodos: true,
      includeConfig: true,
      ...options
    });
  }

  /**
   * Construire un contexte minimal pour une requête simple
   */
  async buildMinimalContextForRequest(
    sessionId: string,
    userRequest: string
  ): Promise<BuiltContext> {
    return this.buildContext({
      sessionId,
      userRequest,
      includeHistory: false,
      includeFiles: false,
      includeGit: false,
      includeTodos: false,
      includeConfig: false
    });
  }

  /**
   * Mettre à jour la configuration
   */
  updateConfig(config: Partial<ContextConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Obtenir la configuration actuelle
   */
  getConfig(): ContextConfig {
    return { ...this.config };
  }
}

/**
 * Créer un ContextBuilder avec la configuration par défaut
 */
export function createContextBuilder(
  config?: Partial<ContextConfig>,
  fs?: FileSystem,
  gitManager?: GitManager
): ContextBuilder {
  return new ContextBuilder(config, fs, gitManager);
}

export const contextBuilder = createContextBuilder();
