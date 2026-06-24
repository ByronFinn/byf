List background tasks and their current status.

Use this tool to discover which background tasks exist and where each one stands. It returns a task ID, status, command, description, and PID for each task, plus exit code and stop reason for finished tasks.

Guidelines:

- After a context compaction, or whenever you are unsure which background tasks are running, call this tool to re-enumerate them instead of guessing a task ID.
- Prefer the default `active_only=true`, which lists only non-terminal tasks. Pass `active_only=false` only when you need to see finished tasks; the result may include `lost` tasks from a previous process.
- `limit` caps how many tasks are returned (1-100, defaults to 20).
- This tool only lists tasks; it does not return their output. Use it first to locate a task ID, then call `TaskOutput` with that ID.
- This tool is read-only and safe to call at any time.
