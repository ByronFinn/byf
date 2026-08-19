---
'@byfriends/cli': patch
'@byfriends/web-client': minor
'@byfriends/web-server': minor
---

`byf web` 网页客户端全新改版:基于 shadcn/ui 与三层设计 token 的深浅双主题界面,新增常驻会话侧边栏(搜索/切换)、代码语法高亮、agent 执行步骤时间轴与智能滚动。运行 `byf web` 体验。
另修复网页端数处流式稳定性问题:空闲事件流连接被服务端提前断开、偶发的会话事件重复广播、关闭会话与恢复会话的并发竞态。
