# @byfriends/agent-core

## 0.3.3

### Patch Changes

- 1176bdc: refactor: replace web-search provider self-registration with explicit `registerBuiltinWebSearchProviders()`

  The Exa, Brave, and Firecrawl provider modules previously called
  `registerProvider(...)` at module load as an import side effect, and
  `core-impl.ts` triggered registration via three `import '#/tools/providers/{exa,brave,firecrawl}'`
  side-effect imports. This made provider availability depend on import
  order and hid the registration surface.

  Now each provider module exports only its class, and
  `registerBuiltinWebSearchProviders()` in `registry.ts` registers all
  three explicitly. `core-impl.ts` calls it once at module load.
  Order-independent and discoverable from a single location. The new
  `registerBuiltinWebSearchProviders` is exported as public API for
  callers that bootstrap a custom core.

- 1176bdc: refactor: remove dead `background` route in AgentRecords handler map

  The `getHandlerKey` mapping table in `AgentRecords` declared a
  `background → 'background'` entry, but no `background` restore handler
  was ever registered (background tasks restore through a separate
  persistence path in `BackgroundProcessManager`). The dead entry made
  ADR 0010's distributed-restore contract appear broader than it is.
  Removed the entry and documented why `background.*` records are
  intentionally skipped on replay.

- 1176bdc: refactor: dedupe run-prompt session resume and tighten `proxyWithExtraPayload` cast

  - `run-prompt.ts` had two near-identical resume branches (`--session`
    and `--continue`) that each repeated `resumeSession` + permission
    forcing + `setModel` + `installHeadlessHandlers`. Extracted
    `resumePromptSession()` and `mostRecentSessionId()` helpers so the
    resume path exists once; the caller resolves a session id (explicit
    flag, latest-in-workdir, or none) and hands it off. Behavior
    unchanged, including the "No sessions to continue" message.
  - `rpc/types.ts` `proxyWithExtraPayload` previously cast the whole
    Proxy target with `as any`, silencing type-checking inside the
    handler too. The target is now typed; the unavoidable output-type
    assertion (the Proxy's return signature genuinely differs from the
    target's) is moved to a single result-level `as unknown as
RPCMethods<T>`, so the handler body stays type-checked.

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
  import { ByfCore } from '@byfriends/agent-core';
  const core = new ByfCore(rpcClient, options);

  // after
  import { createByfCore } from '@byfriends/agent-core';
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

- 1176bdc: feat: add legacy SSE MCP transport support

  Adds a third MCP transport option, `transport: "sse"`, that connects to
  legacy SSE-only MCP servers via the SDK's `SSEClientTransport`. Key changes:

  - **Config schema**: New `McpServerSseConfigSchema` with `transport: z.literal('sse')`.
    Field-for-field identical to HTTP schema (`url`, `headers`, `bearerTokenEnvVar`,
    `McpServerCommonFields`). Added to the discriminated union. Bare `url` entries
    without a `transport` field still default to `'http'` — SSE requires explicit
    `"transport": "sse"`.

  - **SSE client**: `SseMcpClient` class wrapping `SSEClientTransport`, structurally
    mirroring `HttpMcpClient` (hook-before-handshake, ready/closed latches, buffered
    `onUnexpectedClose` replay). Includes SSE-specific terminal-error predicate
    `isTerminalSseError` (SseError code 204 + `/unauthorized/i` message sniff).

  - **Connection manager**: `createClient()` factory supports the `'sse'` branch;
    `RuntimeMcpClient` union widened; OAuth gates (`resolveOAuthProvider`,
    `shouldMarkNeedsAuth`, `getHttpServerUrl`) extended to SSE servers.

  - **User docs**: English and Chinese MCP config guides updated with SSE transport
    option, legacy note, config example, and widened optional-fields table.

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

- 95ed796: feat: add multi-provider web search support with PriorityRouter

  WebSearchTool now supports three search providers (Exa, Brave, Firecrawl) through a PriorityRouter that selects the best available provider based on configuration and availability.

  ### New features
  - **PriorityRouter**: automatically selects the highest-priority configured provider with graceful degradation
  - **ExaProvider**, **BraveWebSearchProvider**, **FirecrawlWebSearchProvider**: three backend implementations sharing a common `WebSearchProvider` interface
  - **webSearchProviderRegistry**: single source of truth for provider registration (mirrors the pattern established by `tools/providers/registry.ts`)
  - **Schema support**: TOML config schema extended with `web_search.providers` and per-provider sections; `web_search.enabled` key for explicit opt-out
  - **Graceful fallback**: WebSearchTool degrades to FetchURL when all configured providers fail, rather than returning an error

  ### Breaking changes

  None — the schema is backward-compatible with existing `web_search` TOML config; the old single-provider path still works via the router's compatibility layer.

- 5352a75: fix: yolo 模式下 Read/Grep/ReadMediaFile 在 workspace 外不再需要 approve

  YoloOutsideWorkspacePermissionPolicy 原本对所有 FILE_ACCESS_TOOLS 中的
  工具（Read/ReadMediaFile/Write/Edit/Grep）都做了 workspace 边界检查，
  即使是已经是 auto_allow 的工具也会被升格为 ask。

  但 auto_allow 的语义是"无需审批"，且 manual 模式下这些工具也不会因为
  workspace 边界而被拦截。所以在 yolo 模式下对 auto_allow 工具做 workspace
  边界检查造成了语义矛盾——yolo 模式比 manual 模式更严格。

  修复：在策略中跳过 isDefaultAutoAllowTool() 为 true 的工具，使 Read、
  ReadMediaFile、Grep 在 yolo 模式下真正免审，同时保留 Write/Edit 的
  workspace 边界保护。

  详见 analysis: packages/agent-core/src/agent/permission/policies/yolo-workspace-access.ts:22-30

- Updated dependencies [1176bdc]
- Updated dependencies [cdd7dbb]
  - @byfriends/kosong@0.3.3
  - @byfriends/kaos@0.3.3

## 0.3.1

### Patch Changes

- 64b9114: Fix published type declarations and clear the lint/typecheck/pubcheck gates.

  - agent-core: the dts bundler left development-time `#/...` subpath imports
    (e.g. `#/rpc`, `#/config`) untouched in the bundled `.d.mts` chunk. Since
    `src/` is not shipped, consumers could not resolve those specifiers, breaking
    the package's types (attw InternalResolutionError). A post-build step now
    rewrites each leaked import to a self-reference against the chunk that
    inlined the referenced module. Public type surface is unchanged.
  - The release validation script (`lint:pkg`) now packs each package with
    `pnpm pack` (which expands `publishConfig`, matching real `pnpm publish`)
    before running attw, instead of `attw --pack` (which uses `npm pack` and
    does not expand `publishConfig`, producing false NoResolution failures).
  - Clear all lint errors/warnings and the lone typecheck error across the
    workspace: drop refactor-residue dead code, tidy imports, and resolve
    switch-exhaustiveness findings (real missing cases added; intentional
    fan-out dispatchers suppressed with documented reasons).

- 5eea99d: feat: allow Glob to search explicit absolute paths outside the workspace

  Glob's `path` argument previously enforced a `strict` policy that rejected any
  absolute path outside the workspace roots. It now uses the
  `absolute-outside-allowed` policy, matching Grep, so explicit absolute paths
  outside the workspace are searched. Relative paths that escape the workspace
  are still rejected.

  - `GlobTool` path validation switched from `strict` to `absolute-outside-allowed` (parity with Grep)
  - Sensitive files (`.env`, `id_rsa`, `.aws/credentials`, ...) are now filtered out of the result set via `isSensitiveFile`, mirroring Grep's `filterSensitiveLines`. A trailing "Filtered N sensitive file(s)" notice lists the relativized paths; when every hit is sensitive the empty result reads "No non-sensitive matches found". Because Glob runs `auto_allow` and now accepts arbitrary absolute roots, withholding sensitive directory structure is worth doing even though Glob only ever returns paths (never contents — Read's `checkSensitive` still blocks reading secrets).
  - Pure-wildcard rejection message reworded from "Allowed roots for explicit path searches" to "Workspace roots" since outside paths are now permitted.
  - `path` field JSON Schema description updated to document the new behavior.
  - Header doc now records the sensitive-file filter and the symlink trust boundary.

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

- 12aa97b: fix(todo): update TodoList tool description to encourage timely status updates

  Change the "Avoid churn" section to "Update discipline" that:

  - Instructs the LLM to update todo status immediately at state transitions (pending → in_progress → done)
  - Instructs the LLM not to skip the in_progress state
  - Retains anti-spam guardrails (avoid redundant calls, use query mode, tell user when stuck)

  fix(todo): truncate TodoPanel to 5 visible items with +N more indicator

  Limit the TodoPanelComponent render output to a maximum of 5 visible todo items,
  with any excess summarized as "+N more" in dimmed text, preventing the todo panel
  from dominating terminal space on large task lists.

  feat(todo): add expand/collapse for todo panel via Ctrl+T

  TodoPanelComponent now implements the Expandable interface, allowing users to
  toggle between collapsed view (5 items + "+N more") and expanded view (all items

  - "▲ collapse" hint) using the Ctrl+T keybinding. Follows the existing
    Expandable pattern used by tool output expansion (Ctrl+O).

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

- 2cf02d0: feat: add multi-provider web search with Exa, Brave, and Firecrawl support

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

## 0.3.0

### Minor Changes

- ef167a8: Prompt cache optimization: three-tier overhaul

  Tier 1 — Remove DirectoryTreeInjector:

  - Deleted `DirectoryTreeInjector` and its test file
  - The model discovers project structure via tools (Glob, Bash) when needed
  - Eliminates persistent `<system-reminder>` pollution in conversation history

  Tier 2 — System prompt cache block restructuring:

  - Reordered `system.md`: `# Project Information` now precedes `# Working Environment`
  - Added `# Working Environment` to `IMPLICIT_BOUNDARY_HEADERS` in prompt-plan builder
  - Creates 4 cache blocks: base (global), projectInstructions (project), workingEnvironment (session), sessionContext (session)
  - Block 0 (global) is now truly session-independent — no per-session variables (BYF_OS, BYF_WORK_DIR) in the cache key hash

  Tier 3 — Activate ephemeral injection pipeline:

  - Implemented `before_user` position in `project()` — appends dynamic content after history, zero cache prefix impact
  - Added optional `getEphemeral?()` to `DynamicInjector` base class
  - New `TimestampInjector`: fresh ISO timestamp each step at `before_user` position
  - Converted `PermissionModeInjector` from persistent transition-based to ephemeral state-based — always reflects current mode, survives compaction
  - Wired `InjectionManager.getEphemeralInjections()` through `buildMessages` in turn loop

### Patch Changes

- 77387fa: Refactor `BackgroundProcessManager` to use a `TaskEntry` discriminated union (`ProcessTaskEntry | PromiseTaskEntry`), eliminating the `as unknown as KaosProcess` cast for agent tasks. `BackgroundTaskInfo.pid` is now typed as `number | null` to accurately reflect that promise-based agent tasks have no OS process id.
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

- Updated dependencies [fad42cd]
  - @byfriends/kosong@0.2.3

## 0.2.5

### Patch Changes

- 56db517: fix: append <byf-skill-loaded> system reminder on user-slash skill activation so the model does not redundantly invoke the Skill tool
- 4361188: fix: add subagent concurrency limit to prevent cascading proliferation

  SessionSubagentHost now enforces `maxConcurrentSubagents` (default: 5) to cap parallel subagents per parent. Background tasks also get a default `maxRunningTasks` of 10. Configurable via `background.maxConcurrentSubagents` and `background.maxRunningTasks` in session config.

## 0.2.3

### Patch Changes

- 4f70390: fix: deduplicate tasks in BackgroundProcessManager.list() to prevent same taskId appearing in both processes and ghosts maps

## 0.2.2

### Patch Changes

- dd15c27: Add automatic proxy fallback for network tool requests (FetchURL, WebSearch, MCP HTTP)

  BYF now automatically detects proxy configuration from environment variables (`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `SOCKS_PROXY`, `NO_PROXY`) and macOS system proxy settings (`scutil --proxy`). When a direct network request fails with a retryable error (network-level errors or HTTP 403/429/502/503/504), BYF retries through the detected proxy with a 60-second timeout. If no proxy is configured, behavior is unchanged.

  Key changes:

  - **ProxiedFetch**: A `typeof fetch` wrapper with direct→proxy fallback logic
  - **System proxy detection**: macOS `scutil --proxy` parsing for HTTP/HTTPS/SOCKS proxy
  - **SOCKS5 support**: Via `undici.ProxyAgent` (no additional dependencies needed)
  - **NO_PROXY matching**: Domain suffixes, exact hosts, IPs, and wildcard support
  - **MCP HTTP wiring**: ProxiedFetch threaded through `McpConnectionManager` → `HttpMcpClient`
  - **60s timeout**: Applied to all network tool requests (previously no timeout)

## 0.2.1

### Patch Changes

- Release 0.2.1
- Updated dependencies
  - @byfriends/kaos@0.2.1
  - @byfriends/kosong@0.2.1

## 0.2.0

### Minor Changes

- 0a9bb30: Add Anthropic prompt cache breakpoints (issue #83).

  `GenerateOptions` now accepts an optional `cacheBreakpoints?: string[]` field. The Anthropic adapter uses these markers to split the system prompt into multiple `text` blocks, each with its own `cache_control: { type: "ephemeral" }`. Markers are stripped from the wire text.

  The default system prompt template (`packages/agent-core/src/profile/default/system.md`) now includes a `__CACHE_BOUNDARY__` marker before the project-specific `# Project Information` section. `KosongLLM` forwards this breakpoint on every `generate()` call.

  Also removed the per-turn `cache_control` injection on the last message block (`injectCacheControlOnLastBlock`), since caching the mutable conversation history provided no benefit and incurred unnecessary cache-creation cost.

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

- 0a9bb30: Enable importance-based observation masking for context minimization (PRD #77 phase 3).

  When token pressure exceeds configurable thresholds, old tool result messages are replaced with structured summaries plus head/tail fragments — without any LLM call.

  - **New module**: `packages/agent-core/src/agent/context/observation-masking.ts`

    - `applyObservationMasking(history, maxContextSize, toolCallIdToInfo, config)` — pure function that returns a new history array and masking result
    - Priority-based masking: `Read`/`Glob`/`Grep` (low) → `Bash` (medium) → `Write`/`Edit` (high, never masked)
    - Head/tail retention rules: Bash (3+5 lines), Read (3+3 lines), Grep/Glob (3+2 lines), Edit/Write (summary only)
    - Thrashing protection: already-masked messages are skipped on re-application

  - **ContextMemory integration**: new `applyObservationMasking(config?)` method that wires the masking function, logs a `context.observation_masking` record, and updates `_history`

  - **FullCompaction trigger**: `beforeStep()` now calls `agent.context.applyObservationMasking()` before `checkAutoCompaction()`, emitting `observation_masking.applied` events when masking occurs

  - **Configuration**: `CompactionConfig` gains an optional `masking?: MaskingConfig` field; `DEFAULT_COMPACTION_CONFIG` includes `DEFAULT_MASKING_CONFIG`

  - **Wire record support**: `context.observation_masking` records are replayed during resume to restore the masked state

  - **Tests**: 24 unit tests for the masking module plus 1 integration test verifying end-to-end masking in `FullCompaction.beforeStep()`

- 0a9bb30: Add output offloading and multi-pass compaction pipeline.

  - **ScratchManager**: new module that writes large tool outputs to scratch files under `~/.byf/sessions/<sessionId>/scratch/`. Implements FIFO eviction when the max file count (100) or total size (50 MB) is exceeded.
  - **OutputOffloading**: new module that offloads string tool outputs larger than ~8,000 tokens to scratch. The context message is replaced with a preview containing the file path and a `Read(path="...")` hint so the agent can retrieve the full output later.
  - **ContextMemory integration**: `appendLoopEvent` is now async and attempts to offload `tool.result` events before appending them. Offloading is skipped during wire replay. `scratchManager` is created when both `agent.homedir` and `sessionId` are available.
  - **Multi-pass pipeline**: `FullCompaction.beforeStep()` now runs four passes in order:
    1. Output offloading (already applied at `tool.result` time)
    2. Observation masking (zero-cost)
    3. Low-priority pruning (zero-cost) — removes oldest masked tool results when context pressure remains high
    4. LLM summarization / compaction (expensive, only when necessary)
  - **Wire records**: added `context.output_offloaded` and `context.pruning` record types, plus `pruning.applied` RPC event.

- 0a9bb30: Refactor system prompt and add DirectoryTreeInjector (Issue #81)

  - **System prompt compression**: Removed the `BYF_WORK_DIR_LS` directory tree from `system.md`, compressed the Research & Data Processing guidelines to 5 bullet points, added a "First Principles" meta-cognition section, added an AGENTS.md budget warning (>4,000 tokens), and streamlined the Skills and Ultimate Reminders sections.
  - **Skill listing compression**: `getModelSkillListing()` now outputs only name + one-line description (truncated to ~100 chars) instead of full metadata. Scope grouping is preserved.
  - **DirectoryTreeInjector**: New `DynamicInjector` that builds a 2-level directory tree with exclusions (node_modules, .git, dist, build, etc.) and a hidden-dir whitelist (.github, .byf, .agents, .changeset, .husky). It injects once at session start and refreshes when the tree changes.
  - **InjectionManager**: Registers `DirectoryTreeInjector` alongside `PermissionModeInjector`.
  - **Template variables**: Removed `BYF_WORK_DIR_LS` from `buildTemplateVars`. Added `BYF_AGENTS_MD_TOO_LONG` which renders a budget warning when merged AGENTS.md exceeds 4,000 tokens.
  - **Cleanup**: Removed `cwdListing` from `SystemPromptContext`, `PreparedSystemPromptContext`, and `Agent.useProfile` since the directory tree now lives in the injection layer.

- 1d06a98: Refactor default system prompt: remove content already covered by tool descriptions and derivable from first principles.

  Removed redundant sections: tool efficiency guidelines (Bash command list, shell chaining, Grep/Read/Edit/Glob rules — all in respective tool descriptions), Agent delegation and Background Bash usage (in tool descriptions), coding/research workflow guidelines (derivable from First Principles), approval coordination (framework implementation detail), AGENTS.md rationale (human-oriented), and Ultimate Reminders (model-inherent behavior).

  Consolidated into four clear sections: First Principles (meta-rule), Tool Use (when to use tools), Protocol (system tags), and Safety (all constraints in one place). Prompt reduced from 174 lines to ~80 lines with no functional loss.

- 0a9bb30: Remove Plan Mode residual references (#80)

  - **agent-core**: Remove `run command in plan mode` dead entry from `ACTION_TO_PATTERN`; update `task-list.md` and `todo-list.ts` descriptions to no longer reference plan mode
  - **node-sdk**: Delete `SetSessionPlanModeRpcInput` interface and `setPlanMode` method from `SDKRpcClient`; delete `Session.setPlanMode`
  - **tests**: Remove `ExitPlanMode` approval adapter tests, `ExitPlanMode` action-label tests, and update background task test descriptions
  - **cli**: Update editor comment removing plan-mode reference
  - **cleanup**: Delete empty `packages/agent-core/src/agent/plan/` directory

### Patch Changes

- 0a9bb30: Compress Read, Glob, and remaining tool descriptions as part of the context-minimization initiative (PRD #77, Issue #79).

  - **Read**: Removed "use Read instead of cat/head/tail", "use Glob/ls instead", and "use Grep instead" rationales (now in system prompt). Retained file size limits, binary handling, line_offset/n_lines pagination, sensitive file protection, and CRLF handling.
  - **Glob**: Removed "use Glob instead of find/ls" rationale and verbose large-directory explanations. Retained good/rejected pattern examples and compressed large-directory warning.
  - **Edit**: Removed Edit/Write distinction and "don't use sed" rules (now in system prompt). Retained old_string matching rules, parallel edit write-lock behavior, and CRLF/LF handling.
  - **Write**: Removed "Use Edit for targeted changes" hint (now in system prompt). Retained overwrite/append distinction, parent-directory requirement, and LF/CRLF semantics.
  - **AskUserQuestion**: Compressed Usage notes while retaining when-to-use/when-not-to-use guidance, multi_select, option label rules, and 1-4 question limit.
  - **TodoList**: Compressed when-to-use/when-not-to-use sections. Retained Avoid churn rules, statuses, and title format requirements.
  - **ReadMediaFile**: Compressed Tips paragraph. Retained parameter descriptions, size limit, return format, and coordinate rules.
  - **TaskOutput/TaskList/TaskStop**: Compressed guidelines while retaining core functionality descriptions and key parameters.
  - **System prompt**: Extended "Tool Efficiency Guidelines" with Read file-access rules and Edit/Write distinction rules.

- 0a9bb30: Compress Bash, Agent, and Grep tool descriptions as part of the context-minimization initiative (PRD #77).

  - **Bash**: Removed command catalog, efficiency guidelines, and full safety guide from the tool description; retained the two safety anchor sentences and background-task semantics. Moved global instructions to the system prompt.
  - **Agent**: Reduced description to the core 4-sentence contract (zero-context start, resume preference, result visibility, no-repeat rule). `buildSubagentDescriptions` no longer emits per-type tool lists.
  - **Grep**: Removed the "use Grep instead of shell grep" rationale (now in system prompt); kept ripgrep-syntax tips, hidden-file notes, and sensitive-file filtering guidance.
  - **System prompt**: Added a new "Tool Efficiency Guidelines" section containing the Bash command catalog, chaining/redirection tips, and the Grep tool-preference rule.

- 1b35310: Fix: ensure paired `tool.result` events are always emitted when a tool returns `isError=true` with a malformed or missing `output` field.

  Previously, if `resolveExecution` returned `{ isError: true }` without an `output` property, `normalizeToolResult` would throw `TypeError: Cannot read properties of undefined (reading 'length')`. This uncaught exception broke the `runToolCallBatch` loop, causing all subsequent `tool.result` events in the same batch to be silently dropped. The missing tool results left orphan `tool.call` entries in the context history, which caused the next LLM request to fail because providers require every `tool_call` to have a matching `tool_call_id` result.

  The fix coerces the `execution` result through `coerceToolResult` before building the pending tool result, so malformed error objects are normalized into safe `{ output, isError: true }` shapes just like runtime tool returns.

- Updated dependencies [0a9bb30]
- Updated dependencies [fa5a6bd]
- Updated dependencies [68987f7]
  - @byfriends/kosong@0.2.0
  - @byfriends/kaos@0.2.0

## 0.1.0

### Minor Changes

- eb5f4fc: Add multi-level reasoning effort support with provider-specific parameter mapping.

  - `@byfriends/cli`: model selector now supports `off/low/medium/high` effort for models exposing `thinking_effort`, with updated runtime state wiring and session model-switch behavior.
  - `@byfriends/oauth`: `/login` model parsing now detects effort-capable models and optional custom effort parameter keys, and writes provider-level `thinking_effort_key` metadata into config.
  - `@byfriends/agent-core`: provider schema/runtime resolution now carries `thinking_effort_key` through to openai-compatible runtime providers.
  - `@byfriends/kosong`: OpenAI-compatible provider now supports configurable thinking effort parameter keys instead of hardcoding `reasoning_effort`.

### Patch Changes

- Updated dependencies [eb5f4fc]
  - @byfriends/kosong@0.1.0

## 0.2.0

### Minor Changes

- [#25](https://github.com/ByronFinn/byf/pull/25) [`c4dd1c7`](https://github.com/ByronFinn/byf/commit/c4dd1c7ff298290ee17d4a6676f93284621f32e8) - Flatten tool call data by inlining tool names and arguments at the top level, and limit legacy record migration so it only rewrites matching tool call payloads.

### Patch Changes

- [#22](https://github.com/ByronFinn/byf/pull/22) [`2004aed`](https://github.com/ByronFinn/byf/commit/2004aedfe1d4e5e17762108bf48b7b9aa6d4e25b) - Add wire record migration handling during session replay.

- [#24](https://github.com/ByronFinn/byf/pull/24) [`7858821`](https://github.com/ByronFinn/byf/commit/7858821f2f1fecc9de666780fc62434ca76dcc82) - Persist model selections from the terminal UI to the default configuration, and honor the configured default thinking state for new sessions.

- [#14](https://github.com/ByronFinn/byf/pull/14) [`0da6073`](https://github.com/ByronFinn/byf/commit/0da60730b9716c39a07e8a3a0a320e3af7ad30fa) - Move wire metadata handling into the record layer and keep persistence backends limited to storage operations.

- [#12](https://github.com/ByronFinn/byf/pull/12) [`89ea895`](https://github.com/ByronFinn/byf/commit/89ea8959eb9419d04e63645b4d89ca0e33f20d98) - Retry compaction responses that do not contain a summary before updating conversation history.

- [#49](https://github.com/ByronFinn/byf/pull/49) [`cf2227e`](https://github.com/ByronFinn/byf/commit/cf2227e8a5222ad9bd1167b573b62599d0efd906) - Resume sessions with a newer wire protocol version instead of failing. A warning is now shown in the TUI and records are replayed without migration.

- [#17](https://github.com/ByronFinn/byf/pull/17) [`bfbd522`](https://github.com/ByronFinn/byf/commit/bfbd522a7160e597d673550f09fd4af089bfde34) - Let Kimi requests use the remaining context window for completion tokens by default while keeping explicit environment limits as hard caps.

- Updated dependencies [[`a200a29`](https://github.com/ByronFinn/byf/commit/a200a297ac8986ec4baa8d2cdc881ef71bc3abfc), [`c4dd1c7`](https://github.com/ByronFinn/byf/commit/c4dd1c7ff298290ee17d4a6676f93284621f32e8), [`df7a9ca`](https://github.com/ByronFinn/byf/commit/df7a9cab606e0f152bc45b1d1645d76210b1e0c4)]:
  - @byfriends/kosong@0.2.0
