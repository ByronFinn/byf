# ADR 0002: User-Configurable Providers via /login

## Status

Accepted

## Context

BYF inherited a hardcoded platform system from upstream: `OPEN_PLATFORMS` with `byf-cn` and `byf-ai`, each with a fixed `baseUrl` and `allowedPrefixes`. This tied BYF to specific API endpoints that don't exist (placeholder `.invalid` domains).

Users need to connect to any OpenAI-compatible API (OpenAI, DeepSeek, local Ollama, etc.), not just pre-defined ones. The existing `/login` command was a stub redirecting to `/connect`.

Options considered:
1. **Keep hardcoded platforms** — Replace placeholder URLs with real ones, add more platforms over time
2. **User-configurable providers** — Remove hardcoded platforms entirely, let users define their own via `/login`

## Decision

We chose option 2. Remove `OPEN_PLATFORMS` and `OpenPlatformDefinition`. The `/login` command becomes the entry point for adding custom providers: name → base_url → api_key → select model. Each provider is stored by its user-chosen name in config.

Key design decisions:
- `/login` supports multiple providers
- `/logout <name>` removes a specific provider
- `/connect` is preserved for catalog providers (models.dev)
- First-run prompt offers both `/login` and `/connect`
- Model filtering via `allowedPrefixes` is a manual config-file setting, not exposed in `/login`
- Provider type is always `'openai-compat'`
- If model fetch fails, user can enter model name manually

## Consequences

- **Positive:** Users can connect to any OpenAI-compatible service. No maintenance burden for hardcoded endpoints. Clean separation between custom providers (`/login`) and catalog providers (`/connect`).
- **Negative:** Users must know their `base_url` — no discovery for custom providers. Slightly more steps than a pre-configured platform.
- **Neutral:** The oauth package's `open-platform.ts` is refactored — functions like `fetchOpenPlatformModels` become `fetchModels(baseUrl, apiKey)` with simpler signatures. The bundled type `OpenPlatformDefinition` is removed.
