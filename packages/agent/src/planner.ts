      
import { contextBuilder, ContextBuilder } from './context-builder';
import { ToolRegistry, ToolExecutor } from '@soryos/tool';
import { executionManager } from '@soryos/execution';
import { SessionData, ToolDefinition } from '@soryos/schema';
import { Plan, PlanStep, PlannerConfig, PlannerOptions, PlanResult } from './types';
import { sessionStore } from '@soryos/session';
import { LlmClient } from './llm-client';
import { PLANNER_SYSTEM_PROMPT } from './prompts';

const DEFAULT_CONFIG: PlannerConfig = {
  maxSteps: 20,
  maxParallelSteps: 1,
  defaultTimeoutMs: 120000,
  defaultMaxRetries: 1,
  retryOnFailure: false,
};

export class Planner {
  private config: PlannerConfig;
  private contextBuilder: ContextBuilder;
  private toolRegistry: ToolRegistry;
  private llmClient: LlmClient;
  private toolExecutor: ToolExecutor;
  private plans: Map<string, Plan> = new Map();

  constructor(
    contextBuilder: ContextBuilder,
    toolRegistry: ToolRegistry,
    llmClient: LlmClient,
    config: Partial<PlannerConfig> = {}
  ) {
    this.contextBuilder = contextBuilder;
    this.toolRegistry = toolRegistry;
    this.llmClient = llmClient;
    this.toolExecutor = new ToolExecutor(toolRegistry);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async planAndExecute(session: SessionData, emit: (event: any) => void): Promise<void> {
    const userRequest = session.messages[session.messages.length - 1].content;
    const planResult = await this.createPlan({ sessionId: session.id, userRequest });

    if (!planResult.success || !planResult.plan) {
      const errorMessage = `Failed to create plan: ${planResult.error}`;
      emit({ type: 'error', message: errorMessage });
      if (planResult.error?.toLowerCase().includes('timeout')) {
          const timeoutMessage = `⏱️ **Request Timed Out**\n\nThe AI took too long to respond. This can happen with complex tasks.\n\n**To continue:**\n• Send a new message to resume where we left off\n• Try breaking your request into smaller steps\n• Type "continue" to pick up from here\n\nYour progress has been saved.`;
          const newMessages = [...session.messages, { id: `msg-${Date.now()}`, role: 'assistant' as const, content: timeoutMessage }];
          sessionStore.update(session.id, { messages: newMessages });
      }
      return;
    }

    const plan = planResult.plan;
    emit({ type: 'plan', plan });

    await this.executePlan(plan.id, session.id, emit);
  }

  async createPlan(options: PlannerOptions): Promise<PlanResult> {
    const { sessionId, userRequest } = options;
    const planId = `plan-${sessionId}-${Date.now()}`;

    try {
      const context = await this.contextBuilder.buildContext({ sessionId, userRequest });
      const tools: ToolDefinition[] = this.toolRegistry.getToolDefinitions();

      const systemPrompt = `${PLANNER_SYSTEM_PROMPT}\n\n# Available Tools\n${tools.map((t: ToolDefinition) => t.name).join(', ')}`;
      
      const fullPrompt = `Context:\n${context.contextItems.map(i => i.content).join('\n')}\n\nUser Request: ${userRequest}\n\nPlan:`;

      const modelResponse = await this.llmClient.generate({
        prompt: fullPrompt,
        systemPrompt: systemPrompt,
        model: sessionStore.get(sessionId)?.model || 'claude-3-opus-20240229',
      });

      if (!modelResponse.text) {
        throw new Error('LLM failed to generate a plan. The response was empty.');
      }

      // The model might return a markdown code block for JSON, so we strip it.
      const jsonString = modelResponse.text.replace(/```json/g, '').replace(/```/g, '').trim();
      const rawSteps: Array<Record<string, any>> = JSON.parse(jsonString);

      const steps: PlanStep[] = rawSteps.map((step, index) => ({
        id: `${planId}-step-${index}`,
        name: step.name || `Step ${index + 1}`,
        description: step.description || '',
        type: step.type === 'tool' ? 'tool' : 'task',
        tool: step.tool || step.toolName,
        parameters: step.parameters,
        status: 'pending',
      }));

      const plan: Plan = {
        id: planId,
        name: userRequest.slice(0, 80),
        description: userRequest,
        sessionId,
        userRequest,
        steps,
        status: 'pending',
        currentStepIndex: 0,
        progress: 0,
        createdAt: Date.now(),
        results: {},
        errors: {},
      };

      this.plans.set(planId, plan);

      return { success: true, plan };

    } catch (error: any) {
      console.error(`[Planner] Error creating plan for session ${sessionId}:`, error);
      return { success: false, error: error.message };
    }
  }

  async executePlan(planId: string, sessionId: string, emit: (event: any) => void): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan) {
      emit({ type: 'error', message: `Plan ${planId} not found for execution.` });
      return;
    }

    plan.status = 'running';
    emit({ type: 'plan_update', plan });

    for (let i = plan.currentStepIndex || 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      plan.currentStepIndex = i;

      const session = sessionStore.get(sessionId);
      if (!session || session.agent_running === false) {
        plan.status = 'paused';
        emit({ type: 'plan_update', plan });
        console.log(`[Planner] Plan execution paused for session ${sessionId}.`);
        return;
      }

      step.status = 'running';
      emit({ type: 'step_update', step });

      try {
        emit({ type: 'thought', message: `Thinking about the next step: ${step.name}` });
        
        if (step.type === 'tool') {
          if (!step.tool) {
            throw new Error(`Tool step "${step.name}" is missing a tool name.`);
          }
          emit({ type: 'thought', message: `Executing tool: \`${step.tool}\`...` });
          const provider = await executionManager.getProvider(sessionId, 'local');
          const result = await this.toolExecutor.execute(step.tool, step.parameters, provider, session, 'build');
          
          step.result = typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2);
          if (result.isError) {
            throw new Error(String(step.result));
          }
        } else if (step.type === 'task') {
          step.result = `Task "${step.name}" is considered complete.`;
        } else {
          throw new Error(`Unknown step type: "${step.type}"`);
        }
        
        step.status = 'completed';
        emit({ type: 'step_update', step });

      } catch (error: any) {
        console.error(`[Planner] Error executing step ${step.id} for session ${sessionId}:`, error);
        step.status = 'failed';
        step.error = error.message;
        plan.status = 'failed';
        plan.errors[step.id] = error.message;
        emit({ type: 'step_update', step });
        emit({ type: 'plan_update', plan });
        emit({ type: 'error', message: `Execution failed on step "${step.name}": ${error.message}` });
        return; // Stop execution on error
      }
    }

    plan.status = 'completed';
    emit({ type: 'plan_update', plan });
    emit({ type: 'done', message: "All steps completed successfully." });
  }

  async resumePlan(planId: string, sessionId: string, emit: (event: any) => void): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan) {
      emit({ type: 'error', message: `Cannot resume: Plan ${planId} not found.` });
      return;
    }

    console.log(`[Planner] Resuming plan ${planId} from step ${plan.currentStepIndex || 0}`);
    sessionStore.update(sessionId, { agent_running: true });
    
    await this.executePlan(plan.id, sessionId, emit);
  }

  getPlan(planId: string): Plan | undefined {
    return this.plans.get(planId);
  }

  getAllPlans(): Plan[] {
    return Array.from(this.plans.values());
  }
}
