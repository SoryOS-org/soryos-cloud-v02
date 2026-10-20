/**
 * Auth — détection de la clé d'API réellement utilisable.
 *
 * Ordre de résolution (identique à `@soryos/credentials`) :
 *   provider actif (choisi via `soryos-code auth switch`)
 *   → providers enregistrés sur disque
 *   → variables d'environnement
 */

import { credentialManager, PROVIDER_REGISTRY } from "@soryos/credentials";
import { getActiveProvider } from "./provider-state";

export interface DetectedCredentials {
  provider: string;
  providerId: string;
  apiKey: string;
  source: string;
}

const PROVIDER_ORDER = [
  "google",
  "openai",
  "anthropic",
  "mistral",
  "openrouter",
  "deepseek",
  "grok",
  "opencode-zen",
];

const ENV_VARS: Record<string, string[]> = {
  google: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  grok: ["GROK_API_KEY", "XAI_API_KEY"],
  "opencode-zen": ["OPENCODE_API_KEY"],
};

/** Charge les identifiants du disque dans le store mémoire (une fois au démarrage). */
export async function hydrateCredentials(cwd: string = process.cwd()): Promise<string[]> {
  try {
    return await credentialManager.hydrate(cwd);
  } catch {
    return [];
  }
}

/** Env var défini pour un provider (nom de la variable). */
export function envVarName(providerId: string): string | undefined {
  return ENV_VARS[providerId]?.find((v) => Boolean(process.env[v]));
}

/**
 * Première clé d'API utilisable.
 * @returns null si aucun provider n'est configuré
 */
export async function detectProviderAndKey(): Promise<DetectedCredentials | null> {
  const active = await getActiveProvider();
  const candidates = active
    ? [active, ...PROVIDER_ORDER.filter((p) => p !== active)]
    : PROVIDER_ORDER;

  for (const providerId of candidates) {
    const status = credentialManager.getProviderStatus(providerId);
    if (!status?.configured || !status.maskedKey) continue;

    const resolved = credentialManager.resolveCredentials(providerId);
    if (!resolved.apiKey) continue;

    return {
      provider: status.name,
      providerId,
      apiKey: resolved.apiKey,
      source: resolved.source,
    };
  }

  return null;
}

/** Liste des providers IA déclarés (pour les pickers). */
export function aiProviderIds(): string[] {
  return Object.keys(PROVIDER_REGISTRY).filter((id) => PROVIDER_REGISTRY[id].category === "ai");
}
