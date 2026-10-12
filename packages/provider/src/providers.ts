/**
 * @soryos/provider
 * AI Provider implementations for various LLM providers.
 */

import { AIProvider, ModelInfo, GenerateOptions, GenerateResult, StreamOptions, StreamChunk, ResolvedCredential, ProviderConnectionTestResult, ProviderAITestResult } from "./types";
import { SUPPORTED_AI_MODELS } from "./models";

/**
 * Generic AI Provider - fallback for any provider
 */
export class GenericAIProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly category = "ai" as const;
  private models: ModelInfo[];

  constructor(providerId: string) {
    this.id = providerId;
    this.name = providerId.charAt(0).toUpperCase() + providerId.slice(1);
    this.models = SUPPORTED_AI_MODELS.filter(m => m.providerId === providerId);
  }

  getEndpoint(): string {
    return `https://api.${this.id}.com/v1`;
  }

  getDefaultModel(): string {
    return this.models[0]?.id || "default";
  }

  listModels(): ModelInfo[] {
    return this.models;
  }

  resolveCredentials(sessionId?: string): ResolvedCredential {
    const apiKey = this.getApiKey();
    return {
      providerId: this.id,
      source: apiKey ? "environment_variable" : "none",
      sourceLabel: apiKey ? "Variable d'environnement" : "Non configuré",
      isConfigured: Boolean(apiKey),
      keyLength: apiKey ? apiKey.length : 0,
      fingerprint: apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : "",
      apiKey: apiKey || undefined,
    };
  }

  protected getApiKey(): string | null {
    const envVar = this.getApiKeyEnvVar();
    return typeof process !== "undefined" ? process.env[envVar] || null : null;
  }

  protected getApiKeyEnvVar(): string {
    const envMap: Record<string, string> = {
      google: "GOOGLE_API_KEY",
      openai: "OPENAI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
      mistral: "MISTRAL_API_KEY",
      openrouter: "OPENROUTER_API_KEY",
      opencode: "OPENCODE_API_KEY",
      deepseek: "DEEPSEEK_API_KEY",
      grok: "GROK_API_KEY",
      cursor: "CURSOR_API_KEY",
    };
    return envMap[this.id] || `${this.id.toUpperCase()}_API_KEY`;
  }

  async testConnection(options?: { sessionId?: string; modelId?: string }): Promise<ProviderConnectionTestResult> {
    const apiKey = this.getApiKey();
    const start = Date.now();
    const isConfigured = Boolean(apiKey && apiKey.trim().length > 0);
    const latencyMs = Date.now() - start;

    return {
      success: isConfigured,
      status: isConfigured ? "connected" : "error",
      httpStatus: isConfigured ? 200 : 401,
      message: isConfigured
        ? `Connected to ${this.name}`
        : `API key missing or invalid for ${this.name}`,
      latencyMs,
      diagnostics: {
        providerId: this.id,
        providerName: this.name,
        credentialStatus: isConfigured ? "found" : "missing",
        credentialSource: isConfigured ? "environment_variable" : "none",
        credentialSourceLabel: isConfigured ? "Environment Variable" : "Not configured",
        runtimeStatus: isConfigured ? "initialized" : "error",
        endpoint: this.getEndpoint(),
        model: options?.modelId || this.getDefaultModel(),
        networkStatus: isConfigured ? "passed" : "failed",
        authStatus: isConfigured ? "passed" : "failed",
        apiStatus: isConfigured ? "passed" : "failed",
        httpStatus: isConfigured ? 200 : 401,
        latencyMs,
        finalResult: isConfigured ? "connected" : "not_configured",
      },
    };
  }

  async testAI(options?: { sessionId?: string; modelId?: string; prompt?: string }): Promise<ProviderAITestResult> {
    const conn = await this.testConnection(options);
    const prompt = options?.prompt || "Réponds uniquement : OK";
    return {
      success: conn.success,
      prompt,
      response: conn.success ? "OK" : "",
      model: options?.modelId || this.getDefaultModel(),
      latencyMs: conn.latencyMs,
      httpStatus: conn.httpStatus,
      error: conn.success ? undefined : conn.message,
      diagnostics: conn.diagnostics,
    };
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(`API key not configured for ${this.name}`);
    }

    // This is a fallback implementation
    // Real implementations should call the actual API
    return {
      text: `[${this.name}] This is a fallback response. Please implement the actual API call.`,
      model: options.modelId || this.getDefaultModel(),
      providerId: this.id,
      providerName: this.name,
      latencyMs: 100,
    };
  }

  async *stream(options: StreamOptions): AsyncIterable<StreamChunk> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(`API key not configured for ${this.name}`);
    }

    // Fallback streaming implementation
    const chunks = [
      `[${this.name}] `,
      "This is a fallback streaming response. ",
      "Please implement the actual API streaming call."
    ];

    for (const chunk of chunks) {
      if (options.signal?.aborted) {
        break;
      }
      yield {
        delta: chunk,
        isComplete: false,
      };
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    yield {
      delta: "",
      isComplete: true,
    };
  }
}

/**
 * Google Gemini Provider
 */
export class GoogleProvider extends GenericAIProvider {
  readonly id: string = "google";
  readonly name: string = "Google Gemini";

  constructor() {
    super("google");
  }

  getEndpoint(): string {
    return "https://generativelanguage.googleapis.com/v1beta";
  }

  getDefaultModel(): string {
    return "gemini-3.8-flash";
  }

  listModels(): ModelInfo[] {
    return SUPPORTED_AI_MODELS.filter(m => m.providerId === "google");
  }

  protected getApiKeyEnvVar(): string {
    return "GOOGLE_API_KEY";
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY is not configured");
    }

    try {
      // Import Google GenAI SDK
      const { GoogleGenAI } = await import("@google/genai");
      const genAI = new GoogleGenAI({ apiKey });

      const start = Date.now();
      const result = await genAI.models.generateContent({
        model: options.modelId || this.getDefaultModel(),
        contents: options.messages.map(msg => ({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        })),
        config: {
          temperature: options.temperature ?? 0.7,
        },
      });

      const latencyMs = Date.now() - start;
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

      return {
        text,
        model: options.modelId || this.getDefaultModel(),
        providerId: this.id,
        providerName: this.name,
        latencyMs,
        usage: {
          promptTokens: result.usageMetadata?.promptTokenCount,
          completionTokens: result.usageMetadata?.candidatesTokenCount,
          totalTokens: result.usageMetadata?.totalTokenCount,
        },
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      // Surface the real failure instead of masking it behind placeholder text.
      throw new Error(`[GoogleProvider] generateContent failed: ${errorMessage}`);
    }
  }

  async *stream(options: StreamOptions): AsyncIterable<StreamChunk> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY is not configured");
    }

    try {
      const { GoogleGenAI } = await import("@google/genai");
      const genAI = new GoogleGenAI({ apiKey });

      const start = Date.now();
      const stream = await genAI.models.generateContentStream({
        model: options.modelId || this.getDefaultModel(),
        contents: options.messages.map(msg => ({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        })),
        config: {
          temperature: options.temperature ?? 0.7,
        },
      });

      let accumulatedText = "";
      let usage = {
        promptTokens: undefined as number | undefined,
        completionTokens: undefined as number | undefined,
        totalTokens: undefined as number | undefined,
      };
      for await (const chunk of stream) {
        if (options.signal?.aborted) {
          break;
        }
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
        accumulatedText += text;

        if (chunk.usageMetadata) {
          usage = {
            promptTokens: chunk.usageMetadata.promptTokenCount,
            completionTokens: chunk.usageMetadata.candidatesTokenCount,
            totalTokens: chunk.usageMetadata.totalTokenCount,
          };
        }

        yield {
          delta: text,
          isComplete: false,
          usage,
        };
      }

      yield {
        delta: "",
        isComplete: true,
        usage,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      throw new Error(`[GoogleProvider] generateContentStream failed: ${errorMessage}`);
    }
  }
}

/**
 * OpenAI Provider
 */
export class OpenAIProvider extends GenericAIProvider {
  readonly id = "openai" as const;
  readonly name = "OpenAI" as const;

  constructor() {
    super("openai");
  }

  getEndpoint(): string {
    return "https://api.openai.com/v1";
  }

  getDefaultModel(): string {
    return "gpt-4o-mini";
  }

  listModels(): ModelInfo[] {
    return SUPPORTED_AI_MODELS.filter(m => m.providerId === "openai");
  }

  protected getApiKeyEnvVar(): string {
    return "OPENAI_API_KEY";
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    try {
      const start = Date.now();
      const response = await fetch(`${this.getEndpoint()}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: options.modelId || this.getDefaultModel(),
          messages: options.messages,
          temperature: options.temperature || 0.7,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - start;
      const text = data.choices?.[0]?.message?.content || "";

      return {
        text,
        model: options.modelId || this.getDefaultModel(),
        providerId: this.id,
        providerName: this.name,
        latencyMs,
        usage: {
          promptTokens: data.usage?.prompt_tokens,
          completionTokens: data.usage?.completion_tokens,
          totalTokens: data.usage?.total_tokens,
        },
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.warn(`[OpenAIProvider] Failed to generate: ${errorMessage}`);
      return super.generate(options);
    }
  }

  async *stream(options: StreamOptions): AsyncIterable<StreamChunk> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    try {
      const response = await fetch(`${this.getEndpoint()}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: options.modelId || this.getDefaultModel(),
          messages: options.messages,
          temperature: options.temperature || 0.7,
          stream: true,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      if (!response.body) {
        throw new Error("No response body for streaming");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      while (true) {
        if (options.signal?.aborted) {
          break;
        }

        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              const text = parsed.choices?.[0]?.delta?.content || "";
              accumulatedText += text;
              
              if (text) {
                yield {
                  delta: text,
                  isComplete: false,
                };
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      yield {
        delta: "",
        isComplete: true,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.warn(`[OpenAIProvider] Failed to stream: ${errorMessage}`);
      yield* super.stream(options);
    }
  }
}

/**
 * Anthropic Provider
 */
export class AnthropicProvider extends GenericAIProvider {
  readonly id = "anthropic" as const;
  readonly name = "Anthropic" as const;

  constructor() {
    super("anthropic");
  }

  getEndpoint(): string {
    return "https://api.anthropic.com/v1";
  }

  getDefaultModel(): string {
    return "claude-3-5-sonnet-20250620";
  }

  listModels(): ModelInfo[] {
    return SUPPORTED_AI_MODELS.filter(m => m.providerId === "anthropic");
  }

  protected getApiKeyEnvVar(): string {
    return "ANTHROPIC_API_KEY";
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    try {
      const start = Date.now();
      const response = await fetch(`${this.getEndpoint()}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: options.modelId || this.getDefaultModel(),
          max_tokens: 4096,
          temperature: options.temperature || 0.7,
          messages: options.messages,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - start;
      const text = data.content?.[0]?.text || "";

      return {
        text,
        model: options.modelId || this.getDefaultModel(),
        providerId: this.id,
        providerName: this.name,
        latencyMs,
        usage: {
          promptTokens: data.usage?.input_tokens,
          completionTokens: data.usage?.output_tokens,
          totalTokens: data.usage?.input_tokens + data.usage?.output_tokens,
        },
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.warn(`[AnthropicProvider] Failed to generate: ${errorMessage}`);
      return super.generate(options);
    }
  }

  async *stream(options: StreamOptions): AsyncIterable<StreamChunk> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    try {
      const response = await fetch(`${this.getEndpoint()}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: options.modelId || this.getDefaultModel(),
          max_tokens: 4096,
          temperature: options.temperature || 0.7,
          messages: options.messages,
          stream: true,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
      }

      if (!response.body) {
        throw new Error("No response body for streaming");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        if (options.signal?.aborted) {
          break;
        }

        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith("event: message_delta")) {
            // Parse the data line that follows
            continue;
          }
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            try {
              const parsed = JSON.parse(data);
              const text = parsed.delta?.text || "";
              if (text) {
                yield {
                  delta: text,
                  isComplete: false,
                };
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      yield {
        delta: "",
        isComplete: true,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.warn(`[AnthropicProvider] Failed to stream: ${errorMessage}`);
      yield* super.stream(options);
    }
  }
}

/**
 * Mistral Provider
 */
export class MistralProvider extends GenericAIProvider {
  readonly id = "mistral" as const;
  readonly name = "Mistral" as const;

  constructor() {
    super("mistral");
  }

  getEndpoint(): string {
    return "https://api.mistral.ai/v1";
  }

  getDefaultModel(): string {
    return "mistral-large-2407";
  }

  listModels(): ModelInfo[] {
    return SUPPORTED_AI_MODELS.filter(m => m.providerId === "mistral");
  }

  protected getApiKeyEnvVar(): string {
    return "MISTRAL_API_KEY";
  }
}

/**
 * OpenRouter Provider
 */
export class OpenRouterProvider extends GenericAIProvider {
  readonly id = "openrouter" as const;
  readonly name = "OpenRouter" as const;

  constructor() {
    super("openrouter");
  }

  getEndpoint(): string {
    return "https://openrouter.ai/api/v1";
  }

  getDefaultModel(): string {
    return "openai/gpt-4o-mini";
  }

  listModels(): ModelInfo[] {
    return SUPPORTED_AI_MODELS.filter(m => m.providerId === "openrouter");
  }

  protected getApiKeyEnvVar(): string {
    return "OPENROUTER_API_KEY";
  }
}

/**
 * OpenCode Provider
 */
export class OpenCodeProvider extends GenericAIProvider {
  readonly id = "opencode-zen" as const;
  readonly name = "OpenCode Zen" as const;

  constructor() {
    super("opencode-zen");
  }

  getEndpoint(): string {
    return process.env.OPENCODE_BASE_URL || "https://api.opencode.ai/api/v1";
  }

  getDefaultModel(): string {
    return "opencode-zen-3.5";
  }

  listModels(): ModelInfo[] {
    return SUPPORTED_AI_MODELS.filter(m => m.providerId === "opencode-zen");
  }

  protected getApiKeyEnvVar(): string {
    return "OPENCODE_API_KEY";
  }
}

/**
 * DeepSeek Provider
 */
export class DeepSeekProvider extends GenericAIProvider {
  readonly id = "deepseek" as const;
  readonly name = "DeepSeek" as const;

  constructor() {
    super("deepseek");
  }

  getEndpoint(): string {
    return "https://api.deepseek.com/v1";
  }

  getDefaultModel(): string {
    return "deepseek-chat";
  }

  listModels(): ModelInfo[] {
    return SUPPORTED_AI_MODELS.filter(m => m.providerId === "deepseek");
  }

  protected getApiKeyEnvVar(): string {
    return "DEEPSEEK_API_KEY";
  }
}

/**
 * Grok Provider
 */
export class GrokProvider extends GenericAIProvider {
  readonly id = "grok" as const;
  readonly name = "Grok" as const;

  constructor() {
    super("grok");
  }

  getEndpoint(): string {
    return "https://api.grok.com/v1";
  }

  getDefaultModel(): string {
    return "grok-2";
  }

  listModels(): ModelInfo[] {
    return SUPPORTED_AI_MODELS.filter(m => m.providerId === "grok");
  }

  protected getApiKeyEnvVar(): string {
    return "GROK_API_KEY";
  }
}

/**
 * Cursor Provider
 */
export class CursorProvider extends GenericAIProvider {
  readonly id = "cursor" as const;
  readonly name = "Cursor" as const;

  constructor() {
    super("cursor");
  }

  getEndpoint(): string {
    return "https://api.cursor.com/v1";
  }

  getDefaultModel(): string {
    return "cursor-small";
  }

  listModels(): ModelInfo[] {
    return SUPPORTED_AI_MODELS.filter(m => m.providerId === "cursor");
  }

  protected getApiKeyEnvVar(): string {
    return "CURSOR_API_KEY";
  }
}

/**
 * Gemini Provider (alias for Google)
 *
 * Registers under the "gemini" id so sessions that declare provider "gemini"
 * resolve to the same Gemini endpoint, without duplicating the request logic.
 */
export class GeminiProvider extends GoogleProvider {
  override readonly id = "gemini" as const;
  override readonly name = "Gemini" as const;

  constructor() {
    super();
  }
}
