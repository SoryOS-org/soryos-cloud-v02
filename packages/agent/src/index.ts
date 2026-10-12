/**
 * @soryos/agent
 * Core Autonomous Agent Runtime inspired by OpenCode, Codex CLI, and Gemini CLI.
 * 
 * This is the main entry point for the agent package.
 */

// Re-export everything from the new modular structure
export * from "./types";
export * from "./config";
export * from "./runtime";
export * from "./providers";
export * from "./error-handler";
export * from "./tools";
export { pingProvider, resolveModelId, DEFAULT_PROVIDER_MODELS, streamChat } from "./llm-client";
export type { ProviderPingResult } from "./llm-client";

// For backward compatibility, keep the original exports
import { AgentRuntime } from "./runtime";
import { AGENT_MATRIX, getAgentDefinition, getAllAgentDefinitions } from "./config";
import type { AgentRunOptions, AgentRunResult, AgentDefinition } from "./types";

// Singleton instance
export const agentRuntime = new AgentRuntime();

// Agent Matrix (for backward compatibility)
export { AGENT_MATRIX };
export { getAgentDefinition };
export { getAllAgentDefinitions };

// Type exports for backward compatibility
export type { AgentRunOptions, AgentRunResult, AgentDefinition };
