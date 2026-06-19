---
'@byfriends/agent-core': minor
'@byfriends/cli': minor
---

fix(todo): update TodoList tool description to encourage timely status updates

Change the "Avoid churn" section to "Update discipline" that:
- Instructs the LLM to update todo status immediately at state transitions (pending → in_progress → done)
- Instructs the LLM not to skip the in_progress state
- Retains anti-spam guardrails (avoid redundant calls, use query mode, tell user when stuck)

fix(todo): truncate TodoPanel to 5 visible items with +N more indicator

Limit the TodoPanelComponent render output to a maximum of 5 visible todo items,
with any excess summarized as "+N more" in dimmed text, preventing the todo panel
from dominating terminal space on large task lists.

feat(todo): add expand/collapse for todo panel via Ctrl+T

TodoPanelComponent now implements the Expandable interface, allowing users to
toggle between collapsed view (5 items + "+N more") and expanded view (all items
+ "▲ collapse" hint) using the Ctrl+T keybinding. Follows the existing
Expandable pattern used by tool output expansion (Ctrl+O).
