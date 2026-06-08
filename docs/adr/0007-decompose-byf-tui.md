# ADR 0007: Decompose ByfTui into Independent Modules

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

### Module map

| Module | Location | Lines (approx) | Extracted from |
|--------|----------|----------------|----------------|
| `TurnEventHandler` | `src/tui/events/turn-event-handler.ts` | 1137 | Session Events (turn-related) + Live Render Hooks |
| `SessionMetaHandler` | `src/tui/events/session-meta-handler.ts` | 200 | Session Events (session-level) |
| `SubagentEventHandler` | `src/tui/events/subagent-event-handler.ts` | 200 | Session Events (subagent) |
| `TranscriptRenderer` | `src/tui/actions/transcript-renderer.ts` | 233 | Transcript Rendering |
| `LoginFlow` | `src/tui/flows/login-flow.ts` | 468 | Slash Command Handlers (`/login`) |
| `ConnectFlow` | `src/tui/flows/connect-flow.ts` | 200 | Slash Command Handlers (`/connect`) |
| `TasksBrowserController` | `src/tui/components/dialogs/tasks-browser/` | 840 | Background tasks browser |
| `DialogHost` interface | `src/tui/types.ts` | 20 | New abstraction over `mountEditorReplacement` |

### What stays in ByfTui

- Types & state creation, Startup Helpers, Lifecycle, Auth/Model Bootstrap
- Layout / Editor Setup, Input Dispatch
- Session Requests / Queues, State Helpers (29 lines)
- Session Runtime, Background task lifecycle
- Panes / Presentation State, Dialogs / Selectors (mount logic)
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
