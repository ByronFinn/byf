Read the current goal snapshot without mutating it.

Returns the live goal state: objective, status (`active`/`paused`/`blocked`/`complete`), remaining budget, accumulated usage (turns, tokens, wall-clock), and any reason attached to the current status.

Use this when:

- You are resuming work mid-goal and need to re-anchor on the objective and what budget remains.
- A system reminder references a goal but you are unsure of its exact current state.
- You want to verify whether your previous `UpdateGoal` call landed before deciding the next step.

If no goal is currently set, the tool returns an error (`goal.not_found`). This tool is always visible to the main agent — it never creates, changes, or clears a goal.
