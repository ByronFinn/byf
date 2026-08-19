---
'@byfriends/agent-core': patch
'@byfriends/cli': patch
---

恢复会话时,对仍在另一个进程运行中的后台任务不再误判为“丢失”,也不再注入虚假的“任务丢失”通知(例如 CLI 与 web 同时打开同一会话时)。
