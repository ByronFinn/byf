---
'@byfriends/agent-core': minor
---

feat: add multi-provider web search with Exa, Brave, and Firecrawl support

- New `WebSearchConfigSchema` with `[[services.web_search.providers]]` array-of-tables config
- `webSearchProviderRegistry` as single source of truth for provider type → default URL mapping
- `PriorityRouter` with automatic fallback: any error triggers next provider, empty results do not
- `ExaWebSearchProvider` (POST, maps `text`→snippet[:300]/content(full), `publishedDate`→date)
- `BraveWebSearchProvider` (GET, maps `description`→snippet, `age`→date, content always undefined)
- `FirecrawlWebSearchProvider` (POST, maps `description`→snippet, no date/content initially)
- `transformServiceData` handles service sub-array recursion (`providers[]` snakeToCamel)
- `servicesToToml` writes `[[services.web_search.providers]]` and `[services.fetch_url]`
- Config key rename: `byfSearch` → `webSearch` (TOML: `web_search`), `byfFetch` → `fetchUrl` (TOML: `fetch_url`)
- Old `RemoteWebSearchProvider` removed (replaced by per-type providers)
