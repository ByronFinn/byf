---
"@byfriends/agent-core": patch
---

fix: deduplicate tasks in BackgroundProcessManager.list() to prevent same taskId appearing in both processes and ghosts maps
