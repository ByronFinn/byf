# @byfriends/sdk

## 0.3.3

### Patch Changes

- 1176bdc: refactor: hide `ByfCore` concrete class behind `createByfCore()` factory

  The SDK held `core: ByfCore` as a **public** field on `SDKRpcClient`,
  leaking the engine's 40+ internal members (`sessions` map, `sdk`
  Promise, `providerManager`, `sessionStore`, `telemetry`, `rpcClient`,
  …) through the SDK type surface and breaking the ADR 0006 isolation
  seam ("SDK is the isolation seam between CLI and engine internals").

  This violated Information Hiding (the concrete class was reachable via
  `import { ByfCore } from '@byfriends/agent-core'`), Dependency Inversion
  (the SDK depended on a concrete engine class instead of the `CoreAPI`
  contract), and Interface Segregation (the SDK only needed
  `homeDir`/`configPath` but inherited the type graph of all 40+ members).

  ### Changes

  - `agent-core`: new `createByfCore(rpcClient, options)` factory returns a
    narrow `CoreEngineHandle` (`{ core: PromisableMethods<CoreAPI>,
homeDir, configPath }`). The `ByfCore` concrete class is no longer
    re-exported from the package public index.
  - `agent-core`: `PromisableMethods` / `Promisify` / `Promisable` contract
    types are now re-exported so SDK callers can type the handle.
  - `node-sdk`: `SDKRpcClient.core` is now `private`, typed as
    `PromisableMethods<CoreAPI>` (the contract). `homeDir`/`configPath`
    are first-class readonly fields set once at construction. The `ByfCore`
    type no longer appears anywhere in the SDK import graph.

  ### BREAKING CHANGE

  `ByfCore` (the class) is no longer re-exported from
  `@byfriends/agent-core`. Code that constructed it directly must switch to
  the factory:

  ```ts
  // before
  import { ByfCore } from "@byfriends/agent-core";
  const core = new ByfCore(rpcClient, options);

  // after
  import { createByfCore } from "@byfriends/agent-core";
  const { core, homeDir, configPath } = createByfCore(rpcClient, options);
  ```

  `ByfCoreOptions` is still exported (it is the factory's parameter type).
  `CoreAPI`, `SDKAPI`, `createRPC` and all payload types are unchanged.

  No monorepo-internal consumers are affected: only `node-sdk` consumed
  `ByfCore`, and it now uses the factory. `apps/cli` and `apps/vis` never
  imported it. Engine-internal tests that need the concrete class import it
  from the engine module path (`rpc/core-impl`), not the package public
  index — engine internals remain accessible inside the engine package.

- cdd7dbb: chore: enable oxfmt formatting across the monorepo

  Installs oxfmt as a root devDependency and adds `pnpm fmt` / `pnpm fmt:check`
  scripts, with corresponding `make fmt` / `make fmt-check` targets. Integrates
  `oxfmt --write` into lint-staged pre-commit hook and `fmt:check` into the
  publish pipeline. Runs initial formatting on all source files.

- 88c9a1e: feat(fork): optional rewind to a user message when forking a session

  `/fork` can now branch from an earlier user message instead of always
  copying the whole session. Running `/fork` opens a picker listing the
  session's user messages; selecting the Nth message forks a new session
  that drops that message and everything after it (edit-message semantics),
  so you can resume from just before it and re-enter the prompt.

  - `ForkSessionInput` / `ForkSessionPayload` / `ForkSessionRecordInput`
    gain an optional `upToMessage?: number` (1-based ordinal of a
    user-origin message). Omitted → full copy, fully backwards compatible.
  - Truncation anchors on the ordinal of `turn.prompt`/`turn.steer` records
    with `origin.kind === 'user'` (turnId is not persisted on the wire
    boundary — see ADR-0020). Out-of-range ordinals reject and leave no
    partial session behind.
  - Sub-agents spawned by dropped turns are removed from the forked
    session's state and their wire directories are deleted.
  - `state.json` records `forkedFromMessage` when a rewind fork happens,
    alongside the existing `forkedFrom`.

  No breaking changes: all new fields are optional and default to the
  previous full-copy behavior.

- 6ad47ce: fix: replace hardcoded API type table in login-flow.ts with loginProviderRegistry

  Removes the local `API_TYPE_OPTIONS` and `DEFAULT_BASE_URL` constants from
  `login-flow.ts` that duplicated the existing `loginProviderRegistry`. The
  login flow now derives its provider type selection options and default
  base URLs directly from the registry via `getLoginProviderOptions()` and
  `loginProviderRegistry`. Also:

  - Exports `loginProviderRegistry`, `getLoginProviderOptions`, and
    `LoginProviderType` as public API from `@byfriends/agent-core` and
    re-exports them through `@byfriends/node-sdk`
  - Cleans up stale `@ts-expect-error` directives in
    `login-provider-registry.test.ts` that were left from before the
    registry was implemented (no behavior change)
  - Removes the never-executed test file at
    `src/config/login-provider-registry.test.ts` (vitest only runs tests
    under `test/` directories)

- 27965a7: feat!: replace `byf update-config` command with a builtin skill

  The `byf update-config` CLI subcommand, the `/update-config` (`/uc`) slash command, and their deterministic analyzer/fixer have been **removed** and replaced by a single builtin skill invoked as `/skill:update-config`. See ADR-0019 for the rationale.

  ### Breaking changes

  - **Removed public API** (major bump): `Finding`, `UpdateConfigInput`, `UpdateConfigResult` types and `ByfHarness.updateConfig()` from `@byfriends/sdk`; `analyzeConfig`, `applyFixes`, `DEPRECATED_FIELD_RULES`, `UpdateAnalyzeInput`, and the `Finding` type from `@byfriends/agent-core`.
  - **Removed files**: `packages/agent-core/src/config/update-rules.ts`, `packages/agent-core/src/config/update.ts`, `apps/cli/src/cli/sub/update-config.ts`.
  - **Removed CLI subcommand**: `byf update-config` no longer exists (no alias period, aligned with ADR-0008).
  - **Removed slash command**: `/update-config` and `/uc` no longer exist. Use `/skill:update-config` instead.

  ### What replaces it

  A builtin skill at `packages/agent-core/src/skill/builtin/update-config.md` (`disableModelInvocation: true`, user-only). The agent reads `~/.byf/config.toml` (path overridable via the skill argument), cross-references the governance rules embedded in its body plus `schema.ts`/`runtime-provider.ts` as the single sources of truth, flags deprecated fields, migrates `default_thinking`, and points out semantic conflicts a deterministic linter cannot catch (e.g. a provider with both `api_key` and `oauth`). Edits are applied via Write/Edit, gated by the permission prompt — there is no automatic backup/rollback (consistent with the existing `mcp-config` skill).

  ### Trade-offs accepted

  Idempotence, deterministic output, JSON-for-CI (`--output-format json`), automatic backup/rollback, and pure-function unit tests are **no longer guaranteed**, because the skill is LLM-driven. In exchange, config governance gains semantic understanding and conversational optimization that hardcoded rules could never enumerate.

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
