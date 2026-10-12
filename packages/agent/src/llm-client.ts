/**
 * @soryos/agent
 * Real streaming LLM client. Resolves the API key through @soryos/credentials
 * (session override → settings store → env var) and calls the provider API.
 */

import { credentialManager } from "@soryos/credentials";
import { SUPPORTED_AI_MODELS } from "@soryos/provider";

export interface ChatMessageInput {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamChatOptions {
  providerId: string;
  model: string;
  messages: ChatMessageInput[];
  sessionId?: string;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
}

const OPENAI_COMPATIBLE_ENDPOINTS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  mistral: "https://api.mistral.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  deepseek: "https://api.deepseek.com/v1",
  grok: "https://api.x.ai/v1",
  "opencode-zen": "https://zen.opencode.ai/api/v1",
};

const PROVIDER_ALIASES: Record<string, string> = {
  gemini: "google",
  "google gemini": "google",
  xai: "grok",
  zen: "opencode-zen",
  opencode: "opencode-zen",
  claude: "anthropic",
};

/** Retired / renamed model ids mapped to their current equivalent. */
const MODEL_ALIASES: Record<string, string> = {
  "gemini-2.5-flash": "gemini-3.8-flash",
  "gemini-2.5-pro": "gemini-3.8-pro",
  "gemini-2.0-flash": "gemini-3.8-flash",
  "codestral-2501": "codestral-latest",
  "mistral-large-2411": "mistral-large-latest",
};

export const DEFAULT_PROVIDER_MODELS: Record<string, string> = {
  google: "gemini-3.8-flash",
  mistral: "codestral-latest",
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-5",
  deepseek: "deepseek-chat",
  grok: "grok-2-latest",
  openrouter: "openrouter/auto",
};

export function resolveModelId(providerId: string, model?: string | null): string {
  const m = (model || "").trim();
  if (!m) return DEFAULT_PROVIDER_MODELS[providerId] || "";
  if (MODEL_ALIASES[m]) return MODEL_ALIASES[m];
  // OpenRouter ids are stored as "openrouter/<vendor>/<model>" but the API expects "<vendor>/<model>"
  if (providerId === "openrouter" && m.startsWith("openrouter/") && m !== "openrouter/auto") {
    return m.slice("openrouter/".length);
  }
  return m;
}

/** Normalizes a provider label ("DeepSeek", "Gemini") to its registry id. */
export function normalizeProviderId(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const id = raw.trim().toLowerCase();
  return PROVIDER_ALIASES[id] || id;
}

/** Finds the provider owning a model id, if known. */
export function providerForModel(model?: string | null): string | undefined {
  if (!model) return undefined;
  return SUPPORTED_AI_MODELS.find((m) => m.id === model)?.providerId;
}

async function readSSE(
  response: Response,
  onData: (data: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.body) throw new Error("Réponse vide du fournisseur IA");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    if (signal?.aborted) break;
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data:")) onData(trimmed.slice(5).trim());
    }
  }
  const rest = buffer.trim();
  if (rest.startsWith("data:")) onData(rest.slice(5).trim());
}

export async function streamChat(options: StreamChatOptions): Promise<string> {
  const providerId = normalizeProviderId(options.providerId) || "opencode-zen";
  const cred = credentialManager.resolveCredentials(providerId, options.sessionId);
  if (!cred.isConfigured || !cred.apiKey) {
    throw new Error(
      `Aucune clé API configurée pour « ${providerId} ». Ajoutez-la dans Paramètres → Fournisseurs IA.`,
    );
  }

  const model = resolveModelId(providerId, options.model);
  let full = "";
  const emit = (text: string) => {
    if (!text) return;
    full += text;
    options.onDelta(text);
  };

  if (providerId === "anthropic") {
    const system = options.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: options.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cred.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        stream: true,
        ...(system ? { system } : {}),
        messages: options.messages.filter((m) => m.role !== "system"),
      }),
    });
    if (!response.ok) {
      throw new Error(`Erreur Anthropic ${response.status} : ${(await response.text()).slice(0, 500)}`);
    }
    await readSSE(response, (data) => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") emit(parsed.delta.text);
        if (parsed.type === "error") throw new Error(parsed.error?.message || "Erreur Anthropic");
      } catch (e) {
        if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
      }
    }, options.signal);
    return full;
  }

  const endpoint = OPENAI_COMPATIBLE_ENDPOINTS[providerId];
  if (!endpoint) throw new Error(`Fournisseur IA inconnu : ${providerId}`);

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    signal: options.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cred.apiKey}`,
    },
    body: JSON.stringify({ model, messages: options.messages, stream: true }),
  });
  if (!response.ok) {
    throw new Error(`Erreur ${providerId} ${response.status} : ${(await response.text()).slice(0, 500)}`);
  }
  await readSSE(response, (data) => {
    if (data === "[DONE]") return;
    try {
      const parsed = JSON.parse(data);
      if (parsed.error) throw new Error(parsed.error.message || JSON.stringify(parsed.error));
      emit(parsed.choices?.[0]?.delta?.content || "");
    } catch (e) {
      if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
    }
  }, options.signal);
  return full;
}

export interface ProviderPingResult {
  success: boolean;
  httpStatus: number;
  model: string;
  endpoint: string;
  latencyMs: number;
  response: string;
  error?: string;
}

/** Real end-to-end check: sends a tiny prompt to the provider and reads the streamed answer. */
export async function pingProvider(
  rawProviderId: string,
  model?: string,
  sessionId?: string,
  prompt = "Réponds uniquement : OK",
): Promise<ProviderPingResult> {
  const providerId = normalizeProviderId(rawProviderId) || rawProviderId;
  const resolved = resolveModelId(providerId, model);
  const endpoint =
    providerId === "anthropic" ? "https://api.anthropic.com/v1" : OPENAI_COMPATIBLE_ENDPOINTS[providerId] || "";
  const start = Date.now();
  try {
    const text = await streamChat({
      providerId,
      model: resolved,
      sessionId,
      messages: [{ role: "user", content: prompt }],
      onDelta: () => {},
    });
    return {
      success: text.trim().length > 0,
      httpStatus: 200,
      model: resolved,
      endpoint,
      latencyMs: Date.now() - start,
      response: text.trim(),
      error: text.trim() ? undefined : "Réponse vide du fournisseur",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = Number(msg.match(/\b([45]\d\d)\b/)?.[1] || 0);
    return {
      success: false,
      httpStatus: status || 500,
      model: resolved,
      endpoint,
      latencyMs: Date.now() - start,
      response: "",
      error: msg,
    };
  }
}
