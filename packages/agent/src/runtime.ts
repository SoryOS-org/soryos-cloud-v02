
import { AgentRunOptions, AgentState } from './types';
import { contextBuilder } from './context-builder';
import { Planner } from './planner';
import { sessionStore } from '@soryos/session';
import { toolRegistry } from '@soryos/tool';
import { llmClient } from './llm-client';
import { EventEmitter } from 'events';

class AgentRuntime extends EventEmitter {
  private state: AgentState = { isRunning: false, isStreaming: false };
  private planner: Planner | undefined;

  constructor() {
    super();
  }

  private getPlanner(): Planner {
    if (this.planner) {
      return this.planner;
    }
    this.planner = new Planner(contextBuilder, toolRegistry, llmClient);
    return this.planner;
  }

  async run(options: AgentRunOptions): Promise<void> {
    if (this.state.isRunning) {
      throw new Error('Agent is already running.');
    }

    this.state.isRunning = true;
    this.state.currentSessionId = options.sessionId;
    this.state.currentMessageId = options.messageId;
    this.emit('start', options);

    try {
      const planner = this.getPlanner();
      const session = sessionStore.get(options.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${options.sessionId}`);
      }
      await planner.planAndExecute(session, (event) => {
        this.emit('event', event);
        options.emit?.(event);
      });
    } catch (error) {
      if (error instanceof Error) {
        this.state.lastError = error;
      }
      this.emit('error', error);
    } finally {
      this.state.isRunning = false;
      this.emit('end');
    }
  }
}

export const agentRuntime = new AgentRuntime();
