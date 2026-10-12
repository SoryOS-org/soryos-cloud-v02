/**
 * @soryos/agent
 * Tools exports - Voice and Image tools for agent integration
 */

// Re-export voice tool
export * from './voice-tool';

// Re-export image tool
export * from './image-tool';

// Combined exports
import { VoiceTool, voiceToolDefinition, createVoiceTool, getVoiceTool } from './voice-tool';
import { ImageTool, imageToolDefinition, createImageTool, getImageTool } from './image-tool';

/**
 * Tool Registry for agent tools
 */
export class AgentToolRegistry {
  private tools: Map<string, { tool: VoiceTool | ImageTool; definition: any }> = new Map();

  constructor() {
    // Register default tools
    this.registerVoiceTool();
    this.registerImageTool();
  }

  /**
   * Register voice tool
   */
  registerVoiceTool(voiceManager?: any): void {
    const tool = createVoiceTool(voiceManager);
    this.tools.set('voice_input', { tool, definition: voiceToolDefinition });
  }

  /**
   * Register image tool
   */
  registerImageTool(imageManager?: any): void {
    const tool = createImageTool(imageManager);
    this.tools.set('image_input', { tool, definition: imageToolDefinition });
  }

  /**
   * Get tool by name
   */
  getTool<T extends VoiceTool | ImageTool>(name: string): T | undefined {
    return this.tools.get(name)?.tool as T;
  }

  /**
   * Get tool definition by name
   */
  getToolDefinition(name: string): any {
    return this.tools.get(name)?.definition;
  }

  /**
   * Get all tool definitions
   */
  getAllToolDefinitions(): any[] {
    return Array.from(this.tools.values()).map(({ definition }) => definition);
  }

  /**
   * Execute tool by name
   */
  async executeTool(name: string, params: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }
    return tool.tool.execute(params);
  }

  /**
   * Check if tool is supported
   */
  isToolSupported(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;
    
    if (name === 'voice_input') {
      return (tool.tool as VoiceTool).isSupported();
    }
    if (name === 'image_input') {
      return (tool.tool as ImageTool).isSupported();
    }
    
    return true;
  }
}

/**
 * Create agent tool registry
 */
export function createAgentToolRegistry(): AgentToolRegistry {
  return new AgentToolRegistry();
}

/**
 * Singleton agent tool registry
 */
let globalAgentToolRegistry: AgentToolRegistry | null = null;

/**
 * Get or create global agent tool registry
 */
export function getAgentToolRegistry(): AgentToolRegistry {
  if (!globalAgentToolRegistry) {
    globalAgentToolRegistry = new AgentToolRegistry();
  }
  return globalAgentToolRegistry;
}

/**
 * Set global agent tool registry
 */
export function setAgentToolRegistry(registry: AgentToolRegistry): void {
  globalAgentToolRegistry = registry;
}
