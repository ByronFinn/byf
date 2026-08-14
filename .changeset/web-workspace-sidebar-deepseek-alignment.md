---
'@byfriends/cli': patch
'@byfriends/web-client': minor
'@byfriends/web-server': minor
---

`byf web` 网页端对齐 deepseek 交互:侧边栏工作区分组/排序/添加(原生目录选择器,删除的工作区不再被索引复活),新会话先选工作区与权限再发送。本轮补齐:历史会话转录恢复(消费 resume 的 replay,SSE 改为 resume 后订阅)、折叠语义对齐(收起=0 行,展开=前 5 条+溢出按钮)、权限选择移入输入卡片底栏(修乐观更新自毁)、输入卡片重构为单一浮动胶囊、设置弹层(默认模型/权限/思考模式与推理强度/模型与 provider 管理,`GET/PATCH /api/config`、`DELETE /api/config/providers/:id`、`PATCH /api/sessions/:id/model`)、推理强度设置(hero 与会话内思考 chip,`PATCH /api/sessions/:id/thinking`)、新会话默认工作区为空(侧边栏「新建会话」经导航 state 一次性预选)、工作区行菜单锚点稳定(打开期间按钮保持可见)、输入触发(`/` 命令面板与 `@` 工作区文件引用——combobox 模式,`POST /api/sessions/:id/activate-skill`、`POST /api/sessions/:id/compact`、`GET /api/fs/list` 受限目录浏览)、slash 技能命令(会话内 `/` 面板合并用户可激活技能,支持带参执行如 `/research 主题`,`GET /api/sessions/:id/skills`)、操作反馈 toast(权限/思考/技能激活/压缩上下文/设置保存,成功与失败均有提示)。运行 `byf web` 体验。
