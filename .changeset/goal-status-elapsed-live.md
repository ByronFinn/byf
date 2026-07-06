---
'@byfriends/cli': patch
'@byfriends/agent-core': patch
---

修复 goal 进行中 `/goal status` 的耗时恒显示 0s——按需读取的快照现在覆盖实时墙钟，与 footer 外推口径一致。
