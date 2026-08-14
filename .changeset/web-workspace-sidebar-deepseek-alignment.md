---
'@byfriends/cli': patch
'@byfriends/web-client': minor
'@byfriends/web-server': minor
---

`byf web` 网页端对齐 deepseek 交互:侧边栏工作区分组/排序/添加(原生目录选择器,删除的工作区不再被索引复活),新会话先选工作区与权限再发送。本轮补齐:历史会话转录恢复(消费 resume 的 replay,SSE 改为 resume 后订阅)、折叠语义对齐(收起=0 行,展开=前 5 条+溢出按钮)、权限选择移入输入卡片底栏(修乐观更新自毁)、输入卡片重构为单一浮动胶囊、设置弹层(默认模型/默认权限/默认思考/模型与 provider 管理,`GET/PATCH /api/config`、`DELETE /api/config/providers/:id`、`PATCH /api/sessions/:id/model`)。运行 `byf web` 体验。
