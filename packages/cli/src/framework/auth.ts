/**
 * Auth — détection des clés d'API par provider (variables d'environnement).
 * Source UNIQUE de la détection : partagée par `run`, `interactive` et `auth`.
 */

export interface DetectedCredentials {
  provider: string;
  apiKey: string;
}

const PROVIDER_KEYS: Array<{ name: string; env: string }> = [
  { name: "Google Gemini", env: "GEMINI_API_KEY" },
  { name: "Google", env: "GOOGLE_API_KEY" },
  { name: "OpenAI", env: "OPENAI_API_KEY" },
  { name: "Mistral", env: "MISTRAL_API_KEY" },
];

/** Première clé trouvée dans l'environnement (null si aucune). */
export function detectProviderAndKey(): DetectedCredentials | null {
  for (const k of PROVIDER_KEYS) {
    const v = process.env[k.env];
    if (v) return { provider: k.name, apiKey: v };
  }
  return null;
}

/** Liste des providers connus (pour `soryos-code auth`). */
export function listProviders(): Array<{ name: string; env: string; present: boolean }> {
  return PROVIDER_KEYS.map((k) => ({
    name: k.name,
    env: k.env,
    present: Boolean(process.env[k.env]),
  }));
}
