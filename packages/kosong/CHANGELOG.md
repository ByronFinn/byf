# @byfriends/kosong

## 0.2.3

### Patch Changes

- fad42cd: Migrate all four provider adapters (`openai-completions`, `anthropic`, `openai-responses`, `google-genai`) to extend `BaseChatProvider`, and their `StreamedMessage` implementations to extend `BaseStreamedMessage`. This removes duplicated `_clone`, accessors, `_createClient` boilerplate, and the `StreamedMessage` field/getter skeleton. Finish-reason normalization is now config-driven via `makeFinishReasonNormalizer` for OpenAI and Anthropic adapters. Google error classification reuses `convertProviderError` while preserving its fetch-specific `TypeError` handling.

## 0.2.2

### Patch Changes

- Release 0.2.2

## 0.2.1

### Patch Changes

- Release 0.2.1

## 0.2.0

### Minor Changes

- 0a9bb30: Add Anthropic prompt cache breakpoints (issue #83).

  `GenerateOptions` now accepts an optional `cacheBreakpoints?: string[]` field. The Anthropic adapter uses these markers to split the system prompt into multiple `text` blocks, each with its own `cache_control: { type: "ephemeral" }`. Markers are stripped from the wire text.

  The default system prompt template (`packages/agent-core/src/profile/default/system.md`) now includes a `__CACHE_BOUNDARY__` marker before the project-specific `# Project Information` section. `KosongLLM` forwards this breakpoint on every `generate()` call.

  Also removed the per-turn `cache_control` injection on the last message block (`injectCacheControlOnLastBlock`), since caching the mutable conversation history provided no benefit and incurred unnecessary cache-creation cost.

- 68987f7: Add `llmFirstTokenLatencyMs` and `llmStreamDurationMs` to `GenerateResult`. These fields measure host-side latency from the `provider.generate()` call to first streamed chunk and to stream exhaustion, respectively. Both are `undefined` when the stream produces no chunks.

### Patch Changes

- fa5a6bd: Codebase cleanup: remove dead code, telemetry, legacy artifacts, and align with ADRs (#58)

  - **Remove telemetry package entirely** — delete `packages/telemetry`, remove all telemetry bootstrap from CLI and SDK, keep minimal `noopTelemetryClient` in agent-core
  - **Remove Kaos SSH orphan** — delete `ssh.ts` and all SSH test files, remove ssh2 dependency
  - **Fix kosong wire types** — use `'openai-completions'` in catalog tests, rename `kimi-*` test files
  - **Remove 16 unused imports** across CLI and kosong
  - **Delete dead code** — unused barrel files, already-deleted components confirmed
  - **Clean up skipped tests** — remove 14 disabled test blocks, fix `managed:byf` fixture references
  - **Re-export OAuth through SDK seam** — CLI no longer imports `@byfriends/oauth` directly (ADR 0006)
  - **Extract vis shared types** — vis-web typechecks independently, no longer imports from vis-server source

## 0.1.0

### Minor Changes

- eb5f4fc: Add multi-level reasoning effort support with provider-specific parameter mapping.

  - `@byfriends/cli`: model selector now supports `off/low/medium/high` effort for models exposing `thinking_effort`, with updated runtime state wiring and session model-switch behavior.
  - `@byfriends/oauth`: `/login` model parsing now detects effort-capable models and optional custom effort parameter keys, and writes provider-level `thinking_effort_key` metadata into config.
  - `@byfriends/agent-core`: provider schema/runtime resolution now carries `thinking_effort_key` through to openai-compatible runtime providers.
  - `@byfriends/kosong`: OpenAI-compatible provider now supports configurable thinking effort parameter keys instead of hardcoding `reasoning_effort`.

## 0.2.0

### Minor Changes

- [#30](https://github.com/ByronFinn/byf/pull/30) [`a200a29`](https://github.com/ByronFinn/byf/commit/a200a297ac8986ec4baa8d2cdc881ef71bc3abfc) - Add a `/connect` command that configures a provider and model from a model catalog.

- [#25](https://github.com/ByronFinn/byf/pull/25) [`c4dd1c7`](https://github.com/ByronFinn/byf/commit/c4dd1c7ff298290ee17d4a6676f93284621f32e8) - Flatten tool call data by inlining tool names and arguments at the top level, and limit legacy record migration so it only rewrites matching tool call payloads.

### Patch Changes

- [#29](https://github.com/ByronFinn/byf/pull/29) [`df7a9ca`](https://github.com/ByronFinn/byf/commit/df7a9cab606e0f152bc45b1d1645d76210b1e0c4) - Avoid CPU spikes from large streamed tool arguments and coalesce high-frequency streaming UI updates.
