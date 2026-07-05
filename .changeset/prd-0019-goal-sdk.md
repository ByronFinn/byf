---
'@byfriends/agent-core': patch
'@byfriends/sdk': patch
---

新增 goal 的 SDK 入口：宿主可经会话对象发起、暂停、恢复、取消目标，并订阅目标状态变化事件；目标类型与事件已从 SDK 重新导出。本切片不含 CLI 入口。
