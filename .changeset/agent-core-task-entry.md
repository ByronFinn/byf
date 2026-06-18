---
'@byfriends/agent-core': patch
---

Refactor `BackgroundProcessManager` to use a `TaskEntry` discriminated union (`ProcessTaskEntry | PromiseTaskEntry`), eliminating the `as unknown as KaosProcess` cast for agent tasks. `BackgroundTaskInfo.pid` is now typed as `number | null` to accurately reflect that promise-based agent tasks have no OS process id.
