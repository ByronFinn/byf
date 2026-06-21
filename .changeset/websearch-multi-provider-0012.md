---
'@byfriends/agent-core': minor
---

feat: add multi-provider web search support with PriorityRouter

WebSearchTool now supports three search providers (Exa, Brave, Firecrawl) through a PriorityRouter that selects the best available provider based on configuration and availability.

### New features

- **PriorityRouter**: automatically selects the highest-priority configured provider with graceful degradation
- **ExaProvider**, **BraveWebSearchProvider**, **FirecrawlWebSearchProvider**: three backend implementations sharing a common `WebSearchProvider` interface
- **webSearchProviderRegistry**: single source of truth for provider registration (mirrors the pattern established by `tools/providers/registry.ts`)
- **Schema support**: TOML config schema extended with `web_search.providers` and per-provider sections; `web_search.enabled` key for explicit opt-out
- **Graceful fallback**: WebSearchTool degrades to FetchURL when all configured providers fail, rather than returning an error

### Breaking changes

None — the schema is backward-compatible with existing `web_search` TOML config; the old single-provider path still works via the router's compatibility layer.
