---
'@byfriends/agent-core': patch
'@byfriends/cli': patch
---

长会话中上下文用量估算会缓存已计算过的文本,不再每步重复扫描整份历史,CPU 占用大幅下降。
