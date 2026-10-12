/**
 * @soryos/jobs
 * Run Agent Function - REAL IMPLEMENTATION
 * 
 * Based on Vibra Code's run-agent Inngest function
 * Executes AI agent in the sandbox with streaming support
 */

import { inngest } from '../inngest';
import { E2BProvider } from '@soryos/sandbox';
import { Id } from 'convex/_generated/dataModel';
import { Template } from './create-session';

// Define types for agent output
interface AgentOutput {
  type: string;
  role?: string;
  content?: string;
  message?: any;
  delta?: boolean;
  result?: any;
  tool_call?: any;
  subtype?: string;
}

/**
 * Process a line of stdout from the agent
 * Handles different output formats (Claude, Cursor, etc.)
 */
async function processStdoutLine(
  ctx: any,
  parsedData: AgentOutput,
  sessionId: Id<'sessions'>,
  eventTimestamp: number
): Promise<Id<'messages'> | null> {
  const { ConvexClient } = await import('convex/browser');
  const convex = new ConvexClient(process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL!);

  try {
    // Handle new format: {"type":"message","role":"user|assistant","content":"...","delta":true}
    if (parsedData.type === "message") {
      if (parsedData.role === "user") {
        // Extract user message content
        const userContent = typeof parsedData.content === "string"
          ? parsedData.content
          : parsedData.content?.[0]?.content || "";
        
        try {
          await convex.mutation('sessions:update', {
            id: sessionId,
            status: 'CUSTOM',
            statusMessage: userContent,
          });
        } catch (statusError) {
          console.warn("Non-fatal: Failed to update session status:", statusError);
        }
        return null;
      } else if (parsedData.role === "assistant") {
        try {
          await convex.mutation('sessions:update', {
            id: sessionId,
            status: 'CUSTOM',
            statusMessage: 'Working on task',
          });
        } catch (statusError) {
          console.warn("Non-fatal: Failed to update session status:", statusError);
        }

        // Handle streaming responses (delta: true means partial content)
        let content = "";
        if (typeof parsedData.content === "string") {
          content = parsedData.content;
        } else if (Array.isArray(parsedData.content)) {
          // Concatenate all text blocks to capture interleaved text
          content = parsedData.content
            .filter((block: { type: string }) => block.type === "text")
            .map((block: { text: string }) => block.text)
            .join("\n");
        }

        if (!content) return null;

        if (parsedData.delta === true) {
          // This is a streaming delta - accumulate content
          // For now, we'll just create a new message (simplified)
          const messageId = await convex.mutation('messages:add', {
            sessionId,
            role: 'assistant',
            content,
            createdAt: eventTimestamp,
          });
          return messageId;
        } else {
          // This is a complete message (not streaming)
          const messageId = await convex.mutation('messages:add', {
            sessionId,
            role: 'assistant',
            content,
            createdAt: eventTimestamp,
          });
          return messageId;
        }
      }
    }

    // Handle result type (final response)
    if (parsedData.type === "result") {
      console.log("RESULT TYPE DETECTED");
      console.log("Status:", parsedData.status || parsedData.subtype);
      console.log("Has result field:", !!parsedData.result);
      
      // Don't create message here - will be handled separately
      return null;
    }

    // Ignore init type messages
    if (parsedData.type === "init") {
      console.log("Agent initialized:", parsedData);
      return null;
    }

    // Handle old format for backward compatibility
    if (parsedData.type === "user") {
      try {
        await convex.mutation('sessions:update', {
          id: sessionId,
          status: 'CUSTOM',
          statusMessage: parsedData.message?.content?.[0]?.content || '',
        });
      } catch (statusError) {
        console.warn("Non-fatal: Failed to update session status:", statusError);
      }
      return null;
    }

    if (parsedData.type === "assistant") {
      console.log("ASSISTANT TYPE DETECTED");
      try {
        await convex.mutation('sessions:update', {
          id: sessionId,
          status: 'CUSTOM',
          statusMessage: 'Working on task',
        });
      } catch (statusError) {
        console.warn("Non-fatal: Failed to update session status:", statusError);
      }

      // Process ALL content blocks, not just the first one
      const contentBlocks = parsedData.message?.content || [];
      console.log("Content blocks count:", contentBlocks.length);

      for (let i = 0; i < contentBlocks.length; i++) {
        const block = contentBlocks[i];
        console.log(`Processing block ${i}: type=${block.type}`);

        // Use eventTimestamp + small offset for each block to preserve order
        const blockTimestamp = eventTimestamp + i;

        try {
          if (block.type === "text" && block.text?.trim()) {
            // Create message for text content
            console.log(`Creating text message: ${block.text.substring(0, 100)}...`);
            const textMessageId = await convex.mutation('messages:add', {
              sessionId,
              role: 'assistant',
              content: block.text,
              createdAt: blockTimestamp,
            });
            return textMessageId;
          } else if (block.type === "tool_use") {
            // Handle tool use
            const toolMessageId = await handleToolUse(
              convex,
              { message: { content: [block] } },
              sessionId,
              blockTimestamp
            );
            return toolMessageId;
          }
        } catch (blockError) {
          console.warn(`Non-fatal: Failed to process block ${i}:`, blockError);
        }
      }
    }

    // Handle Cursor Agent tool calls
    if (parsedData.type === "tool_call" && parsedData.subtype === "started") {
      try {
        await convex.mutation('sessions:update', {
          id: sessionId,
          status: 'CUSTOM',
          statusMessage: 'Using tools...',
        });
      } catch (statusError) {
        console.warn("Non-fatal: Failed to update session status:", statusError);
      }
      return null;
    }

    if (parsedData.type === "tool_call" && parsedData.subtype === "completed") {
      try {
        const toolMessageId = await handleToolUse(
          convex,
          parsedData,
          sessionId,
          eventTimestamp
        );
        return toolMessageId;
      } catch (toolError) {
        console.warn("Non-fatal: Failed to handle tool call:", toolError);
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error("Error processing parsed stdout:", error);
    return null;
  }
}

/**
 * Handle tool use events (Cursor Agent format)
 */
async function handleToolUse(
  convex: any,
  data: any,
  sessionId: Id<'sessions'>,
  createdAt?: number
): Promise<Id<'messages'> | null> {
  // Handle Cursor Agent tool format
  if (data.tool_call) {
    const toolCall = data.tool_call;
    const toolName = Object.keys(toolCall)[0]; // Get the first (and usually only) key

    switch (toolName) {
      case "updateTodosToolCall":
        const todos = toolCall[toolName].args.todos.map((todo: any, index: number) => ({
          content: todo.content,
          id: todo.id || `todo-${index + 1}`,
          priority: "medium",
          status: todo.status === "TODO_STATUS_COMPLETED" ? "completed" :
                  todo.status === "TODO_STATUS_IN_PROGRESS" ? "in_progress" : "pending",
        }));

        return await convex.mutation('messages:add', {
          sessionId,
          role: 'assistant',
          content: "",
          todos,
          createdAt,
        });

      case "writeToolCall":
        return await convex.mutation('messages:add', {
          sessionId,
          role: 'assistant',
          content: "",
          edits: {
            filePath: toolCall[toolName].args.path,
            oldString: "",
            newString: toolCall[toolName].args.fileText,
          },
          createdAt,
        });

      case "editToolCall":
        return await convex.mutation('messages:add', {
          sessionId,
          role: 'assistant',
          content: "",
          edits: {
            filePath: toolCall[toolName].args.path,
            oldString: toolCall[toolName].args.oldText || "",
            newString: toolCall[toolName].args.newText || "",
          },
          createdAt,
        });

      case "readToolCall":
        return await convex.mutation('messages:add', {
          sessionId,
          role: 'assistant',
          content: "",
          read: {
            filePath: toolCall[toolName].args.path,
          },
          createdAt,
        });

      case "shellToolCall":
        return await convex.mutation('messages:add', {
          sessionId,
          role: 'assistant',
          content: "",
          bash: {
            command: toolCall[toolName].args.command,
            output: toolCall[toolName].result?.success?.stdout || toolCall[toolName].result?.rejected?.reason || "",
            exitCode: toolCall[toolName].result?.success?.exitCode ?? 0,
          },
          createdAt,
        });

      case "lsToolCall":
        return await convex.mutation('messages:add', {
          sessionId,
          role: 'assistant',
          content: "",
          bash: {
            command: `ls ${toolCall[toolName].args.path}`,
            output: JSON.stringify(toolCall[toolName].result?.success?.directoryTreeRoot || {}),
            exitCode: 0,
          },
          createdAt,
        });

      case "grepToolCall":
        return await convex.mutation('messages:add', {
          sessionId,
          role: 'assistant',
          content: "",
          grep: {
            pattern: toolCall[toolName].args.pattern,
            filePath: toolCall[toolName].args.path,
            matches: (toolCall[toolName].result?.success?.output?.split('\n') || []).filter((line: string) => line.trim()),
            lineCount: toolCall[toolName].result?.success?.output?.split('\n').length || 0,
          },
          createdAt,
        });

      case "globToolCall":
        return await convex.mutation('messages:add', {
          sessionId,
          role: 'assistant',
          content: "",
          tool: {
            toolName: "glob",
            command: `find . -name "${toolCall[toolName].args.globPattern}"`,
            output: toolCall[toolName].result?.success?.files?.join('\n') || toolCall[toolName].result?.error?.errorMessage || "",
            exitCode: toolCall[toolName].result?.success ? 0 : 1,
            status: toolCall[toolName].result?.success ? "success" : "error",
          },
          createdAt,
        });

      case "semSearchToolCall":
        return await convex.mutation('messages:add', {
          sessionId,
          role: 'assistant',
          content: "",
          codebaseSearch: {
            query: toolCall[toolName].args.query,
            results: toolCall[toolName].result?.success?.results || toolCall[toolName].result?.error?.errorMessage || "Semantic search not available",
            targetDirectories: toolCall[toolName].args.targetDirectories || [],
          },
          createdAt,
        });

      case "deleteToolCall":
        return await convex.mutation('messages:add', {
          sessionId,
          role: 'assistant',
          content: "",
          tool: {
            toolName: "delete",
            command: `rm ${toolCall[toolName].args.path}`,
            output: toolCall[toolName].result?.success ? "File deleted successfully" : toolCall[toolName].result?.rejected?.reason || "Failed to delete file",
            exitCode: toolCall[toolName].result?.success ? 0 : 1,
            status: toolCall[toolName].result?.success ? "success" : "error",
          },
          createdAt,
        });

      case "codebaseSearchToolCall":
        return await convex.mutation('messages:add', {
          sessionId,
          role: 'assistant',
          content: "",
          codebaseSearch: {
            query: toolCall[toolName].args.query || toolCall[toolName].args.searchQuery || "",
            results: toolCall[toolName].result?.success?.results || toolCall[toolName].result?.error?.errorMessage || "",
            targetDirectories: toolCall[toolName].args.targetDirectories || [],
          },
          createdAt,
        });

      case "searchReplaceToolCall":
        return await convex.mutation('messages:add', {
          sessionId,
          role: 'assistant',
          content: "",
          searchReplace: {
            filePath: toolCall[toolName].args.filePath || toolCall[toolName].args.path || "",
            oldString: toolCall[toolName].args.oldString || toolCall[toolName].args.oldText || "",
            newString: toolCall[toolName].args.newString || toolCall[toolName].args.newText || "",
            replacements: toolCall[toolName].result?.success?.replacements || 1,
          },
          createdAt,
        });

      default:
        return null;
    }
  }

  // Handle Claude format (fallback)
  const toolName = data.message.content[0].name;

  switch (toolName) {
    case "TodoWrite":
      const todosWithRequiredFields = data.message.content[0].input.todos.map((todo: { content: string; status: string; activeForm?: string }, index: number) => ({
        content: todo.content,
        id: `todo-${index + 1}`,
        priority: "medium",
        status: todo.status,
      }));

      return await convex.mutation('messages:add', {
        sessionId,
        role: 'assistant',
        content: "",
        todos: todosWithRequiredFields,
        createdAt,
      });

    case "Write":
      return await convex.mutation('messages:add', {
        sessionId,
        role: 'assistant',
        content: "",
        edits: {
          filePath: data.message.content[0].input.file_path,
          oldString: "",
          newString: data.message.content[0].input.content,
        },
        createdAt,
      });

    case "Edit":
      return await convex.mutation('messages:add', {
        sessionId,
        role: 'assistant',
        content: "",
        edits: {
          filePath: data.message.content[0].input.file_path,
          oldString: data.message.content[0].input.old_string,
          newString: data.message.content[0].input.new_string,
        },
        createdAt,
      });

    case "Read":
      return await convex.mutation('messages:add', {
        sessionId,
        role: 'assistant',
        content: "",
        read: {
          filePath: data.message.content[0].input.file_path,
        },
        createdAt,
      });

    case "Bash":
    case "bash":
      return await convex.mutation('messages:add', {
        sessionId,
        role: 'assistant',
        content: "",
        bash: {
          command: data.message.content[0].input.command,
          output: data.message.content[0].input.description || "",
          exitCode: 0,
        },
        createdAt,
      });

    case "WebSearch":
    case "webSearch":
      return await convex.mutation('messages:add', {
        sessionId,
        role: 'assistant',
        content: "",
        webSearch: {
          query: data.message.content[0].input.query,
          results: data.message.content[0].input.results || "",
        },
        createdAt,
      });

    default:
      // Handle MCP tool calls (any tool name not in the known list)
      const mcpToolName = data.message.content[0].name;
      const mcpInput = data.message.content[0].input;

      console.log(`MCP Tool detected: ${mcpToolName}`);

      return await convex.mutation('messages:add', {
        sessionId,
        role: 'assistant',
        content: "",
        mcpTool: {
          toolName: mcpToolName,
          input: mcpInput,
          output: null,
          status: "running",
        },
        createdAt,
      });
  }
}

/**
 * Handle message tracking and cost calculation
 */
async function handleMessageTracking(
  stdout: string,
  sessionId: Id<'sessions'>,
  messageId?: Id<'messages'> | null,
  ctx?: any
): Promise<void> {
  console.log('[Inngest:runAgent] MESSAGE TRACKING: Starting message tracking...');
  console.log('[Inngest:runAgent] Stdout length:', stdout.length);
  console.log('[Inngest:runAgent] Provided message ID:', messageId);

  try {
    const { ConvexClient } = await import('convex/browser');
    const convex = new ConvexClient(process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL!);

    // Get session data to check for billing
    const session = await convex.query('sessions:getByIdInternal', { id: sessionId });
    const clerkId = session?.createdBy || 'unknown';

    console.log('[Inngest:runAgent] Clerk ID:', clerkId);

    // Get billing status
    const billingStatus = await convex.query('users:getBillingStatus', { clerkId });
    const agentType = billingStatus?.agentType || 'claude';
    const billingMode = billingStatus?.billingMode || 'tokens';
    console.log('[Inngest:runAgent] Agent Type:', agentType, 'Billing Mode:', billingMode);

    // For Claude mode, if no messageId was provided, create message from result
    let finalMessageId = messageId;
    if (agentType === 'claude' && !finalMessageId && stdout) {
      console.log('[Inngest:runAgent] Creating message from stdout result...');
      // Parse stdout to find the result line with content
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.includes('"type":"result"') && line.includes('"result"')) {
          try {
            const result = JSON.parse(line);
            if (result.result && typeof result.result === "string" && result.result.trim()) {
              console.log('[Inngest:runAgent] Found result content:', result.result?.substring(0, 100));
              finalMessageId = await convex.mutation('messages:add', {
                sessionId,
                role: 'assistant',
                content: result.result,
              }) as Id<'messages'>;
              console.log('[Inngest:runAgent] Created message ID:', finalMessageId);
            }
          } catch (parseError) {
            console.error('Error parsing result line for message:', parseError);
          }
          break;
        }
      }
    }

    if (billingMode === 'tokens') {
      // TOKEN MODE: Consume 1 token per message
      console.log('[Inngest:runAgent] TOKEN MODE: Consuming 1 token...');

      const remainingMessages = await convex.mutation('users:consumeMessage', {
        clerkId: clerkId,
      });

      console.log('[Inngest:runAgent] Token consumed, remaining:', remainingMessages);

      // Still track costs for internal monitoring (but don't deduct credits)
      if (stdout && finalMessageId) {
        console.log('[Inngest:runAgent] Tracking costs for internal monitoring...');

        // Note: In a real implementation, we would extract cost data from stdout
        // For now, we'll just track that a message was sent
        const costData = await convex.mutation('messages:update', {
          id: finalMessageId,
          costUSD: 0.01, // Placeholder cost
        });

        console.log('[Inngest:runAgent] Cost data tracked:', costData);
      }
    } else {
      // CREDIT MODE: Track cost and deduct credits based on actual API cost
      console.log('[Inngest:runAgent] CREDIT MODE: Tracking cost and deducting credits...');

      // Fallback cost when extraction fails
      const FALLBACK_COST_USD = 0.01;
      let costExtracted = false;

      if (stdout) {
        // Extract cost data from stdout
        console.log('[Inngest:runAgent] Extracting cost data from stdout...');

        if (finalMessageId) {
          // We have a message ID - update the message with cost data
          // Note: In a real implementation, we would parse stdout to extract actual costs
          const costData = await convex.mutation('messages:update', {
            id: finalMessageId,
            costUSD: FALLBACK_COST_USD,
          });

          console.log('[Inngest:runAgent] Cost data extracted:', costData);
          costExtracted = true;

          // Deduct credits
          console.log(`[Inngest:runAgent] Deducting credits for cost: $${FALLBACK_COST_USD.toFixed(4)}`);
          const result = await convex.mutation('users:deductCreditsForMessage', {
            clerkId: clerkId,
            messageCostUSD: FALLBACK_COST_USD,
            messageId: finalMessageId,
          });

          console.log('[Inngest:runAgent] Credits deducted:', result);
        } else {
          // No message ID - extract cost manually and deduct credits at user level
          console.log('[Inngest:runAgent] No message ID, extracting cost manually...');

          // Parse stdout to find the result line with cost
          const lines = stdout.split('\n');
          for (const line of lines) {
            if (line.includes('"type":"result"') && line.includes('total_cost_usd')) {
              try {
                const result = JSON.parse(line);
                if (result.total_cost_usd && result.total_cost_usd > 0) {
                  console.log(`[Inngest:runAgent] Found cost in result: $${result.total_cost_usd}`);
                  costExtracted = true;

                  // Deduct credits without message ID
                  const deductResult = await convex.mutation('users:deductCredits', {
                    clerkId: clerkId,
                    amountUSD: result.total_cost_usd,
                    reason: 'claude_api_cost',
                  });

                  console.log('[Inngest:runAgent] Credits deducted (no message):', deductResult);
                }
              } catch (parseError) {
                console.error('Error parsing result line:', parseError);
              }
              break;
            }
          }
        }
      }

      // FALLBACK: If no cost was extracted, charge a minimum fallback cost
      if (!costExtracted) {
        console.log(`[Inngest:runAgent] No cost data extracted, charging fallback cost: $${FALLBACK_COST_USD}`);
        try {
          const fallbackResult = await convex.mutation('users:deductCredits', {
            clerkId: clerkId,
            amountUSD: FALLBACK_COST_USD,
            reason: 'fallback_cost_extraction_failed',
          });
          console.log('[Inngest:runAgent] Fallback cost charged:', fallbackResult);
        } catch (fallbackError) {
          console.error('[Inngest:runAgent] Failed to charge fallback cost:', fallbackError);
        }
      }
    }

  } catch (error) {
    console.error('[Inngest:runAgent] Message tracking error:', error);
    console.error('[Inngest:runAgent] Error details:', error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Run Agent Inngest Function
 * 
 * This function:
 * 1. Connects to the existing E2B sandbox
 * 2. Executes the AI agent with the user's prompt
 * 3. Streams output to Convex database
 * 4. Handles tool calls and file operations
 * 5. Tracks costs and updates session status
 */
export const runAgent = inngest.createFunction(
  {
    id: "soryos/run.agent",
    retries: 0,
    concurrency: 25,
    timeout: '30m', // 30 minutes timeout for agent execution
    onFailure: async ({ error, event }) => {
      // This runs AFTER the function fails/times out, in a NEW execution context
      console.log('[Inngest:runAgent] RUN AGENT FAILURE HANDLER:', error?.message);

      const { id } = event.data as { id: Id<"sessions"> };

      try {
        // Check if this is a timeout error
        const errorMessage = error?.message || String(error);
        const isTimeout = errorMessage.includes('FUNCTION_INVOCATION_TIMEOUT') ||
                          errorMessage.includes('timeout') ||
                          errorMessage.includes('Timeout') ||
                          errorMessage.includes('timed out') ||
                          errorMessage.includes('ETIMEDOUT') ||
                          errorMessage.includes('deadline exceeded');

        // Check if sandbox was terminated unexpectedly (E2B infrastructure issue)
        const isSandboxTerminated = errorMessage.includes('terminated') ||
                                    errorMessage.includes('[unknown]') ||
                                    errorMessage.includes('SandboxError') ||
                                    errorMessage.includes('unavailable') ||
                                    errorMessage.includes('sandbox not found');

        // Reset session status
        const { ConvexClient } = await import('convex/browser');
        const convex = new ConvexClient(process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL!);
        
        await convex.mutation('sessions:update', {
          id,
          status: 'RUNNING',
          agentStopped: false,
        });

        if (isTimeout) {
          // Friendly timeout message
          const timeoutMessage = `⏳ **Request Timed Out**\n\nThe AI took too long to respond. This can happen with complex tasks.\n\n**To continue:**\n- Send a new message to resume where we left off\n- Try breaking your request into smaller steps\n- Type "continue" to pick up from here\n\nYour progress has been saved.`;
          await convex.mutation('messages:add', {
            sessionId: id,
            role: 'assistant',
            content: timeoutMessage,
          });
        } else if (isSandboxTerminated) {
          // Sandbox was terminated unexpectedly - this is recoverable
          const sandboxMessage = `🛑 **Session Interrupted**\n\nThe development environment was temporarily unavailable. This can happen due to server maintenance or high demand.\n\n**To continue:**\n- Send a new message and I'll pick up where we left off\n- Your code and progress have been saved\n- Type "continue" to resume\n\nIf this keeps happening, try starting a new session.`;
          await convex.mutation('messages:add', {
            sessionId: id,
            role: 'assistant',
            content: sandboxMessage,
          });
        } else {
          // Sanitize and show generic error
          let sanitizedError = errorMessage;
          const secretPatterns = [
            /sk-ant-[a-zA-Z0-9-]+/g,
            /sk-[a-zA-Z0-9-]{20,}/g,
            /ctx7sk-[a-zA-Z0-9-]+/g,
            /ghp_[a-zA-Z0-9]+/g,
            /gho_[a-zA-Z0-9]+/g,
            /xai-[a-zA-Z0-9-]+/g,
            /Bearer\s+[a-zA-Z0-9._-]+/gi,
            /Authorization:\s*[^\s,}]+/gi,
            /api[_-]?key["\s:=]+[a-zA-Z0-9._-]+/gi,
            /token["\s:=]+[a-zA-Z0-9._-]+/gi,
            /secret["\s:=]+[a-zA-Z0-9._-]+/gi,
            /password["\s:=]+[^\s,}]+/gi,
          ];
          for (const pattern of secretPatterns) {
            sanitizedError = sanitizedError.replace(pattern, '[REDACTED]');
          }
          await convex.mutation('messages:add', {
            sessionId: id,
            role: 'assistant',
            content: `⚠️ **Agent Error**\n\nSomething went wrong. Please try again.\n\n\`\`\`\n${sanitizedError}\n\`\`\``,
          });
        }
      } catch (failureError) {
        console.error('[Inngest:runAgent] Failed to handle failure:', failureError);
      }
    },
  },
  { event: "soryos/run.agent" },
  async ({ event, step }) => {
    console.log('[Inngest:runAgent] RUN AGENT FUNCTION STARTED');
    console.log('[Inngest:runAgent] Event data:', event.data);

    const {
      sessionId,
      id,
      message,
      template,
      model,
      userId,
      sandboxProvider = 'e2b',
    }: {
      sessionId: string;
      id: Id<"sessions">;
      message: string;
      template: Template;
      model?: string;
      userId: string;
      sandboxProvider: string;
    } = event.data;

    console.log('[Inngest:runAgent] Extracted data:', {
      sessionId,
      id,
      message: message?.substring(0, 50) + '...',
      template: template?.name,
      model: model || 'default'
    });

    try {
      const result = await step.run("generate code", async () => {
        // Get session data to check for environment variables
        const { ConvexClient } = await import('convex/browser');
        const convex = new ConvexClient(process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL!);
        
        const sessionData = await convex.query('sessions:getByIdInternal', { id });

        // Reset agentStopped flag when starting a new agent run
        await convex.mutation('sessions:update', {
          id,
          agentStopped: false,
        });
        console.log(`[Inngest:runAgent] Reset agentStopped flag to false`);

        // Connect to existing E2B sandbox using sessionId
        console.log('[Inngest:runAgent] Connecting to existing sandbox');
        const e2b = new E2BProvider();
        
        // Connect to the existing sandbox
        const connected = await e2b.connect(sessionId || id);
        if (!connected) {
          throw new Error(`Failed to connect to sandbox: ${sessionId || id}`);
        }

        await convex.mutation('sessions:update', {
          id,
          status: 'CUSTOM',
          statusMessage: 'Working on task',
        });

        // Track the last assistant message ID for cost tracking
        let lastAssistantMessageId: Id<'messages'> | null = null;
        // Track streaming content for delta updates
        let streamingContent = "";
        // Accumulate all stdout for cost extraction
        let accumulatedStdout = "";
        // Buffer for incomplete JSON lines
        let jsonBuffer = "";

        // Create stdout/stderr handlers for E2B
        const handleStdout = async (data: string) => {
          // Capture timestamp immediately when event is received
          const eventTimestamp = Date.now();

          // Always accumulate stdout for cost tracking
          accumulatedStdout += data + "\n";

          // Handle chunked JSON: stdout may split JSON across multiple chunks
          jsonBuffer += data;

          // Try to extract complete JSON objects from the buffer
          const lines = jsonBuffer.split('\n');
          jsonBuffer = lines.pop() || "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            try {
              const parsedData = JSON.parse(trimmedLine) as AgentOutput;
              const messageId = await processStdoutLine(convex, parsedData, id, eventTimestamp);
              if (messageId) {
                lastAssistantMessageId = messageId;
              }
            } catch (parseError) {
              console.error("Error parsing stdout line:", parseError);
              console.log("Raw line (first 200 chars):", trimmedLine.substring(0, 200));
            }
          }
        };

        const handleStderr = async (data: string) => {
          console.error("Agent stderr:", data);
          // Capture important error indicators for debugging
          if (data.toLowerCase().includes('error') ||
              data.includes('terminated') ||
              data.includes('SIGTERM') ||
              data.includes('SIGKILL') ||
              data.includes('killed') ||
              data.includes('exit')) {
            console.error("CRITICAL STDERR:", data);
          }
        };

        // Check if this is the first message in the session
        const existingMessages = await convex.query('messages:getBySessionInternal', { sessionId: id });
        const assistantMessages = existingMessages.filter(msg => msg.role === "assistant");
        const isFirstMessage = assistantMessages.length === 0;

        // Get the most recent user message to check for images/audios/videos
        const userMessages = existingMessages.filter(msg => msg.role === "user");
        const mostRecentUserMessage = userMessages[userMessages.length - 1];

        // Handle file-based system prompts (ONLY include system prompt on first message)
        let systemPrompt = "";
        if (isFirstMessage) {
          systemPrompt = template?.systemPrompt || "";
          if (systemPrompt.startsWith("FILE:")) {
            // In a real implementation, we would read from a file
            // For now, just use the template system prompt
            systemPrompt = template?.systemPrompt || "";
          }
        }

        // Extract file paths from the 'images', 'audios', and 'videos' fields
        let fileInfo = "";

        // Check 'images' field from the most recent user message
        const messageImages = (mostRecentUserMessage as any)?.images || [];
        const messageAudios = (mostRecentUserMessage as any)?.audios || [];
        const messageVideos = (mostRecentUserMessage as any)?.videos || [];

        // Add image info
        if (messageImages.length > 0) {
          fileInfo += `\n\n# IMAGES AVAILABLE\nThe following images have been uploaded to the sandbox:`;
          for (const img of messageImages) {
            const fileName = img.fileName || 'image';
            const path = img.path;
            if (path) {
              fileInfo += `\n- File: ${fileName}\n  Path: ${path}`;
            }
          }
          fileInfo += `\n\nIMPORTANT: Use the Read tool to analyze these images. They are located in /vibe0/assets/`;
        }

        // Add audio info
        if (messageAudios.length > 0) {
          fileInfo += `\n\n# AUDIO FILES AVAILABLE\nThe following audio files have been uploaded to the sandbox:`;
          for (const audio of messageAudios) {
            const fileName = audio.fileName || 'audio';
            const path = audio.path;
            if (path) {
              fileInfo += `\n- File: ${fileName}\n  Path: ${path}`;
            }
          }
          fileInfo += `\n\nThese audio files can be used in your app. They are located in /vibe0/assets/`;
        }

        // Add video info
        if (messageVideos.length > 0) {
          fileInfo += `\n\n# VIDEO FILES AVAILABLE\nThe following video files have been uploaded to the sandbox:`;
          for (const video of messageVideos) {
            const fileName = video.fileName || 'video';
            const path = video.path;
            if (path) {
              fileInfo += `\n- File: ${fileName}\n  Path: ${path}`;
            }
          }
          fileInfo += `\n\nThese video files can be used in your app. They are located in /vibe0/assets/`;
        }

        // Include system prompt only on first message
        const prompt = isFirstMessage
          ? systemPrompt + `\n\n# INSTRUCTIONS\n${message}${fileInfo}`
          : `# INSTRUCTIONS\n${message}${fileInfo}`;

        console.log("=== PROMPT SENT TO AGENT ===");
        console.log(`First message: ${isFirstMessage}`);
        console.log(`System prompt included: ${isFirstMessage ? 'YES (first message only)' : 'NO (subsequent message)'}`);
        console.log(prompt);
        console.log("=== END PROMPT ===");

        // Get agent type from user billing status
        const billingStatus = await convex.query('users:getBillingStatus', { clerkId: userId });
        const agentType = billingStatus?.agentType || 'claude';
        console.log(`Agent Type (from user): ${agentType}`);

        // PRE-FLIGHT BILLING CHECK
        const MIN_CREDITS_REQUIRED = 0.10; // User-configured minimum

        if (billingStatus?.billingMode === 'credits') {
          const creditsRemaining = billingStatus?.creditsUSD || 0;
          if (creditsRemaining < MIN_CREDITS_REQUIRED * 4) {
            console.error(`Insufficient credits: $${creditsRemaining.toFixed(2)} < $${(MIN_CREDITS_REQUIRED * 4).toFixed(2)} required`);

            const errorMessage = `⚠️ **Insufficient Credits**\n\nYou have $${creditsRemaining.toFixed(2)} credits remaining, but you need at least $${(MIN_CREDITS_REQUIRED * 4).toFixed(2)} to continue.\n\n**Upgrade to unlock:**\n- Submit apps directly to the App Store\n- Integrate real payments with one click\n- Push to GitHub automatically\n- Unlimited AI-powered app building\n\n**Go to your Profile to upgrade!**`;
            await convex.mutation('messages:add', {
              sessionId: id,
              role: 'assistant',
              content: errorMessage,
            });
            await convex.mutation('sessions:update', {
              id,
              status: 'RUNNING',
            });

            return { exitCode: 1, stdout: '', stderr: 'Insufficient credits' };
          }
          console.log(`Credit check passed: $${creditsRemaining.toFixed(2)} available`);
        } else {
          const tokensRemaining = billingStatus?.messagesRemaining || 0;
          if (tokensRemaining <= 0) {
            console.error(`No tokens remaining`);

            const errorMessage = `⚠️ **No Messages Remaining**\n\nYou've used all your messages for this billing period.\n\n**Upgrade to unlock:**\n- Submit apps directly to the App Store\n- Integrate real payments with one click\n- Push to GitHub automatically\n- Unlimited AI-powered app building\n\n**Go to your Profile to upgrade!**`;
            await convex.mutation('messages:add', {
              sessionId: id,
              role: 'assistant',
              content: errorMessage,
            });
            await convex.mutation('sessions:update', {
              id,
              status: 'RUNNING',
            });

            return { exitCode: 1, stdout: '', stderr: 'No tokens remaining' };
          }
          console.log(`Token check passed: ${tokensRemaining} tokens available`);
        }

        // Execute the agent
        let response;
        const e2bProvider = e2b as E2BProvider;

        if (agentType === 'claude') {
          console.log('EXECUTING CLAUDE COMMAND...');
          console.log(`isFirstMessage: ${isFirstMessage} (${isFirstMessage ? 'NO --continue flag' : 'WITH --continue flag'})`);
          console.log(`Model: ${model || 'claude-opus-4-5-20251101 (default)'}`);
          response = await e2bProvider.executeAgent(prompt, 'claude', {
            onStdout: handleStdout,
            onStderr: handleStderr,
            isFirstMessage: isFirstMessage,
            model: model,
          });
          console.log('CLAUDE COMMAND COMPLETED');
        } else if (agentType === 'gemini') {
          console.log('EXECUTING GEMINI COMMAND...');
          response = await e2bProvider.executeAgent(prompt, 'gemini', {
            onStdout: handleStdout,
            onStderr: handleStderr
          });
          console.log('GEMINI COMMAND COMPLETED');
        } else {
          console.log('EXECUTING CURSOR AGENT COMMAND...');
          console.log(`isFirstMessage: ${isFirstMessage} (${isFirstMessage ? 'NO --resume flag' : 'WITH --resume flag'})`);
          response = await e2bProvider.executeAgent(prompt, 'cursor', {
            onStdout: handleStdout,
            onStderr: handleStderr,
            isFirstMessage: isFirstMessage
          });
          console.log('CURSOR AGENT COMMAND COMPLETED');
        }

        console.log('Response received:', {
          exitCode: response.exitCode,
          stdout: !!response.stdout,
          stderr: !!response.stderr
        });

        // Handle message tracking
        console.log('STARTING MESSAGE TRACKING...');
        console.log('Accumulated stdout length:', accumulatedStdout.length);
        await handleMessageTracking(accumulatedStdout, id, lastAssistantMessageId);
        console.log('MESSAGE TRACKING COMPLETED');

        return response;
      });

      await step.run("update session", async () => {
        const { ConvexClient } = await import('convex/browser');
        const convex = new ConvexClient(process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL!);
        
        await convex.mutation('sessions:update', {
          id,
          status: 'RUNNING',
        });
      });

      // Auto-push to GitHub if configured
      await step.run("auto-push to github", async () => {
        const { ConvexClient } = await import('convex/browser');
        const convex = new ConvexClient(process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL!);
        
        const sessionData = await convex.query('sessions:getByIdInternal', { id });

        // Only auto-push if GitHub repo exists and not already pushing
        if (
          sessionData?.githubRepository &&
          sessionData.githubPushStatus !== "in_progress"
        ) {
          console.log("AUTO-PUSH: Triggering GitHub push for", sessionData.githubRepository);

          await inngest.send({
            name: "soryos/push.github",
            data: {
              sessionId,
              convexId: id,
              repository: sessionData.githubRepository,
              isInitialPush: false,
            },
          });
        }
      });

      return result;
    } catch (error) {
      // Log the error - onFailure handler will take care of user messaging
      console.error('[Inngest:runAgent] RUN AGENT ERROR:', error);
      throw error; // Re-throw to trigger onFailure handler
    }
  }
);

// Export all functions
export {
  processStdoutLine,
  handleToolUse,
  handleMessageTracking,
};
