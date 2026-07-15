---
'@byfriends/cli': patch
'@byfriends/agent-core': patch
---

修复恢复含已读文件记录的会话时，首次读取或编辑文件报错 `t.has is not a function` 的问题：已读文件记录改为用数组持久化，避免经 JSON 落盘后丢失。
