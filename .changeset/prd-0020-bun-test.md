---
'@byfriends/cli': patch
'@byfriends/vis-server': patch
'@byfriends/agent-core': patch
---

测试门禁切换为 `bun test`；CLI 入口仅在作为进程主模块时自动启动，避免测试导入时拉起 TUI。
