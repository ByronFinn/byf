---
"@byfriends/cli": minor
"@byfriends/oauth": minor
"@byfriends/agent-core": minor
"@byfriends/kosong": minor
---

Add multi-level reasoning effort support with provider-specific parameter mapping.

- `@byfriends/cli`: model selector now supports `off/low/medium/high` effort for models exposing `thinking_effort`, with updated runtime state wiring and session model-switch behavior.
- `@byfriends/oauth`: `/login` model parsing now detects effort-capable models and optional custom effort parameter keys, and writes provider-level `thinking_effort_key` metadata into config.
- `@byfriends/agent-core`: provider schema/runtime resolution now carries `thinking_effort_key` through to openai-compatible runtime providers.
- `@byfriends/kosong`: OpenAI-compatible provider now supports configurable thinking effort parameter keys instead of hardcoding `reasoning_effort`.
