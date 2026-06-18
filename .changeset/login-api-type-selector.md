---
'@byfriends/sdk': minor
'@byfriends/cli': minor
---

Add API interface-type selection as the first `/login` step (PRD-0002, issue #145)

Foundation slice for multi-type `/login`. The flow now starts with a type picker
(`openai-completions` / `openai_responses` / `anthropic`); selecting a type
prefills the Base URL placeholder with the official default, and leaving Base URL
empty falls back to that default. This release wires the scaffolding end-to-end
for the existing `openai-completions` type with zero behavior regression —
per-type native fetchers land in follow-up issues (#146 anthropic, #149 responses).

- `@byfriends/oauth`: `applyProviderConfig` accepts an optional `type` (defaults
  to `'openai-completions'`, so existing callers are unaffected); new
  `fetchModelsByType(type, baseUrl, apiKey)` dispatches to the OpenAI-compatible
  fetcher for `openai-completions` / `openai_responses`. Both re-exported via SDK.
- `@byfriends/cli`: new `promptApiTypeSelection`; `LoginFlow` runs the type step
  first, threads the selected type into `applyProviderConfig`, and
  `LoginFlowDeps.fetchModels` is now `(type, baseUrl, apiKey)`.
- `TextInputDialog` gains an opt-in `allowEmpty` so the Base URL prompt can be
  submitted empty (= use the official default).
