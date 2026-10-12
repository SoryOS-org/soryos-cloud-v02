/**
 * @soryos/jobs
 * Background Agents - Inspiré de Vibra Code
 * 
 * Fonctionnalités:
 * - Exécution d'agents en arrière-plan
 * - Gestion des tâches longues
 * - Communication via événements
 * - Persistance des sessions
 * - Gestion des erreurs
 * - Récupération automatique
 * 
 * Le frontend n'est pas obligatoire pour maintenir l'exécution.
 */

import { GlobalEventBus } from '@soryos/bus';
import { AgentRuntime } from '@soryos/agent';
import { ExecutionProvider } from '@soryos/execution';
import { SessionStore, SessionData } from '@soryos/session';
import { permissionsManager } from '@soryos/permissions';
import { LongRunningTaskManager, LongRunningTask, TaskOptions, TaskStatus } from './long-running-tasks';

export interface BackgroundAgentConfig {
  maxBackgroundAgents: number;
  agentTimeoutMs: number;
  idleTimeoutMs: number;
  autoCleanup: boolean;
  cleanupIntervalMs: number;
}

export interface BackgroundAgent {
  id: string;
  sessionId: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  name: string;
  description: string;
  status: TaskStatus;
  createdAt: number;
  startedAt?: number;
  lastActivityAt?: number;
  completedAt?: number;
  totalDurationMs?: number;
  currentTaskId?: string;
  tasks: string[];
  results: Record<string, any>;
  errors: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface BackgroundAgentOptions {
  sessionId: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  name: string;
  description?: string;
  task: TaskOptions;
  metadata?: Record<string, any>;
}

export interface BackgroundAgentResult {
  success: boolean;
  agent?: BackgroundAgent;
  task?: LongRunningTask;
  error?: string;
  message?: string;
}

const DEFAULT_CONFIG: BackgroundAgentConfig = {
  maxBackgroundAgents: 10,
  agentTimeoutMs: 3600000, // 1 hour
  idleTimeoutMs: 300000, // 5 minutes
  autoCleanup: true,
  cleanupIntervalMs: 60000 // 1 minute
};

/**
 * Background Agent Manager
 * 
 * Gère l'exécution d'agents en arrière-plan pour des tâches longues.
 * Les agents peuvent continuer à exécuter même après que l'utilisateur ait quitté le frontend.
 */
export class BackgroundAgentManager {
  private config: BackgroundAgentConfig;
  private provider: ExecutionProvider;
  private agentRuntime: AgentRuntime;
  private taskManager: LongRunningTaskManager;
  
  private agents: Map<string, BackgroundAgent> = new Map();
  private activeAgents: Map<string, BackgroundAgent> = new Map(); // sessionId -> agent
  private idleAgents: Set<string> = new Set();
  private runningAgents: Set<string> = new Set();
  
  private agentTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    provider: ExecutionProvider,
    agentRuntime: AgentRuntime,
    taskManager: LongRunningTaskManager,
    config: Partial<BackgroundAgentConfig> = {}
  ) {
    this.provider = provider;
    this.agentRuntime = agentRuntime;
    this.taskManager = taskManager;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Démarrer le cleanup automatique
    if (this.config.autoCleanup) {
      this.startCleanupInterval();
    }
  }

  /**
   * Démarrer l'intervalle de cleanup
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleAgents().catch(console.error);
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Arrêter l'intervalle de cleanup
   */
  private stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Nettoyer les agents inactifs
   */
  private async cleanupIdleAgents(): Promise<void> {
    const now = Date.now();
    const idleThreshold = this.config.idleTimeoutMs;
    
    for (const agentId of Array.from(this.idleAgents)) {
      const agent = this.agents.get(agentId);
      if (!agent) continue;
      
      if (!agent.lastActivityAt || now - agent.lastActivityAt > idleThreshold) {
        await this.stopBackgroundAgent(agentId, true);
      }
    }
  }

  /**
   * Créer un agent en arrière-plan
   */
  async createBackgroundAgent(
    options: BackgroundAgentOptions
  ): Promise<BackgroundAgentResult> {
    const agentId = `bg-agent-${options.sessionId}-${Date.now()}`;
    const {
      sessionId,
      workspaceId,
      projectId,
      userId,
      name,
      description = '',
      task: taskOptions,
      metadata = {}
    } = options;

    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'create_background_agent', options);
      if (!perm.allowed) {
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      // Vérifier le nombre max d'agents
      if (this.agents.size >= this.config.maxBackgroundAgents) {
        return {
          success: false,
          error: `Maximum background agents (${this.config.maxBackgroundAgents}) reached`
        };
      }

      // Créer l'agent
      const agent: BackgroundAgent = {
        id: agentId,
        sessionId,
        workspaceId,
        projectId,
        userId,
        name,
        description,
        status: 'queued',
        createdAt: Date.now(),
        tasks: [],
        results: {},
        errors: {},
        metadata
      };

      // Ajouter à la liste des agents
      this.agents.set(agentId, agent);
      this.activeAgents.set(sessionId, agent);

      GlobalEventBus.emit('background-agent.created', {
        agentId,
        sessionId,
        agent
      });

      // Créer la tâche associée
      const taskResult = await this.taskManager.createTask({
        ...taskOptions,
        sessionId,
        workspaceId,
        projectId,
        userId,
        name: `${name} - Background Task`,
        description: description || taskOptions.description,
        metadata: {
          ...metadata,
          backgroundAgentId: agentId
        }
      });

      if (!taskResult.success) {
        // Nettoyer
        this.agents.delete(agentId);
        this.activeAgents.delete(sessionId);
        
        return {
          success: false,
          error: `Failed to create background task: ${taskResult.error}`
        };
      }

      // Mettre à jour l'agent
      agent.currentTaskId = taskResult.task!.id;
      agent.tasks.push(taskResult.task!.id);
      agent.status = 'queued';

      // Sauvegarder
      await this.saveAgent(agent);

      // Démarrer l'agent
      this.startBackgroundAgent(agentId).catch(console.error);

      return {
        success: true,
        agent,
        task: taskResult.task,
        message: `Background agent created: ${agentId}`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      GlobalEventBus.emit('background-agent.failed', {
        agentId,
        sessionId,
        error: errorMessage
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Démarrer un agent en arrière-plan
   */
  private async startBackgroundAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    
    if (!agent) return;

    try {
      // Vérifier qu'il y a une tâche
      if (!agent.currentTaskId) {
        console.log(`[BackgroundAgentManager] No task for agent ${agentId}`);
        return;
      }

      // Obtenir la tâche
      const task = this.taskManager.getTask(agent.currentTaskId);
      if (!task) {
        console.log(`[BackgroundAgentManager] Task not found for agent ${agentId}`);
        return;
      }

      // Mettre à jour le statut
      agent.status = 'running';
      agent.startedAt = Date.now();
      agent.lastActivityAt = Date.now();
      
      this.runningAgents.add(agentId);
      this.idleAgents.delete(agentId);

      // Sauvegarder
      await this.saveAgent(agent);

      GlobalEventBus.emit('background-agent.started', {
        agentId,
        sessionId: agent.sessionId,
        agent,
        task
      });

      // Démarrer le timeout
      this.setupAgentTimeout(agentId);

      // Démarrer la tâche
      const taskResult = await this.taskManager.startTask(task.id);
      
      if (!taskResult.success) {
        console.error(`[BackgroundAgentManager] Failed to start task for agent ${agentId}:`, taskResult.error);
        
        // Mettre à jour l'agent
        agent.status = 'failed';
        agent.completedAt = Date.now();
        agent.errors[task.id] = taskResult.error || 'Unknown error';
        
        await this.saveAgent(agent);
        
        GlobalEventBus.emit('background-agent.failed', {
          agentId,
          sessionId: agent.sessionId,
          agent,
          error: taskResult.error
        });
        
        return;
      }

      // Mettre à jour l'agent
      agent.lastActivityAt = Date.now();
      await this.saveAgent(agent);

      // Surveiller la tâche
      this.monitorTask(agentId, task.id);

    } catch (error) {
      console.error(`[BackgroundAgentManager] Error starting agent ${agentId}:`, error);
      
      const agent = this.agents.get(agentId);
      if (agent) {
        agent.status = 'failed';
        agent.completedAt = Date.now();
        agent.errors[agent.currentTaskId || 'unknown'] = error instanceof Error ? error.message : String(error);
        
        this.runningAgents.delete(agentId);
        
        await this.saveAgent(agent);

        GlobalEventBus.emit('background-agent.failed', {
          agentId,
          sessionId: agent.sessionId,
          agent,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Surveiller une tâche
   */
  private monitorTask(agentId: string, taskId: string): void {
    const checkInterval = setInterval(async () => {
      const agent = this.agents.get(agentId);
      const task = this.taskManager.getTask(taskId);
      
      if (!agent || !task) {
        clearInterval(checkInterval);
        return;
      }

      // Mettre à jour l'activité
      agent.lastActivityAt = Date.now();
      await this.saveAgent(agent);

      // Vérifier le statut de la tâche
      if (task.status === 'completed') {
        // Tâche terminée
        clearInterval(checkInterval);
        await this.completeBackgroundAgent(agentId, task);
      } else if (task.status === 'failed') {
        // Tâche échouée
        clearInterval(checkInterval);
        await this.failBackgroundAgent(agentId, task, task.error);
      } else if (task.status === 'cancelled') {
        // Tâche annulée
        clearInterval(checkInterval);
        await this.cancelBackgroundAgent(agentId, task);
      } else if (task.status === 'waiting_for_user') {
        // Tâche en attente d'utilisateur
        agent.status = 'waiting_for_user';
        await this.saveAgent(agent);
        
        GlobalEventBus.emit('background-agent.waiting_for_user', {
          agentId,
          sessionId: agent.sessionId,
          agent,
          task
        });
      }
    }, 1000);
  }

  /**
   * Configurer le timeout de l'agent
   */
  private setupAgentTimeout(agentId: string): void {
    // Annuler le timeout existant
    const existingTimeout = this.agentTimeouts.get(agentId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Créer un nouveau timeout
    const timeout = setTimeout(async () => {
      const agent = this.agents.get(agentId);
      if (agent && agent.status === 'running') {
        await this.timeoutBackgroundAgent(agentId);
      }
    }, this.config.agentTimeoutMs);

    this.agentTimeouts.set(agentId, timeout);
  }

  /**
   * Compléter un agent en arrière-plan
   */
  private async completeBackgroundAgent(
    agentId: string,
    task: LongRunningTask
  ): Promise<void> {
    const agent = this.agents.get(agentId);
    
    if (!agent) return;

    try {
      // Mettre à jour le statut
      agent.status = 'completed';
      agent.completedAt = Date.now();
      agent.totalDurationMs = Date.now() - (agent.startedAt || Date.now());
      agent.results[task.id] = task.result;
      
      // Nettoyer
      this.cleanupAgent(agentId);

      // Sauvegarder
      await this.saveAgent(agent);

      GlobalEventBus.emit('background-agent.completed', {
        agentId,
        sessionId: agent.sessionId,
        agent,
        task
      });

    } catch (error) {
      console.error('[BackgroundAgentManager] Failed to complete agent:', error);
    }
  }

  /**
   * Échec d'un agent en arrière-plan
   */
  private async failBackgroundAgent(
    agentId: string,
    task: LongRunningTask,
    error?: string
  ): Promise<void> {
    const agent = this.agents.get(agentId);
    
    if (!agent) return;

    try {
      // Mettre à jour le statut
      agent.status = 'failed';
      agent.completedAt = Date.now();
      agent.totalDurationMs = Date.now() - (agent.startedAt || Date.now());
      agent.errors[task.id] = error || task.error || 'Unknown error';
      
      // Nettoyer
      this.cleanupAgent(agentId);

      // Sauvegarder
      await this.saveAgent(agent);

      GlobalEventBus.emit('background-agent.failed', {
        agentId,
        sessionId: agent.sessionId,
        agent,
        task,
        error
      });

      // Tenter un retry si possible
      if (task.isRetryable && task.retryCount < task.maxRetries) {
        await this.retryBackgroundAgent(agentId, task);
      }

    } catch (error) {
      console.error('[BackgroundAgentManager] Failed to fail agent:', error);
    }
  }

  /**
   * Annuler un agent en arrière-plan
   */
  private async cancelBackgroundAgent(
    agentId: string,
    task: LongRunningTask
  ): Promise<void> {
    const agent = this.agents.get(agentId);
    
    if (!agent) return;

    try {
      // Mettre à jour le statut
      agent.status = 'cancelled';
      agent.completedAt = Date.now();
      agent.totalDurationMs = Date.now() - (agent.startedAt || Date.now());
      
      // Nettoyer
      this.cleanupAgent(agentId);

      // Sauvegarder
      await this.saveAgent(agent);

      GlobalEventBus.emit('background-agent.cancelled', {
        agentId,
        sessionId: agent.sessionId,
        agent,
        task
      });

    } catch (error) {
      console.error('[BackgroundAgentManager] Failed to cancel agent:', error);
    }
  }

  /**
   * Timeout d'un agent en arrière-plan
   */
  private async timeoutBackgroundAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    
    if (!agent) return;

    try {
      // Mettre à jour le statut
      agent.status = 'failed';
      agent.completedAt = Date.now();
      agent.totalDurationMs = Date.now() - (agent.startedAt || Date.now());
      agent.errors[agent.currentTaskId || 'unknown'] = `Agent timed out after ${this.config.agentTimeoutMs}ms`;
      
      // Nettoyer
      this.cleanupAgent(agentId);

      // Sauvegarder
      await this.saveAgent(agent);

      GlobalEventBus.emit('background-agent.timeout', {
        agentId,
        sessionId: agent.sessionId,
        agent
      });

    } catch (error) {
      console.error('[BackgroundAgentManager] Failed to timeout agent:', error);
    }
  }

  /**
   * Retenter un agent en arrière-plan
   */
  private async retryBackgroundAgent(
    agentId: string,
    task: LongRunningTask
  ): Promise<void> {
    const agent = this.agents.get(agentId);
    
    if (!agent) return;

    try {
      // Mettre à jour l'agent
      agent.status = 'queued';
      agent.startedAt = undefined;
      agent.completedAt = undefined;
      agent.lastActivityAt = Date.now();
      
      // Sauvegarder
      await this.saveAgent(agent);

      GlobalEventBus.emit('background-agent.retry', {
        agentId,
        sessionId: agent.sessionId,
        agent,
        task,
        retryCount: task.retryCount + 1
      });

      // Redémarrer l'agent
      this.startBackgroundAgent(agentId).catch(console.error);

    } catch (error) {
      console.error('[BackgroundAgentManager] Failed to retry agent:', error);
    }
  }

  /**
   * Nettoyer un agent
   */
  private cleanupAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Retirer des agents actifs
    this.activeAgents.delete(agent.sessionId);
    this.runningAgents.delete(agentId);
    this.idleAgents.delete(agentId);
    
    // Annuler le timeout
    const timeout = this.agentTimeouts.get(agentId);
    if (timeout) {
      clearTimeout(timeout);
      this.agentTimeouts.delete(agentId);
    }
  }

  /**
   * Arrêter un agent en arrière-plan
   */
  async stopBackgroundAgent(agentId: string, force: boolean = false): Promise<BackgroundAgentResult> {
    const agent = this.agents.get(agentId);
    
    if (!agent) {
      return {
        success: false,
        error: `Agent ${agentId} not found`
      };
    }

    try {
      // Vérifier les permissions
      if (!force) {
        const perm = permissionsManager.checkPermission('build', 'stop_background_agent', { 
          agentId, 
          sessionId: agent.sessionId 
        });
        if (!perm.allowed) {
          return {
            success: false,
            error: `PERMISSION DENIED: ${perm.reason}`
          };
        }
      }

      // Arrêter la tâche associée
      if (agent.currentTaskId) {
        const taskResult = await this.taskManager.cancelTask(agent.currentTaskId);
        if (!taskResult.success) {
          console.warn(`[BackgroundAgentManager] Failed to cancel task ${agent.currentTaskId}:`, taskResult.error);
        }
      }

      // Mettre à jour le statut
      agent.status = 'cancelled';
      agent.completedAt = Date.now();
      agent.totalDurationMs = Date.now() - (agent.startedAt || Date.now());
      
      // Nettoyer
      this.cleanupAgent(agentId);

      // Sauvegarder
      await this.saveAgent(agent);

      GlobalEventBus.emit('background-agent.stopped', {
        agentId,
        sessionId: agent.sessionId,
        agent
      });

      return {
        success: true,
        agent,
        message: `Background agent stopped: ${agentId}`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Mettre en pause un agent en arrière-plan
   */
  async pauseBackgroundAgent(agentId: string): Promise<BackgroundAgentResult> {
    const agent = this.agents.get(agentId);
    
    if (!agent) {
      return {
        success: false,
        error: `Agent ${agentId} not found`
      };
    }

    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'pause_background_agent', { 
        agentId, 
        sessionId: agent.sessionId 
      });
      if (!perm.allowed) {
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      if (agent.status !== 'running') {
        return {
          success: false,
          error: `Cannot pause agent with status: ${agent.status}`
        };
      }

      // Mettre en pause la tâche associée
      if (agent.currentTaskId) {
        const taskResult = await this.taskManager.pauseTask(agent.currentTaskId);
        if (!taskResult.success) {
          return {
            success: false,
            error: `Failed to pause task: ${taskResult.error}`
          };
        }
      }

      // Mettre à jour le statut
      agent.status = 'paused';
      agent.lastActivityAt = Date.now();
      
      this.runningAgents.delete(agentId);
      this.idleAgents.add(agentId);

      // Sauvegarder
      await this.saveAgent(agent);

      GlobalEventBus.emit('background-agent.paused', {
        agentId,
        sessionId: agent.sessionId,
        agent
      });

      return {
        success: true,
        agent,
        message: `Background agent paused: ${agentId}`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Reprendre un agent en arrière-plan
   */
  async resumeBackgroundAgent(agentId: string): Promise<BackgroundAgentResult> {
    const agent = this.agents.get(agentId);
    
    if (!agent) {
      return {
        success: false,
        error: `Agent ${agentId} not found`
      };
    }

    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'resume_background_agent', { 
        agentId, 
        sessionId: agent.sessionId 
      });
      if (!perm.allowed) {
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      if (agent.status !== 'paused') {
        return {
          success: false,
          error: `Cannot resume agent with status: ${agent.status}`
        };
      }

      // Reprendre la tâche associée
      if (agent.currentTaskId) {
        const taskResult = await this.taskManager.resumeTask(agent.currentTaskId);
        if (!taskResult.success) {
          return {
            success: false,
            error: `Failed to resume task: ${taskResult.error}`
          };
        }
      }

      // Mettre à jour le statut
      agent.status = 'running';
      agent.lastActivityAt = Date.now();
      
      this.idleAgents.delete(agentId);
      this.runningAgents.add(agentId);

      // Sauvegarder
      await this.saveAgent(agent);

      GlobalEventBus.emit('background-agent.resumed', {
        agentId,
        sessionId: agent.sessionId,
        agent
      });

      // Démarrer le timeout
      this.setupAgentTimeout(agentId);

      // Surveiller la tâche
      if (agent.currentTaskId) {
        const task = this.taskManager.getTask(agent.currentTaskId);
        if (task) {
          this.monitorTask(agentId, task.id);
        }
      }

      return {
        success: true,
        agent,
        message: `Background agent resumed: ${agentId}`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Sauvegarder un agent
   */
  private async saveAgent(agent: BackgroundAgent): Promise<void> {
    try {
      // À implémenter: sauvegarder dans la base de données
      // await BackgroundAgentStore.save(agent);
      
      console.log('[BackgroundAgentManager] Agent saved:', agent.id, agent.status);
    } catch (error) {
      console.error('[BackgroundAgentManager] Failed to save agent:', error);
    }
  }

  /**
   * Charger les agents persistés
   */
  private async loadPersistedAgents(): Promise<void> {
    try {
      // À implémenter: charger depuis la base de données
      // const persistedAgents = await BackgroundAgentStore.getAll();
      // for (const agent of persistedAgents) {
      //   this.agents.set(agent.id, agent);
      //   if (agent.status === 'running') {
      //     this.runningAgents.add(agent.id);
      //   } else if (agent.status === 'paused') {
      //     this.idleAgents.add(agent.id);
      //   }
      // }
    } catch (error) {
      console.error('[BackgroundAgentManager] Failed to load persisted agents:', error);
    }
  }

  /**
   * Obtenir un agent
   */
  getAgent(agentId: string): BackgroundAgent | null {
    return this.agents.get(agentId) || null;
  }

  /**
   * Obtenir tous les agents
   */
  getAllAgents(): BackgroundAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Obtenir les agents par session
   */
  getAgentsBySession(sessionId: string): BackgroundAgent[] {
    return Array.from(this.agents.values())
      .filter(agent => agent.sessionId === sessionId);
  }

  /**
   * Obtenir les agents actifs
   */
  getActiveAgents(): BackgroundAgent[] {
    return Array.from(this.runningAgents)
      .map(id => this.agents.get(id))
      .filter((agent): agent is BackgroundAgent => agent !== null);
  }

  /**
   * Obtenir les agents en pause
   */
  getPausedAgents(): BackgroundAgent[] {
    return Array.from(this.idleAgents)
      .map(id => this.agents.get(id))
      .filter((agent): agent is BackgroundAgent => agent !== null);
  }

  /**
   * Obtenir les agents terminés
   */
  getCompletedAgents(): BackgroundAgent[] {
    return Array.from(this.agents.values())
      .filter(agent => agent.status === 'completed');
  }

  /**
   * Obtenir les agents échoués
   */
  getFailedAgents(): BackgroundAgent[] {
    return Array.from(this.agents.values())
      .filter(agent => agent.status === 'failed');
  }

  /**
   * Supprimer un agent
   */
  async deleteAgent(agentId: string, force: boolean = false): Promise<BackgroundAgentResult> {
    const agent = this.agents.get(agentId);
    
    if (!agent) {
      return {
        success: false,
        error: `Agent ${agentId} not found`
      };
    }

    try {
      // Vérifier les permissions
      if (!force) {
        const perm = permissionsManager.checkPermission('build', 'delete_background_agent', { 
          agentId, 
          sessionId: agent.sessionId 
        });
        if (!perm.allowed) {
          return {
            success: false,
            error: `PERMISSION DENIED: ${perm.reason}`
          };
        }
      }

      // Arrêter l'agent
      const stopResult = await this.stopBackgroundAgent(agentId, true);
      if (!stopResult.success) {
        console.warn(`[BackgroundAgentManager] Failed to stop agent ${agentId}:`, stopResult.error);
      }

      // Supprimer de toutes les listes
      this.agents.delete(agentId);
      this.activeAgents.delete(agent.sessionId);
      this.runningAgents.delete(agentId);
      this.idleAgents.delete(agentId);
      
      // Supprimer de la base de données
      // await BackgroundAgentStore.delete(agentId);

      GlobalEventBus.emit('background-agent.deleted', {
        agentId,
        sessionId: agent.sessionId,
        agent
      });

      return {
        success: true,
        message: `Background agent deleted: ${agentId}`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Nettoyer les agents terminés
   */
  async cleanupCompletedAgents(olderThanMs: number = 86400000): Promise<number> {
    const now = Date.now();
    const completedAgents = this.getCompletedAgents();
    const failedAgents = this.getFailedAgents();
    const cancelledAgents = this.getAgentsByStatus('cancelled');
    
    const agentsToCleanup = [
      ...completedAgents,
      ...failedAgents,
      ...cancelledAgents
    ].filter(agent => {
      if (!agent.completedAt) return false;
      return now - agent.completedAt > olderThanMs;
    });

    let cleanedCount = 0;
    
    for (const agent of agentsToCleanup) {
      const result = await this.deleteAgent(agent.id, true);
      if (result.success) {
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Obtenir les agents par statut
   */
  private getAgentsByStatus(status: TaskStatus): BackgroundAgent[] {
    return Array.from(this.agents.values())
      .filter(agent => agent.status === status);
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
    this.taskManager.setProvider(provider);
  }

  /**
   * Mettre à jour la configuration
   */
  updateConfig(config: Partial<BackgroundAgentConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Redémarrer le cleanup si nécessaire
    if (this.config.autoCleanup && !this.cleanupInterval) {
      this.startCleanupInterval();
    } else if (!this.config.autoCleanup && this.cleanupInterval) {
      this.stopCleanupInterval();
    }
  }

  /**
   * Obtenir la configuration actuelle
   */
  getConfig(): BackgroundAgentConfig {
    return { ...this.config };
  }

  /**
   * Nettoyer tous les agents
   */
  async clearAllAgents(): Promise<void> {
    const allAgents = this.getAllAgents();
    
    for (const agent of allAgents) {
      await this.deleteAgent(agent.id, true);
    }

    this.agents.clear();
    this.activeAgents.clear();
    this.runningAgents.clear();
    this.idleAgents.clear();
    this.agentTimeouts.clear();
    
    this.stopCleanupInterval();
  }

  /**
   * Obtenir les statistiques
   */
  getStats(): Record<string, any> {
    return {
      total: this.agents.size,
      running: this.runningAgents.size,
      paused: this.idleAgents.size,
      completed: this.getCompletedAgents().length,
      failed: this.getFailedAgents().length,
      cancelled: this.getAgentsByStatus('cancelled').length
    };
  }

  /**
   * Arrêter tous les agents
   */
  async stopAllAgents(): Promise<void> {
    const allAgents = this.getAllAgents();
    
    for (const agent of allAgents) {
      await this.stopBackgroundAgent(agent.id, true);
    }
  }
}

/**
 * Créer une instance du BackgroundAgentManager
 */
export function createBackgroundAgentManager(
  provider: ExecutionProvider,
  agentRuntime: AgentRuntime,
  taskManager: LongRunningTaskManager,
  config: Partial<BackgroundAgentConfig> = {}
): BackgroundAgentManager {
  return new BackgroundAgentManager(provider, agentRuntime, taskManager, config);
}

export { DEFAULT_CONFIG };
