---
'@byfriends/agent-core': patch
'@byfriends/cli': patch
'@byfriends/vis-server': patch
---

新增 goal 状态机内核（agent-core）：持久化的 active/paused/blocked 状态、complete 瞬态、goal.create/update/clear records、goal.updated 事件，以及 fork 清空与重启降级。本切片为后续 slash 命令与 SDK 入口奠基，暂无用户可见入口。
