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

## Agent Guidelines
- Never hardcode API keys in source files.
- Always redact API keys in logs using `redactSecretText()`.
