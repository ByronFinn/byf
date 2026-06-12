Launch a subagent to handle a task. The subagent starts with zero context — it has not seen this conversation. Brief it with the goal, what you already know, and exact paths or commands.

- When the task continues earlier work a subagent already did, prefer resuming that agent (pass its `resume` id) over spawning a fresh instance.
- A subagent's result is only visible to you, not to the user. Summarize the relevant parts yourself when the user needs to see them.
- Skip delegation for trivial work you can do directly — reading a known file, searching a small set of files, or any one-step task.
- Once a subagent is running, do not redo its searches or reads in parallel, and do not abandon it midway and finish the job manually.
- There is a concurrency limit on parallel subagents. If the limit is reached, wait for a running subagent to complete before launching another.
