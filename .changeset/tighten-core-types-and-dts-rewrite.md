---
'@byfriends/agent-core': patch
---

收紧内部类型定义,移除 RPC、搜索提供者注册表与会话元信息中残留的 `any`,改用 `unknown` 或精确的选项类型。
