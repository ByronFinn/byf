---
'@byfriends/cli': minor
'@byfriends/sdk': minor
'@byfriends/agent-core': minor
---

新增 `/add-dir` 与可重复的 `--add-dir`，可把额外工作目录加入会话；选择记住时写入项目 `.byf/local.toml` 的 `workspace.additional_dir`。运行 `/add-dir list` 查看当前 roots。
