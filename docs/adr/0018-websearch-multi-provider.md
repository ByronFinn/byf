# ADR 0018: WebSearch Multi-Provider Architecture

## Status

Accepted

## Context

WebSearch previously had a single implementation (`RemoteWebSearchProvider`) that only worked with a BYF-private remote search service. When no service was configured, the tool was completely absent. Users could not choose or switch between search backends (Exa, Brave, Firecrawl, etc.).

Meanwhile, the existing `WebSearchProvider` interface already existed but had only one implementation. The TOML config keys (`byfSearch` / `byfFetch`) were also misaligned with what the documentation showed (`web_search` / `web_fetch`).

A key user requirement emerged: the LLM should only know about one search tool (`WebSearch`), regardless of how many backends are configured. This saves tokens (no per-provider tool definitions injected into the prompt) and keeps the tool interface stable when backends change.

## Decision

### 1. Direct REST providers, not MCP

WebSearch providers (Exa, Brave, Firecrawl) communicate via direct REST API calls, not through the MCP infrastructure. Rationale:

- **Token efficiency**: MCP surfaces each provider as a separate tool (`mcp__exa__search`, `mcp__brave__web_search`, etc.), inflating the tool definition tokens. A single `WebSearch` tool with a clean schema is cheaper.
- **Simplicity**: No MCP server lifecycle, connection management, or OAuth flow needed for search.
- **User control**: Users configure search backends in `config.toml` directly with API keys, no separate `mcp.json` entries.

### 2. Priority-based first-wins fallback

Multiple providers are tried in ascending `priority` order. The first provider to return results (including empty results) wins. Fallback is triggered on **any thrown error** (auth failure, rate limit, server error, timeout, bad request). Empty results do NOT trigger fallback — a provider legitimately finding no matches is a valid answer.

This was chosen over multi-provider result merging because:

- Lower latency (no waiting for the slowest provider)
- Simpler logic (no deduplication, ranking, or conflict resolution)
- Sufficient for the primary use case: fault tolerance across providers

### 3. `api_keys` as `string[]` with in-call sequential fallback

Each provider entry supports multiple API keys (`api_keys = ["sk-1", "sk-2"]`). Within a single `search()` call, keys are tried sequentially — first key fails, second key is tried. Each new `search()` call resets to the first key. This is stateless and simple: a recovered key is automatically reused.

### 4. Static `webSearchProviderRegistry` as single source of truth

Provider types (`exa`, `brave`, `firecrawl`) are mapped to their class AND default URL in one static registry object. The Zod `type` enum and `DEFAULT_BASE_URLS` are derived from this registry, not maintained separately. Adding a new provider = one registry entry; type safety guarantees consistency across the Zod schema, defaults, and factory function.

### 5. Config key rename (no deprecation needed)

`byfSearch` → `web_search` (code: `webSearch`), `byfFetch` → `fetch_url` (code: `fetchUrl`). Old keys (`byfSearch`/`byfFetch`) are removed without a deprecation path: the code and documentation were never aligned (docs documented `web_search`/`web_fetch`, code accepted `byfSearch`/`byfFetch`), so no user could have successfully configured the old keys. The old `RemoteWebSearchProvider` (BYF-private protocol) is deleted — it was never publicly documented and the config key mismatch means no user could have successfully configured it anyway.

### 6. AllProvidersFailedError propagation

When all providers fail, `PriorityRouter` throws `AllProvidersFailedError`. This flows through `WebSearchTool`'s existing `catch` block → `classifySearchError()` → returns `{ isError: true }` to the LLM. This keeps the error path consistent with the tool's existing design and avoids faking error messages as search results.

## Consequences

- **Adding a search backend**: Create a new provider class implementing `WebSearchProvider`, add it to the registry, add the type to the Zod enum. No changes to `WebSearchTool` itself.
- **Provider-specific capabilities** (e.g., Exa's `category`, Brave's `freshness`): Not exposed to the LLM. Each provider uses sensible defaults internally. Can be promoted to the tool schema later if needed.
- **`include_content` asymmetry**: Exa and Firecrawl return full page content natively; Brave only returns snippets. This is acceptable — the LLM sees `content` as optional on each result and behaves correctly either way.
- **Timeout**: No per-provider timeout configuration. Each HTTP request inherits the 60s timeout from `proxied-fetch`. If a provider times out, the error triggers fallback to the next provider.
