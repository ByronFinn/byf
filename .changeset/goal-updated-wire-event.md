---
'@byfriends/agent-core': patch
---

goal 生命周期事件（goal.updated）改经 wire 的 transient 事件通道统一派发，事件内容与触发时机保持不变。
