# ADR 0016: Multi-Type Providers in /login

Date: 2026-06-18

## Status

Accepted

## Context

ADR 0002 established `/login` as the entry point for user-configured providers, with one hard constraint (decision point #7): "Provider type is always `'openai-compat'`." At the time this was sufficient — the only path to non-OpenAI providers was `/connect`, which derives the wire type from the models.dev catalog.

The gap surfaced in practice: users who want to connect to the native Anthropic endpoint (or a custom Anthropic-compatible gateway) via BYO base URL cannot do so through `/login`. They must either impersonate OpenAI-compatible (relying on a proxy to translate the wire format) or abandon `/login` for `/connect` (which requires the target provider to be catalog-listed). Neither fits the "custom provider, my own endpoint" workflow that is `/login`'s reason to exist.

A code review during `/grill` revealed an additional constraint that bounds the first version: `google-genai` and `vertexai` providers do not consume a user-supplied `baseUrl` at runtime — `runtime-provider.ts` does not pass `baseUrl` into the google-genai kosong config, and `GoogleGenAIChatProvider` ignores it. So exposing a base-URL field for those types would persist a value to TOML that the runtime silently drops, breaking the "custom URL must take effect" promise. This is deferred, not designed away.

## Decision

`/login` no longer hardcodes a single interface type. The flow gains a type-selection step as its first prompt, offering the types whose base-URL propagation is end-to-end functional:

1. `openai-completions` — OpenAI Chat Completions-compatible (unchanged behavior)
2. `openai_responses` — OpenAI Responses API (shares the `/models` endpoint with openai-completions)
3. `anthropic` — Anthropic native endpoint

For each type:
- A native model-listing fetcher is used (`fetchModelsByType` in `@byfriends/oauth`), rather than the OpenAI-compatible shape for all. The Anthropic fetcher uses `x-api-key` + `anthropic-version` headers and handles `has_more`/`last_id` pagination.
- The provider's `type` field written to TOML matches the user's choice.
- Base URL is entered via a placeholder hint (the type's official default), left empty = use the official default.

`google-genai` and `vertexai` are explicitly deferred from the selector until base-URL propagation to those runtime providers is implemented (separate work). This supersedes ADR 0002 decision point #7 only; all other ADR 0002 decisions (multiple providers, `/logout <name>`, `/connect` for catalog providers, manual model entry on fetch failure) remain in force.

Catalog enrichment (ADR 0012) continues to apply uniformly across all `/login` types — model IDs are matched against models.dev regardless of type, since catalog metadata for claude models is authoritative.

## Consequences

### Positive

- Users can connect to the native Anthropic endpoint and Anthropic-compatible gateways directly through `/login`, without an OpenAI-compat translation proxy.
- The `type` field in TOML accurately reflects the wire protocol, eliminating the latent mismatch where an Anthropic endpoint was mislabeled `openai-completions`.
- The base-URL promise ("custom URL takes effect") holds for every offered type — no silent drops, because types that cannot honor it are excluded.

### Negative

- `/login` gains a step. Users connecting to OpenAI-compatible providers (the common case today) make one extra selection.
- Per-type native fetchers add maintenance surface in `@byfriends/oauth` (Anthropic pagination, OpenAI Responses quirks). A future provider type needs its own fetcher.
- `google-genai` / `vertexai` users still cannot use `/login` for BYO endpoints; they must use `/connect` (catalog) or wait for the base-URL propagation work.
- The base-URL convention (baseUrl contains the version path, e.g. `/v1`; fetcher appends `/models`) is end-to-end: a custom proxy that does not follow this convention will fail both listing and runtime chat consistently.

## Alternatives Considered

* **Keep ADR 0002 as-is (always openai-compat):** rejected — leaves the native-endpoint workflow unsupported, the original problem.
* **Implement all five types including google-genai/vertexai now:** rejected — google-genai's runtime ignores `baseUrl` (verified in `runtime-provider.ts` + `GoogleGenAIChatProvider`), so shipping it would persist a silently-ignored config value, violating the custom-URL promise. Better to defer until the propagation fix lands.
* **Derive type from the base URL heuristically:** rejected — fragile (many proxies impersonate multiple wire types) and removes the user's ability to be explicit about a non-obvious gateway.
* **Route all non-OpenAI types through `/connect` only:** rejected — `/connect` requires the provider to be catalog-listed; custom/private Anthropic gateways are exactly the case `/login` exists for.

## References

* [ADR 0002 — User-Configurable Providers via /login](0002-user-configurable-providers.md) (decision point #7 superseded)
* [ADR 0012 — Login-Time Catalog Enrichment](0012-login-catalog-enrichment.md) (enrichment continues to apply)
* `packages/agent-core/src/providers/runtime-provider.ts:280-285` (google-genai omits baseUrl — the deferral trigger)
* `packages/oauth/src/provider-config.ts:183-227` (`applyProviderConfig` hardcodes type today)
