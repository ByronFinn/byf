---
'@byfriends/agent-core': minor
'@byfriends/vis-server': patch
---

wire 记录层重构为声明式 reducer（dispatch/restore 双路径、纯函数 apply），会话历史重建与事件派生统一走同一引擎，输出卸载与遮蔽记录改为只改内存不落盘，为后续 checkpoint/undo 等能力预留框架支持；既有会话恢复行为保持等价。
