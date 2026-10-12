/**
 * @soryos/agent
 * Agent Runtime - Core agent execution engine.
 * 
 * Features:
 * - Multi-turn conversation support
 * - Streaming output with JSON parsing
 * - Tool execution with permissions
 * - Session management
 * - Real-time event streaming
 */

import { AgentRunOptions, AgentRunResult, AgentStep, AgentMessage, ToolCall, ToolResult, AgentState } from './types';
import { getAgentDefinition, getDefaultAgent, DEFAULT_AGENT_CONFIG } from './config';
import { agentProviderRegistry } from './providers';
import { GlobalEventBus } from '@soryos/bus';
import { ToolExecutor, ToolRegistry } from '@soryos/tool';
import { sessionStore, messageStore, SessionStore } from '@soryos/session';
import { ErrorRecoveryManager, getErrorRecoveryManager, classifyError, ClassifiedError } from './error-handler';
import { streamChat, normalizeProviderId, providerForModel } from './llm-client';

/**
 * Agent Runtime
 * 
 * Core class for executing AI agents with multi-turn conversation support.
 */
export class AgentRuntime {
  private state: AgentState = {
    isRunning: false,
    isStreaming: false
  };

  private jsonBuffer: string = '';
  private streamingContent: string = '';
  private lastAssistantMessageId: string | null = null;
  private messageCounter: number = 0;
  private errorRecoveryManager: ErrorRecoveryManager | null = null;

  constructor() {
    // Initialize tool registry
    this.initializeTools();
    
    // Initialize error recovery manager (lazy initialization)
    this.initializeErrorRecovery();
  }

  /**
   * Initialize error recovery manager
   */
  private async initializeErrorRecovery(): Promise<void> {
    try {
      this.errorRecoveryManager = getErrorRecoveryManager(sessionStore as any);
    } catch {
      // Ignore recovery initialization failures in dev mode
    }
  }

  /**
   * Set error recovery manager with real session store
   */
  setErrorRecoveryManager(manager: ErrorRecoveryManager): void {
    this.errorRecoveryManager = manager;
  }

  /**
   * Initialize tool registry
   */
  private initializeTools(): void {
    // Tools will be registered dynamically
    console.log('[Agent] Initializing tool registry');
  }

  /**
   * Run the agent with the given options
   */
  async run(options: AgentRunOptions | any): Promise<AgentRunResult> {
    const startTime = Date.now();
    const session = options.session;
    const sessionId = options.sessionId || session?.id || `session-${Date.now()}`;
    const lastUserMsg = session?.messages?.slice().reverse().find((m: any) => m.role === 'user');
    const input = options.input || lastUserMsg?.content || '';
    const emit = options.emit;

    const model = options.model || options.modelId || session?.model;
    const normalizedOptions: AgentRunOptions = {
      ...options,
      sessionId,
      input: options.input || options.userMessage || input,
      streaming: options.streaming ?? true,
      model,
      provider:
        normalizeProviderId(options.provider) ||
        providerForModel(model) ||
        normalizeProviderId(session?.provider),
    };

    // Set running state
    this.state = {
      ...this.state,
      isRunning: true,
      currentSessionId: sessionId
    };

    // Emit start event
    GlobalEventBus.emit('agent.started', { sessionId, input });

    // Setup SSE bridge if emit is provided
    const unsubscribers: Array<() => void> = [];
    if (emit) {
      emit({ type: "status", message: "Initialisation de l'agent..." });

      const onStreamingText = (data: any) => {
        if (data.sessionId === sessionId && data.text) {
          emit({ type: "text", delta: data.text });
        }
      };
      const onStatus = (data: any) => {
        if (data.sessionId === sessionId && data.message) {
          emit({ type: "status", message: data.message });
        }
      };
      const onToolStart = (data: any) => {
        if (data.sessionId === sessionId) {
          emit({
            type: "tool_start",
            id: data.id || `tool-${Date.now()}`,
            name: data.toolName || data.name || "tool",
            input: data.input,
          });
        }
      };
      const onToolEnd = (data: any) => {
        if (data.sessionId === sessionId) {
          emit({
            type: "tool_end",
            id: data.id || `tool-${Date.now()}`,
            output: data.output || data.result || "Succès",
            isError: Boolean(data.error),
          });
        }
      };

      GlobalEventBus.on('agent.streaming.text', onStreamingText);
      GlobalEventBus.on('agent.status', onStatus);
      GlobalEventBus.on('agent.tool.started', onToolStart);
      GlobalEventBus.on('agent.tool.completed', onToolEnd);

      unsubscribers.push(() => {
        GlobalEventBus.off('agent.streaming.text', onStreamingText);
        GlobalEventBus.off('agent.status', onStatus);
        GlobalEventBus.off('agent.tool.started', onToolStart);
        GlobalEventBus.off('agent.tool.completed', onToolEnd);
      });
    }

    try {
      // Get agent configuration
      const agentConfig = this.getAgentConfig(normalizedOptions);
      const provider = this.getProvider(agentConfig.provider);

      if (!provider) {
        throw new Error(`Provider ${agentConfig.provider} not found`);
      }

      // Initialize conversation context
      const context = await this.buildConversationContext(sessionId, input);

      // Execute with streaming if enabled
      if (normalizedOptions.streaming) {
        return await this.runWithStreaming(normalizedOptions, context, provider, agentConfig);
      } else {
        return await this.runWithoutStreaming(normalizedOptions, context, provider, agentConfig);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorObj = error instanceof Error ? error : new Error(errorMessage);
      if (emit) {
        emit({ type: "error", message: errorMessage });
      }
      
      // Use error recovery manager if available
      if (this.errorRecoveryManager) {
        const classification = await this.errorRecoveryManager.handleError(errorObj, {
          sessionId,
          action: 'agent.run',
          retryable: true
        });
        
        // Emit classified error event
        GlobalEventBus.emit('agent.error', { 
          sessionId, 
          error: classification.error,
          input: options.input 
        });

        // Set error state with classification
        this.state = {
          ...this.state,
          isRunning: false,
          lastError: errorObj,
          lastErrorClassification: classification.error
        };

        // Return error result with classification
        return {
          id: `run-${Date.now()}`,
          sessionId,
          input: options.input,
          output: '',
          steps: [],
          exitCode: 1,
          stdout: '',
          stderr: classification.error.userMessage,
          errorType: classification.error.type,
          errorCode: classification.error.code,
          isRetryable: classification.error.isRetryable,
          recoverySuggestions: classification.error.recoverySuggestions,
          durationMs: Date.now() - startTime,
          model: options.model || DEFAULT_AGENT_CONFIG.defaultModel,
          provider: options.provider || DEFAULT_AGENT_CONFIG.defaultProvider,
          timestamp: Date.now()
        };
      } else {
        // Fallback to basic error handling
        // Emit error event
        GlobalEventBus.emit('agent.error', { 
          sessionId, 
          error: errorMessage,
          input: options.input 
        });

        // Set error state
        this.state = {
          ...this.state,
          isRunning: false,
          lastError: errorObj
        };

        // Return error result
        return {
          id: `run-${Date.now()}`,
          sessionId,
          input: options.input,
          output: '',
          steps: [],
          exitCode: 1,
          stdout: '',
          stderr: errorMessage,
          durationMs: Date.now() - startTime,
          model: options.model || DEFAULT_AGENT_CONFIG.defaultModel,
          provider: options.provider || DEFAULT_AGENT_CONFIG.defaultProvider,
          timestamp: Date.now()
        };
      }

    } finally {
      // Unsubscribe SSE listeners
      unsubscribers.forEach((unsub) => {
        try { unsub(); } catch {}
      });

      if (emit) {
        emit({ type: "done" });
      }

      // Reset streaming state
      this.jsonBuffer = '';
      this.streamingContent = '';
      this.lastAssistantMessageId = null;

      // Reset running state if not streaming
      if (!normalizedOptions.streaming) {
        this.state = {
          ...this.state,
          isRunning: false,
          currentSessionId: undefined
        };
      }

      // Emit end event
      GlobalEventBus.emit('agent.ended', { sessionId, input });
    }
  }

  /**
   * Run the agent with streaming support
   */
  async runWithStreaming(
    options: AgentRunOptions,
    context: any,
    provider: any,
    agentConfig: any
  ): Promise<AgentRunResult> {
    const startTime = Date.now();
    const sessionId = options.sessionId || `session-${Date.now()}`;
    const steps: AgentStep[] = [];
    let stdout = '';
    let stderr = '';

    // Set streaming state
    this.state = {
      ...this.state,
      isStreaming: true
    };

    // Emit streaming start event
    GlobalEventBus.emit('agent.streaming.started', { sessionId, input: options.input });

    try {
      // Build the full prompt
      const prompt = this.buildPrompt(context, options.input);

      // Execute the provider with streaming
      const result = await this.executeProviderWithStreaming(
        provider,
        prompt,
        agentConfig,
        options
      );

      // Update state
      stdout = result.stdout || '';
      stderr = result.stderr || '';

      // Build final result
      return {
        id: `run-${Date.now()}`,
        sessionId,
        input: options.input,
        output: this.streamingContent,
        steps,
        exitCode: result.exitCode || 0,
        stdout,
        stderr,
        durationMs: Date.now() - startTime,
        model: agentConfig.model,
        provider: agentConfig.provider,
        timestamp: Date.now()
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Emit error event
      GlobalEventBus.emit('agent.streaming.error', { 
        sessionId, 
        error: errorMessage,
        input: options.input 
      });

      throw error;
    } finally {
      // Reset streaming state
      this.state = {
        ...this.state,
        isStreaming: false
      };

      // Emit streaming end event
      GlobalEventBus.emit('agent.streaming.ended', { sessionId, input: options.input });
    }
  }

  /**
   * Run the agent without streaming
   */
  async runWithoutStreaming(
    options: AgentRunOptions,
    context: any,
    provider: any,
    agentConfig: any
  ): Promise<AgentRunResult> {
    const startTime = Date.now();
    const sessionId = options.sessionId || `session-${Date.now()}`;

    try {
      // Build the full prompt
      const prompt = this.buildPrompt(context, options.input);

      // Execute the provider
      const result = await this.executeProvider(
        provider,
        prompt,
        agentConfig,
        options
      );

      // Process the result
      const output = this.processProviderResult(result, sessionId, options);

      // Build final result
      return {
        id: `run-${Date.now()}`,
        sessionId,
        input: options.input,
        output: output.content,
        steps: output.steps,
        exitCode: result.exitCode || 0,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        durationMs: Date.now() - startTime,
        model: agentConfig.model,
        provider: agentConfig.provider,
        timestamp: Date.now()
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * Execute provider with streaming support
   */
  private async executeProviderWithStreaming(
    provider: any,
    prompt: string,
    agentConfig: any,
    options: AgentRunOptions
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const sessionId = options.sessionId || `session-${Date.now()}`;
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    // Create stdout handler
    const handleStdout = (data: string) => {
      stdoutChunks.push(data);
      this.processStreamingChunk(data, sessionId, options);
    };

    // Create stderr handler
    const handleStderr = (data: string) => {
      stderrChunks.push(data);
      console.error('[Agent] Stderr:', data);
    };

    // Real streaming call to the provider API (key resolved via @soryos/credentials)
    const exitCode = 0;
    const providerId =
      normalizeProviderId(agentConfig.provider) || providerForModel(agentConfig.model) || 'opencode-zen';
    await streamChat({
      providerId,
      model: agentConfig.model,
      sessionId,
      messages: [
        { role: 'system', content: 'Tu es SoryOS-Code, un assistant de développement logiciel. Réponds dans la langue de l\'utilisateur.' },
        { role: 'user', content: prompt },
      ],
      onDelta: (text) => {
        stdoutChunks.push(text);
        this.processTextChunk(text, sessionId, Date.now());
      },
    });
    void handleStdout;
    void provider;

    // Return combined result
    return {
      stdout: stdoutChunks.join(''),
      stderr: stderrChunks.join(''),
      exitCode
    };
  }

  /**
   * Process streaming chunk from provider
   */
  private processStreamingChunk(data: string, sessionId: string, options: AgentRunOptions): void {
    // Capture timestamp
    const eventTimestamp = Date.now();

    // Add to buffer
    this.jsonBuffer += data;

    // Try to parse complete JSON lines
    const lines = this.jsonBuffer.split('\n');
    this.jsonBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      try {
        const parsedData = JSON.parse(trimmedLine);
        this.processParsedData(parsedData, sessionId, eventTimestamp, options);
      } catch (parseError) {
        // Not valid JSON, might be partial or non-JSON output
        console.log('[Agent] Non-JSON output:', trimmedLine.substring(0, 200));
        
        // Treat as plain text
        this.processTextChunk(trimmedLine, sessionId, eventTimestamp);
      }
    }
  }

  /**
   * Process parsed JSON data from streaming
   */
  private processParsedData(
    parsedData: Record<string, unknown>,
    sessionId: string,
    timestamp: number,
    options: AgentRunOptions
  ): void {
    try {
      // Handle message type (Claude Code new format)
      if (parsedData.type === 'message') {
        this.processMessageType(parsedData, sessionId, timestamp);
      }
      // Handle result type
      else if (parsedData.type === 'result') {
        this.processResultType(parsedData, sessionId, timestamp);
      }
      // Handle tool_call type (Cursor Agent)
      else if (parsedData.type === 'tool_call') {
        this.processToolCallType(parsedData, sessionId, timestamp);
      }
      // Handle init type
      else if (parsedData.type === 'init') {
        console.log('[Agent] Agent initialized:', parsedData);
      }
      // Handle old Claude format
      else if (parsedData.type === 'assistant') {
        this.processAssistantType(parsedData, sessionId, timestamp);
      }
      // Handle user type
      else if (parsedData.type === 'user') {
        console.log('[Agent] User message:', parsedData);
      }
      // Handle unknown types
      else {
        console.log('[Agent] Unknown type:', parsedData.type, parsedData);
      }

      // Emit raw data event
      GlobalEventBus.emit('agent.streaming.data', { 
        sessionId, 
        data: parsedData,
        timestamp 
      });

    } catch (error) {
      console.error('[Agent] Error processing parsed data:', error);
    }
  }

  /**
   * Process message type (Claude Code new format)
   */
  private processMessageType(
    parsedData: Record<string, unknown>,
    sessionId: string,
    timestamp: number
  ): void {
    const role = parsedData.role as string;

    if (role === 'user') {
      // User message - update status
      const content = typeof parsedData.content === 'string' 
        ? parsedData.content 
        : (parsedData.content as any)?.content?.[0]?.content || '';
      
      GlobalEventBus.emit('agent.status', { 
        sessionId, 
        status: 'processing',
        message: content 
      });

    } else if (role === 'assistant') {
      // Assistant message
      let content = '';

      if (typeof parsedData.content === 'string') {
        content = parsedData.content;
      } else if (Array.isArray(parsedData.content)) {
        // Concatenate all text blocks
        content = (parsedData.content as any[])
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join('\n');
      }

      if (!content) return;

      const isDelta = parsedData.delta === true;

      if (isDelta) {
        // Streaming delta - accumulate content
        this.streamingContent += content;

        // Update existing message or create new one
        if (this.lastAssistantMessageId) {
          this.updateMessage(sessionId, this.lastAssistantMessageId, this.streamingContent, timestamp);
        } else {
          this.lastAssistantMessageId = this.addMessage(
            sessionId,
            content,
            'assistant',
            timestamp
          );
        }

        // Emit streaming text event
        GlobalEventBus.emit('agent.streaming.text', { 
          sessionId,
          text: content,
          delta: true,
          timestamp 
        });

      } else {
        // Complete message
        this.streamingContent = content;
        this.lastAssistantMessageId = this.addMessage(
          sessionId,
          content,
          'assistant',
          timestamp
        );

        // Emit complete message event
        GlobalEventBus.emit('agent.streaming.message', { 
          sessionId,
          messageId: this.lastAssistantMessageId,
          content,
          role: 'assistant',
          delta: false,
          timestamp 
        });
      }
    }
  }

  /**
   * Process result type
   */
  private processResultType(
    parsedData: Record<string, unknown>,
    sessionId: string,
    timestamp: number
  ): void {
    console.log('[Agent] Result type detected');
    
    // Reset streaming content
    this.streamingContent = '';

    // Emit result event
    GlobalEventBus.emit('agent.streaming.result', { 
      sessionId,
      result: parsedData,
      timestamp 
    });
  }

  /**
   * Process tool_call type (Cursor Agent)
   */
  private processToolCallType(
    parsedData: Record<string, unknown>,
    sessionId: string,
    timestamp: number
  ): void {
    const subtype = parsedData.subtype as string;

    if (subtype === 'started') {
      // Tool call started
      const toolName = (parsedData as any).name || Object.keys(parsedData).find(k => k !== 'type' && k !== 'subtype');
      
      GlobalEventBus.emit('agent.tool.started', { 
        sessionId,
        toolName,
        timestamp 
      });

    } else if (subtype === 'completed') {
      // Tool call completed
      const toolName = (parsedData as any).name || Object.keys(parsedData).find(k => k !== 'type' && k !== 'subtype');
      const result = (parsedData as any).result;

      // Handle the tool result
      this.processToolResult(toolName, result, sessionId, timestamp);
    }
  }

  /**
   * Process assistant type (old Claude format)
   */
  private processAssistantType(
    parsedData: Record<string, unknown>,
    sessionId: string,
    timestamp: number
  ): void {
    const contentBlocks = (parsedData as any).message?.content || [];

    for (let i = 0; i < contentBlocks.length; i++) {
      const block = contentBlocks[i];
      const blockTimestamp = timestamp + i;

      if (block.type === 'text' && block.text?.trim()) {
        // Text content
        const messageId = this.addMessage(
          sessionId,
          block.text,
          'assistant',
          blockTimestamp
        );
        this.lastAssistantMessageId = messageId;

        // Emit text event
        GlobalEventBus.emit('agent.streaming.text', { 
          sessionId,
          text: block.text,
          delta: false,
          timestamp: blockTimestamp
        });

      } else if (block.type === 'tool_use') {
        // Tool use
        this.processToolUse(block, sessionId, blockTimestamp);
      }
    }
  }

  /**
   * Process text chunk (non-JSON)
   */
  private processTextChunk(text: string, sessionId: string, timestamp: number): void {
    // Accumulate text
    this.streamingContent += text;

    // Update or create message
    if (this.lastAssistantMessageId) {
      this.updateMessage(sessionId, this.lastAssistantMessageId, this.streamingContent, timestamp);
    } else {
      this.lastAssistantMessageId = this.addMessage(
        sessionId,
        text,
        'assistant',
        timestamp
      );
    }

    // Emit text event
    GlobalEventBus.emit('agent.streaming.text', { 
      sessionId,
      text,
      delta: true,
      timestamp 
    });
  }

  /**
   * Process tool use from old Claude format
   */
  private processToolUse(
    toolUse: Record<string, unknown>,
    sessionId: string,
    timestamp: number
  ): void {
    const toolName = toolUse.name as string;
    const input = toolUse.input as Record<string, unknown>;

    console.log(`[Agent] Tool use: ${toolName}`, input);

    // Emit tool call event
    GlobalEventBus.emit('agent.tool.call', { 
      sessionId,
      toolName,
      input,
      timestamp 
    });

    // Handle different tool types
    switch (toolName) {
      case 'TodoWrite':
        this.processTodoWriteTool(input, sessionId, timestamp);
        break;
      case 'Write':
        this.processWriteTool(input, sessionId, timestamp);
        break;
      case 'Edit':
        this.processEditTool(input, sessionId, timestamp);
        break;
      case 'Read':
        this.processReadTool(input, sessionId, timestamp);
        break;
      case 'Bash':
      case 'bash':
        this.processBashTool(input, sessionId, timestamp);
        break;
      case 'WebSearch':
      case 'webSearch':
        this.processWebSearchTool(input, sessionId, timestamp);
        break;
      default:
        // Handle MCP tools or unknown tools
        this.processUnknownTool(toolName, input, sessionId, timestamp);
    }
  }

  /**
   * Process tool result from Cursor Agent
   */
  private processToolResult(
    toolName: string,
    result: unknown,
    sessionId: string,
    timestamp: number
  ): void {
    console.log(`[Agent] Tool result: ${toolName}`, result);

    // Emit tool result event
    GlobalEventBus.emit('agent.tool.result', { 
      sessionId,
      toolName,
      result,
      timestamp 
    });

    // Handle different tool results
    if (toolName === 'writeToolCall' || toolName === 'Write') {
      this.processWriteToolResult(result, sessionId, timestamp);
    } else if (toolName === 'editToolCall' || toolName === 'Edit') {
      this.processEditToolResult(result, sessionId, timestamp);
    } else if (toolName === 'readToolCall' || toolName === 'Read') {
      this.processReadToolResult(result, sessionId, timestamp);
    } else if (toolName === 'shellToolCall' || toolName === 'Bash' || toolName === 'bash') {
      this.processBashToolResult(result, sessionId, timestamp);
    }
  }

  /**
   * Process TodoWrite tool
   */
  private processTodoWriteTool(
    input: Record<string, unknown>,
    sessionId: string,
    timestamp: number
  ): void {
    const todos = (input.todos as any[]) || [];
    const todosWithFields = todos.map((todo: any, index: number) => ({
      content: todo.content,
      id: todo.id || `todo-${index + 1}`,
      priority: 'medium' as const,
      status: todo.status || 'pending'
    }));

    const messageId = this.addMessage(
      sessionId,
      '',
      'assistant',
      timestamp,
      { todos: todosWithFields }
    );
    this.lastAssistantMessageId = messageId;

    GlobalEventBus.emit('agent.tool.todos', { 
      sessionId,
      todos: todosWithFields,
      timestamp 
    });
  }

  /**
   * Process Write tool
   */
  private processWriteTool(
    input: Record<string, unknown>,
    sessionId: string,
    timestamp: number
  ): void {
    const filePath = input.file_path as string || input.path as string || '';
    const content = input.content as string || input.fileText as string || '';

    const messageId = this.addMessage(
      sessionId,
      '',
      'assistant',
      timestamp,
      {
        edits: {
          filePath,
          oldString: '',
          newString: content
        }
      }
    );
    this.lastAssistantMessageId = messageId;

    GlobalEventBus.emit('agent.tool.write', { 
      sessionId,
      filePath,
      content,
      timestamp 
    });
  }

  /**
   * Process Edit tool
   */
  private processEditTool(
    input: Record<string, unknown>,
    sessionId: string,
    timestamp: number
  ): void {
    const filePath = input.file_path as string || input.path as string || '';
    const oldString = input.old_string as string || input.oldText as string || '';
    const newString = input.new_string as string || input.newText as string || '';

    const messageId = this.addMessage(
      sessionId,
      '',
      'assistant',
      timestamp,
      {
        edits: {
          filePath,
          oldString,
          newString
        }
      }
    );
    this.lastAssistantMessageId = messageId;

    GlobalEventBus.emit('agent.tool.edit', { 
      sessionId,
      filePath,
      oldString,
      newString,
      timestamp 
    });
  }

  /**
   * Process Read tool
   */
  private processReadTool(
    input: Record<string, unknown>,
    sessionId: string,
    timestamp: number
  ): void {
    const filePath = input.file_path as string || input.path as string || '';

    const messageId = this.addMessage(
      sessionId,
      '',
      'assistant',
      timestamp,
      {
        read: {
          filePath
        }
      }
    );
    this.lastAssistantMessageId = messageId;

    GlobalEventBus.emit('agent.tool.read', { 
      sessionId,
      filePath,
      timestamp 
    });
  }

  /**
   * Process Bash tool
   */
  private processBashTool(
    input: Record<string, unknown>,
    sessionId: string,
    timestamp: number
  ): void {
    const command = input.command as string || '';

    const messageId = this.addMessage(
      sessionId,
      '',
      'assistant',
      timestamp,
      {
        bash: {
          command,
          output: input.description as string || '',
          exitCode: 0
        }
      }
    );
    this.lastAssistantMessageId = messageId;

    GlobalEventBus.emit('agent.tool.bash', { 
      sessionId,
      command,
      timestamp 
    });
  }

  /**
   * Process WebSearch tool
   */
  private processWebSearchTool(
    input: Record<string, unknown>,
    sessionId: string,
    timestamp: number
  ): void {
    const query = input.query as string || '';
    const results = input.results as string || '';

    const messageId = this.addMessage(
      sessionId,
      '',
      'assistant',
      timestamp,
      {
        webSearch: {
          query,
          results
        }
      }
    );
    this.lastAssistantMessageId = messageId;

    GlobalEventBus.emit('agent.tool.webSearch', { 
      sessionId,
      query,
      results,
      timestamp 
    });
  }

  /**
   * Process unknown tool (MCP or custom)
   */
  private processUnknownTool(
    toolName: string,
    input: Record<string, unknown>,
    sessionId: string,
    timestamp: number
  ): void {
    console.log(`[Agent] Unknown tool: ${toolName}`, input);

    const messageId = this.addMessage(
      sessionId,
      '',
      'assistant',
      timestamp,
      {
        mcpTool: {
          toolName,
          input,
          output: null,
          status: 'running' as const
        }
      }
    );
    this.lastAssistantMessageId = messageId;

    GlobalEventBus.emit('agent.tool.unknown', { 
      sessionId,
      toolName,
      input,
      timestamp 
    });
  }

  /**
   * Process Write tool result
   */
  private processWriteToolResult(
    result: unknown,
    sessionId: string,
    timestamp: number
  ): void {
    const resultObj = result as Record<string, unknown>;
    const filePath = resultObj.path as string || '';
    const content = resultObj.fileText as string || resultObj.content as string || '';

    // Update the message with the result
    if (this.lastAssistantMessageId) {
      this.updateMessage(
        sessionId,
        this.lastAssistantMessageId,
        this.streamingContent,
        timestamp,
        {
          edits: {
            filePath,
            oldString: '',
            newString: content
          }
        }
      );
    }

    GlobalEventBus.emit('agent.tool.write.result', { 
      sessionId,
      filePath,
      content,
      timestamp 
    });
  }

  /**
   * Process Edit tool result
   */
  private processEditToolResult(
    result: unknown,
    sessionId: string,
    timestamp: number
  ): void {
    const resultObj = result as Record<string, unknown>;
    const filePath = resultObj.path as string || '';
    const oldString = resultObj.oldText as string || resultObj.oldString as string || '';
    const newString = resultObj.newText as string || resultObj.newString as string || '';

    // Update the message with the result
    if (this.lastAssistantMessageId) {
      this.updateMessage(
        sessionId,
        this.lastAssistantMessageId,
        this.streamingContent,
        timestamp,
        {
          edits: {
            filePath,
            oldString,
            newString
          }
        }
      );
    }

    GlobalEventBus.emit('agent.tool.edit.result', { 
      sessionId,
      filePath,
      oldString,
      newString,
      timestamp 
    });
  }

  /**
   * Process Read tool result
   */
  private processReadToolResult(
    result: unknown,
    sessionId: string,
    timestamp: number
  ): void {
    const resultObj = result as Record<string, unknown>;
    const filePath = resultObj.path as string || '';
    const content = resultObj.content as string || '';

    // Update the message with the result
    if (this.lastAssistantMessageId) {
      this.updateMessage(
        sessionId,
        this.lastAssistantMessageId,
        this.streamingContent,
        timestamp,
        {
          read: {
            filePath,
            content
          }
        }
      );
    }

    GlobalEventBus.emit('agent.tool.read.result', { 
      sessionId,
      filePath,
      content,
      timestamp 
    });
  }

  /**
   * Process Bash tool result
   */
  private processBashToolResult(
    result: unknown,
    sessionId: string,
    timestamp: number
  ): void {
    const resultObj = result as Record<string, unknown>;
    const command = resultObj.command as string || '';
    const output = resultObj.stdout as string || resultObj.output as string || '';
    const exitCode = resultObj.exitCode as number || 0;

    // Update the message with the result
    if (this.lastAssistantMessageId) {
      this.updateMessage(
        sessionId,
        this.lastAssistantMessageId,
        this.streamingContent,
        timestamp,
        {
          bash: {
            command,
            output,
            exitCode
          }
        }
      );
    }

    GlobalEventBus.emit('agent.tool.bash.result', { 
      sessionId,
      command,
      output,
      exitCode,
      timestamp 
    });
  }

  /**
   * Execute provider without streaming
   */
  private async executeProvider(
    provider: any,
    prompt: string,
    agentConfig: any,
    options: AgentRunOptions
  ): Promise<{ stdout: string; stderr: string; exitCode: number; result?: unknown }> {
    // For non-streaming, we'll use generate
    const result = await provider.generate({
      messages: [{ role: 'user', content: prompt }],
      ...options
    });
    
    return {
      stdout: result.text || '',
      stderr: '',
      exitCode: 0,
      result
    };
  }

  /**
   * Process provider result for non-streaming
   */
  private processProviderResult(
    result: { stdout: string; stderr: string; exitCode: number; result?: { content?: string } | unknown },
    sessionId: string,
    options: AgentRunOptions
  ): { content: string; steps: AgentStep[] } {
    const nested = result.result as { content?: string } | undefined | null;
    const content = result.stdout || nested?.content || '';
    const steps: AgentStep[] = [];

    // Add text step
    if (content) {
      steps.push({
        type: 'text',
        text: content,
        timestamp: Date.now()
      });
    }

    return { content, steps };
  }

  /**
   * Build conversation context
   */
  private async buildConversationContext(
    sessionId: string,
    newInput: string
  ): Promise<{ messages: Array<{ role: string; content: string }>; context: Record<string, unknown> }> {
    const messages: Array<{ role: string; content: string }> = [];
    const context: Record<string, unknown> = {};

    // Get existing messages from session
    try {
      const sessionMessages = await messageStore.getBySession(sessionId);
      
      for (const msg of sessionMessages) {
        messages.push({
          role: (msg as any).role || 'user',
          content: (msg as any).content || ''
        });
      }
    } catch (error) {
      console.warn('[Agent] Failed to get session messages:', error);
    }

    // Add new input
    messages.push({
      role: 'user',
      content: newInput
    });

    // Add context from session
    try {
      const session = typeof sessionStore !== 'undefined' && sessionStore?.get 
        ? sessionStore.get(sessionId) 
        : (typeof SessionStore !== 'undefined' && typeof SessionStore.get === 'function' 
            ? SessionStore.get(sessionId) 
            : undefined);
      if (session) {
        context.session = session;
      }
    } catch (error) {
      console.warn('[Agent] Failed to get session context:', error);
    }

    return { messages, context };
  }

  /**
   * Build the final prompt
   */
  private buildPrompt(
    context: { messages: Array<{ role: string; content: string }>; context: Record<string, unknown> },
    newInput: string
  ): string {
    // For now, just return the new input
    // This can be enhanced to include system prompts, context, etc.
    return newInput;
  }

  /**
   * Get agent configuration
   */
  private getAgentConfig(options: AgentRunOptions): { model: string; provider: string; config: any } {
    const model = options.model || DEFAULT_AGENT_CONFIG.defaultModel;
    const providerId = options.provider || DEFAULT_AGENT_CONFIG.defaultProvider;

    // Get agent definition
    const agentDef = getAgentByModel(model) || getDefaultAgent();

    return {
      model: options.model || agentDef?.model || DEFAULT_AGENT_CONFIG.defaultModel,
      provider: options.provider || agentDef?.provider || DEFAULT_AGENT_CONFIG.defaultProvider,
      config: DEFAULT_AGENT_CONFIG
    };
  }

  /**
   * Get provider by ID
   */
  private getProvider(providerId: string): any {
    return agentProviderRegistry.get(providerId as any);
  }

  /**
   * Add a message to the session
   */
  private addMessage(
    sessionId: string,
    content: string,
    role: 'user' | 'assistant',
    timestamp: number,
    additionalData?: Record<string, unknown>
  ): string {
    let messageId = `msg-${sessionId}-${this.messageCounter++}-${Date.now()}`;

    try {
      const stored = messageStore.add({
        id: messageId,
        sessionId,
        content,
        role,
        ...additionalData,
        createdAt: timestamp
      } as any);
      if (stored?.id) messageId = stored.id;

      // Emit message added event
      GlobalEventBus.emit('agent.message.added', {
        sessionId,
        messageId,
        content,
        role,
        ...additionalData,
        timestamp
      });

    } catch (error) {
      console.error('[Agent] Failed to add message:', error);
    }

    return messageId;
  }

  /**
   * Update a message
   */
  private updateMessage(
    sessionId: string,
    messageId: string,
    content: string,
    timestamp: number,
    additionalData?: Record<string, unknown>
  ): void {
    try {
      messageStore.update(messageId, {
        content,
        ...additionalData,
        updatedAt: timestamp
      } as any);

      // Emit message updated event
      GlobalEventBus.emit('agent.message.updated', {
        sessionId,
        messageId,
        content,
        ...additionalData,
        timestamp
      });

    } catch (error) {
      console.error('[Agent] Failed to update message:', error);
    }
  }

  /**
   * Get the current state
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Stop the current agent execution
   */
  async stop(): Promise<void> {
    this.state = {
      isRunning: false,
      isStreaming: false,
      currentSessionId: undefined,
      currentMessageId: undefined
    };

    // Reset buffers
    this.jsonBuffer = '';
    this.streamingContent = '';
    this.lastAssistantMessageId = null;

    GlobalEventBus.emit('agent.stopped', {});
  }

  /**
   * Pause the current agent execution
   */
  async pause(): Promise<void> {
    this.state = {
      ...this.state,
      isRunning: false
    };

    GlobalEventBus.emit('agent.paused', {});
  }

  /**
   * Resume the agent execution
   */
  async resume(options: AgentRunOptions): Promise<AgentRunResult> {
    this.state = {
      ...this.state,
      isRunning: true
    };

    return this.run(options);
  }
}

/**
 * Get agent by model (helper function)
 */
function getAgentByModel(model: string): any {
  return getAgentDefinition(model);
}
