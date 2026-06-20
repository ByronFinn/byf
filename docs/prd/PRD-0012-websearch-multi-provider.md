# PRD-0012: WebSearch Multi-Provider Support

## Status: Grilled

## Problem Statement

WebSearchTool currently only works with a single remote HTTP search service (via `RemoteWebSearchProvider`), and the tool is **completely absent** when no service is configured. This creates several problems:

1. **No search capability without configuration** — FetchURL has a local fallback, WebSearch does not
2. **Single backend lock-in** — users cannot choose or switch between search providers
3. **No fault tolerance** — a single search service failure makes the tool unusable
4. **Misaligned TOML keys** — code uses `byfSearch` / `byfFetch` but docs document `web_search` / `web_fetch`, causing silent config drops via Zod stripping

Meanwhile, the existing `WebSearchProvider` interface already exists but has only one implementation.

## Solution

### Architecture

```
LLM → WebSearchTool (unchanged, single tool)
         └─ PriorityRouter (new) — try providers by priority, fallback on failure
              ├─ ExaWebSearchProvider
              ├─ BraveWebSearchProvider
              ├─ FirecrawlWebSearchProvider
              └─ ...more in registry.ts
```

- **LLM sees one tool**: `WebSearch` with clean input schema (`query`, `limit`, `include_content`)
- **Backend switching is transparent**: no MCP needed, no extra tool definitions
- **Priority-based fallback**: providers tried in order, automatic failover
- **`api_keys` always `string[]`**: unified, minimal mental model

### Provider Registry

Static mapping in `providers/registry.ts`:

```typescript
const registry = {
  exa: ExaWebSearchProvider,
  brave: BraveWebSearchProvider,
  firecrawl: FirecrawlWebSearchProvider,
} as const;
```

Adding a new provider = one file + one registry entry.

## User Stories

1. As a user, I can configure multiple search providers in `config.toml` with priority-based fallback.
2. As a user, I can use multiple Exa API keys under the same provider entry.
3. As a user, I only need to know `WebSearch` as the search tool — LLM learns no per-provider tool names.
4. As a user, when a provider fails (auth/rate-limit/server-error/timeout), WebSearch automatically falls back to the next priority provider.
5. As a user, I can override `base_url` for any provider (e.g., to use a proxy or self-hosted endpoint).

## Requirements

### Functional

1. **Multi-provider config**: Support `[[services.web_search.providers]]` array-of-tables in TOML with `type`, `api_keys`, `priority`, optional `base_url`.
2. **Priority ordering**: Providers are tried in ascending `priority` order.
3. **Fallback logic**: Only trigger fallback on auth errors (401/403), rate limiting (429), server errors (5xx), and network timeouts. Do NOT fallback on empty results or 400 Bad Request.
4. **All-providers-failed behavior**: Return empty results with last error description. Do not throw.
5. **Provider signatures**:
   - Exa: `POST { query, numResults }` → `results[].{ title, url, text }`
   - Brave: `GET ?q=&count=` → `web.results[].{ title, url, description, age }`
   - Firecrawl: `POST { query, limit }` → `data.web[].{ title, url, description }`
6. **Config key rename**: `byfSearch` → `web_search` (TOML key, maps to `webSearch` in code). `byfFetch` → `fetch_url` (TOML key, maps to `fetchUrl` in code).
7. **Default base URLs**: Each built-in type has a known default `base_url`. User only needs `type` + `api_keys` + `priority`.

### Non-functional

1. **Zero-config-not-required**: If no `[services.web_search]` is configured, WebSearchTool is not registered (same as today's behavior).
2. **Provider isolation**: One provider's bug must not affect others.
3. **No MCP dependency**: Search works entirely through direct REST calls, no MCP infrastructure needed.
4. **Backward compatibility**: Old `byfSearch`/`byfFetch` config keys should produce a helpful error or deprecation warning (not silent failure).

## Acceptance Criteria

1. TOML config with 2+ providers is loaded and WebSearch shows up as a tool.
2. When priority-1 provider returns results, priority-2 provider is never called.
3. When priority-1 provider returns 503, priority-2 provider is called automatically.
4. When priority-1 provider returns 200 with empty array (no results), priority-2 is NOT called.
5. When all providers fail, tool returns `{ isError: true }` with error message via `classifySearchError` (PriorityRouter throws `AllProvidersFailedError`, WebSearchTool catches and formats it).
6. A single provider with multiple api_keys rotates through them before falling back.
7. `base_url` override works (user-specified URL takes precedence over default).
8. Old config with `[services.byfSearch]` logs a deprecation warning pointing to the new key.

## Definition of Done

- [ ] Zod schema updated for `services.web_search` and `services.fetch_url`
- [ ] `createRuntimeConfig()` builds `PriorityRouter` from config
- [ ] `ExaWebSearchProvider` implemented
- [ ] `BraveWebSearchProvider` implemented
- [ ] `FirecrawlWebSearchProvider` implemented
- [ ] `PriorityRouter` with fallback logic implemented
- [ ] `registry.ts` mapping created
- [ ] `RemoteWebSearchProvider` removed (replaced by per-type providers)
- [ ] Deprecation warning for old `byfSearch`/`byfFetch` keys
- [ ] English and Chinese config docs updated
- [ ] Changeset generated (`minor` bump for new feature, not `major` since old config gets a deprecation warning, not removal)

## Out of Scope

| Item | Rationale |
|---|---|
| Provider-specific advanced params in tool schema (e.g., Exa `category`, Brave `freshness`) | Keep LLM interface clean; can add later if needed |
| Multi-provider result merging | Complexity not justified; priority-based first-wins is sufficient |
| Search result caching | Independent concern, can be added later |
| `custom` provider type | Zero-code API adapter is complex and fragile; users with niche APIs can use Bash |
| Local search provider (DDG/searxng) | Not needed since search is always configured with provider API keys |
| MCP-based search provider | User explicitly does not want MCP dependency for search |

## Technical Approach

### Config Schema Changes

```typescript
// New schema in config/schema.ts
const WebSearchProviderConfigSchema = z.object({
  type: z.enum(['exa', 'brave', 'firecrawl']),
  api_keys: z.array(z.string().min(1)).nonempty(),
  base_url: z.string().optional(),
  priority: z.number().int().positive(),
});

const WebSearchConfigSchema = z.object({
  providers: z.array(WebSearchProviderConfigSchema).nonempty(),
});

// ServicesConfigSchema updated
const ServicesConfigSchema = z.object({
  webSearch: WebSearchConfigSchema.optional(),
  // renamed from byfFetch
  fetchUrl: ByfServiceConfigSchema.optional(),
});
```

Also accept the old keys (`byfSearch`, `byfFetch`) with a `.refine()` that logs a deprecation warning.

### Runtime Config

```typescript
// createRuntimeConfig() in core-impl.ts
const webSearchConfig = config.services?.webSearch;
const webSearcher = webSearchConfig
  ? new PriorityRouter(
      webSearchConfig.providers
        .sort((a, b) => a.priority - b.priority)
        .map(p => createProvider(p))
    )
  : undefined;
```

### Provider Interface

```typescript
// Existing WebSearchProvider interface — unchanged
interface WebSearchProvider {
  search(query: string, options?: {
    limit?: number;
    includeContent?: boolean;
    toolCallId?: string;
  }): Promise<WebSearchResult[]>;
}
```

### PriorityRouter

```typescript
class AllProvidersFailedError extends Error {
  constructor(public readonly lastError: string | undefined) {
    super(`All search providers failed. Last error: ${lastError ?? 'unknown'}`);
  }
}

class PriorityRouter implements WebSearchProvider {
  constructor(private readonly providers: WebSearchProvider[]) {}

  async search(query: string, options?: SearchOptions): Promise<WebSearchResult[]> {
    let lastError: string | undefined;
    for (const provider of this.providers) {
      try {
        const results = await provider.search(query, options);
        return results; // first success — includes empty array (no results)
      } catch (err) {
        // All errors trigger fallback (BadRequestError won't reach here —
        // provider implementations return empty array for 0 results,
        // and 400 errors are surfaced as errors that still allow trying next)
        lastError = err instanceof Error ? err.message : String(err);
        continue;
      }
    }
    // All failed — throw to let WebSearchTool's classifySearchError handle it
    throw new AllProvidersFailedError(lastError);
  }
}
```

**Error flow**: PriorityRouter throws `AllProvidersFailedError` when all providers fail. WebSearchTool's existing `catch` block catches it, `classifySearchError()` classifies it as `Search failed:`, and returns `{ isError: true }` to the LLM. Empty results (`[]`) pass through as a normal success with "No search results found." output.
```

### Helper: `shouldFallback()` and `isNonFallbackError()`

~~Errors are classified by provider implementations into typed error classes:~~

Error classification is no longer needed at the Router level — all errors from individual Search Provider implementations trigger fallback to the next provider. The Router does not need to distinguish error types because:

- Empty results (search legitimately found nothing) → provider returns `[]`, not an error → no fallback
- All actual errors (401/403/429/5xx/timeout/400) → thrown by provider → Router catches and tries next
- All providers exhausted → Router throws `AllProvidersFailedError` → WebSearchTool's `classifySearchError` handles it

The distinction between "should fallback" and "should not fallback" lives inside each provider: a provider returns `[]` for empty results (no throw), and throws for actual errors.

### Default base_urls

```typescript
const DEFAULT_BASE_URLS: Record<string, string> = {
  exa: 'https://api.exa.ai/search',
  brave: 'https://api.search.brave.com/res/v1/web/search',
  firecrawl: 'https://api.firecrawl.dev/v2/search',
};
```

## Implementation Plan

### Phase 1 (Core)

```
1. config/schema.ts        — new WebSearch schema + fetchUrl rename
2. config/toml.ts          — transformServiceData: recurse into providers[] for snakeToCamel
3. config/toml.ts          — deprecation warning for byfSearch/byfFetch
4. providers/registry.ts   — static provider type → class mapping
5. providers/exa.ts        — ExaWebSearchProvider
6. providers/brave.ts      — BraveWebSearchProvider
7. providers/firecrawl.ts  — FirecrawlWebSearchProvider
8. providers/router.ts     — PriorityRouter + AllProvidersFailedError
9. providers/remote-web-search.ts — DELETE (old single-implementation)
10. rpc/core-impl.ts       — build PriorityRouter from config
11. docs/*.md              — config file docs update
```

### Phase 2 (Polish)

```
11. error handling refinement
12. testing (existing test file)
```

## Decisions (ADR-lite)

| Decision | Rationale |
|---|---|
| Array-of-tables (`[[providers]]`) over nested tables | TOML-native, simple Zod validation, flat priority ordering |
| `api_keys` always `string[]` | Unified, minimal mental model; single key is `["sk-..."]` |
| Priority-based first-wins over result merging | Lower latency, simpler logic, sufficient for fault tolerance |
| Static provider registry (not dynamic) | Type-safe, predictable, no plugin infrastructure needed |
| Provider-specific params excluded from tool schema | Keep LLM interface clean; provider handles defaults internally |
| `base_url` optional with defaults | Users only need `type` + `api_keys` + `priority` to start |
| Empty results don't trigger fallback | Prevent false positives; a provider saying "no results" is valid |

## Domain Terms

| Term | Definition |
|---|---|
| Search Provider | A single search backend entry, defined by `type` + `api_keys` + `priority`. Detailed in CONTEXT.md. |
| PriorityRouter | Router that tries Search Providers in ascending `priority` order with automatic fallback |
| Fallback condition | Auth error / rate limit / server error / timeout — triggers next Search Provider |
| Provider type | Built-in identifier (`exa`, `brave`, `firecrawl`) mapped to a Search Provider class |

## Open Questions

- [x] Exact timeout per provider call — resolved: rely on proxied-fetch 60s timeout
- [x] Retry policy within a single provider — resolved: sequential fallback through api_keys in one search() call, reset to first key on each new call

## Traceability

- Grilled by: `/grill` session on 2026-06-20
- ADR: `docs/adr/0018-websearch-multi-provider.md`
- CONTEXT.md: added "Search Provider" term
