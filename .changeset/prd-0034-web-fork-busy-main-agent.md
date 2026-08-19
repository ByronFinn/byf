---
'@byfriends/web-server': patch
---

修复子代理生命周期误清除分叉保护，导致运行中会话可能被并发分叉的问题。
