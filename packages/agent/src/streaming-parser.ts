/**
 * @soryos/agent
 * Streaming Parser - Extrait de Vibra Code
 * 
 * Fonctionnalités:
 * - Parsing JSON intelligent avec buffer pour chunks partiels
 * - Support multi-format (Claude Code, Cursor Agent, Gemini)
 * - Gestion des messages delta (streaming)
 * - Extraction des tool calls
 * - Validation des données
 */

import { GlobalEventBus } from '@soryos/bus';

export interface ParsedMessage {
  type: 'message' | 'result' | 'tool_call' | 'init' | 'assistant' | 'user' | 'unknown';
  role?: 'user' | 'assistant' | 'system';
  content?: string | Array<{ type: string; text?: string; [key: string]: any }>;
  delta?: boolean;
  subtype?: string;
  name?: string;
  tool_call?: Record<string, any>;
  result?: any;
  [key: string]: any;
}

export interface StreamingChunk {
  data: string;
  timestamp: number;
  sessionId: string;
}

export interface ParseResult {
  parsedData: ParsedMessage;
  isComplete: boolean;
  remainingBuffer: string;
}

export class StreamingParser {
  private jsonBuffer: string = '';
  private messageCounter: number = 0;
  private currentMessageId: string | null = null;
  private streamingContent: string = '';

  constructor(private sessionId: string) {}

  /**
   * Réinitialiser le parseur
   */
  reset(): void {
    this.jsonBuffer = '';
    this.messageCounter = 0;
    this.currentMessageId = null;
    this.streamingContent = '';
  }

  /**
   * Parser un chunk de données streaming
   */
  parseChunk(chunk: StreamingChunk): ParseResult[] {
    const results: ParseResult[] = [];
    const { data, timestamp, sessionId } = chunk;

    // Ajouter au buffer
    this.jsonBuffer += data;

    // Essayer de parser les lignes JSON complètes
    const lines = this.jsonBuffer.split('\n');
    // Garder la dernière ligne (potentiellement incomplète) dans le buffer
    this.jsonBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      try {
        const parsedData = JSON.parse(trimmedLine);
        
        // Créer un résultat complet
        const result: ParseResult = {
          parsedData: this.normalizeParsedData(parsedData),
          isComplete: true,
          remainingBuffer: this.jsonBuffer
        };
        
        results.push(result);
        
        // Traiter le message
        this.processParsedMessage(result.parsedData, sessionId, timestamp);
        
      } catch (parseError) {
        // Ce n'est pas du JSON valide, peut-être du texte simple ou un chunk partiel
        console.debug('[StreamingParser] Non-JSON line:', trimmedLine.substring(0, 100));
        
        // Si le buffer est trop grand, c'est probablement du texte simple
        if (this.jsonBuffer.length > 10000) {
          // Traiter comme texte simple
          const textResult: ParseResult = {
            parsedData: {
              type: 'message',
              role: 'assistant',
              content: this.jsonBuffer,
              delta: true
            },
            isComplete: false,
            remainingBuffer: ''
          };
          
          results.push(textResult);
          this.processTextChunk(this.jsonBuffer, sessionId, timestamp);
          this.jsonBuffer = '';
        }
      }
    }

    return results;
  }

  /**
   * Normaliser les données parsées pour un format cohérent
   */
  private normalizeParsedData(data: any): ParsedMessage {
    // Détecter le type de message
    if (data.type === 'message') {
      return this.normalizeMessageType(data);
    } else if (data.type === 'result') {
      return this.normalizeResultType(data);
    } else if (data.type === 'tool_call') {
      return this.normalizeToolCallType(data);
    } else if (data.type === 'init') {
      return { ...data, type: 'init' };
    } else if (data.type === 'assistant' || data.type === 'user') {
      return this.normalizeLegacyType(data);
    }
    
    // Type inconnu
    return {
      type: 'unknown',
      ...data,
      rawData: data
    };
  }

  /**
   * Normaliser le type 'message' (format Claude Code nouveau)
   */
  private normalizeMessageType(data: any): ParsedMessage {
    const { type, role, content, delta, ...rest } = data;
    
    return {
      type: 'message',
      role: role as 'user' | 'assistant' | 'system',
      content: this.normalizeContent(content),
      delta: delta === true,
      ...rest
    };
  }

  /**
   * Normaliser le type 'result'
   */
  private normalizeResultType(data: any): ParsedMessage {
    return {
      type: 'result',
      result: data.result,
      status: data.status || data.subtype,
      total_cost_usd: data.total_cost_usd,
      ...data
    };
  }

  /**
   * Normaliser le type 'tool_call'
   */
  private normalizeToolCallType(data: any): ParsedMessage {
    return {
      type: 'tool_call',
      subtype: data.subtype,
      tool_call: data.tool_call || data,
      ...data
    };
  }

  /**
   * Normaliser le format legacy (old Claude)
   */
  private normalizeLegacyType(data: any): ParsedMessage {
    if (data.type === 'assistant') {
      return {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: this.normalizeContent(data.message?.content || data.content || [])
        },
        ...data
      };
    } else if (data.type === 'user') {
      return {
        type: 'user',
        message: {
          role: 'user',
          content: data.message?.content || data.content || ''
        },
        ...data
      };
    }
    
    return data;
  }

  /**
   * Normaliser le contenu (string ou array de blocks)
   */
  private normalizeContent(content: any): string | Array<any> {
    if (typeof content === 'string') {
      return content;
    }
    
    if (Array.isArray(content)) {
      return content.map(block => {
        if (typeof block === 'string') {
          return { type: 'text', text: block };
        }
        return block;
      });
    }
    
    return content;
  }

  /**
   * Traiter un message parsé
   */
  private processParsedMessage(data: ParsedMessage, sessionId: string, timestamp: number): void {
    switch (data.type) {
      case 'message':
        this.processMessageType(data, sessionId, timestamp);
        break;
      case 'result':
        this.processResultType(data, sessionId, timestamp);
        break;
      case 'tool_call':
        this.processToolCallType(data, sessionId, timestamp);
        break;
      case 'init':
        this.processInitType(data, sessionId, timestamp);
        break;
      case 'assistant':
        this.processAssistantType(data, sessionId, timestamp);
        break;
      case 'user':
        this.processUserType(data, sessionId, timestamp);
        break;
      default:
        this.processUnknownType(data, sessionId, timestamp);
    }
    
    // Émettre l'événement de données brutes
    GlobalEventBus.emit('agent.streaming.data', { 
      sessionId, 
      data,
      timestamp 
    });
  }

  /**
   * Traiter le type 'message'
   */
  private processMessageType(data: ParsedMessage, sessionId: string, timestamp: number): void {
    const role = data.role;
    
    if (role === 'user') {
      // Message utilisateur
      const content = this.extractTextContent(data.content);
      GlobalEventBus.emit('agent.status', { 
        sessionId, 
        status: 'processing',
        message: content 
      });
    } else if (role === 'assistant') {
      // Message assistant
      this.processAssistantMessage(data, sessionId, timestamp);
    }
  }

  /**
   * Traiter le type 'result'
   */
  private processResultType(data: ParsedMessage, sessionId: string, timestamp: number): void {
    console.log('[StreamingParser] Result type detected');
    
    // Réinitialiser le contenu streaming
    this.streamingContent = '';
    
    GlobalEventBus.emit('agent.streaming.result', { 
      sessionId,
      result: data,
      timestamp 
    });
  }

  /**
   * Traiter le type 'tool_call'
   */
  private processToolCallType(data: ParsedMessage, sessionId: string, timestamp: number): void {
    const subtype = data.subtype;
    
    if (subtype === 'started') {
      // Appel d'outil démarré
      const toolName = data.tool_call?.name || 
                      (data as any).name || 
                      Object.keys(data).find(k => k !== 'type' && k !== 'subtype');
      
      GlobalEventBus.emit('agent.tool.started', { 
        sessionId,
        toolName,
        timestamp 
      });
    } else if (subtype === 'completed') {
      // Appel d'outil terminé
      const toolName = data.tool_call?.name || 
                      (data as any).name || 
                      Object.keys(data).find(k => k !== 'type' && k !== 'subtype');
      const result = (data as any).result;
      
      GlobalEventBus.emit('agent.tool.completed', { 
        sessionId,
        toolName,
        result,
        timestamp 
      });
    }
  }

  /**
   * Traiter le type 'init'
   */
  private processInitType(data: ParsedMessage, sessionId: string, timestamp: number): void {
    console.log('[StreamingParser] Agent initialized:', data);
    GlobalEventBus.emit('agent.initialized', { 
      sessionId,
      data,
      timestamp 
    });
  }

  /**
   * Traiter le type 'assistant' (legacy)
   */
  private processAssistantType(data: ParsedMessage, sessionId: string, timestamp: number): void {
    const contentBlocks = (data as any).message?.content || [];
    
    for (let i = 0; i < contentBlocks.length; i++) {
      const block = contentBlocks[i];
      const blockTimestamp = timestamp + i;
      
      if (block.type === 'text' && block.text?.trim()) {
        // Contenu texte
        this.processTextBlock(block, sessionId, blockTimestamp);
      } else if (block.type === 'tool_use') {
        // Utilisation d'outil
        this.processToolUse(block, sessionId, blockTimestamp);
      }
    }
  }

  /**
   * Traiter le type 'user' (legacy)
   */
  private processUserType(data: ParsedMessage, sessionId: string, timestamp: number): void {
    const content = this.extractTextContent(data.content || (data as any).message?.content);
    GlobalEventBus.emit('agent.status', { 
      sessionId, 
      status: 'processing',
      message: content 
    });
  }

  /**
   * Traiter le type inconnu
   */
  private processUnknownType(data: ParsedMessage, sessionId: string, timestamp: number): void {
    console.log('[StreamingParser] Unknown type:', data.type, data);
    GlobalEventBus.emit('agent.streaming.unknown', { 
      sessionId,
      data,
      timestamp 
    });
  }

  /**
   * Traiter un bloc de texte
   */
  private processTextBlock(block: { type: string; text?: string }, sessionId: string, timestamp: number): void {
    if (!block.text?.trim()) return;
    
    const content = block.text;
    const isDelta = false; // Les blocs de texte sont complets
    
    // Accumuler le contenu
    this.streamingContent += content;
    
    // Créer ou mettre à jour le message
    if (this.currentMessageId) {
      this.updateMessage(sessionId, this.currentMessageId, this.streamingContent, timestamp);
    } else {
      this.currentMessageId = this.createMessageId(sessionId);
      this.createMessage(sessionId, content, 'assistant', timestamp);
    }
    
    // Émettre l'événement
    GlobalEventBus.emit('agent.streaming.text', { 
      sessionId,
      text: content,
      delta: isDelta,
      timestamp 
    });
  }

  /**
   * Traiter l'utilisation d'un outil
   */
  private processToolUse(toolUse: any, sessionId: string, timestamp: number): void {
    const toolName = toolUse.name;
    const input = toolUse.input;
    
    console.log(`[StreamingParser] Tool use: ${toolName}`, input);
    
    GlobalEventBus.emit('agent.tool.call', { 
      sessionId,
      toolName,
      input,
      timestamp 
    });
    
    // Traiter différents types d'outils
    this.processSpecificTool(toolName, input, sessionId, timestamp);
  }

  /**
   * Traiter un outil spécifique
   */
  private processSpecificTool(toolName: string, input: any, sessionId: string, timestamp: number): void {
    switch (toolName) {
      case 'TodoWrite':
      case 'todowrite':
        this.processTodoWriteTool(input, sessionId, timestamp);
        break;
      case 'Write':
      case 'write_file':
        this.processWriteTool(input, sessionId, timestamp);
        break;
      case 'Edit':
      case 'edit_file':
        this.processEditTool(input, sessionId, timestamp);
        break;
      case 'Read':
      case 'read_file':
        this.processReadTool(input, sessionId, timestamp);
        break;
      case 'Bash':
      case 'bash':
      case 'shell':
      case 'shell_command':
        this.processBashTool(input, sessionId, timestamp);
        break;
      case 'WebSearch':
      case 'webSearch':
      case 'web_search':
        this.processWebSearchTool(input, sessionId, timestamp);
        break;
      case 'grep':
      case 'grep_search':
        this.processGrepTool(input, sessionId, timestamp);
        break;
      case 'glob':
      case 'glob_files':
        this.processGlobTool(input, sessionId, timestamp);
        break;
      default:
        // Outil MCP ou inconnu
        this.processUnknownTool(toolName, input, sessionId, timestamp);
    }
  }

  /**
   * Traiter un chunk de texte simple
   */
  private processTextChunk(text: string, sessionId: string, timestamp: number): void {
    // Accumuler le texte
    this.streamingContent += text;
    
    // Mettre à jour ou créer le message
    if (this.currentMessageId) {
      this.updateMessage(sessionId, this.currentMessageId, this.streamingContent, timestamp);
    } else {
      this.currentMessageId = this.createMessageId(sessionId);
      this.createMessage(sessionId, text, 'assistant', timestamp);
    }
    
    // Émettre l'événement
    GlobalEventBus.emit('agent.streaming.text', { 
      sessionId,
      text,
      delta: true,
      timestamp 
    });
  }

  /**
   * Extraire le contenu texte
   */
  private extractTextContent(content: any): string {
    if (typeof content === 'string') {
      return content;
    }
    
    if (Array.isArray(content)) {
      // Extraire le texte de tous les blocs
      return content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n');
    }
    
    return '';
  }

  /**
   * Traiter TodoWrite tool
   */
  private processTodoWriteTool(input: any, sessionId: string, timestamp: number): void {
    const todos = input.todos || [];
    
    GlobalEventBus.emit('agent.tool.todos', { 
      sessionId,
      todos,
      timestamp 
    });
  }

  /**
   * Traiter Write tool
   */
  private processWriteTool(input: any, sessionId: string, timestamp: number): void {
    const filePath = input.file_path || input.filePath || input.path || '';
    const content = input.content || input.fileText || '';
    
    GlobalEventBus.emit('agent.tool.write', { 
      sessionId,
      filePath,
      content,
      timestamp 
    });
  }

  /**
   * Traiter Edit tool
   */
  private processEditTool(input: any, sessionId: string, timestamp: number): void {
    const filePath = input.file_path || input.filePath || input.path || '';
    const oldString = input.old_string || input.oldText || '';
    const newString = input.new_string || input.newText || '';
    
    GlobalEventBus.emit('agent.tool.edit', { 
      sessionId,
      filePath,
      oldString,
      newString,
      timestamp 
    });
  }

  /**
   * Traiter Read tool
   */
  private processReadTool(input: any, sessionId: string, timestamp: number): void {
    const filePath = input.file_path || input.filePath || input.path || '';
    
    GlobalEventBus.emit('agent.tool.read', { 
      sessionId,
      filePath,
      timestamp 
    });
  }

  /**
   * Traiter Bash tool
   */
  private processBashTool(input: any, sessionId: string, timestamp: number): void {
    const command = input.command || input.CommandLine || '';
    
    GlobalEventBus.emit('agent.tool.bash', { 
      sessionId,
      command,
      timestamp 
    });
  }

  /**
   * Traiter WebSearch tool
   */
  private processWebSearchTool(input: any, sessionId: string, timestamp: number): void {
    const query = input.query || '';
    const results = input.results || '';
    
    GlobalEventBus.emit('agent.tool.webSearch', { 
      sessionId,
      query,
      results,
      timestamp 
    });
  }

  /**
   * Traiter Grep tool
   */
  private processGrepTool(input: any, sessionId: string, timestamp: number): void {
    const query = input.query || input.pattern || '';
    const path = input.path || '';
    
    GlobalEventBus.emit('agent.tool.grep', { 
      sessionId,
      query,
      path,
      timestamp 
    });
  }

  /**
   * Traiter Glob tool
   */
  private processGlobTool(input: any, sessionId: string, timestamp: number): void {
    const pattern = input.pattern || input.globPattern || '';
    
    GlobalEventBus.emit('agent.tool.glob', { 
      sessionId,
      pattern,
      timestamp 
    });
  }

  /**
   * Traiter outil inconnu (MCP)
   */
  private processUnknownTool(toolName: string, input: any, sessionId: string, timestamp: number): void {
    console.log(`[StreamingParser] Unknown tool: ${toolName}`, input);
    
    GlobalEventBus.emit('agent.tool.unknown', { 
      sessionId,
      toolName,
      input,
      timestamp 
    });
  }

  /**
   * Créer un ID de message
   */
  private createMessageId(sessionId: string): string {
    return `msg-${sessionId}-${this.messageCounter++}-${Date.now()}`;
  }

  /**
   * Créer un message (placeholder - à implémenter avec MessageStore)
   */
  private createMessage(sessionId: string, content: string, role: 'user' | 'assistant', timestamp: number): void {
    // À implémenter avec MessageStore
    console.log(`[StreamingParser] Create message: ${role} - ${content.substring(0, 50)}`);
  }

  /**
   * Mettre à jour un message (placeholder - à implémenter avec MessageStore)
   */
  private updateMessage(sessionId: string, messageId: string, content: string, timestamp: number): void {
    // À implémenter avec MessageStore
    console.log(`[StreamingParser] Update message ${messageId}: ${content.substring(0, 50)}`);
  }

  /**
   * Obtenir le contenu streaming actuel
   */
  getStreamingContent(): string {
    return this.streamingContent;
  }

  /**
   * Obtenir le buffer actuel
   */
  getBuffer(): string {
    return this.jsonBuffer;
  }

  /**
   * Obtenir l'ID du message courant
   */
  getCurrentMessageId(): string | null {
    return this.currentMessageId;
  }
}

export function createStreamingParser(sessionId: string): StreamingParser {
  return new StreamingParser(sessionId);
}
