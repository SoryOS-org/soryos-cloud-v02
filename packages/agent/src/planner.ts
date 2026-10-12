/**
 * @soryos/agent
 * Planner - Système de planification inspiré de Vibra Code
 * 
 * Fonctionnalités:
 * - Création de plans multi-étapes
 * - Gestion des subagents spécialisés
 * - Exécution séquentielle ou parallèle
 * - Suivi de la progression
 * - Gestion des erreurs et récupération
 * - Validation des résultats
 */

import { GlobalEventBus } from '@soryos/bus';
import { AgentRuntime } from './runtime';
import { ContextBuilder, ContextOptions } from './context-builder';
import { ToolExecutor } from '@soryos/tool';
import { ExecutionProvider } from '@soryos/execution';
import { SessionData } from '@soryos/schema';

export interface PlanStep {
  id: string;
  name: string;
  description: string;
  type: 'task' | 'tool' | 'subagent' | 'condition' | 'parallel' | 'sequence';
  action?: string;
  tool?: string;
  parameters?: Record<string, any>;
  subagent?: string;
  steps?: PlanStep[];
  condition?: string;
  expectedResult?: any;
  timeoutMs?: number;
  retryOnFailure?: boolean;
  maxRetries?: number;
  dependencies?: string[];
  priority: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: any;
  error?: string;
  startTime?: number;
  endTime?: number;
  durationMs?: number;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  sessionId: string;
  workspaceId?: string;
  projectId?: string;
  steps: PlanStep[];
  currentStepIndex: number;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  totalDurationMs?: number;
  results: Record<string, any>;
  errors: Record<string, string>;
}

export interface PlannerConfig {
  maxSteps: number;
  maxParallelSteps: number;
  defaultTimeoutMs: number;
  defaultMaxRetries: number;
  retryOnFailure: boolean;
}

export interface SubagentConfig {
  name: string;
  description: string;
  capabilities: string[];
  systemPrompt: string;
  tools: string[];
}

export interface PlannerOptions {
  sessionId: string;
  workspaceId?: string;
  projectId?: string;
  userRequest: string;
  contextOptions?: ContextOptions;
}

export interface PlanResult {
  plan: Plan;
  success: boolean;
  message?: string;
  error?: string;
}

const DEFAULT_CONFIG: PlannerConfig = {
  maxSteps: 100,
  maxParallelSteps: 5,
  defaultTimeoutMs: 60000,
  defaultMaxRetries: 3,
  retryOnFailure: true
};

// Définitions des subagents
const SUBAGENTS: Record<string, SubagentConfig> = {
  planner: {
    name: 'Planner',
    description: 'Specialized in creating detailed plans for complex tasks',
    capabilities: ['plan_creation', 'task_decomposition', 'dependency_analysis', 'risk_assessment'],
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
    tools: ['read_file', 'list_files', 'grep_search', 'codebase_search']
  },
  
  coder: {
    name: 'Coder',
    description: 'Specialized in writing and modifying code',
    capabilities: ['code_generation', 'code_modification', 'code_review', 'refactoring'],
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
    tools: ['read_file', 'write_file', 'edit_file', 'shell_command', 'grep_search', 'codebase_search']
  },
  
  tester: {
    name: 'Tester',
    description: 'Specialized in testing and verification',
    capabilities: ['test_writing', 'test_execution', 'verification', 'debugging'],
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
    tools: ['shell_command', 'read_file', 'write_file', 'grep_search']
  },
  
  reviewer: {
    name: 'Reviewer',
    description: 'Specialized in code review and quality assurance',
    capabilities: ['code_review', 'quality_check', 'security_analysis', 'performance_analysis'],
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

Available tools: read_file, grep_search, codebase_search`,
    tools: ['read_file', 'grep_search', 'codebase_search', 'symbol_search']
  },
  
  debugger: {
    name: 'Debugger',
    description: 'Specialized in debugging and error resolution',
    capabilities: ['error_analysis', 'root_cause_identification', 'debugging', 'error_recovery'],
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
    tools: ['read_file', 'grep_search', 'shell_command', 'codebase_search']
  },
  
  researcher: {
    name: 'Researcher',
    description: 'Specialized in information gathering and research',
    capabilities: ['documentation_search', 'information_gathering', 'api_research', 'best_practices'],
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
    tools: ['grep_search', 'read_file', 'web_search']
  }
};

export class Planner {
  private config: PlannerConfig;
  private agentRuntime: AgentRuntime;
  private contextBuilder: ContextBuilder;
  private toolExecutor: ToolExecutor;
  private provider: ExecutionProvider;
  private plans: Map<string, Plan> = new Map();
  private activePlanId: string | null = null;

  constructor(
    agentRuntime: AgentRuntime,
    contextBuilder: ContextBuilder,
    toolExecutor: ToolExecutor,
    provider: ExecutionProvider,
    config: Partial<PlannerConfig> = {}
  ) {
    this.agentRuntime = agentRuntime;
    this.contextBuilder = contextBuilder;
    this.toolExecutor = toolExecutor;
    this.provider = provider;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Créer un plan pour une requête utilisateur
   */
  async createPlan(options: PlannerOptions): Promise<PlanResult> {
    const { sessionId, workspaceId, projectId, userRequest, contextOptions } = options;
    const planId = `plan-${sessionId}-${Date.now()}`;
    
    try {
      // Construire le contexte
      const context = await this.contextBuilder.buildContext({
        sessionId,
        workspaceId,
        projectId,
        userRequest,
        ...contextOptions
      });

      // Créer un plan initial
      const plan: Plan = {
        id: planId,
        name: this.generatePlanName(userRequest),
        description: userRequest,
        sessionId,
        workspaceId,
        projectId,
        steps: [],
        currentStepIndex: 0,
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        results: {},
        errors: {}
      };

      // Utiliser le subagent Planner pour créer le plan détaillé
      const plannerResult = await this.runSubagent(
        'planner',
        userRequest,
        context,
        sessionId
      );

      if (!plannerResult.success) {
        return {
          plan,
          success: false,
          error: plannerResult.error || 'Failed to create plan'
        };
      }

      // Parser le plan généré
      const planSteps = this.parsePlanFromResponse(plannerResult.output || '');
      plan.steps = planSteps.map((step, index) => ({
        ...step,
        id: step.id || `step-${index}`,
        status: 'pending',
        priority: index + 1
      }));

      // Valider le plan
      const validation = this.validatePlan(plan);
      if (!validation.valid) {
        return {
          plan,
          success: false,
          error: `Invalid plan: ${validation.error}`
        };
      }

      // Sauvegarder le plan
      this.plans.set(planId, plan);
      this.activePlanId = planId;

      GlobalEventBus.emit('plan.created', {
        planId,
        sessionId,
        plan
      });

      return {
        plan,
        success: true,
        message: `Plan created with ${plan.steps.length} steps`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      GlobalEventBus.emit('plan.failed', {
        planId,
        sessionId,
        error: errorMessage
      });

      return {
        plan: {
          id: planId,
          name: this.generatePlanName(userRequest),
          description: userRequest,
          sessionId,
          workspaceId,
          projectId,
          steps: [],
          currentStepIndex: 0,
          status: 'failed',
          progress: 0,
          createdAt: Date.now(),
          results: {},
          errors: {}
        },
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Générer un nom de plan
   */
  private generatePlanName(userRequest: string): string {
    const lowerRequest = userRequest.toLowerCase();
    
    if (lowerRequest.includes('create') || lowerRequest.includes('build')) {
      return 'Create/Build Plan';
    } else if (lowerRequest.includes('fix') || lowerRequest.includes('error') || lowerRequest.includes('bug')) {
      return 'Debug/Fix Plan';
    } else if (lowerRequest.includes('test')) {
      return 'Test Plan';
    } else if (lowerRequest.includes('refactor') || lowerRequest.includes('improve')) {
      return 'Refactor/Improve Plan';
    } else if (lowerRequest.includes('add') || lowerRequest.includes('new')) {
      return 'Add/New Feature Plan';
    }
    
    return 'Execution Plan';
  }

  /**
   * Parser un plan depuis la réponse du subagent
   */
  private parsePlanFromResponse(response: string): PlanStep[] {
    const steps: PlanStep[] = [];
    
    try {
      // Essayer de parser comme JSON
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed)) {
        return parsed.map((step, index) => ({
          id: step.id || `step-${index}`,
          name: step.name || `Step ${index + 1}`,
          description: step.description || '',
          type: step.type || 'task',
          action: step.action,
          tool: step.tool,
          parameters: step.parameters || {},
          subagent: step.subagent,
          steps: step.steps ? this.parsePlanFromResponse(JSON.stringify(step.steps)) : undefined,
          condition: step.condition,
          expectedResult: step.expectedResult,
          timeoutMs: step.timeoutMs || this.config.defaultTimeoutMs,
          retryOnFailure: step.retryOnFailure !== undefined ? step.retryOnFailure : this.config.retryOnFailure,
          maxRetries: step.maxRetries || this.config.defaultMaxRetries,
          dependencies: step.dependencies || [],
          priority: step.priority || index + 1,
          status: 'pending'
        }));
      }
      
      // Parser comme Markdown
      if (response.includes('##') || response.includes('- [')) {
        return this.parseMarkdownPlan(response);
      }
      
      // Parser comme texte simple
      const lines = response.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Détecter les étapes numérotées
        const stepMatch = line.match(/^(\d+)\.\s+(.+)/);
        if (stepMatch) {
          steps.push({
            id: `step-${i}`,
            name: stepMatch[2],
            description: '',
            type: 'task',
            priority: parseInt(stepMatch[1]),
            status: 'pending'
          });
        }
        // Détecter les listes
        else if (line.startsWith('- ') || line.startsWith('* ')) {
          steps.push({
            id: `step-${i}`,
            name: line.substring(2),
            description: '',
            type: 'task',
            priority: steps.length + 1,
            status: 'pending'
          });
        }
      }
    } catch (error) {
      // Si le parsing échoue, créer des étapes par défaut
      console.error('[Planner] Error parsing plan:', error);
      
      // Créer une étape par défaut
      steps.push({
        id: 'step-0',
        name: 'Execute user request',
        description: response.substring(0, 200),
        type: 'task',
        priority: 1,
        status: 'pending'
      });
    }
    
    return steps;
  }

  /**
   * Parser un plan au format Markdown
   */
  private parseMarkdownPlan(markdown: string): PlanStep[] {
    const steps: PlanStep[] = [];
    const lines = markdown.split('\n');
    let currentSection = '';
    let currentStep: Partial<PlanStep> = {};
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('## ')) {
        // Nouvelle section
        currentSection = trimmed.substring(3);
      } else if (trimmed.startsWith('### ')) {
        // Nouveau sous-section
        currentSection = trimmed.substring(4);
      } else if (trimmed.match(/^- \[ \] /) || trimmed.match(/^- \[x\] /)) {
        // Étape avec checkbox
        const content = trimmed.substring(4);
        const isCompleted = trimmed.includes('[x]');
        
        currentStep = {
          id: `step-${steps.length}`,
          name: content.split('\n')[0],
          description: '',
          type: 'task',
          priority: steps.length + 1,
          status: isCompleted ? 'completed' : 'pending'
        };
        steps.push(currentStep as PlanStep);
      } else if (trimmed.match(/^\d+\. /)) {
        // Étape numérotée
        const match = trimmed.match(/^(\d+)\.\s+(.+)/);
        if (match) {
          currentStep = {
            id: `step-${steps.length}`,
            name: match[2],
            description: '',
            type: 'task',
            priority: parseInt(match[1]),
            status: 'pending'
          };
          steps.push(currentStep as PlanStep);
        }
      } else if (trimmed && currentStep.name) {
        // Ajouter à la description
        if (!currentStep.description) {
          currentStep.description = trimmed;
        } else {
          currentStep.description += '\n' + trimmed;
        }
      }
    }
    
    return steps;
  }

  /**
   * Valider un plan
   */
  private validatePlan(plan: Plan): { valid: boolean; error?: string } {
    if (!plan.steps || plan.steps.length === 0) {
      return { valid: false, error: 'Plan must have at least one step' };
    }
    
    if (plan.steps.length > this.config.maxSteps) {
      return { valid: false, error: `Plan cannot have more than ${this.config.maxSteps} steps` };
    }
    
    // Valider chaque étape
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      
      if (!step.name) {
        return { valid: false, error: `Step ${i} must have a name` };
      }
      
      if (!step.type) {
        return { valid: false, error: `Step ${i} must have a type` };
      }
      
      if (step.type === 'tool' && !step.tool) {
        return { valid: false, error: `Tool step ${i} must specify a tool` };
      }
      
      if (step.type === 'subagent' && !step.subagent) {
        return { valid: false, error: `Subagent step ${i} must specify a subagent` };
      }
      
      if (step.type === 'condition' && !step.condition) {
        return { valid: false, error: `Condition step ${i} must specify a condition` };
      }
    }
    
    // Vérifier les dépendances circulaires
    if (this.hasCircularDependencies(plan.steps)) {
      return { valid: false, error: 'Plan has circular dependencies' };
    }
    
    return { valid: true };
  }

  /**
   * Vérifier les dépendances circulaires
   */
  private hasCircularDependencies(steps: PlanStep[]): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const hasCycle = (stepId: string): boolean => {
      visited.add(stepId);
      recursionStack.add(stepId);
      
      const step = steps.find(s => s.id === stepId);
      if (!step) return false;
      
      if (step.dependencies) {
        for (const depId of step.dependencies) {
          if (!visited.has(depId)) {
            if (hasCycle(depId)) {
              return true;
            }
          } else if (recursionStack.has(depId)) {
            return true;
          }
        }
      }
      
      recursionStack.delete(stepId);
      return false;
    };
    
    for (const step of steps) {
      if (!visited.has(step.id)) {
        if (hasCycle(step.id)) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Exécuter un plan
   */
  async executePlan(planId: string, sessionId: string): Promise<PlanResult> {
    const plan = this.plans.get(planId);
    
    if (!plan) {
      return {
        plan: this.createEmptyPlan(planId, sessionId),
        success: false,
        error: `Plan ${planId} not found`
      };
    }

    try {
      // Mettre à jour le statut
      plan.status = 'running';
      plan.startedAt = Date.now();
      this.activePlanId = planId;
      
      GlobalEventBus.emit('plan.started', {
        planId,
        sessionId,
        plan
      });

      // Exécuter chaque étape
      for (let i = 0; i < plan.steps.length; i++) {
        plan.currentStepIndex = i;
        const step = plan.steps[i];
        
        // Mettre à jour la progression
        plan.progress = ((i + 1) / plan.steps.length) * 100;
        
        GlobalEventBus.emit('plan.step.started', {
          planId,
          sessionId,
          stepId: step.id,
          stepIndex: i,
          step
        });

        // Exécuter l'étape
        const result = await this.executeStep(step, plan, sessionId);
        
        if (result.success) {
          step.status = 'completed';
          step.result = result.result;
          step.endTime = Date.now();
          step.durationMs = step.startTime ? Date.now() - step.startTime : undefined;
          plan.results[step.id] = result.result;
          
          GlobalEventBus.emit('plan.step.completed', {
            planId,
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
          plan.errors[step.id] = result.error || 'Unknown error';
          
          GlobalEventBus.emit('plan.step.failed', {
            planId,
            sessionId,
            stepId: step.id,
            stepIndex: i,
            error: result.error
          });

          // Gérer l'échec
          if (this.shouldContinueOnFailure(step)) {
            console.log(`[Planner] Step ${step.id} failed, but continuing...`);
            continue;
          } else {
            plan.status = 'failed';
            plan.completedAt = Date.now();
            plan.totalDurationMs = Date.now() - (plan.startedAt || Date.now());
            
            GlobalEventBus.emit('plan.failed', {
              planId,
              sessionId,
              stepId: step.id,
              error: result.error
            });

            return {
              plan,
              success: false,
              error: result.error
            };
          }
        }
      }

      // Toutes les étapes terminées
      plan.status = 'completed';
      plan.completedAt = Date.now();
      plan.progress = 100;
      plan.totalDurationMs = Date.now() - (plan.startedAt || Date.now());
      
      GlobalEventBus.emit('plan.completed', {
        planId,
        sessionId,
        plan
      });

      return {
        plan,
        success: true,
        message: `Plan completed successfully in ${plan.totalDurationMs}ms`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      plan.status = 'failed';
      plan.completedAt = Date.now();
      plan.totalDurationMs = Date.now() - (plan.startedAt || Date.now());
      
      GlobalEventBus.emit('plan.failed', {
        planId,
        sessionId,
        error: errorMessage
      });

      return {
        plan,
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Exécuter une étape individuelle
   */
  private async executeStep(
    step: PlanStep,
    plan: Plan,
    sessionId: string
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const startTime = Date.now();
    step.startTime = startTime;
    step.status = 'running';
    
    GlobalEventBus.emit('plan.step.running', {
      planId: plan.id,
      sessionId,
      stepId: step.id
    });

    try {
      switch (step.type) {
        case 'tool':
          return await this.executeToolStep(step, plan, sessionId);
        case 'subagent':
          return await this.executeSubagentStep(step, plan, sessionId);
        case 'condition':
          return await this.executeConditionStep(step, plan, sessionId);
        case 'parallel':
          return await this.executeParallelStep(step, plan, sessionId);
        case 'sequence':
          return await this.executeSequenceStep(step, plan, sessionId);
        case 'task':
        default:
          return await this.executeTaskStep(step, plan, sessionId);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Exécuter une étape de type 'tool'
   */
  private async executeToolStep(
    step: PlanStep,
    plan: Plan,
    sessionId: string
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    if (!step.tool) {
      return { success: false, error: 'Tool step must specify a tool' };
    }

    try {
      // Exécuter l'outil via ToolExecutor
      const result = await this.toolExecutor.execute(
        step.tool,
        step.parameters || {},
        this.provider,
        {
          id: sessionId,
          workspaceId: plan.workspaceId,
          projectId: plan.projectId,
          files: {}
        } as SessionData,
        'build'
      );

      if (result.isError) {
        return { success: false, error: result.output as string };
      }

      // Vérifier le résultat attendu
      if (step.expectedResult && result.output !== step.expectedResult) {
        return {
          success: false,
          error: `Unexpected result: expected ${step.expectedResult}, got ${result.output}`
        };
      }

      return { success: true, result: result.output };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Exécuter une étape de type 'subagent'
   */
  private async executeSubagentStep(
    step: PlanStep,
    plan: Plan,
    sessionId: string
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    if (!step.subagent) {
      return { success: false, error: 'Subagent step must specify a subagent' };
    }

    // Construire le contexte pour le subagent
    const context = await this.contextBuilder.buildContext({
      sessionId,
      workspaceId: plan.workspaceId,
      projectId: plan.projectId,
      userRequest: step.description || step.name
    });

    // Exécuter le subagent
    const result = await this.runSubagent(
      step.subagent,
      step.description || step.name,
      context,
      sessionId
    );

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, result: result.output };
  }

  /**
   * Exécuter une étape de type 'condition'
   */
  private async executeConditionStep(
    step: PlanStep,
    plan: Plan,
    sessionId: string
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    if (!step.condition) {
      return { success: false, error: 'Condition step must specify a condition' };
    }

    try {
      // Évaluer la condition
      const conditionMet = await this.evaluateCondition(step.condition, plan, sessionId);
      
      if (conditionMet) {
        // Exécuter les étapes enfants
        if (step.steps && step.steps.length > 0) {
          for (const childStep of step.steps) {
            const result = await this.executeStep(childStep, plan, sessionId);
            if (!result.success) {
              return result;
            }
          }
        }
        return { success: true, result: { conditionMet: true } };
      } else {
        // Sauter les étapes enfants
        if (step.steps) {
          for (const childStep of step.steps) {
            childStep.status = 'skipped';
          }
        }
        return { success: true, result: { conditionMet: false, skipped: true } };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Exécuter une étape de type 'parallel'
   */
  private async executeParallelStep(
    step: PlanStep,
    plan: Plan,
    sessionId: string
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    if (!step.steps || step.steps.length === 0) {
      return { success: false, error: 'Parallel step must have child steps' };
    }

    // Limiter le nombre de steps parallèles
    const maxParallel = Math.min(this.config.maxParallelSteps, step.steps.length);
    const batches = this.splitIntoBatches(step.steps, maxParallel);
    
    const results: any[] = [];
    
    for (const batch of batches) {
      const batchPromises = batch.map(childStep => 
        this.executeStep(childStep, plan, sessionId)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({ success: false, error: result.reason as string });
        }
      }
    }

    // Vérifier si tous ont réussi
    const allSuccess = results.every(r => r.success);
    
    if (!allSuccess && !this.shouldContinueOnFailure(step)) {
      const firstError = results.find(r => !r.success)?.error;
      return { success: false, error: firstError || 'One or more parallel steps failed' };
    }

    return { success: true, result: results };
  }

  /**
   * Exécuter une étape de type 'sequence'
   */
  private async executeSequenceStep(
    step: PlanStep,
    plan: Plan,
    sessionId: string
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    if (!step.steps || step.steps.length === 0) {
      return { success: false, error: 'Sequence step must have child steps' };
    }

    const results: any[] = [];
    
    for (const childStep of step.steps) {
      const result = await this.executeStep(childStep, plan, sessionId);
      results.push(result);
      
      if (!result.success && !this.shouldContinueOnFailure(childStep)) {
        return result;
      }
    }

    return { success: true, result: results };
  }

  /**
   * Exécuter une étape de type 'task'
   */
  private async executeTaskStep(
    step: PlanStep,
    plan: Plan,
    sessionId: string
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    // Pour les tâches simples, utiliser l'AgentRuntime
    try {
      const result = await this.agentRuntime.run({
        sessionId,
        input: step.description || step.name,
        streaming: false
      });

      if (result.exitCode !== 0) {
        return { success: false, error: result.stderr || 'Task execution failed' };
      }

      return { success: true, result: result.output };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
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
   * Évaluer une condition
   */
  private async evaluateCondition(
    condition: string,
    plan: Plan,
    sessionId: string
  ): Promise<boolean> {
    // Conditions simples
    if (condition === 'always') return true;
    if (condition === 'never') return false;
    
    // Conditions basées sur l'état du plan
    if (condition.startsWith('plan.')) {
      const property = condition.substring(5);
      return (plan as any)[property] === true;
    }
    
    // Conditions basées sur les résultats
    if (condition.startsWith('result.')) {
      const parts = condition.split('.');
      const stepId = parts[1];
      const property = parts[2];
      
      const stepResult = plan.results[stepId];
      if (stepResult === undefined) return false;
      
      return stepResult[property] === true;
    }
    
    // Conditions basées sur les erreurs
    if (condition.startsWith('error.')) {
      const stepId = condition.substring(6);
      return plan.errors[stepId] !== undefined;
    }
    
    // Conditions personnalisées (à implémenter)
    try {
      // Exécuter via l'agent
      const result = await this.agentRuntime.run({
        sessionId,
        input: `Evaluate this condition: ${condition}. Return only true or false`,
        streaming: false
      });

      if (result.exitCode !== 0) {
        return false;
      }

      return String(result.output || '').trim().toLowerCase().startsWith('true');
    } catch {
      return false;
    }
  }
}
