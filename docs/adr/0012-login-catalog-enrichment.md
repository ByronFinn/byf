# ADR 0012: Login-Time Catalog Enrichment

## Status

Accepted

## Context

When users configure third-party compatible providers via `/login`, the provider's `/models` API typically does not return rich capability metadata (e.g., `supports_reasoning_effort`). This causes the `/model` UI to degrade — showing only an on/off toggle for thinking instead of effort level selection — even when the underlying model (e.g., `gpt-5.5`, `claude-opus-4-7`) fully supports categorical effort control.

The models.dev catalog maintains authoritative metadata for mainstream models (capabilities, context limits, reasoning keys). A model configured through a third-party provider often has an ID that matches a catalog entry.

## Decision

### 1. Enrich `/login` model metadata from catalog

During `/login`, after fetching models from the provider API, attempt to match each model ID against catalog entries. When a match is found, use the catalog's metadata to fill in fields the provider API did not supply.

### 2. Catalog source priority

1. Remote catalog (`https://models.dev/api.json`) — freshest data, requires network
2. Built-in catalog (`__BYF_CODE_BUILT_IN_CATALOG__`) — shipped with byf, offline fallback
3. Provider API data — final fallback when no catalog match exists

### 3. Matching rule: prefix + separator boundary

A provider model ID matches a catalog entry when the catalog ID is a prefix of the provider ID and the next character (if any) is `-`. Examples:

| Provider ID | Catalog ID | Match |
|---|---|---|
| `gpt-5.5` | `gpt-5.5` | Yes (exact) |
| `gpt-5.5-2025-06-01` | `gpt-5.5` | Yes (prefix + `-` boundary) |
| `claude-opus-4-7-20250605` | `claude-opus-4-7` | Yes (prefix + `-` boundary) |
| `gpt-5.5-turbo` | `gpt-5` | No (`.` is not `-`) |

### 4. Merge strategy: catalog priority, provider fallback

When a match is found, catalog metadata takes priority for all fields it provides. Fields absent from the catalog retain the provider API value. Specifically:

- `capabilities` — from catalog (the primary motivation)
- `maxContextSize` — from catalog
- `maxOutputSize` — from catalog
- `displayName` — from provider (user chose this provider, keep its naming)
- `reasoningKey` — from catalog

### 5. Timing: login-time only, persisted to TOML

Enrichment happens once during `/login`. The result is written to the TOML config file. Subsequent byf startups read from TOML directly without re-querying the catalog. Users who want updated metadata should re-run `/login`.

### 6. Error handling

- Remote catalog fetch fails → fall back to built-in catalog
- Built-in catalog unavailable → use provider API data as-is
- No catalog match for a model ID → use provider API data as-is
- Catalog data causes runtime errors (e.g., a third-party rejects a catalog-suggested parameter) → the existing provider error handling surfaces the error to the user

## Consequences

- Users of third-party compatible providers get correct thinking effort controls in the `/model` UI when their model IDs match catalog entries.
- `/login` now requires network access for optimal enrichment. Offline `/login` still works but with degraded metadata.
- The enrichment is a best-effort enhancement. When catalog data is wrong for a specific third-party provider (e.g., the provider doesn't actually support a catalog-listed capability), the user sees a runtime error — which is better than silently degrading the UI.
- This does not help models that have no catalog entry (e.g., `glm-5.1`, `kimi-k2.6`). Those models continue to rely on whatever the provider API returns or manual TOML configuration of the `capabilities` array.
- Related bug fix: `capabilityToStrings()` in `packages/node-sdk/src/catalog.ts` was missing `thinking_effort`, `thinking_xhigh`, and `thinking_max` mappings (ADR 0005 Decision 5 implementation gap). Fixed alongside this change.
