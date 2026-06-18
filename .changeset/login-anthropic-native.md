---
'@byfriends/sdk': minor
---

Add Anthropic native model fetching to `/login` (PRD-0002, issue #146)

Selecting the `anthropic` interface type in `/login` now lists models from the
native Anthropic endpoint instead of impersonating OpenAI-compatible:
`fetchModelsByType('anthropic', ...)` calls `{baseUrl}/models` with `x-api-key`
+ `anthropic-version: 2023-06-01` headers (not Bearer), follows `has_more` /
`last_id` pagination with `?after_id=`, and maps `display_name`. Defensive
guards: stops pagination when `has_more` is true but `last_id` is missing, and a
10-page cap bounds the loop. The runtime already consumes the provider
`baseUrl` for anthropic (verified), so custom/gateway URLs take effect end-to-end.
