Update the lifecycle status of the current goal.

This is how the agent signals the terminal (or pause) state of an autonomous goal. The driver reads the resulting status at the next turn boundary and decides whether to keep looping.

**Parameters:**

- `status` (enum, required): One of `active`, `complete`, `paused`, `blocked`.
- `reason` (string, optional): A short justification. Required in spirit for `blocked` (why you are stuck) and appreciated for `complete` (what you accomplished); ignored for `active`.

**Status semantics:**

- `complete`: The objective has been met. Marks the goal as complete and emits a completion event. The current turn finishes naturally (you may keep calling tools); the driver clears the goal and stops looping at the turn boundary. Always include a one-line `reason` describing what was achieved — this is what gets surfaced to the user in the completion summary.
- `blocked`: You cannot make further progress without external input (a missing dependency, an ambiguous requirement, a failed verification you cannot resolve). Include a clear `reason` describing the blocker. The goal pauses for the user; they can `/goal resume` once the blocker is cleared.
- `paused`: A soft pause — you are parking the goal intentionally (e.g. the user asked to pause, or you want to hand control back). The current turn is not aborted; the driver stops at the next boundary.
- `active`: Re-assert that the goal is in flight (rarely needed; the driver already assumes active).

**Important:**

- `UpdateGoal('complete')` does **not** abort the current turn. The driver only stops at the turn boundary — finish any in-flight tool work first.
- Transitioning from a non-active state to `complete` is invalid and returns `goal.status_invalid`.
- Calling this tool when no goal exists returns `goal.not_found`.
