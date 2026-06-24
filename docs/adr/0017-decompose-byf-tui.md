# ADR 0017: Decompose ByfTui into Independent Modules

## Status

Accepted

## Context

`ByfTui` (`apps/cli/src/tui/byf-tui.ts`) is a 5623-line class containing 16 responsibility sections. While `apps/cli/AGENTS.md` defines section boundaries as conventions, nothing enforces them in code. Understanding or testing any single section requires navigating the entire file.

Three goals drive the decomposition:

1. **Testability** — independent modules have testable interfaces, not just integration tests through ByfTui.
2. **Navigability** — each section becomes its own file.
3. **Reusability** — extracted modules don't depend on ByfTui instance, making them usable from non-interactive mode or future API entry points.

## Decision

### Design principles

- **ByfTui remains the sole state owner.** Extracted modules receive state as parameters (or via constructor injection); they never hold mutable references to TUIState.
- **Pure logic becomes independent functions.** Modules that don't depend on UI state are extracted as plain functions.
- **No pass-through modules.** Simple slash commands (3–5 lines each) and state helpers stay in ByfTui — extracting them would create shallow wrappers.

### State injection: direct reference, not snapshot assembly (2026-06-24 revision)

The original wording above ("never hold mutable references to TUIState") was implemented by having ByfTui assemble a fresh getter/setter snapshot object per handler — e.g. `turnEventState()` returned a 59-line object of `get x() { return state.x; }` forwarders. This created an **adapter-layer tax**: every extracted class-based handler forced ByfTui to grow a new `xxxState()` assembly method (~540 lines aggregate). The decomposition path was fighting itself — the more modules ADR-0017 extracted, the larger ByfTui became.

First-principles review showed the "never hold" rule was misapplied: ByfTui and its handlers are objects in the **same compilation unit**, not services across a trust boundary. The least-privilege guarantee that rule sought is already provided by **TypeScript's structural type system at compile time** — a handler typed against `TurnEventState` cannot reach `state.sessions` regardless of what runtime object it holds. The runtime getter snapshots only duplicated this compile-time guarantee (and incompletely — reference types like `appState` were still mutable through the snapshot).

**Revised rule:** class-based handlers (`TurnEventHandler`, `CompactionHandler`, `BackgroundTaskHandler`) now receive `this.state` directly at construction and hold it for their lifetime. ByfTui's `*State()` assembly methods for these three were deleted (~85 lines). The handlers' `XxxState` interfaces remain the narrow contract declaring which fields each handler reads, enforced by the compiler — `CompactionState` and `BackgroundTaskState` are untouched; only `TurnEventState` was realigned to TUIState's real shape (`colors: ColorPalette` -> `theme: ByfTuiThemeBundle`, since the handler reads `theme.colors.error` and TUIState stores colors nested under `theme`).

**Scope of this revision — intentionally limited:**

- **Class-based handlers**: state assembly deleted; handler holds `this.state` directly. Callbacks assembly (`*Callbacks()`) is retained — callbacks are a _behavior_ adapter (binding ByfTui methods + inlining logic like `notifyTurnComplete`), which has genuine encapsulation value, unlike pure field forwarding.
- **Free-function handlers** (`handleStatusUpdate`, `handleSkillActivated`, `subagentEventHandler`): their `*State()` projections are retained. These perform real field remapping (e.g. `SessionMetaState` lifts `appState.sessionId` to a top-level field) or are method-adapters (`SubagentEventState` is a 20-method interface over Map operations), so they are narrow projections, not pass-through shells.

### Module map

| Module                   | Location                                     | Lines (approx) | Extracted from                                    |
| ------------------------ | -------------------------------------------- | -------------- | ------------------------------------------------- |
| `TurnEventHandler`       | `src/tui/events/turn-event-handler.ts`       | 1137           | Session Events (turn-related) + Live Render Hooks |
| `SessionMetaHandler`     | `src/tui/events/session-meta-handler.ts`     | 200            | Session Events (session-level)                    |
| `SubagentEventHandler`   | `src/tui/events/subagent-event-handler.ts`   | 200            | Session Events (subagent)                         |
| `TranscriptRenderer`     | `src/tui/actions/transcript-renderer.ts`     | 233            | Transcript Rendering                              |
| `LoginFlow`              | `src/tui/flows/login-flow.ts`                | 468            | Slash Command Handlers (`/login`)                 |
| `ConnectFlow`            | `src/tui/flows/connect-flow.ts`              | 200            | Slash Command Handlers (`/connect`)               |
| `TasksBrowserController` | `src/tui/components/dialogs/tasks-browser/`  | 840            | Background tasks browser                          |
| `DialogHost` interface   | `src/tui/types.ts`                           | 20             | New abstraction over `mountEditorReplacement`     |
| `BackgroundTaskHandler`  | `src/tui/events/background-task-handler.ts`  | 159            | Background task lifecycle                         |
| `CompactionHandler`      | `src/tui/events/compaction-handler.ts`       | 74             | Session Runtime (compaction lifecycle)            |
| `handleSkillActivated`   | `src/tui/events/skill-activation-handler.ts` | 37             | Session Events (skill activation)                 |

### What stays in ByfTui

- Types & state creation, Startup Helpers, Lifecycle, Auth/Model Bootstrap
- Layout / Editor Setup, Input Dispatch
- Session Requests / Queues, State Helpers (29 lines)
- Session Runtime (turn dispatch, streaming state), Panes / Presentation State
- Dialogs / Selectors (mount logic)
- Simple slash commands and selector-triggered commands

### DialogHost interface

```ts
interface DialogHost {
  show(panel: Component & Focusable): void;
  close(): void;
}
```

The project already has ~15 dialog components. DialogHost formalizes the existing `mountEditorReplacement` pattern so business flows (LoginFlow, TasksBrowserController) don't know about editor replacement internals.

We rejected two alternatives:

- **Callback injection** (`{ mountDialog, unmountDialog, ... }`) — would work for 2 dialogs, but with 15 the repetition signals a missing abstraction.
- **InteractionHost** (`showPicker/showForm/showConfirm`) — framework-level abstraction premature for a product. pi-tui components are imperative; each dialog has vastly different construction requirements. Revisit if BYF adds Web UI or API server mode.

### Implementation order

1. **DialogHost interface** — smallest change, unlocks subsequent steps.
2. **TranscriptRenderer** — pure function extraction, zero risk, no dependencies.
3. **Three EventHandlers** — largest change; TurnEventHandler depends on TranscriptRenderer.
4. **LoginFlow + TasksBrowserController** — depend on DialogHost; most self-contained.

Each step is independently testable with no regression.

## Consequences

- **Positive:** Each extracted module has its own test surface. Turn lifecycle, event routing, and business flows can be tested without spinning up a full ByfTui instance.
- **Positive:** Navigating the codebase no longer requires scrolling through 5600 lines.
- **Positive:** TranscriptRenderer and LoginFlow are reusable from non-interactive entry points.
- **Negative:** More files to track. The decomposition adds ~7 new files to the TUI directory.
- **Negative:** TurnEventHandler at ~1137 lines is still large, but it encapsulates a single responsibility (turn lifecycle) with a narrow interface — depth, not breadth.
