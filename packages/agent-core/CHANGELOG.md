# @byfriends/agent-core

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
