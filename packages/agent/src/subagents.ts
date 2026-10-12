/**
 * @soryos/agent
 * Subagents System - Inspiré de Vibra Code
 * 
 * Fonctionnalités:
 * - Gestion des subagents spécialisés
 * - Exécution indépendante ou coordonnée
 * - Communication entre subagents
 * - Partage du contexte
 * - Gestion des résultats
 */

import { GlobalEventBus } from '@soryos/bus';
import { AgentRuntime } from './runtime';
import { ContextBuilder, ContextOptions } from './context-builder';
import { ToolExecutor } from '@soryos/tool';
import { ExecutionProvider } from '@soryos/execution';
import { SessionData } from '@soryos/schema';

export interface SubagentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  capabilities: string[];
  tools: string[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface SubagentInstance {
  id: string;
  name: string;
  definition: SubagentDefinition;
  sessionId: string;
  workspaceId?: string;
  projectId?: string;
  createdAt: number;
  lastUsedAt?: number;
  usageCount: number;
  results: Record<string, any>;
  errors: Record<string, string>;
}

export interface SubagentTask {
  id: string;
  subagentId: string;
  subagentName: string;
  sessionId: string;
  input: string;
  context?: any;
  parameters?: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: any;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
}

export interface SubagentConfig {
  enabledSubagents: string[];
  defaultSubagent: string;
  allowParallelExecution: boolean;
  maxParallelTasks: number;
  taskTimeoutMs: number;
}

const DEFAULT_CONFIG: SubagentConfig = {
  enabledSubagents: ['planner', 'coder', 'tester', 'reviewer', 'debugger', 'researcher'],
  defaultSubagent: 'planner',
  allowParallelExecution: true,
  maxParallelTasks: 5,
  taskTimeoutMs: 120000
};

// Définitions des subagents (même que dans planner.ts)
const SUBAGENT_DEFINITIONS: Record<string, SubagentDefinition> = {
  planner: {
    name: 'Planner',
    description: 'Specialized in creating detailed plans for complex tasks',
    systemPrompt: `You are the Planner subagent. Your role is to:
1. Analyze the user request
2. Break it down into manageable steps
3. Identify dependencies between steps
4. Assess risks and potential issues
5. Create a detailed execution plan

Guidelines:
- Each step should be specific and actionable
- Identify clear dependencies between steps
- Estimate time and complexity for each step
- Consider error scenarios and recovery strategies
- Use the available tools to gather information

Available tools: read_file, list_files, grep_search, codebase_search`,
    capabilities: ['plan_creation', 'task_decomposition', 'dependency_analysis', 'risk_assessment'],
    tools: ['read_file', 'list_files', 'grep_search', 'codebase_search'],
    maxTokens: 8192,
    temperature: 0.3,
    model: 'claude-3-5-sonnet'
  },
  
  coder: {
    name: 'Coder',
    description: 'Specialized in writing and modifying code',
    systemPrompt: `You are the Coder subagent. Your role is to:
1. Write clean, efficient, and maintainable code
2. Follow best practices and conventions
3. Ensure code is properly formatted and documented
4. Handle errors gracefully
5. Verify your changes work correctly

Guidelines:
- Always read existing code before modifying
- Use appropriate tools for each task
- Test your changes when possible
- Document complex logic
- Follow the existing code style

Available tools: read_file, write_file, edit_file, shell_command, grep_search`,
    capabilities: ['code_generation', 'code_modification', 'code_review', 'refactoring'],
    tools: ['read_file', 'write_file', 'edit_file', 'shell_command', 'grep_search', 'codebase_search'],
    maxTokens: 16384,
    temperature: 0.2,
    model: 'claude-3-5-sonnet'
  },
  
  tester: {
    name: 'Tester',
    description: 'Specialized in testing and verification',
    systemPrompt: `You are the Tester subagent. Your role is to:
1. Write comprehensive tests
2. Execute tests and analyze results
3. Verify that code works as expected
4. Identify and report bugs
5. Suggest fixes for failing tests

Guidelines:
- Write tests for both happy paths and edge cases
- Ensure tests are isolated and repeatable
- Provide clear error messages
- Verify test coverage
- Use appropriate testing frameworks

Available tools: shell_command, read_file, write_file, grep_search`,
    capabilities: ['test_writing', 'test_execution', 'verification', 'debugging'],
    tools: ['shell_command', 'read_file', 'write_file', 'grep_search'],
    maxTokens: 8192,
    temperature: 0.2,
    model: 'claude-3-5-sonnet'
  },
  
  reviewer: {
    name: 'Reviewer',
    description: 'Specialized in code review and quality assurance',
    systemPrompt: `You are the Reviewer subagent. Your role is to:
1. Review code for quality and best practices
2. Identify potential bugs and issues
3. Assess security vulnerabilities
4. Analyze performance implications
5. Suggest improvements

Guidelines:
- Be thorough but constructive
- Focus on maintainability and readability
- Consider security implications
- Think about edge cases
- Provide actionable suggestions

Available tools: read_file, grep_search, codebase_search, symbol_search`,
    capabilities: ['code_review', 'quality_check', 'security_analysis', 'performance_analysis'],
    tools: ['read_file', 'grep_search', 'codebase_search', 'symbol_search'],
    maxTokens: 8192,
    temperature: 0.2,
    model: 'claude-3-5-sonnet'
  },
  
  debugger: {
    name: 'Debugger',
    description: 'Specialized in debugging and error resolution',
    systemPrompt: `You are the Debugger subagent. Your role is to:
1. Analyze error messages and logs
2. Identify the root cause of issues
3. Suggest debugging approaches
4. Propose fixes for errors
5. Verify that fixes resolve the issues

Guidelines:
- Start with error messages and stack traces
- Check recent changes that might have caused the issue
- Use logging and debugging tools
- Isolate the problem
- Test fixes thoroughly

Available tools: read_file, grep_search, shell_command, codebase_search`,
    capabilities: ['error_analysis', 'root_cause_identification', 'debugging', 'error_recovery'],
    tools: ['read_file', 'grep_search', 'shell_command', 'codebase_search'],
    maxTokens: 8192,
    temperature: 0.2,
    model: 'claude-3-5-sonnet'
  },
  
  researcher: {
    name: 'Researcher',
    description: 'Specialized in information gathering and research',
    systemPrompt: `You are the Researcher subagent. Your role is to:
1. Search for relevant documentation
2. Gather information about APIs, libraries, and tools
3. Research best practices and patterns
4. Find examples and tutorials
5. Provide accurate and up-to-date information

Guidelines:
- Use reliable sources
- Verify information accuracy
- Provide context and examples
- Cite sources when possible
- Focus on practical applications

Available tools: grep_search, read_file, web_search`,
    capabilities: ['documentation_search', 'information_gathering', 'api_research', 'best_practices'],
    tools: ['grep_search', 'read_file', 'web_search'],
    maxTokens: 8192,
    temperature: 0.3,
    model: 'claude-3-5-sonnet'
  }
};

export class SubagentManager {
  private config: SubagentConfig;
  private agentRuntime: AgentRuntime;
  private contextBuilder: ContextBuilder;
  private toolExecutor: ToolExecutor;
  private provider: ExecutionProvider;
  
  private instances: Map<string, SubagentInstance> = new Map();
  private tasks: Map<string, SubagentTask> = new Map();
  private activeTasks: Map<string, Set<string>> = new Map(); // sessionId -> Set<taskId>
  private runningTasks: Set<string> = new Set();

  constructor(
    agentRuntime: AgentRuntime,
    contextBuilder: ContextBuilder,
    toolExecutor: ToolExecutor,
    provider: ExecutionProvider,
    config: Partial<SubagentConfig> = {}
  ) {
    this.agentRuntime = agentRuntime;
    this.contextBuilder = contextBuilder;
    this.toolExecutor = toolExecutor;
    this.provider = provider;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Créer une instance de subagent
   */
  async createSubagent(
    name: string,
    sessionId: string,
    workspaceId?: string,
    projectId?: string
  ): Promise<SubagentInstance | null> {
    // Vérifier si le subagent est activé
    if (!this.config.enabledSubagents.includes(name)) {
      console.warn(`[SubagentManager] Subagent '${name}' is not enabled`);
      return null;
    }

    // Vérifier si la définition existe
    const definition = SUBAGENT_DEFINITIONS[name];
    if (!definition) {
      console.warn(`[SubagentManager] Subagent definition for '${name}' not found`);
      return null;
    }

    // Créer l'instance
    const instance: SubagentInstance = {
      id: `subagent-${name}-${sessionId}-${Date.now()}`,
      name,
      definition,
      sessionId,
      workspaceId,
      projectId,
      createdAt: Date.now(),
      usageCount: 0,
      results: {},
      errors: {}
    };

    // Sauvegarder l'instance
    this.instances.set(instance.id, instance);

    GlobalEventBus.emit('subagent.created', {
      subagentId: instance.id,
      subagentName: name,
      sessionId
    });

    return instance;
  }

  /**
   * Obtenir une instance de subagent
   */
  getSubagent(instanceId: string): SubagentInstance | null {
    return this.instances.get(instanceId) || null;
  }

  /**
   * Obtenir toutes les instances de subagent pour une session
   */
  getSubagentsBySession(sessionId: string): SubagentInstance[] {
    return Array.from(this.instances.values())
      .filter(instance => instance.sessionId === sessionId);
  }

  /**
   * Supprimer une instance de subagent
   */
  removeSubagent(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    this.instances.delete(instanceId);
    
    GlobalEventBus.emit('subagent.removed', {
      subagentId: instanceId,
      subagentName: instance.name,
      sessionId: instance.sessionId
    });

    return true;
  }

  /**
   * Exécuter une tâche avec un subagent
   */
  async executeTask(
    subagentName: string,
    sessionId: string,
    input: string,
    options: {
      workspaceId?: string;
      projectId?: string;
      context?: any;
      parameters?: Record<string, any>;
      timeoutMs?: number;
    } = {}
  ): Promise<{ success: boolean; result?: any; error?: string; taskId?: string }> {
    const taskId = `task-${subagentName}-${sessionId}-${Date.now()}`;
    const {
      workspaceId,
      projectId,
      context: customContext,
      parameters = {},
      timeoutMs = this.config.taskTimeoutMs
    } = options;

    try {
      // Créer ou obtenir l'instance du subagent
      let instance = this.getSubagentsBySession(sessionId)
        .find(i => i.name === subagentName);
      
      if (!instance) {
        instance = await this.createSubagent(subagentName, sessionId, workspaceId, projectId);
        if (!instance) {
          return {
            success: false,
            error: `Failed to create subagent '${subagentName}'`
          };
        }
      }

      // Créer la tâche
      const task: SubagentTask = {
        id: taskId,
        subagentId: instance.id,
        subagentName,
        sessionId,
        input,
        context: customContext,
        parameters,
        status: 'pending',
        createdAt: Date.now()
      };

      this.tasks.set(taskId, task);
      
      // Ajouter à la liste des tâches actives
      if (!this.activeTasks.has(sessionId)) {
        this.activeTasks.set(sessionId, new Set());
      }
      this.activeTasks.get(sessionId)!.add(taskId);

      GlobalEventBus.emit('subagent.task.created', {
        taskId,
        subagentId: instance.id,
        subagentName,
        sessionId,
        input
      });

      // Exécuter la tâche
      const result = await this.runSubagentTask(task, instance, timeoutMs);

      if (result.success) {
        task.status = 'completed';
        task.result = result.result;
        task.completedAt = Date.now();
        task.durationMs = task.startedAt ? Date.now() - task.startedAt : undefined;
        
        // Mettre à jour l'instance
        instance.lastUsedAt = Date.now();
        instance.usageCount++;
        instance.results[taskId] = result.result;
        
        GlobalEventBus.emit('subagent.task.completed', {
          taskId,
          subagentId: instance.id,
          subagentName,
          sessionId,
          result: result.result
        });
      } else {
        task.status = 'failed';
        task.error = result.error;
        task.completedAt = Date.now();
        task.durationMs = task.startedAt ? Date.now() - task.startedAt : undefined;
        
        // Mettre à jour l'instance
        instance.lastUsedAt = Date.now();
        instance.errors[taskId] = result.error || 'Unknown error';
        
        GlobalEventBus.emit('subagent.task.failed', {
          taskId,
          subagentId: instance.id,
          subagentName,
          sessionId,
          error: result.error
        });
      }

      // Retirer de la liste des tâches actives
      this.activeTasks.get(sessionId)?.delete(taskId);
      this.runningTasks.delete(taskId);

      return {
        success: result.success,
        result: result.result,
        error: result.error,
        taskId
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Mettre à jour la tâche
      const task = this.tasks.get(taskId);
      if (task) {
        task.status = 'failed';
        task.error = errorMessage;
        task.completedAt = Date.now();
      }
      
      // Retirer de la liste des tâches actives
      this.activeTasks.get(sessionId)?.delete(taskId);
      this.runningTasks.delete(taskId);

      return {
        success: false,
        error: errorMessage,
        taskId
      };
    }
  }

  /**
   * Exécuter une tâche de subagent
   */
  private async runSubagentTask(
    task: SubagentTask,
    instance: SubagentInstance,
    timeoutMs: number
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const definition = instance.definition;
    const sessionId = task.sessionId;
    
    try {
      // Mettre à jour le statut de la tâche
      task.status = 'running';
      task.startedAt = Date.now();
      this.runningTasks.add(task.id);

      GlobalEventBus.emit('subagent.task.started', {
        taskId: task.id,
        subagentId: instance.id,
        subagentName: instance.name,
        sessionId
      });

      // Construire le contexte
      let context = task.context;
      if (!context) {
        context = await this.contextBuilder.buildContext({
          sessionId,
          workspaceId: instance.workspaceId,
          projectId: instance.projectId,
          userRequest: task.input
        });
      }

      // Construire le prompt pour le subagent
      const prompt = this.buildSubagentPrompt(
        definition,
        task.input,
        context,
        task.parameters
      );

      // Exécuter via AgentRuntime avec un timeout
      const executionPromise = this.agentRuntime.run({
        sessionId,
        input: prompt,
        streaming: false,
        model: definition.model,
        timeoutMs
      });

      // Appliquer le timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Subagent task timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      // Attendre le résultat ou le timeout
      const result = await Promise.race([
        executionPromise,
        timeoutPromise
      ]);

      if (result.exitCode !== 0) {
        return {
          success: false,
          error: result.stderr || result.output || 'Subagent task failed'
        };
      }

      return {
        success: true,
        result: result.output
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      this.runningTasks.delete(task.id);
    }
  }

  /**
   * Construire le prompt pour un subagent
   */
  private buildSubagentPrompt(
    definition: SubagentDefinition,
    input: string,
    context: any,
    parameters: Record<string, any>
  ): string {
    const parts: string[] = [];

    // Ajouter le system prompt
    parts.push(`SYSTEM PROMPT: ${definition.systemPrompt}\n\n`);

    // Ajouter le contexte
    if (context.systemPrompt) {
      parts.push(`CONTEXT:\n${context.systemPrompt}\n\n`);
    }

    if (context.messages && context.messages.length > 0) {
      parts.push(`HISTORY:\n`);
      for (const msg of context.messages) {
        parts.push(`${msg.role}: ${msg.content}\n`);
      }
      parts.push('\n');
    }

    if (context.contextItems && context.contextItems.length > 0) {
      parts.push(`RELEVANT FILES:\n`);
      for (const item of context.contextItems) {
        if (item.type === 'file') {
          parts.push(`- ${item.path}: ${item.content.substring(0, 200)}\n`);
        }
      }
      parts.push('\n');
    }

    // Ajouter les paramètres
    if (Object.keys(parameters).length > 0) {
      parts.push(`PARAMETERS:\n`);
      for (const [key, value] of Object.entries(parameters)) {
        parts.push(`- ${key}: ${JSON.stringify(value)}\n`);
      }
      parts.push('\n');
    }

    // Ajouter l'input utilisateur
    parts.push(`TASK:\n${input}\n`);

    // Instructions pour le subagent
    parts.push(`\nINSTRUCTIONS:\n`);
    parts.push(`1. Analyze the task and context\n`);
    parts.push(`2. Use the available tools to gather information\n`);
    parts.push(`3. Provide a detailed and accurate response\n`);
    parts.push(`4. If you need to execute code, use the appropriate tools\n`);
    parts.push(`5. Always verify your results\n`);

    return parts.join('');
  }

  /**
   * Obtenir la définition d'un subagent
   */
  getSubagentDefinition(name: string): SubagentDefinition | null {
    return SUBAGENT_DEFINITIONS[name] || null;
  }

  /**
   * Obtenir tous les noms de subagents disponibles
   */
  getAvailableSubagents(): string[] {
    return Object.keys(SUBAGENT_DEFINITIONS);
  }

  /**
   * Obtenir toutes les définitions de subagents
   */
  getAllSubagentDefinitions(): Record<string, SubagentDefinition> {
    return { ...SUBAGENT_DEFINITIONS };
  }

  /**
   * Obtenir les capacités d'un subagent
   */
  getSubagentCapabilities(name: string): string[] {
    const definition = this.getSubagentDefinition(name);
    return definition?.capabilities || [];
  }

  /**
   * Vérifier si un subagent est capable d'une tâche
   */
  canHandleTask(subagentName: string, capability: string): boolean {
    const capabilities = this.getSubagentCapabilities(subagentName);
    return capabilities.includes(capability);
  }

  /**
   * Trouver le meilleur subagent pour une tâche
   */
  findBestSubagentForTask(task: string, capabilities: string[] = []): string | null {
    const lowerTask = task.toLowerCase();
    
    // Vérifier les mots-clés dans la tâche
    const taskKeywords = [
      { keyword: 'plan', subagent: 'planner' },
      { keyword: 'create', subagent: 'coder' },
      { keyword: 'write', subagent: 'coder' },
      { keyword: 'modify', subagent: 'coder' },
      { keyword: 'edit', subagent: 'coder' },
      { keyword: 'code', subagent: 'coder' },
      { keyword: 'test', subagent: 'tester' },
      { keyword: 'verify', subagent: 'tester' },
      { keyword: 'check', subagent: 'tester' },
      { keyword: 'review', subagent: 'reviewer' },
      { keyword: 'quality', subagent: 'reviewer' },
      { keyword: 'security', subagent: 'reviewer' },
      { keyword: 'bug', subagent: 'debugger' },
      { keyword: 'error', subagent: 'debugger' },
      { keyword: 'fix', subagent: 'debugger' },
      { keyword: 'debug', subagent: 'debugger' },
      { keyword: 'research', subagent: 'researcher' },
      { keyword: 'documentation', subagent: 'researcher' },
      { keyword: 'api', subagent: 'researcher' },
      { keyword: 'how to', subagent: 'researcher' },
      { keyword: 'best practice', subagent: 'researcher' }
    ];
    
    for (const { keyword, subagent } of taskKeywords) {
      if (lowerTask.includes(keyword)) {
        // Vérifier si le subagent a les capacités requises
        if (capabilities.length === 0 || 
            capabilities.every(cap => this.canHandleTask(subagent, cap))) {
          return subagent;
        }
      }
    }
    
    // Vérifier les capacités requises
    if (capabilities.length > 0) {
      for (const subagentName of this.config.enabledSubagents) {
        if (capabilities.every(cap => this.canHandleTask(subagentName, cap))) {
          return subagentName;
        }
      }
    }
    
    // Retourner le subagent par défaut
    return this.config.defaultSubagent;
  }

  /**
   * Exécuter plusieurs subagents en parallèle
   */
  async executeParallel(
    tasks: Array<{
      subagentName: string;
      input: string;
      parameters?: Record<string, any>;
    }>,
    sessionId: string,
    options: {
      workspaceId?: string;
      projectId?: string;
      timeoutMs?: number;
    } = {}
  ): Promise<Record<string, { success: boolean; result?: any; error?: string }>> {
    const results: Record<string, { success: boolean; result?: any; error?: string }> = {};
    
    if (!this.config.allowParallelExecution) {
      // Exécuter séquentiellement
      for (const task of tasks) {
        const result = await this.executeTask(
          task.subagentName,
          sessionId,
          task.input,
          { ...options, parameters: task.parameters }
        );
        results[task.subagentName] = result;
      }
      return results;
    }

    // Limiter le nombre de tâches parallèles
    const maxParallel = Math.min(this.config.maxParallelTasks, tasks.length);
    const batches = this.splitIntoBatches(tasks, maxParallel);
    
    for (const batch of batches) {
      const batchPromises = batch.map(task => 
        this.executeTask(
          task.subagentName,
          sessionId,
          task.input,
          { ...options, parameters: task.parameters }
        )
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (let i = 0; i < batch.length; i++) {
        const task = batch[i];
        const result = batchResults[i];
        
        if (result.status === 'fulfilled') {
          results[task.subagentName] = result.value;
        } else {
          results[task.subagentName] = {
            success: false,
            error: result.reason as string
          };
        }
      }
    }
    
    return results;
  }

  /**
   * Obtenir une tâche
   */
  getTask(taskId: string): SubagentTask | null {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Obtenir toutes les tâches pour une session
   */
  getTasksBySession(sessionId: string): SubagentTask[] {
    return Array.from(this.tasks.values())
      .filter(task => task.sessionId === sessionId);
  }

  /**
   * Obtenir les tâches actives pour une session
   */
  getActiveTasks(sessionId: string): SubagentTask[] {
    const activeTaskIds = this.activeTasks.get(sessionId);
    if (!activeTaskIds) return [];
    
    return Array.from(activeTaskIds)
      .map(id => this.tasks.get(id))
      .filter((task): task is SubagentTask => task !== null);
  }

  /**
   * Obtenir les tâches en cours
   */
  getRunningTasks(): SubagentTask[] {
    return Array.from(this.runningTasks)
      .map(id => this.tasks.get(id))
      .filter((task): task is SubagentTask => task !== null);
  }

  /**
   * Annuler une tâche
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    // Mettre à jour le statut
    task.status = 'cancelled';
    task.completedAt = Date.now();

    // Retirer des listes actives
    this.activeTasks.get(task.sessionId)?.delete(taskId);
    this.runningTasks.delete(taskId);

    GlobalEventBus.emit('subagent.task.cancelled', {
      taskId,
      subagentId: task.subagentId,
      subagentName: task.subagentName,
      sessionId: task.sessionId
    });

    return true;
  }

  /**
   * Annuler toutes les tâches pour une session
   */
  cancelAllTasks(sessionId: string): number {
    const activeTaskIds = this.activeTasks.get(sessionId);
    if (!activeTaskIds) return 0;

    let cancelledCount = 0;
    for (const taskId of Array.from(activeTaskIds)) {
      if (this.cancelTask(taskId)) {
        cancelledCount++;
      }
    }

    return cancelledCount;
  }

  /**
   * Effacer les subagents pour une session
   */
  clearSession(sessionId: string): void {
    // Annuler toutes les tâches
    this.cancelAllTasks(sessionId);

    // Supprimer toutes les instances
    const instances = this.getSubagentsBySession(sessionId);
    for (const instance of instances) {
      this.instances.delete(instance.id);
    }

    // Supprimer toutes les tâches
    const tasks = this.getTasksBySession(sessionId);
    for (const task of tasks) {
      this.tasks.delete(task.id);
    }

    // Nettoyer les listes
    this.activeTasks.delete(sessionId);

    GlobalEventBus.emit('subagent.session.cleared', {
      sessionId
    });
  }

  /**
   * Diviser en batches
   */
  private splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    return batches;
  }

  /**
   * Obtenir le provider actuel
   */
  getProvider(): ExecutionProvider {
    return this.provider;
  }

  /**
   * Mettre à jour le provider
   */
  setProvider(provider: ExecutionProvider): void {
    this.provider = provider;
  }

  /**
   * Mettre à jour la configuration
   */
  updateConfig(config: Partial<SubagentConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Obtenir la configuration actuelle
   */
  getConfig(): SubagentConfig {
    return { ...this.config };
  }

  /**
   * Ajouter une définition de subagent personnalisée
   */
  addSubagentDefinition(name: string, definition: SubagentDefinition): void {
    SUBAGENT_DEFINITIONS[name] = definition;
  }

  /**
   * Supprimer une définition de subagent
   */
  removeSubagentDefinition(name: string): boolean {
    if (SUBAGENT_DEFINITIONS[name]) {
      delete SUBAGENT_DEFINITIONS[name];
      return true;
    }
    return false;
  }
}

/**
 * Créer une instance du SubagentManager
 */
export function createSubagentManager(
  agentRuntime: AgentRuntime,
  contextBuilder: ContextBuilder,
  toolExecutor: ToolExecutor,
  provider: ExecutionProvider,
  config: Partial<SubagentConfig> = {}
): SubagentManager {
  return new SubagentManager(agentRuntime, contextBuilder, toolExecutor, provider, config);
}

/**
 * Obtenir les définitions des subagents
 */
export function getSubagentDefinitions(): Record<string, SubagentDefinition> {
  return { ...SUBAGENT_DEFINITIONS };
}

export { SUBAGENT_DEFINITIONS, SUBAGENTS };
