Use this tool to maintain a structured TODO list as you work through a multi-step task.

Use for multi-step tasks, tracking investigation progress, or planning a sequence of edits. Do not use for single-shot answers or trivial requests.

**Avoid churn:**
- Do not re-call this tool when nothing meaningful has changed since the last call — update the list only after real progress.
- When unsure of the current state, call query mode first (omit `todos`) to check the list before deciding what to update.
- If no available tool can move any task forward, tell the user where you are stuck instead of repeatedly re-ordering the same todos.

**How to use:**
- Call with `todos: [...]` to replace the full list. Statuses: pending / in_progress / done.
- Call with no arguments to query the current list.
- Call with `todos: []` to clear the list.
- Keep titles short and actionable.
- Update statuses as you make progress — mark one item in_progress at a time.
