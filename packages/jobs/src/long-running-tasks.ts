/**
 * @soryos/jobs
 * Long Running Tasks - Inspiré de Vibra Code
 * 
 * Fonctionnalités:
 * - Gestion des tâches longues
 * - Suivi de la progression
 * - Persistance des tâches
 * - Récupération après interruption
 * - Gestion des états (queued, running, paused, failed, completed, cancelled)
 * - Exécution en arrière-plan
 * - Notifications
 */

import { GlobalEventBus } from '@soryos/bus';
import { ExecutionProvider } from '@soryos/execution';
import { SessionStore } from '@soryos/session';
import { permissionsManager } from '@soryos/permissions';

export type TaskStatus = 
  | 'queued'
  | 'running'
  | 'paused'
  | 'waiting_for_user'
  | 'failed'
  | 'completed'
  | 'cancelled';

export interface TaskStep {
  id: string;
  name: string;
  description: string;
  status: TaskStatus;
  startTime?: number;
  endTime?: number;
  durationMs?: number;
  result?: any;
  error?: string;
  progress: number;
}

export interface LongRunningTask {
  id: string;
  sessionId: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  name: string;
  description: string;
  type: string;
  status: TaskStatus;
  priority: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  pausedAt?: number;
  resumedAt?: number;
  totalDurationMs?: number;
  currentStepIndex: number;
  steps: TaskStep[];
  progress: number;
  result?: any;
  error?: string;
  metadata?: Record<string, any>;
  retryCount: number;
  maxRetries: number;
  isRetryable: boolean;
}

export interface TaskConfig {
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  autoResume: boolean;
  maxConcurrentTasks: number;
  queueTimeoutMs: number;
}

export interface TaskOptions {
  sessionId: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  name: string;
  description?: string;
  type?: string;
  priority?: number;
  steps?: TaskStep[];
  metadata?: Record<string, any>;
  maxRetries?: number;
  isRetryable?: boolean;
}

export interface TaskResult {
  success: boolean;
  task?: LongRunningTask;
  error?: string;
  message?: string;
}

const DEFAULT_CONFIG: TaskConfig = {
  maxRetries: 3,
  retryDelayMs: 2000,
  timeoutMs: 3600000, // 1 hour
  autoResume: true,
  maxConcurrentTasks: 5,
  queueTimeoutMs: 60000 // 1 minute
};

/**
 * Long Running Task Manager
 * 
 * Gère l'exécution de tâches longues avec persistance et récupération.
 */
export class LongRunningTaskManager {
  private config: TaskConfig;
  private provider: ExecutionProvider;
  
  private tasks: Map<string, LongRunningTask> = new Map();
  private activeTasks: Map<string, LongRunningTask> = new Map(); // sessionId -> task
  private queuedTasks: LongRunningTask[] = [];
  private runningTasks: Set<string> = new Set();
  private pausedTasks: Map<string, LongRunningTask> = new Map();
  
  private retryCounts: Map<string, number> = new Map();
  private taskTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    provider: ExecutionProvider,
    config: Partial<TaskConfig> = {}
  ) {
    this.provider = provider;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Charger les tâches persistées
    this.loadPersistedTasks();
  }

  /**
   * Charger les tâches persistées
   */
  private async loadPersistedTasks(): Promise<void> {
    try {
      // À implémenter: charger depuis la base de données
      // const persistedTasks = await TaskStore.getAll();
      // for (const task of persistedTasks) {
      //   this.tasks.set(task.id, task);
      //   if (task.status === 'running') {
      //     this.activeTasks.set(task.sessionId, task);
      //     this.runningTasks.add(task.id);
      //   } else if (task.status === 'paused') {
      //     this.pausedTasks.set(task.id, task);
      //   } else if (task.status === 'queued') {
      //     this.queuedTasks.push(task);
      //   }
      // }
    } catch (error) {
      console.error('[LongRunningTaskManager] Failed to load persisted tasks:', error);
    }
  }

  /**
   * Sauvegarder une tâche
   */
  private async saveTask(task: LongRunningTask): Promise<void> {
    try {
      // À implémenter: sauvegarder dans la base de données
      // await TaskStore.save(task);
      
      // Pour l'instant, juste logger
      console.log('[LongRunningTaskManager] Task saved:', task.id, task.status);
    } catch (error) {
      console.error('[LongRunningTaskManager] Failed to save task:', error);
    }
  }

  /**
   * Supprimer une tâche
   */
  private async deleteTask(taskId: string): Promise<void> {
    try {
      // À implémenter: supprimer de la base de données
      // await TaskStore.delete(taskId);
      
      console.log('[LongRunningTaskManager] Task deleted:', taskId);
    } catch (error) {
      console.error('[LongRunningTaskManager] Failed to delete task:', error);
    }
  }

  /**
   * Créer une nouvelle tâche
   */
  async createTask(options: TaskOptions): Promise<TaskResult> {
    const taskId = `task-${options.sessionId}-${Date.now()}`;
    const {
      sessionId,
      workspaceId,
      projectId,
      userId,
      name,
      description = '',
      type = 'default',
      priority = 0,
      steps = [],
      metadata = {},
      maxRetries = this.config.maxRetries,
      isRetryable = true
    } = options;

    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'create_task', options);
      if (!perm.allowed) {
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      // Créer la tâche
      const task: LongRunningTask = {
        id: taskId,
        sessionId,
        workspaceId,
        projectId,
        userId,
        name,
        description,
        type,
        status: 'queued',
        priority,
        createdAt: Date.now(),
        currentStepIndex: 0,
        steps: steps.map((step, index) => ({
          ...step,
          id: step.id || `step-${index}`,
          status: 'pending',
          progress: 0
        })),
        progress: 0,
        metadata,
        retryCount: 0,
        maxRetries,
        isRetryable
      };

      // Ajouter à la liste des tâches
      this.tasks.set(taskId, task);
      this.queuedTasks.push(task);

      // Sauvegarder
      await this.saveTask(task);

      GlobalEventBus.emit('task.created', {
        taskId,
        sessionId,
        task
      });

      // Essayer de démarrer la tâche si possible
      this.tryStartQueuedTasks();

      return {
        success: true,
        task,
        message: `Task created: ${taskId}`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      GlobalEventBus.emit('task.failed', {
        taskId,
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
   * Démarrer une tâche
   */
  async startTask(taskId: string): Promise<TaskResult> {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      return {
        success: false,
        error: `Task ${taskId} not found`
      };
    }

    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'start_task', { taskId, sessionId: task.sessionId });
      if (!perm.allowed) {
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      if (task.status !== 'queued' && task.status !== 'paused') {
        return {
          success: false,
          error: `Cannot start task with status: ${task.status}`
        };
      }

      // Mettre à jour le statut
      task.status = 'running';
      task.startedAt = Date.now();
      task.currentStepIndex = 0;
      
      // Ajouter aux tâches actives
      this.activeTasks.set(task.sessionId, task);
      this.runningTasks.add(taskId);
      
      // Retirer de la queue
      this.queuedTasks = this.queuedTasks.filter(t => t.id !== taskId);
      this.pausedTasks.delete(taskId);

      // Sauvegarder
      await this.saveTask(task);

      GlobalEventBus.emit('task.started', {
        taskId,
        sessionId: task.sessionId,
        task
      });

      // Démarrer le timeout
      this.setupTaskTimeout(taskId);

      // Exécuter la tâche
      this.executeTask(task);

      return {
        success: true,
        task,
        message: `Task started: ${taskId}`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      GlobalEventBus.emit('task.failed', {
        taskId,
        sessionId: task?.sessionId,
        error: errorMessage
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Exécuter une tâche
   */
  private async executeTask(task: LongRunningTask): Promise<void> {
    const taskId = task.id;
    const sessionId = task.sessionId;
    
    try {
      // Exécuter chaque étape
      for (let i = 0; i < task.steps.length; i++) {
        task.currentStepIndex = i;
        const step = task.steps[i];
        
        // Mettre à jour la progression
        task.progress = ((i + 1) / task.steps.length) * 100;
        
        GlobalEventBus.emit('task.step.started', {
          taskId,
          sessionId,
          stepId: step.id,
          stepIndex: i,
          step
        });

        // Exécuter l'étape
        const result = await this.executeStep(step, task);
        
        if (result.success) {
          step.status = 'completed';
          step.result = result.result;
          step.endTime = Date.now();
          step.durationMs = step.startTime ? Date.now() - step.startTime : undefined;
          step.progress = 100;
          
          GlobalEventBus.emit('task.step.completed', {
            taskId,
            sessionId,
            stepId: step.id,
            stepIndex: i,
            result: result.result
          });
        } else {
          step.status = 'failed';
          step.error = result.error;
          step.endTime = Date.now();
          step.durationMs = step.startTime ? Date.now() - step.startTime : undefined;
          
          GlobalEventBus.emit('task.step.failed', {
            taskId,
            sessionId,
            stepId: step.id,
            stepIndex: i,
            error: result.error
          });

          // Gérer l'échec
          if (this.shouldContinueOnFailure(task, step)) {
            console.log(`[LongRunningTaskManager] Step ${step.id} failed, but continuing...`);
            continue;
          } else {
            // Arrêter la tâche
            await this.failTask(taskId, result.error || 'Step failed');
            return;
          }
        }
      }

      // Toutes les étapes terminées
      await this.completeTask(taskId);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Gérer l'erreur
      this.failTask(taskId, errorMessage).catch(console.error);
    }
  }

  /**
   * Exécuter une étape
   */
  private async executeStep(
    step: TaskStep,
    task: LongRunningTask
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const startTime = Date.now();
    step.startTime = startTime;
    step.status = 'running';
    
    GlobalEventBus.emit('task.step.running', {
      taskId: task.id,
      sessionId: task.sessionId,
      stepId: step.id
    });

    try {
      // Ici, on devrait exécuter la logique de l'étape
      // Pour l'instant, on simule un délai
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Simuler un succès
      return {
        success: true,
        result: {
          stepId: step.id,
          stepName: step.name,
          completedAt: Date.now()
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Configurer le timeout de la tâche
   */
  private setupTaskTimeout(taskId: string): void {
    // Annuler le timeout existant
    const existingTimeout = this.taskTimeouts.get(taskId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Créer un nouveau timeout
    const timeout = setTimeout(async () => {
      const task = this.tasks.get(taskId);
      if (task && task.status === 'running') {
        await this.timeoutTask(taskId);
      }
    }, this.config.timeoutMs);

    this.taskTimeouts.set(taskId, timeout);
  }

  /**
   * Timeout d'une tâche
   */
  private async timeoutTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    
    if (!task) return;

    try {
      // Mettre à jour le statut
      task.status = 'failed';
      task.completedAt = Date.now();
      task.totalDurationMs = Date.now() - (task.startedAt || Date.now());
      task.error = `Task timed out after ${this.config.timeoutMs}ms`;

      // Nettoyer
      this.cleanupTask(taskId);

      // Sauvegarder
      await this.saveTask(task);

      GlobalEventBus.emit('task.timeout', {
        taskId,
        sessionId: task.sessionId,
        task
      });

      // Tenter un retry si possible
      if (task.isRetryable && task.retryCount < task.maxRetries) {
        await this.retryTask(taskId);
      }

    } catch (error) {
      console.error('[LongRunningTaskManager] Failed to handle timeout:', error);
    }
  }

  /**
   * Compléter une tâche
   */
  private async completeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    
    if (!task) return;

    try {
      // Mettre à jour le statut
      task.status = 'completed';
      task.completedAt = Date.now();
      task.totalDurationMs = Date.now() - (task.startedAt || Date.now());
      task.progress = 100;

      // Nettoyer
      this.cleanupTask(taskId);

      // Sauvegarder
      await this.saveTask(task);

      GlobalEventBus.emit('task.completed', {
        taskId,
        sessionId: task.sessionId,
        task
      });

      // Essayer de démarrer la prochaine tâche dans la queue
      this.tryStartQueuedTasks();

    } catch (error) {
      console.error('[LongRunningTaskManager] Failed to complete task:', error);
    }
  }

  /**
   * Échec d'une tâche
   */
  private async failTask(taskId: string, error: string): Promise<void> {
    const task = this.tasks.get(taskId);
    
    if (!task) return;

    try {
      // Mettre à jour le statut
      task.status = 'failed';
      task.completedAt = Date.now();
      task.totalDurationMs = Date.now() - (task.startedAt || Date.now());
      task.error = error;
      task.retryCount++;

      // Nettoyer
      this.cleanupTask(taskId);

      // Sauvegarder
      await this.saveTask(task);

      GlobalEventBus.emit('task.failed', {
        taskId,
        sessionId: task.sessionId,
        task,
        error
      });

      // Tenter un retry si possible
      if (task.isRetryable && task.retryCount < task.maxRetries) {
        await this.retryTask(taskId);
      }

    } catch (error) {
      console.error('[LongRunningTaskManager] Failed to fail task:', error);
    }
  }

  /**
   * Retenter une tâche
   */
  private async retryTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    
    if (!task) return;

    try {
      // Attendre avant le retry
      await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs));

      // Réinitialiser les étapes
      task.steps.forEach(step => {
        step.status = 'pending';
        step.startTime = undefined;
        step.endTime = undefined;
        step.result = undefined;
        step.error = undefined;
      });

      // Mettre à jour le statut
      task.status = 'queued';
      task.currentStepIndex = 0;
      task.startedAt = undefined;
      task.startedAt = undefined;

      // Sauvegarder
      await this.saveTask(task);

      GlobalEventBus.emit('task.retry', {
        taskId,
        sessionId: task.sessionId,
        task,
        retryCount: task.retryCount + 1
      });

      // Réessayer de démarrer
      this.tryStartQueuedTasks();

    } catch (error) {
      console.error('[LongRunningTaskManager] Failed to retry task:', error);
    }
  }

  /**
   * Nettoyer une tâche
   */
  private cleanupTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // Retirer des tâches actives
    this.activeTasks.delete(task.sessionId);
    this.runningTasks.delete(taskId);
    this.pausedTasks.delete(taskId);
    
    // Annuler le timeout
    const timeout = this.taskTimeouts.get(taskId);
    if (timeout) {
      clearTimeout(timeout);
      this.taskTimeouts.delete(taskId);
    }
  }

  /**
   * Essayer de démarrer les tâches en queue
   */
  private tryStartQueuedTasks(): void {
    // Vérifier le nombre max de tâches concurrentes
    while (this.runningTasks.size < this.config.maxConcurrentTasks && 
           this.queuedTasks.length > 0) {
      
      // Trouver la tâche avec la priorité la plus élevée
      const nextTask = this.queuedTasks.reduce((highest, current) => {
        return (current.priority || 0) > (highest?.priority || 0) ? current : highest;
      }, this.queuedTasks[0]);

      if (!nextTask) break;

      // Démarrer la tâche
      this.startTask(nextTask.id).catch(console.error);
    }
  }

  /**
   * Mettre en pause une tâche
   */
  async pauseTask(taskId: string): Promise<TaskResult> {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      return {
        success: false,
        error: `Task ${taskId} not found`
      };
    }

    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'pause_task', { taskId, sessionId: task.sessionId });
      if (!perm.allowed) {
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      if (task.status !== 'running') {
        return {
          success: false,
          error: `Cannot pause task with status: ${task.status}`
        };
      }

      // Mettre à jour le statut
      task.status = 'paused';
      task.pausedAt = Date.now();
      
      // Retirer des tâches actives
      this.activeTasks.delete(task.sessionId);
      this.runningTasks.delete(taskId);
      
      // Ajouter aux tâches en pause
      this.pausedTasks.set(taskId, task);

      // Annuler le timeout
      const timeout = this.taskTimeouts.get(taskId);
      if (timeout) {
        clearTimeout(timeout);
        this.taskTimeouts.delete(taskId);
      }

      // Sauvegarder
      await this.saveTask(task);

      GlobalEventBus.emit('task.paused', {
        taskId,
        sessionId: task.sessionId,
        task
      });

      return {
        success: true,
        task,
        message: `Task paused: ${taskId}`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      GlobalEventBus.emit('task.failed', {
        taskId,
        sessionId: task?.sessionId,
        error: errorMessage
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Reprendre une tâche
   */
  async resumeTask(taskId: string): Promise<TaskResult> {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      return {
        success: false,
        error: `Task ${taskId} not found`
      };
    }

    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'resume_task', { taskId, sessionId: task.sessionId });
      if (!perm.allowed) {
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      if (task.status !== 'paused') {
        return {
          success: false,
          error: `Cannot resume task with status: ${task.status}`
        };
      }

      // Mettre à jour le statut
      task.status = 'running';
      task.resumedAt = Date.now();
      
      // Retirer des tâches en pause
      this.pausedTasks.delete(taskId);
      
      // Ajouter aux tâches actives
      this.activeTasks.set(task.sessionId, task);
      this.runningTasks.add(taskId);

      // Sauvegarder
      await this.saveTask(task);

      GlobalEventBus.emit('task.resumed', {
        taskId,
        sessionId: task.sessionId,
        task
      });

      // Démarrer le timeout
      this.setupTaskTimeout(taskId);

      // Exécuter la tâche
      this.executeTask(task);

      return {
        success: true,
        task,
        message: `Task resumed: ${taskId}`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      GlobalEventBus.emit('task.failed', {
        taskId,
        sessionId: task?.sessionId,
        error: errorMessage
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Annuler une tâche
   */
  async cancelTask(taskId: string): Promise<TaskResult> {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      return {
        success: false,
        error: `Task ${taskId} not found`
      };
    }

    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'cancel_task', { taskId, sessionId: task.sessionId });
      if (!perm.allowed) {
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      if (task.status === 'completed' || task.status === 'failed') {
        return {
          success: false,
          error: `Cannot cancel task with status: ${task.status}`
        };
      }

      // Mettre à jour le statut
      task.status = 'cancelled';
      task.completedAt = Date.now();
      task.totalDurationMs = Date.now() - (task.startedAt || Date.now());

      // Nettoyer
      this.cleanupTask(taskId);

      // Sauvegarder
      await this.saveTask(task);

      GlobalEventBus.emit('task.cancelled', {
        taskId,
        sessionId: task.sessionId,
        task
      });

      return {
        success: true,
        task,
        message: `Task cancelled: ${taskId}`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      GlobalEventBus.emit('task.failed', {
        taskId,
        sessionId: task?.sessionId,
        error: errorMessage
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Mettre à jour la progression d'une tâche
   */
  async updateTaskProgress(
    taskId: string,
    progress: number,
    metadata?: Record<string, any>
  ): Promise<TaskResult> {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      return {
        success: false,
        error: `Task ${taskId} not found`
      };
    }

    try {
      // Mettre à jour la progression
      task.progress = Math.min(100, Math.max(0, progress));
      
      if (metadata) {
        task.metadata = { ...task.metadata, ...metadata };
      }

      // Sauvegarder
      await this.saveTask(task);

      GlobalEventBus.emit('task.progress', {
        taskId,
        sessionId: task.sessionId,
        progress,
        metadata
      });

      return {
        success: true,
        task,
        message: `Task progress updated: ${progress}%`
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
   * Mettre en attente d'utilisateur
   */
  async waitForUser(taskId: string, message: string): Promise<TaskResult> {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      return {
        success: false,
        error: `Task ${taskId} not found`
      };
    }

    try {
      // Mettre à jour le statut
      task.status = 'waiting_for_user';
      
      // Sauvegarder
      await this.saveTask(task);

      GlobalEventBus.emit('task.waiting_for_user', {
        taskId,
        sessionId: task.sessionId,
        task,
        message
      });

      return {
        success: true,
        task,
        message: `Task waiting for user: ${taskId}`
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
   * Reprendre après attente utilisateur
   */
  async continueAfterUser(taskId: string): Promise<TaskResult> {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      return {
        success: false,
        error: `Task ${taskId} not found`
      };
    }

    try {
      if (task.status !== 'waiting_for_user') {
        return {
          success: false,
          error: `Cannot continue task with status: ${task.status}`
        };
      }

      // Mettre à jour le statut
      task.status = 'running';
      
      // Sauvegarder
      await this.saveTask(task);

      GlobalEventBus.emit('task.continued', {
        taskId,
        sessionId: task.sessionId,
        task
      });

      // Exécuter la tâche
      this.executeTask(task);

      return {
        success: true,
        task,
        message: `Task continued: ${taskId}`
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
   * Obtenir une tâche
   */
  getTask(taskId: string): LongRunningTask | null {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Obtenir toutes les tâches
   */
  getAllTasks(): LongRunningTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Obtenir les tâches par session
   */
  getTasksBySession(sessionId: string): LongRunningTask[] {
    return Array.from(this.tasks.values())
      .filter(task => task.sessionId === sessionId);
  }

  /**
   * Obtenir les tâches actives
   */
  getActiveTasks(): LongRunningTask[] {
    return Array.from(this.runningTasks)
      .map(id => this.tasks.get(id))
      .filter((task): task is LongRunningTask => task !== null);
  }

  /**
   * Obtenir les tâches en queue
   */
  getQueuedTasks(): LongRunningTask[] {
    return [...this.queuedTasks];
  }

  /**
   * Obtenir les tâches en pause
   */
  getPausedTasks(): LongRunningTask[] {
    return Array.from(this.pausedTasks.values());
  }

  /**
   * Obtenir les tâches terminées
   */
  getCompletedTasks(): LongRunningTask[] {
    return Array.from(this.tasks.values())
      .filter(task => task.status === 'completed');
  }

  /**
   * Obtenir les tâches échouées
   */
  getFailedTasks(): LongRunningTask[] {
    return Array.from(this.tasks.values())
      .filter(task => task.status === 'failed');
  }

  /**
   * Supprimer une tâche
   */
  async deleteTask(taskId: string, force: boolean = false): Promise<TaskResult> {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      return {
        success: false,
        error: `Task ${taskId} not found`
      };
    }

    try {
      // Vérifier les permissions
      const perm = permissionsManager.checkPermission('build', 'delete_task', { taskId, sessionId: task.sessionId });
      if (!perm.allowed && !force) {
        return {
          success: false,
          error: `PERMISSION DENIED: ${perm.reason}`
        };
      }

      // Nettoyer
      this.cleanupTask(taskId);
      
      // Supprimer de toutes les listes
      this.tasks.delete(taskId);
      this.queuedTasks = this.queuedTasks.filter(t => t.id !== taskId);
      this.pausedTasks.delete(taskId);
      
      // Supprimer de la base de données
      await this.deleteTask(taskId);

      GlobalEventBus.emit('task.deleted', {
        taskId,
        sessionId: task.sessionId,
        task
      });

      return {
        success: true,
        message: `Task deleted: ${taskId}`
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
   * Nettoyer les tâches terminées
   */
  async cleanupCompletedTasks(olderThanMs: number = 86400000): Promise<number> {
    const now = Date.now();
    const completedTasks = this.getCompletedTasks();
    const failedTasks = this.getFailedTasks();
    const cancelledTasks = this.getTasksByStatus('cancelled');
    
    const tasksToCleanup = [
      ...completedTasks,
      ...failedTasks,
      ...cancelledTasks
    ].filter(task => {
      if (!task.completedAt) return false;
      return now - task.completedAt > olderThanMs;
    });

    let cleanedCount = 0;
    
    for (const task of tasksToCleanup) {
      const result = await this.deleteTask(task.id, true);
      if (result.success) {
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Obtenir les tâches par statut
   */
  private getTasksByStatus(status: TaskStatus): LongRunningTask[] {
    return Array.from(this.tasks.values())
      .filter(task => task.status === status);
  }

  /**
   * Vérifier si on doit continuer après un échec
   */
  private shouldContinueOnFailure(task: LongRunningTask, step: TaskStep): boolean {
    // Vérifier la configuration de la tâche
    if (!task.isRetryable) return false;
    
    // Vérifier la configuration de l'étape
    if (step.status === 'failed' && !step.error?.includes('retryable')) {
      return false;
    }
    
    // Vérifier le nombre de retries
    if (task.retryCount >= task.maxRetries) {
      return false;
    }
    
    return true;
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
  updateConfig(config: Partial<TaskConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Obtenir la configuration actuelle
   */
  getConfig(): TaskConfig {
    return { ...this.config };
  }

  /**
   * Nettoyer toutes les tâches
   */
  async clearAllTasks(): Promise<void> {
    const allTasks = this.getAllTasks();
    
    for (const task of allTasks) {
      await this.deleteTask(task.id, true);
    }

    this.tasks.clear();
    this.activeTasks.clear();
    this.queuedTasks = [];
    this.runningTasks.clear();
    this.pausedTasks.clear();
    this.retryCounts.clear();
    this.taskTimeouts.clear();
  }

  /**
   * Obtenir les statistiques
   */
  getStats(): Record<string, any> {
    return {
      total: this.tasks.size,
      queued: this.queuedTasks.length,
      running: this.runningTasks.size,
      paused: this.pausedTasks.size,
      completed: this.getCompletedTasks().length,
      failed: this.getFailedTasks().length,
      cancelled: this.getTasksByStatus('cancelled').length,
      waitingForUser: this.getTasksByStatus('waiting_for_user').length
    };
  }
}

/**
 * Créer une instance du LongRunningTaskManager
 */
export function createLongRunningTaskManager(
  provider: ExecutionProvider,
  config: Partial<TaskConfig> = {}
): LongRunningTaskManager {
  return new LongRunningTaskManager(provider, config);
}

export { DEFAULT_CONFIG };
