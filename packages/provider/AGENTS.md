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

### Catalogue EN DIRECT (prioritaire sur le statique)

La passerelle expose `GET {endpoint}/models` — **ça répond même sans clé**.
C'est la source de vérité : le catalogue statique (`ZEN_MODELS`, 120 modèles)
est un instantané de la référence et devient périmé (modèles retirés → 410,
`upstream unavailable`, etc.).

- `fetchZenModels(endpoint)` → liste réelle servie par la passerelle
- `mergeZenCatalog(liveIds)` → fusion : un id vivant garde ses métadonnées
  (nom, description, coût, free tier), un id inconnu reçoit une entrée
  minimale avec un nom lisible (`prettifyModelId`)
- `OpenCodeProvider.refreshModels()` → rafraîchit le catalogue (best effort,
  timeout 8 s) ; en cas d'échec le catalogue statique reste utilisé
- Le CLI appelle `refreshLiveModels()` avant d'afficher les modèles
  (`soryos-code models`, picker `/model`)
- Le modèle par défaut est recalculé sur la liste vivante (un modèle gratuit
  vivant)

### Limite réelle du free tier (honnête)
La passerelle répond `403 FreeTierError` : « OpenCode's free tier can only be
used from within OpenCode ». Le contrôle est côté serveur et résiste à un
simple User-Agent (vérifié : même avec `User-Agent: opencode/...` → 403).

Constat mesuré en direct (API réelle) : avec la clé publique, les modèles
**existants** renvoient tous `403 FreeTierError`. Les ids du catalogue périmé
renvoient `upstream unavailable` (erreur de modèle, avant le contrôle) — d'où
l'importance du catalogue en direct.

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
