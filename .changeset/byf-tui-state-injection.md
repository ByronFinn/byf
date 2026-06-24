---
'@byfriends/cli': patch
---

refactor(cli): inject TUIState directly into class-based event handlers (ADR-0017)

`TurnEventHandler`, `CompactionHandler`, and `BackgroundTaskHandler` previously
received their state through per-call getter/setter snapshot objects assembled
by `turnEventState()` / `compactionState()` / `backgroundTaskState()` on `ByfTui`.
These assembly methods were pure field-forwarding shells (~85 lines) that existed
only to honor an over-literal reading of ADR-0017's "modules never hold mutable
references to TUIState" rule.

First-principles review showed ByfTui and its handlers share one compilation unit
with no trust boundary between them, so the least-privilege guarantee is already
provided by TypeScript's structural type system at compile time — a handler typed
against `TurnEventState` cannot reach `state.sessions` regardless of the runtime
object it holds. The runtime snapshots only duplicated this guarantee (and
incompletely: reference types like `appState` stayed mutable through them).

The three handlers now receive `this.state` directly at construction and hold it
for their lifetime; the assembly methods are deleted. `TurnEventState.colors` was
realigned to `theme: ByfTuiThemeBundle` to match TUIState's real nested shape.
ADR-0017 documents this revision. Internal TUI types only — no CLI command,
argument, config, or user-visible behavior change.
