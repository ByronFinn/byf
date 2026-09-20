---
'@byfriends/agent-core': minor
'@byfriends/sdk': minor
'@byfriends/web-server': minor
'@byfriends/web-client': minor
'@byfriends/cli': minor
---

Web 工作台与会话可视化工具合并为单源工作台：会话检查（wire / 上下文 / 子代理 / 状态）、config.toml 全文编辑（服务端校验、revision 乐观锁、密钥掩码显示）、会话删除与 reveal、deepseek 风格三栏界面。运行 byf web 打开统一工作台，或运行 byf vis 查看会话检查视图。

`@byfriends/vis-server` 弃用窗口已结：其兼容 shim 随本版本从 workspace 与发布集移除，`byf vis` 继续作为 `byf web` 的别名保留。
