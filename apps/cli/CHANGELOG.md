# @byfriends/cli

## 0.3.5

### Patch Changes

- bundle updated @byfriends/agent-core (system prompt tightening)

## 0.3.3

### Patch Changes

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

- 7e413c2: fix: remove unused type imports in byf-tui.ts and add missing handler unit tests

  Removes 4 unused type imports (`AgentStatusUpdatedEvent`, `ErrorEvent`,
  `SessionMetaUpdatedEvent`, `WarningEvent`) that were left behind after
  the ADR-0017 Phase 2 event handler extraction. Adds unit tests for
  `BackgroundTaskHandler` and `handleSkillActivated` which previously had
  no dedicated coverage. Updates ADR 0017 module map to reflect the
  extraction of background task lifecycle.

- ce2d665: refactor: extract SubagentActivityStore from ToolCallComponent

  Moves ~500 lines of subagent lifecycle state (spawning → running → done/failed),
  sub-tool call tracking, timer management, snapshot production, and change listener
  notification from the 1622-line `ToolCallComponent` into a standalone
  `SubagentActivityStore` class.

  - `ToolCallComponent` reduced from ~1622 to ~1053 lines (net -569 lines)
  - New file: `subagent-activity-store.ts` (~816 lines)
  - Public API of `ToolCallComponent` fully backward-compatible — all 14 method
    signatures unchanged; types re-exported at `tool-call.ts` bottom
  - Fixes: `OngoingSubCall.streamingArguments` type convention violation (removed
    unnecessary `| undefined`), duplicate JSDoc in store
  - Adds 27 direct unit tests for the store covering: full lifecycle, backgrounded
    phase, failure path, live usage updates, snapshot detail, timer management,
    listener lifecycle, replay, trimming, latestActivity computation

- d6a7202: fix: prevent duplicate AskUserQuestion Q/A rendering in transcript

  `ToolCallComponent` constructor registered a snapshot listener before
  building result content. Because `addSnapshotListener` invokes its
  callback immediately, `buildContent()` ran once inside the callback and
  again in the constructor's own build sequence, producing two copies of
  each question-answer pair in the transcript.

  The fix moves the snapshot listener registration to after all initial
  build steps, so the immediate callback rebuilds the existing content
  instead of racing with the constructor. Adds a unit test that verifies
  each Q/A pair is rendered exactly once.

- f455064: fix: todo-panel sliding window keeps in_progress task visible

  The collapsed TODO panel used a fixed `slice(0, 5)` that always showed the first five items regardless of which task was active. When `in_progress` appeared beyond the fifth position it was hidden behind the "+N more" fold.

  The collapsed view now computes a dynamic window offset so that the `in_progress` item is always within the visible range. When the window slides past the beginning of the list, an "(N above)" hint is added; the "+N more" hint continues to reflect items hidden below. Edge cases (five or fewer items, no `in_progress`, last item active) are handled correctly.

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

- 546a493: refactor: tidy handleEvent dispatch cases for turn.ended / skill.activated / error / warning

  Cleans up four dispatch cases in `byf-tui.ts` that had leaked orchestration
  or inline parameter assembly, so each case is now a single-line delegation
  consistent with the rest of the switch:

  - `turn.ended`: introduce a private `handleTurnEnd` wrapper that owns the
    "clear todo panel when all done" policy, and have `TurnEventHandler.handleTurnEnd`
    self-orchestrate flush+reset (mirroring `handleStepBegin` / `handleStepInterrupted`).
    Removes the redundant explicit flush that was duplicated inside the handler.
  - Eliminate the `as TurnEndedEvent` fake-event cast on the `/init` finalize path:
    expose a public `TurnEventHandler.finalizeTurn(sendQueued)` (the private
    implementation becomes `finalizeInternal`), so callers no longer synthesize a
    dummy `{ type: 'turn.ended', turnId: 0 }` object. The `isStreaming` guard is
    preserved.
  - `skill.activated`: extract `skillActivationState()` / `skillActivationCallbacks()`
    helpers instead of building inline object literals per event.
  - `error` / `warning`: extract `sessionMetaState()` and reuse the existing
    `sessionMetaCallbacks()` for both, instead of inline state objects and ad-hoc
    arrow functions.
  - Unify `handleStatusUpdate`, `handleSessionMetaChanged`, and `handleSessionWarning`
    from a single-callback parameter (`SessionMetaCallbacks['setAppState']` /
    `['showStatus']`) to the whole `SessionMetaCallbacks` object, matching
    `handleSessionError`'s existing shape. Their unit tests are updated to use the
    shared `makeCallbacks()` mock.

  The dispatch-case delegation shape (single-line `fn(event, ...)`) is preserved
  across all cases. Behavior is unchanged.

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

- 5823202: Add Shift+Tab keyboard shortcut to cycle permission mode (manual → yolo → auto → manual).

  - `editor.onShiftTab` callback now wired to cycle through the three permission modes
  - Help panel (`/help`) updated with the new shortcut entry

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

## 0.3.0

### Minor Changes

- da47401: Cache observability: display cache hit-rate across four CLI surfaces

  Add cache hit-rate visibility so users can see prompt cache efficiency at a glance:

  - `/usage` panel: per-model and total-row `(cache XX%)` suffix when hit rate > 0
  - Footer line 2: `cache: XX%` badge (per-turn, from `currentTurn` usage)
  - `/status` panel: `Cache` section with session-cumulative hit rate + read/write breakdown
  - Subagent chip: `(XX%)` suffix when `inputCacheRead > 0`

  New shared helpers in `usage-format.ts`:

  - `computeCacheHitRate(inputOther, inputCacheRead, inputCacheCreation)` — pure function, returns `undefined` for zero denominator
  - `formatCacheHitRate(rate)` — integer percentage with banker's rounding, returns `undefined` for rates that round to 0%
  - `safeNumber(value)` — defensive coercion for RPC/serialized token values

  All surfaces degrade gracefully: no cache data → no cache display (identical to previous behavior).

- 17651c3: Foreground sub-agent live viewer: `/agent` command with full-screen list and real-time activity viewer

  Add the ability to inspect foreground sub-agents during and after execution:

  - **`/agent` command** — new slash command to open the foreground sub-agent list
  - **SubagentsListApp** — full-screen list showing all foreground sub-agents (running + completed) with agent name, description, phase, tool count, tokens, and elapsed time; 1-second polling for live updates; `Enter` to drill into the live viewer
  - **SubagentLiveViewer** — full-screen scrollable viewer that renders the complete tool-call sequence (not truncated to 4 rows), sub-agent text output, and conditionally-visible thinking stream; real-time updates via `setSnapshotListener` with follow-tail when scrolled to bottom; vim-style scrolling (`j`/`k`/`g`/`G`/`PgUp`/`PgDn`); `t` to toggle thinking visibility
  - **Card hint** — running sub-agent cards show `· /agent to inspect` so the viewer is discoverable
  - **Sub-agent activity detail API** — `ToolCallComponent.getSubagentActivityDetail()` exposes the full ordered activity trail for consumption by the live viewer
  - **Group support** — `AgentGroupComponent.getSubagentEntries()` getter enables locating ToolCallComponents inside groups for the list layer
  - **Frame alignment fix** — `SubagentsListApp` and `SubagentLiveViewer` now use `@earendil-works/pi-tui`'s ANSI-aware width helpers, preventing colored text from shifting frame borders
  - **Render loop fix** — `SubagentsController` now requests a TUI re-render after every poll update and live-viewer snapshot update, so the list/viewer refresh and keyboard input keep working instead of appearing frozen
  - **Selection-change refresh** — moving the selection with ↑/↓ (or `j`/`k`) immediately refreshes the Detail and Output panes instead of waiting for the next poll tick
  - **Tool status accuracy** — the Detail pane now distinguishes ongoing (`… Name`), done (`• Name`) and failed (`✗ Name`) sub-tools, so active tools are no longer misreported as done
  - **Output preview stream** — the Output pane now shows the real-time sub-tool activity stream while the sub-agent is running, instead of staying blank until tools finish
  - **Streaming render throttle** — the live viewer now coalesces high-frequency snapshot callbacks (one per streamed token) into a single render every 80ms, preventing the terminal diff renderer from being overwhelmed by full-trail redraws on every delta (which froze the UI and garbled the layout). Mirrors the throttle approach used by `AgentGroupComponent`
  - **Control-character sanitization** — streamed sub-agent text, tool output, error text, and preview activity lines are now stripped of raw C0 control characters (`\r`, `\b`, `\x07`, vertical tab, form feed, …) that moved the cursor and produced the "one character per line" garble; `\t` is expanded to spaces for stable alignment
  - **Soft-wrap instead of truncation** — long viewer body lines now wrap across rows (`wrapTextWithAnsi`) instead of being hard-truncated with an ellipsis, so streamed content stays fully readable at any terminal width

  New files:

  - `apps/cli/src/tui/components/dialogs/subagents/controller.ts`
  - `apps/cli/src/tui/components/dialogs/subagents/list-app.ts`
  - `apps/cli/src/tui/components/dialogs/subagents/live-viewer.ts`
  - `apps/cli/src/tui/utils/sanitize-text.ts`

  Test files:

  - `apps/cli/test/tui/subagents-controller.test.ts`
  - `apps/cli/test/tui/subagents-list-app.test.ts`
  - `apps/cli/test/tui/subagent-live-viewer.test.ts`
  - `apps/cli/test/tui/components/messages/agent-group.test.ts`

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

- e072434: Cross-type regression guard for /login manual fallback type preservation (PRD-0002, issue #152)

  Add tests verifying that when model fetching fails and the user enters a model
  manually, the selected interface type (`anthropic` / `openai_responses`) is
  preserved in the provider config rather than falling back to
  `openai-completions`. Dual type-keys are covered: anthropic manual entry and
  openai_responses manual entry, both driven through the full login flow.

- 338e6ed: Wire openai_responses type in /login model listing (PRD-0002, issue #149)

  The `openai_responses` type dispatches to the same OpenAI-compatible `/models`
  endpoint as `openai-completions` (they share the model registry), but writes
  `type: 'openai_responses'` into the provider config so the runtime uses the
  Responses API wire format. The `/login` type picker already listed this option
  since #145; this slice adds the end-to-end test coverage verifying the correct
  type is written to config when the user selects it.

### Patch Changes

- 2cc24d5: Add a full border to the approval panel when it is shown as an overlay on top of fullscreen views such as `/agent` and `/tasks`, making it visually distinct from the background content.
- fad42cd: Extract `DialogManager` from `ByfTui` to own the editor-replacement picker/dialog methods (help, session, model, theme, permission, settings, editor selectors). No user-facing behavior change.
- 754c123: Fix /agent page: approval no longer force-dismisses fullscreen, and Output pane no longer overflows

  Two fixes for the `/agent` fullscreen page:

  **Approval now shows as overlay when fullscreen is active**

  Previously `showApprovalPanel` / `showQuestionDialog` would call
  `dismissFullscreenControllers()` to force-close the agent page before
  mounting the dialog into the editor — losing the user's place. Now when
  the agent page (or tasks browser) is open the approval / question dialog
  is rendered as a pi-tui overlay on top of the fullscreen. Input is
  captured by the overlay while the fullscreen stays intact underneath, and
  closing the overlay returns focus to the fullscreen. In normal mode
  (no fullscreen) the existing editor-replacement path is unchanged.

  **Output pane no longer overflows its frame**

  The Output preview pane in the sub-agent list constructs `toolOutputs`
  by joining up-to-3 output lines with `\n`. `renderPreviewFrame` pushed
  each joined string as a single visual line, so the embedded newlines
  broke through the frame border and corrupted the layout. The renderer
  now splits each `toolOutput` on `\n` so every visual line stays inside
  the frame — fixing the overflow and the associated flicker/duplicate-page
  artifacts that occurred when switching between sub-agents.

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

## 0.2.5

### Patch Changes

- 3a6e7e8: feat: remove 1000-step default limit per turn

  Turns now run without a step limit unless `loop_control.max_steps_per_turn` is explicitly configured. Previously the default was 1000 steps.

- 56db517: chore: remove Windows from release pipeline; document platform priority (macOS first, Linux second, Windows best-effort)

## 0.2.2

### Patch Changes

- Release 0.2.2

## 0.2.1

### Patch Changes

- Release 0.2.1

## 0.2.0

### Minor Changes

- fa5a6bd: Codebase cleanup: remove dead code, telemetry, legacy artifacts, and align with ADRs (#58)

  - **Remove telemetry package entirely** — delete `packages/telemetry`, remove all telemetry bootstrap from CLI and SDK, keep minimal `noopTelemetryClient` in agent-core
  - **Remove Kaos SSH orphan** — delete `ssh.ts` and all SSH test files, remove ssh2 dependency
  - **Fix kosong wire types** — use `'openai-completions'` in catalog tests, rename `kimi-*` test files
  - **Remove 16 unused imports** across CLI and kosong
  - **Delete dead code** — unused barrel files, already-deleted components confirmed
  - **Clean up skipped tests** — remove 14 disabled test blocks, fix `managed:byf` fixture references
  - **Re-export OAuth through SDK seam** — CLI no longer imports `@byfriends/oauth` directly (ADR 0006)
  - **Extract vis shared types** — vis-web typechecks independently, no longer imports from vis-server source

- 72d2806: Decompose ByfTui into independent, testable modules: add DialogHost interface, extract TranscriptRenderer, SessionMetaHandler, SubagentEventHandler, TurnEventHandler, LoginFlow, ConnectFlow, and TasksBrowserController. ByfTui shrinks from 5623 to 4345 lines. 138 new unit tests added.
- 42d51d8: `/logout` now opens an interactive provider selector instead of requiring a provider name argument. The provider associated with `defaultModel` is highlighted by default, so pressing Enter maintains the previous common-case behavior. The `/disconnect` alias behaves identically. This also fixes a bug where removing the default model's provider would incorrectly clear the active session model even when the current session was using a different provider.

## 0.1.0

### Minor Changes

- eb5f4fc: Add multi-level reasoning effort support with provider-specific parameter mapping.

  - `@byfriends/cli`: model selector now supports `off/low/medium/high` effort for models exposing `thinking_effort`, with updated runtime state wiring and session model-switch behavior.
  - `@byfriends/oauth`: `/login` model parsing now detects effort-capable models and optional custom effort parameter keys, and writes provider-level `thinking_effort_key` metadata into config.
  - `@byfriends/agent-core`: provider schema/runtime resolution now carries `thinking_effort_key` through to openai-compatible runtime providers.
  - `@byfriends/kosong`: OpenAI-compatible provider now supports configurable thinking effort parameter keys instead of hardcoding `reasoning_effort`.

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

- b592aeb: Add /login command for custom OpenAI-compatible providers

### Patch Changes

- 8beb53d: Remove remaining upstream Kimi Code brand references (postinstall, flake, build scripts)

  ### @byfriends/cli
  - Replaced the postinstall hook (`scripts/postinstall.mjs`) with a deliberate
    no-op. The previous hook was a full Kimi-to-BYF CLI migration script that
    probed PATH for a Python `kimi-cli` installation and renamed/removed its
    shim. BYF has no Python predecessor, so every global install would have run
    irrelevant migration logic and printed "kimi now runs the new version" to the
    user. The script now exits silently; future first-install UX (PATH
    reachability check etc.) can be added without any upstream baggage.
  - Deleted the three submodule files (`scripts/postinstall/migrate.mjs`,
    `reach.mjs`, `ui.mjs`) and removed `"scripts/postinstall"` from the `files`
    array in `package.json`.
  - `scripts/native/build.mjs`: error message updated from
    "Kimi Code native SEA build requires…" to "BYF native SEA build requires…".
  - `flake.nix`: fully rebranded — description, derivation names (`kimi-code` →
    `byf`, `kimi-code-pnpm-deps` → `byf-pnpm-deps`), package paths
    (`apps/kimi-code` → `apps/cli`), binary name (`kimi` → `byf`), env-var name
    (`KIMI_CODE_BUILD_TARGET` → `BYF_CODE_BUILD_TARGET`), meta fields (homepage,
    license `mit` → `unfree`, `mainProgram`), and the `update-pnpm-deps` helper
    script.

- 8beb53d: Remove dead code and stale Kimi brand artifacts

  ### @byfriends/telemetry
  - Removed unused optional fields from `AsyncTransportOptions`: `endpoint`,
    `getAccessToken`, `fetchImpl`, `retryBackoffsMs`, `requestTimeoutMs`,
    `sleep`, `now`. These options were never read by the constructor after the
    HTTP-send path was stripped; passing them had no effect.
  - Removed the exported `RETRY_BACKOFFS_MS` constant and `TransientTelemetryError`
    class, which had no production callers.
  - Removed `getAccessToken` from `TelemetryBootstrapOptions`; the CLI never
    passed it and `initializeTelemetry` forwarded it to an option the transport
    silently ignored.
  - Updated tests to reflect the slimmed-down interface.

  ### @byfriends/cli
  - Deleted the `DeviceCodeBoxComponent` TUI component and its test. The
    OAuth device-code flow was removed in slice 3; the component was exported
    but never instantiated in the TUI runtime.
  - Updated `.gitignore`: `.kimi-stash-dir` → `.byf-stash-dir`.
  - Updated `apps/cli/.gitignore` comment: `packages/kimi-core` → `packages/agent-core`.

## 0.2.0

### Minor Changes

- [#30](https://github.com/ByronFinn/byf/pull/30) [`a200a29`](https://github.com/ByronFinn/byf/commit/a200a297ac8986ec4baa8d2cdc881ef71bc3abfc) - Add a `/connect` command that configures a provider and model from a model catalog.

- [#30](https://github.com/ByronFinn/byf/pull/30) [`a200a29`](https://github.com/ByronFinn/byf/commit/a200a297ac8986ec4baa8d2cdc881ef71bc3abfc) - The `/connect` provider and model pickers now support type-to-search filtering, and long lists are paginated. The `/model` picker is also paginated when many models are configured.

- [#25](https://github.com/ByronFinn/byf/pull/25) [`c4dd1c7`](https://github.com/ByronFinn/byf/commit/c4dd1c7ff298290ee17d4a6676f93284621f32e8) - Flatten tool call data by inlining tool names and arguments at the top level, and limit legacy record migration so it only rewrites matching tool call payloads.

### Patch Changes

- [#9](https://github.com/ByronFinn/byf/pull/9) [`e503e69`](https://github.com/ByronFinn/byf/commit/e503e6963ab6cc6b4ed98c89389dbbb525fc6e9e) - Add `Ctrl-J` as an additional shortcut for inserting new lines in the TUI prompt.

- [#22](https://github.com/ByronFinn/byf/pull/22) [`2004aed`](https://github.com/ByronFinn/byf/commit/2004aedfe1d4e5e17762108bf48b7b9aa6d4e25b) - Add wire record migration handling during session replay.

- [#33](https://github.com/ByronFinn/byf/pull/33) [`ab4bd09`](https://github.com/ByronFinn/byf/commit/ab4bd090825cffbd7ab656b47840b0060d6cf601) - Report the macOS product version in OAuth device information instead of the Darwin kernel version.

- [#52](https://github.com/ByronFinn/byf/pull/52) [`064343a`](https://github.com/ByronFinn/byf/commit/064343a6e565a525fbf38b3a1f70f7ff0235a5ed) - Correct the `X-Msh-Platform` header value to `kimi_code_cli`.

- [#38](https://github.com/ByronFinn/byf/pull/38) [`e9e4a48`](https://github.com/ByronFinn/byf/commit/e9e4a48633f2d216672e8905b0235107b5cbe34a) - Clarify the prompt-mode error when no model is configured by pointing users to the login flow.

- [#13](https://github.com/ByronFinn/byf/pull/13) [`35726d7`](https://github.com/ByronFinn/byf/commit/35726d7a41d54a0e6cb19a21d16980fd462132e1) - Hide the empty current session from the sessions picker while keeping other empty sessions visible.

- [#31](https://github.com/ByronFinn/byf/pull/31) [`475ebad`](https://github.com/ByronFinn/byf/commit/475ebadc2070e3b878789f6a89ce191b1bd957a9) - Stop mentioning OAuth credentials in the migration UI — they are never migrated, so the previous "needs /login" notice misread as a failure. OAuth-only installs no longer trigger the migration screen.

- [#31](https://github.com/ByronFinn/byf/pull/31) [`475ebad`](https://github.com/ByronFinn/byf/commit/475ebadc2070e3b878789f6a89ce191b1bd957a9) - Migrate user skills from `~/.kimi/skills/` to `~/.kimi-code/skills/` during the first-launch migration; existing target skills are kept.

- [#30](https://github.com/ByronFinn/byf/pull/30) [`a200a29`](https://github.com/ByronFinn/byf/commit/a200a297ac8986ec4baa8d2cdc881ef71bc3abfc) - When no models are configured, `/model` and the welcome panel now point users to `/login` (for Kimi) and `/connect` (for other providers).

- [#11](https://github.com/ByronFinn/byf/pull/11) [`15b018f`](https://github.com/ByronFinn/byf/commit/15b018fc84a36a9ebde598970e5b44bebe5d68c6) - Surface API-provided error messages during feedback, usage, login, and model setup failures.

- [#24](https://github.com/ByronFinn/byf/pull/24) [`7858821`](https://github.com/ByronFinn/byf/commit/7858821f2f1fecc9de666780fc62434ca76dcc82) - Persist model selections from the terminal UI to the default configuration, and honor the configured default thinking state for new sessions.

- [#14](https://github.com/ByronFinn/byf/pull/14) [`0da6073`](https://github.com/ByronFinn/byf/commit/0da60730b9716c39a07e8a3a0a320e3af7ad30fa) - Move wire metadata handling into the record layer and keep persistence backends limited to storage operations.

- [#12](https://github.com/ByronFinn/byf/pull/12) [`89ea895`](https://github.com/ByronFinn/byf/commit/89ea8959eb9419d04e63645b4d89ca0e33f20d98) - Retry compaction responses that do not contain a summary before updating conversation history.

- [#29](https://github.com/ByronFinn/byf/pull/29) [`df7a9ca`](https://github.com/ByronFinn/byf/commit/df7a9cab606e0f152bc45b1d1645d76210b1e0c4) - Avoid CPU spikes from large streamed tool arguments and coalesce high-frequency streaming UI updates.

- [#47](https://github.com/ByronFinn/byf/pull/47) [`07ed2cf`](https://github.com/ByronFinn/byf/commit/07ed2cf9d4f01985c00c004b3bc0cc8d2587044b) - Emit session resume hint as a structured meta message in stream-json output format.

- [#49](https://github.com/ByronFinn/byf/pull/49) [`cf2227e`](https://github.com/ByronFinn/byf/commit/cf2227e8a5222ad9bd1167b573b62599d0efd906) - Resume sessions with a newer wire protocol version instead of failing. A warning is now shown in the TUI and records are replayed without migration.

- [#18](https://github.com/ByronFinn/byf/pull/18) [`a964bd2`](https://github.com/ByronFinn/byf/commit/a964bd2430a583ff0364fde19eafabda03b489ed) - Warn tmux users when extended key settings may prevent modified Enter shortcuts from working.

- [#17](https://github.com/ByronFinn/byf/pull/17) [`bfbd522`](https://github.com/ByronFinn/byf/commit/bfbd522a7160e597d673550f09fd4af089bfde34) - Let Kimi requests use the remaining context window for completion tokens by default while keeping explicit environment limits as hard caps.
