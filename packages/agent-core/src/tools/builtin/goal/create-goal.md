Declare a new autonomous goal for the agent to pursue across multiple turns.

Use this when the user (or you, on their behalf) wants to commit to a self-directed objective that the driver will keep advancing turn after turn until it completes, gets blocked, or the budget runs out. Until the goal is resolved, you will receive a system reminder at the start of every continuation turn re-stating the objective and remaining budget.

**Parameters:**

- `objective` (string, required): A single, concrete, verifiable sentence describing what "done" looks like. Max 4000 characters. Do not pack multiple goals into one objective.
- `replace` (boolean, optional, default false): Set to `true` to discard the current goal and start a new one in its place. By default a second `CreateGoal` is rejected when a goal already exists.
- `budget` (object, optional): Hard limits on how far the goal may run. All fields optional; omit a field to leave that dimension unbounded.
  - `turn_budget` (integer ≥ 0): Maximum number of continuation turns the driver will run.
  - `token_budget` (integer ≥ 0): Maximum cumulative input+output tokens the driver will spend.
  - `wall_clock_budget_ms` (integer > 0): Maximum wall-clock milliseconds while the goal is active (paused intervals do not count).

**Behavior:**

- On success the goal enters the `active` state and the driver takes over at the end of the current turn.
- Calling `CreateGoal` while a goal already exists returns an error unless `replace: true` is set.
- The objective is validated: empty or whitespace-only objectives, and objectives longer than 4000 characters, are rejected.

**When to use it:**

- The user explicitly asks for a long-running, autonomous task ("keep working on X until it's done", "go fix all the lint errors in this package").
- You have decomposed a large task and want to commit to a sub-goal that spans many tool calls.

**When not to use it:**

- Single-shot answers, trivial lookups, or anything finishable in one turn — just do the work directly.
- When the user is actively pairing with you turn-by-turn; a goal is for AFK / hands-off execution.
