---
'@byfriends/agent-core': minor
---

fix: add subagent concurrency limit to prevent cascading proliferation

SessionSubagentHost now enforces `maxConcurrentSubagents` (default: 5) to cap parallel subagents per parent. Background tasks also get a default `maxRunningTasks` of 10. Configurable via `background.maxConcurrentSubagents` and `background.maxRunningTasks` in session config.
