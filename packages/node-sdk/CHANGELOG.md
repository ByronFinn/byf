# @byfriends/sdk

## 0.3.1

### Patch Changes

- a3c89a0: Remove the last plan-mode remnants left over from ADR 0008.

  The earlier removal (`.changeset/plan-removed-157.md`) deleted the engine and
  SDK methods but left a shell of always-null / never-produced types and a replay
  branch that could never fire. This cleans up that shell so the RPC and wire
  contracts no longer carry dead plan surface area:

  - `PlanData` type, `ResumedAgentState.plan` field, and the `plan_updated` arm of
    `AgentReplayRecord` are removed (`plan` was always `null` and no code produced
    `plan_updated` records).
  - The `plan_mode.enter` / `cancel` / `exit` wire record event types and their
    record-router mapping are removed. Per the user's decision, backward
    compatibility for old sessions containing these legacy records is no longer
    maintained; such records are now unknown types during replay.
  - The CLI `replay-ops` projection no longer handles the unreachable
    `plan_updated` branch.
  - vis no longer renders or projects `plan_mode.*` records.
  - User docs (interaction guide, slash-command reference, data locations) drop the
    obsolete `/plan` command, Shift-Tab shortcut, and Plan mode sections (EN + ZH).

- 081ea06: Add `runtime` passthrough from `ByfHarnessOptions` to `ByfCore` via `SDKRpcClient`. Optionally accepts a custom `RuntimeConfig` (kaos, osEnv, etc.) for injecting execution environments. Default behavior unchanged when omitted.
- a81140d: feat: add `byf update-config` command for config.toml schema migration

  - **agent-core**: New `config/update-rules.ts` with `Finding` type (removed/renamed/migrated/dangling/unknown/invalid-value) and `DEPRECATED_FIELD_RULES` whitelist
  - **agent-core**: New `config/update.ts` with `analyzeConfig` (scans config.raw for deprecated fields) and `applyFixes` (cleans up and migrates)
  - **agent-core**: Added `CAPABILITY_DEFINITIONS` / `VALID_CAPABILITIES` exports from runtime-provider.ts (single source of truth for capability validation and resolution)
  - **agent-core**: Detection of 6 finding categories (the PRD's `ghost` category is deferred):
    - `removed`: `default_yolo`/`defaultYolo`, `byf_search`, `byf_fetch`
    - `renamed`: `loop_control.max_steps_per_run` → `max_steps_per_turn`
    - `migrated`: `default_thinking` → `[thinking]` block (mode="on"/"off" + effort="high")
    - `dangling`: model aliases/defaults referencing nonexistent providers/models
    - `unknown`: schema-unrecognized fields (via zod `.shape`, non-hardcoded; includes nested container scanning)
    - `invalid-value`: invalid capability values in model aliases
  - **SDK**: New `ByfHarness.updateConfig({ fix?, configPath? })` method with automatic backup (chmod 0o600), validation, and rollback
  - **CLI**: New `byf update-config` subcommand with `--fix`, `--config <path>`, `--output-format <pretty|json>` flags
  - **CLI**: Pretty-printed categorized report in dry-run mode; JSON output for pipeline integration
  - **TUI**: New `/update-config` slash command (alias `/uc`) for in-TUI config auditing
  - **Tests**: 97+ tests across all layers (agent-core 72 new / 105 total, SDK 11, CLI 14 + TUI resolve tests)

## 0.3.0

### Minor Changes

- 0733fbb: Add Anthropic native model fetching to `/login` (PRD-0002, issue #146)

  Selecting the `anthropic` interface type in `/login` now lists models from the
  native Anthropic endpoint instead of impersonating OpenAI-compatible:
  `fetchModelsByType('anthropic', ...)` calls `{baseUrl}/models` with `x-api-key`

  - `anthropic-version: 2023-06-01` headers (not Bearer), follows `has_more` /
    `last_id` pagination with `?after_id=`, and maps `display_name`. Defensive
    guards: stops pagination when `has_more` is true but `last_id` is missing, and a
    10-page cap bounds the loop. The runtime already consumes the provider
    `baseUrl` for anthropic (verified), so custom/gateway URLs take effect end-to-end.

- 05bd355: Add API interface-type selection as the first `/login` step (PRD-0002, issue #145)

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

### Patch Changes

- 8b7b3e2: Fix: `/agent` records disappear after session resume

  After resuming a session, the `/agent` panel showed empty Agent tool-call
  cards — the child agent's name, tool calls, text, and token count were all
  lost. Root cause: those fields are read from per-card subagent runtime state,
  which only the live event stream populates; the replay-projection path that
  resume uses never reconstructed it.

  - **Persist `parentToolCallId`** — `AgentMeta` (state.json) now records the
    parent tool-call id that spawned each sub-agent, so a resumed main-agent
    `Agent` tool-call can be mapped back to its child. `createAgent`/`spawn`
    thread it through; `ResumedAgentState` exposes it.
  - **Project child activity onto resumed cards** — `distillSubagents` distills
    each non-main agent's resumed state (replay → tool calls + text, profileName,
    usage.total) into a `SubagentReplayBlockData` keyed by `parentToolCallId`.
    `projectReplayRecords` attaches it to the matching `Agent` tool-call, and the
    existing `applySubagentReplay` pipeline (now also consuming `usage`) fills the
    card — so `/agent` shows the child's name, tools, text, and token count.
  - **Fix Agent grouping after resume** — replay projection now assigns
    `step`/`turnId` to projected tool-calls (one assistant message = one step,
    turnId increments per user turn), so adjacent resumed Agent calls group into
    an `AgentGroupComponent` again, matching live behavior.
  - **Graceful degradation** — old sessions persisted before `parentToolCallId`
    still resume without crashing; their Agent cards render from the result
    summary as before. Token count is restored; elapsed time is not (replay
    records carry no timestamps) and is left for a follow-up.

  All new fields are optional; no wire-format or breaking change.

## 0.2.2

### Patch Changes

- Release 0.2.2

## 0.2.1

### Patch Changes

- Release 0.2.1

## 0.2.0

### Minor Changes

- 68987f7: Emit `llmFirstTokenLatencyMs` and `llmStreamDurationMs` on `turn.step.completed` events. Consumers can now observe how long the LLM provider took to produce its first streamed output token and how long the entire stream took to complete.
- fa5a6bd: Codebase cleanup: remove dead code, telemetry, legacy artifacts, and align with ADRs (#58)

  - **Remove telemetry package entirely** — delete `packages/telemetry`, remove all telemetry bootstrap from CLI and SDK, keep minimal `noopTelemetryClient` in agent-core
  - **Remove Kaos SSH orphan** — delete `ssh.ts` and all SSH test files, remove ssh2 dependency
  - **Fix kosong wire types** — use `'openai-completions'` in catalog tests, rename `kimi-*` test files
  - **Remove 16 unused imports** across CLI and kosong
  - **Delete dead code** — unused barrel files, already-deleted components confirmed
  - **Clean up skipped tests** — remove 14 disabled test blocks, fix `managed:byf` fixture references
  - **Re-export OAuth through SDK seam** — CLI no longer imports `@byfriends/oauth` directly (ADR 0006)
  - **Extract vis shared types** — vis-web typechecks independently, no longer imports from vis-server source

- 0a9bb30: Remove Plan Mode residual references (#80)

  - **agent-core**: Remove `run command in plan mode` dead entry from `ACTION_TO_PATTERN`; update `task-list.md` and `todo-list.ts` descriptions to no longer reference plan mode
  - **node-sdk**: Delete `SetSessionPlanModeRpcInput` interface and `setPlanMode` method from `SDKRpcClient`; delete `Session.setPlanMode`
  - **tests**: Remove `ExitPlanMode` approval adapter tests, `ExitPlanMode` action-label tests, and update background task test descriptions
  - **cli**: Update editor comment removing plan-mode reference
  - **cleanup**: Delete empty `packages/agent-core/src/agent/plan/` directory

## 1.0.0

### Major Changes

- 9f7a9d1: Remove Kimi OAuth auth and replace with BYF API-key auth (issue #4, slice 3)

  ### @byfriends/oauth (breaking)

  - Deleted all OAuth device-code flow files: `oauth.ts`, `oauth-manager.ts`,
    `managed-kimi-code.ts`, `managed-usage.ts`, `managed-feedback.ts`,
    `identity.ts`, `constants.ts`, `storage.ts`, `token-state.ts`, `toolkit.ts`
  - The package now only exposes open-platform helpers:
    `fetchOpenPlatformModels`, `applyOpenPlatformConfig`,
    `removeOpenPlatformConfig`, `capabilitiesForModel`, `filterModelsByPrefix`
  - `pollDeviceToken`, `refreshAccessToken`, `requestDeviceAuthorization`,
    `OAuthManager`, `KimiOAuthToolkit`, `FileTokenStorage` are no longer exported

  ### @byfriends/sdk (breaking)

  - Removed OAuth-related types (`OAuthConfig`, `OAuthTokenProviderResolver` public
    re-exports) and OAuth auth-facade helpers
  - Auth now resolves exclusively via API key; OAuth token-provider path is
    preserved internally for backward-compat config migration only
  - Deleted OAuth smoke-test examples (`kimi-harness-auth-smoke.ts`,
    `kimi-harness-config-smoke.ts`)

  ### @byfriends/cli

  - Feedback hint copy updated from `kimi export` → `byf export`
  - Model selector and provider labels reflect BYF branding
  - Startup flow no longer references `auth.kimi.com` or OAuth login dialogs;
    users are directed to `/connect` for provider setup

## 0.2.0

### Minor Changes

- [#30](https://github.com/ByronFinn/byf/pull/30) [`a200a29`](https://github.com/ByronFinn/byf/commit/a200a297ac8986ec4baa8d2cdc881ef71bc3abfc) - Add a `/connect` command that configures a provider and model from a model catalog.

### Patch Changes

- [#33](https://github.com/ByronFinn/byf/pull/33) [`ab4bd09`](https://github.com/ByronFinn/byf/commit/ab4bd090825cffbd7ab656b47840b0060d6cf601) - Report the macOS product version in OAuth device information instead of the Darwin kernel version.

- [#49](https://github.com/ByronFinn/byf/pull/49) [`cf2227e`](https://github.com/ByronFinn/byf/commit/cf2227e8a5222ad9bd1167b573b62599d0efd906) - Resume sessions with a newer wire protocol version instead of failing. A warning is now shown in the TUI and records are replayed without migration.
