---
'@byfriends/agent-core': minor
'@byfriends/sdk': minor
'@byfriends/web-server': minor
'@byfriends/web-client': minor
'@byfriends/cli': minor
'@byfriends/vis-server': minor
---

Web 工作台与会话可视化工具合并为单源工作台：会话检查（wire / 上下文 / 子代理 / 状态）、config.toml 全文编辑（服务端校验、revision 乐观锁、密钥掩码显示）、会话删除与 reveal、deepseek 风格三栏界面。运行 byf web 打开统一工作台，或运行 byf vis 查看会话检查视图。

`@byfriends/vis-server` 自本版本起弃用：仅保留为兼容 shim（转发至统一工作台），一个 minor 版本后从 workspace 移除。
