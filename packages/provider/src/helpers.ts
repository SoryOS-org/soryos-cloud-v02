import type { ChatMessage, StreamChunk } from "./types";

declare const __non_webpack_require__: ((id: string) => unknown) | undefined;

export function computeFingerprint(secret?: string): string {
  if (!secret || secret.trim().length === 0) return "none";
  const trimmed = secret.trim();
  
  if (typeof window === "undefined") {
    // Node.js environment
    try {
      const req = typeof __non_webpack_require__ === "function" ? __non_webpack_require__ : eval("require");
      const crypto = req("crypto");
      const hash = crypto.createHash("sha256").update(trimmed).digest("hex");
      return `sha256:${hash.slice(0, 8)}...${hash.slice(-4)}`;
    } catch {
      return "sha256:fallback";
    }
  } else {
    // Browser environment simple hash fallback
    let hash = 0;
    for (let i = 0; i < trimmed.length; i++) {
      hash = (hash << 5) - hash + trimmed.charCodeAt(i);
      hash |= 0;
    }
    return `browser:${Math.abs(hash).toString(16)}`;
  }
}

export function maskSecret(val?: string): string {
  if (!val) return "";
  const trimmed = val.trim();
  if (trimmed.length <= 8) return "••••••••";
  const start = trimmed.slice(0, 4);
  const end = trimmed.slice(-4);
  return `${start}••••••••${end}`;
}

export function redactSecretText(text: string, secretsToRedact: string[] = []): string {
  let result = text;
  for (const sec of secretsToRedact) {
    if (sec && sec.length > 5) {
      result = result.split(sec).join("[REDACTED]");
    }
  }
  result = result.replace(/AIza[0-9A-Za-z-_]{35}/g, "AIza[REDACTED]");
  result = result.replace(/sk-[0-9A-Za-z-_]{20,}/g, "sk-[REDACTED]");
  return result;
}

export interface ParsedApiError {
  statusCode: number;
  errorType: string;
  message: string;
  endpoint: string;
}

export async function parseResponseError(
  res: Response,
  endpoint: string,
  apiKeyToRedact?: string,
): Promise<ParsedApiError> {
  let rawBody = "";
  try {
    rawBody = await res.text();
  } catch {
    rawBody = "(empty response)";
  }

  let errorType = `HTTP_${res.status}`;
  let message = `Request to ${endpoint} failed with HTTP status ${res.status}`;

  try {
    const json = JSON.parse(rawBody);
    if (json.error) {
      if (typeof json.error === "string") {
        message = json.error;
      } else if (typeof json.error === "object") {
        message = json.error.message || json.error.code || message;
        errorType = json.error.type || json.error.code || errorType;
      }
    }
  } catch {
    if (rawBody && rawBody.length > 0) {
      message = rawBody.slice(0, 300);
    }
  }

  const safeMessage = redactSecretText(message, apiKeyToRedact ? [apiKeyToRedact] : []);

  return {
    statusCode: res.status,
    errorType,
    message: safeMessage,
    endpoint,
  };
}
