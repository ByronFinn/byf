---
'@byfriends/agent-core': minor
'@byfriends/sdk': minor
'@byfriends/cli': minor
---

Edit/Write 现在要求先 Read 同一文件：未读直接编辑或覆盖已存在文件会被拒绝，避免基于过期内容产生错误的 old_string。old_string 匹配失败时返回文件真实内容片段，便于直接修正。
