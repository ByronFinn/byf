# PRD-0010: User-Configurable Providers via /login

## Problem Statement

BYF inherited hardcoded API platform definitions (`byf-cn`, `byf-ai`) with placeholder URLs from the upstream fork. Users cannot connect to arbitrary OpenAI-compatible services. The `/login` and `/logout` commands are disabled stubs. Users must use `/connect` which only supports well-known providers from the models.dev catalog.

## Solution

Replace the hardcoded platform system with user-configurable providers. Restore `/login` as the command to add custom OpenAI-compatible providers by specifying a name, base URL, and API key. Restore `/logout` to remove a specific provider. The models are auto-fetched from the provider's `/models` endpoint, with a manual fallback. The first-run experience guides users to choose between `/login` (custom) and `/connect` (catalog).

## User Stories

1. As a BYF user, I want to run `/login` to add a custom OpenAI-compatible provider, so that I can use any LLM API I have access to
2. As a BYF user, I want to name my provider during `/login`, so that I can distinguish between multiple providers
3. As a BYF user, I want to enter a `base_url` during `/login`, so that I can connect to any OpenAI-compatible endpoint
4. As a BYF user, I want to enter an `api_key` during `/login`, so that my requests are authenticated
5. As a BYF user, I want BYF to automatically fetch available models from my provider after `/login`, so that I can pick the right model without manual configuration
6. As a BYF user, I want to manually enter a model name if auto-fetch fails, so that I am not blocked by incompatible or unreachable `/models` endpoints
7. As a BYF user, I want to configure multiple providers via repeated `/login` calls, so that I can use different LLM services simultaneously
8. As a BYF user, I want to switch between models from different providers via `/model`, so that I can choose the best model for each task
9. As a BYF user, I want to run `/logout <name>` to remove a specific provider, so that I can clean up providers I no longer use
10. As a BYF user, I want `/logout` to also remove all models belonging to that provider, so that stale model entries don't clutter my config
11. As a BYF user, I want `/logout` to clear the default model if it belongs to the removed provider, so that I am not referencing a non-existent provider
12. As a new BYF user, I want the first-run experience to offer me a choice between `/login` (custom provider) and `/connect` (catalog provider), so that I can pick the path that fits my setup
13. As a BYF user, I want `/connect` to keep working for well-known providers, so that I can still quickly set up OpenAI, Anthropic, etc.
14. As a BYF user, I want `/model` to show models from all providers (both custom and catalog) with their provider names, so that I can identify which model belongs to which service
15. As an advanced BYF user, I want to optionally set `allowedPrefixes` in my config file to filter model lists, so that I only see relevant models from providers with many models
16. As a BYF user, I want provider configurations to be stored as `openai-compat` type, so that the system treats them uniformly regardless of origin

## Implementation Decisions

### Module 1: Provider config functions (packages/oauth)

Refactor `open-platform.ts` to remove all hardcoded platform concepts:

- **Delete**: `OpenPlatformDefinition` type, `OPEN_PLATFORMS` constant, `getOpenPlatformById`, `isOpenPlatformId`
- **Rename** `fetchOpenPlatformModels` → `fetchModels`: takes `(baseUrl, apiKey, fetchImpl, signal?)` instead of a platform object. Returns `ModelInfo[]`. Throws `ProviderApiError` on HTTP errors.
- **Rename** `applyOpenPlatformConfig` → `applyProviderConfig`: takes `(config, { name, baseUrl, apiKey, models, selectedModel, thinking })`. The `name` parameter becomes the provider key in config. Writes provider as `type: 'openai-compat'`.
- **Rename** `removeOpenPlatformConfig` → `removeProviderConfig`: takes `(config, providerName)`. Removes the provider entry, all its models, and clears `defaultModel` if it belonged to this provider.
- **Simplify** `filterModelsByPrefix`: takes `(models, prefixes)` as separate params instead of a platform object. No behavior change.
- **Keep** `OpenPlatformApiError` class — rename to `ProviderApiError` to match new terminology.
- **Keep** `ModelInfo`, `ModelAlias`, `ConfigShape`, `capabilitiesForModel` types unchanged.
- **Update** `packages/oauth/src/index.ts` exports to reflect new names.
- **Delete** `packages/oauth/test/open-platform.test.ts` and rewrite as `packages/oauth/test/provider-config.test.ts` covering all refactored functions.

### Module 2: /login command handler (apps/cli)

New TUI flow in `byf-tui.ts`, registered in the slash command registry:

1. **Name input**: Text input prompt for provider name (e.g. "deepseek"). Must be non-empty, no spaces, no collision with existing providers.
2. **Base URL input**: Text input prompt with default suggestion `https://api.openai.com/v1`.
3. **API key input**: Text input prompt (masked if terminal supports it).
4. **Model fetch**: Call `fetchModels(baseUrl, apiKey)`. On success, show model selector. On failure (network error, non-standard response, auth failure), show error and offer manual model name input.
5. **Manual model fallback**: Text input for model ID (e.g. "gpt-4o"). Prompt for `maxContextSize` with a sensible default (128000).
6. **Apply**: Call `applyProviderConfig()` with selected model. Print confirmation with provider name and model.

The command replaces the current stub that prints "Use /connect to configure a provider."

### Module 3: /logout command handler (apps/cli)

Restore from stub in `byf-tui.ts`:

- Accept one argument: provider name (required).
- Validate the provider exists in config.
- Call `removeProviderConfig(config, providerName)`.
- Print confirmation.
- If the removed provider was the active model, print a hint to run `/login` or `/connect` to configure a new one.
- The `/disconnect` alias is preserved.

### Module 4: First-run guidance (apps/cli)

- **Welcome panel** (`welcome.ts`): Change the message from "Run /connect to configure a provider" to offer both options: "/login for a custom provider" and "/connect for a known provider".
- **Error messages** throughout `byf-tui.ts`: Update all instances of "Use /connect to configure a provider" to "Use /login or /connect to configure a provider".
- **Platform selector** (`platform-selector.ts`): This file is currently unused. Delete it, since the first-run choice is handled by the welcome panel text rather than a picker component.

### Data format

Provider config written by `/login`:
```
providers:
  deepseek:
    type: openai-compat
    baseUrl: https://api.deepseek.com/v1
    apiKey: sk-xxx
models:
  deepseek/deepseek-chat:
    provider: deepseek
    model: deepseek-chat
    maxContextSize: 65536
    capabilities: [thinking, tool_use]
defaultModel: deepseek/deepseek-chat
```

This is identical to the format `applyOpenPlatformConfig` produces today, just with a user-chosen provider name instead of a hardcoded platform ID.

## Testing Decisions

### Module 1: Provider config functions (oauth package)
- **Unit tests** in `test/provider-config.test.ts` replacing `test/open-platform.test.ts`.
- Test `fetchModels` with mock `fetch`: success case, HTTP error case, malformed response case, network error case.
- Test `applyProviderConfig`: adds provider and models to empty config, replaces existing models for same provider, preserves other providers' models.
- Test `removeProviderConfig`: removes provider and its models, clears defaultModel if it belonged to removed provider, preserves other providers.
- Test `filterModelsByPrefix`: with prefixes, without prefixes (returns all), empty list.
- Prior art: existing `open-platform.test.ts` covers the same scenarios with the old signatures.

### Module 2: /login command handler
- **Integration tests** using the existing TUI test patterns in `apps/cli/test/`.
- Test the full flow: mock fetch returning models → verify config written correctly.
- Test the fallback flow: mock fetch failing → manual model input → verify config written correctly.
- Test validation: empty name, name collision, empty base_url, empty api_key.

### Module 3: /logout command handler
- **Unit tests**: verify `removeProviderConfig` is called with correct provider name.
- Test error case: non-existent provider name.
- Test active model cleared when its provider is removed.

### Module 4: First-run guidance
- **Snapshot tests** on welcome panel output: verify both `/login` and `/connect` are mentioned.
- Grep-based test: ensure no remaining "Use /connect to configure" messages without also mentioning `/login`.

## Out of Scope

- **`/connect` refactoring**: The catalog provider flow remains unchanged.
- **`/model` command**: No changes needed — it already displays provider names and supports switching.
- **Config migration**: No automatic migration of old `byf-cn`/`byf-ai` entries. Users with existing configs will need to re-run `/login`.
- **`allowedPrefixes` UI**: This remains a manual config-file-only setting, not exposed in any command.
- **API key encryption**: API keys are stored in plain text in the config file, same as today.
- **Provider health checks**: No periodic validation that configured providers are reachable.
- **Non-OpenAI-compatible providers**: Only OpenAI-compatible APIs are supported via `/login`. Other protocols (e.g., Anthropic native) use `/connect`.

## Further Notes

- See ADR 0002 (`docs/adr/0002-user-configurable-providers.md`) for the decision record.
- See `CONTEXT.md` glossary for definitions of Provider, Catalog Provider, `/login`, `/connect`, `/logout`.
- The `no-oauth-references.test.ts` file in the oauth package should be updated to reflect the new exports (renamed functions, removed `OPEN_PLATFORMS` constant).
