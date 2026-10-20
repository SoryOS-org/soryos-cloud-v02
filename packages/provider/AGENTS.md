# `@soryos/provider` Agent Operating Guidelines

## Overview
This package manages multi-model AI providers and credential resolution.

## Supported Providers
- **Google Gemini** (15 modèles), **OpenRouter** (16), **OpenAI** (5), **Anthropic** (4),
  **Mistral AI** (3), **DeepSeek** (4), **OpenCode Zen** (4), **Grok** (2), **Cursor** (2)
  → **56 modèles** au total, tous listés dans `SUPPORTED_AI_MODELS`.

`SUPPORTED_AI_MODELS` est la **source unique** du catalogue : la commande
`soryos-code models`, le picker `/model` et l'outil `models` de l'agent
lisent tous ce catalogue (via `listModels()` des providers). Plus de liste
dupliquée ailleurs.

### Règles du catalogue
- L'**id d'un modèle est l'id API réel** : il est envoyé tel quel à l'API du
  provider (ex. OpenRouter attend `openai/gpt-4o-mini`, **pas**
  `openrouter/openai/gpt-4o-mini`).
- Le `getDefaultModel()` de chaque provider doit exister dans le catalogue
  (garanti par `packages/tool/__tests__/model-catalog.test.ts`).

## Responsibilities
- Provide `AIProviderRegistry` (`aiProviderRegistry`).
- Resolve API keys from environment or session overrides.
- Provide model metadata via `SUPPORTED_AI_MODELS`.
- **Multimodal input**: `ChatMessage.images` (base64, no data: prefix) mapped per provider — Gemini `inlineData` parts (`buildGoogleContents`), OpenAI/Generic `image_url` data-URI parts (`buildOpenAIMessages`), Anthropic base64 image blocks (`buildAnthropicMessages`). Pure builders in `helpers.ts`, unit-tested; never silently drop images (unsupported backends surface the API error honestly).

## OpenCode Zen — free tier par clé publique (`src/models-zen.ts`)

Mécanisme adapté du projet opencode de référence :

1. **Clé publique** : sans `OPENCODE_API_KEY` ni identifiants stockés, le
   credential manager renvoie la clé littérale `public`
   (`PUBLIC_GATEWAY_KEY`) — la passerelle l'accepte comme Bearer.
2. **Catalogue réel** : `ZEN_MODELS` reprend les **120 modèles** du catalogue
   models.dev de la référence (ids, noms, descriptions, contexte, coûts).
   38 sont **gratuits** (`cost.input === 0`).
3. **Gating du free tier** : avec la clé publique, seuls les modèles gratuits
   sont utilisables (`isZenModelUsable`). Les payants sont marqués
   « key required » dans le picker du CLI.
4. **Modèle par défaut** = un modèle gratuit (`ZEN_DEFAULT_MODEL`) : le
   provider fonctionne donc immédiatement, sans configuration.

### Endpoint
`https://opencode.ai/inference/v1` (endpoint d'inférence de la référence —
**pas** `api.opencode.ai/api/v1`, qui est l'API console). Surchargeable via
`OPENCODE_BASE_URL`.

### Limite réelle du free tier (honnête)
La passerelle répond `403 FreeTierError` : « OpenCode's free tier can only be
used from within OpenCode ». Le contrôle est côté serveur et résiste à un
simple User-Agent (vérifié : même avec `User-Agent: opencode/...` → 403).

Nous ne nous faisons **PAS** passer pour le client OpenCode :
- le User-Agent envoyé est `soryos-code/1.0 (+https://github.com/SoryOS-org/...)`
- l'erreur est remontée telle quelle + un hint actionnable
  (« utilisez votre propre clé ou un autre provider »)

Avec une clé personnelle (`OPENCODE_API_KEY` ou `soryos-code auth login
opencode-zen`), les 120 modèles sont disponibles.

## Agent Guidelines
- Never hardcode API keys in source files.
- Always redact API keys in logs using `redactSecretText()`.
- A model id in the catalog is the REAL api id (it is sent as-is to the
  provider). Never invent model ids: take them from the reference catalog.
