# `@soryos/provider` Agent Operating Guidelines

## Overview
This package manages multi-model AI providers and credential resolution.

## Supported Providers
- **Google Gemini**: `gemini-2.5-flash`, `gemini-2.5-pro`
- **OpenAI**: `gpt-4o`, `gpt-4o-mini`, `o1`, `o3-mini`
- **Mistral AI**: `codestral-latest`, `mistral-large-latest`
- **OpenCode Zen / DeepSeek / Grok**

## Responsibilities
- Provide `AIProviderRegistry` (`aiProviderRegistry`).
- Resolve API keys from environment or session overrides.
- Provide model metadata via `SUPPORTED_AI_MODELS`.

## Agent Guidelines
- Never hardcode API keys in source files.
- Always redact API keys in logs using `redactSecretText()`.
