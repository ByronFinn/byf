---
'@byfriends/cli': patch
'@byfriends/agent-core': patch
---

goal 推进中 footer 的耗时现在每秒实时跳动（此前只在每轮边界刷新，单轮内部静止）。首轮结束 driver 接管即显示 turns=1（此前会跳过 1 直接到 2）。
