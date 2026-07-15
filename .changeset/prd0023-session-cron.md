---
'@byfriends/cli': minor
'@byfriends/sdk': minor
'@byfriends/agent-core': minor
---

新增会话内 Cron 工具（创建/列表/删除），触发时注入当前会话并在 TUI 显示 notice。在 `-p` 中创建有未来 fire 的周期任务会使进程保持运行直至任务结束或被外部终止。
