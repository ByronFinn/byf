Stop a running background task.

Only use this when a task must genuinely be cancelled — for a task that is finishing normally, wait for its completion notification or inspect it with `TaskOutput` instead.

Guidelines:

- General-purpose stop for any background task, not a bash-specific kill.
- Stopping a task is destructive and may leave partial side effects behind. Use it with care.
- If the task has already finished, this tool returns its current status.
