Partially update the budget of the current goal.

Pass only the dimensions you want to change; any field omitted keeps its current value (it is **not** cleared to zero). All fields are optional.

**Parameters:**

- `turn_budget` (integer ≥ 0, optional): New cap on continuation turns.
- `token_budget` (integer ≥ 0, optional): New cap on cumulative input+output tokens.
- `wall_clock_budget_ms` (integer > 0, optional): New cap on wall-clock milliseconds while active.

**Behavior:**

- This tool only mutates the budget. It does not change the goal's status, objective, or accumulated usage.
- The new cap takes effect at the next driver boundary check. Lowering a budget below the already-accumulated usage will cause the driver to stop the goal at the next turn boundary.
- Calling this tool when no goal exists returns an error (`goal.not_found`).
- Non-integer or out-of-range values return `goal.budget_invalid`.

**When to use it:**

- The user asks to tighten or relax the budget mid-flight ("just give it 3 more turns", "cap it at 50k tokens").
- You discover the original budget was far too small or large for the work that remains.
