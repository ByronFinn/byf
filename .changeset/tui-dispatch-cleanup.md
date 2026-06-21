---
'@byfriends/cli': patch
---

refactor: tidy handleEvent dispatch cases for turn.ended / skill.activated / error / warning

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
