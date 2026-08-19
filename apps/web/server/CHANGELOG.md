# @byfriends/web-server

## 0.2.0

### Minor Changes

- bed368f: Web 设置 MCP 页签新增「测试连接」:新增 server 前可临时拉起验证,测试通过后才能保存;transport 选中项现可正确回显,参数改为一行一个输入框。运行 byf web,打开设置 → MCP 配置 → 新增 server → 测试连接。
- ebc9e8d: Web 工作台与会话可视化工具合并为单源工作台：会话检查（wire / 上下文 / 子代理 / 状态）、config.toml 全文编辑（服务端校验、revision 乐观锁、密钥掩码显示）、会话删除与 reveal、deepseek 风格三栏界面。运行 byf web 打开统一工作台，或运行 byf vis 查看会话检查视图。

  `@byfriends/vis-server` 自本版本起弃用：仅保留为兼容 shim（转发至统一工作台），一个 minor 版本后从 workspace 移除。

- faf255c: `byf web` 网页客户端全新改版:基于 shadcn/ui 与三层设计 token 的深浅双主题界面,新增常驻会话侧边栏(搜索/切换)、代码语法高亮、agent 执行步骤时间轴与智能滚动。运行 `byf web` 体验。
  另修复网页端数处流式稳定性问题:空闲事件流连接被服务端提前断开、偶发的会话事件重复广播、关闭会话与恢复会话的并发竞态。
- 131a7a5: Web 工作台升级:会话组织(重命名/置顶/归档/分叉)、过程观测(工具调用归组与耗时、子 Agent 看板)、富内容渲染(Mermaid / LaTeX / 图片与生成文件预览)与 provider 及模型别名可视化配置。运行 byf web 查看。
- 6b6c173: Web 工作台 Tasks 页签新增后台任务的命令输出展示:点击任务行后,右侧详情直接显示该任务的捕获输出。运行 byf web,打开 Tasks 页签并点击任意后台任务即可查看。
- c989843: 新增 byf web 子命令,在浏览器中打开网页聊天界面实时驱动 agent(发消息、流式渲染、审批与问答)。运行 byf web 启动。
- cfcbe83: Web 设置新增「MCP 配置」与「Skill 配置」页签:按全局/本地双作用域管理 MCP server(增删改、enabled 开关、RAW 兜底编辑、密钥占位符回显)与 skill(模板新建、删除、遮蔽标记)。运行 byf web,打开设置 → MCP 配置 / Skill 配置。
- 131fb16: `byf web` 网页端对齐 deepseek 交互:侧边栏工作区分组/排序/添加(原生目录选择器,删除的工作区不再被索引复活),新会话先选工作区与权限再发送。本轮补齐:历史会话转录恢复(消费 resume 的 replay,SSE 改为 resume 后订阅)、折叠语义对齐(收起=0 行,展开=前 5 条+溢出按钮)、权限选择移入输入卡片底栏(修乐观更新自毁)、输入卡片重构为单一浮动胶囊、设置弹层(默认模型/权限/思考模式与推理强度/模型与 provider 管理,`GET/PATCH /api/config`、`DELETE /api/config/providers/:id`、`PATCH /api/sessions/:id/model`)、推理强度设置(hero 与会话内思考 chip,`PATCH /api/sessions/:id/thinking`)、新会话默认工作区为空(侧边栏「新建会话」经导航 state 一次性预选)、工作区行菜单锚点稳定(打开期间按钮保持可见)、输入触发(`/` 命令面板与 `@` 工作区文件引用——combobox 模式,`POST /api/sessions/:id/activate-skill`、`POST /api/sessions/:id/compact`、`GET /api/fs/list` 受限目录浏览)、slash 技能命令(会话内 `/` 面板合并用户可激活技能,支持带参执行如 `/research 主题`,`GET /api/sessions/:id/skills`)、操作反馈 toast(权限/思考/技能激活/压缩上下文/设置保存,成功与失败均有提示)。运行 `byf web` 体验。

### Patch Changes

- 0604d86: 修复子代理生命周期误清除分叉保护，导致运行中会话可能被并发分叉的问题。
- 0604d86: 修复对不存在会话的操作返回 500 而非 404 的问题。
- 306614f: Web 设置「模型与 Provider」的模型别名支持编辑能力:新增音频能力勾选,思考能力可设为开关/强度调节/总是思考并叠加超高、最高档位;能力按模型名自动识别预填勾选,保存即写入配置。打开设置 → 模型与 Provider 展开 Provider、选中模型别名查看。
- 306614f: Web 设置「模型与 Provider」改为 Provider 父子嵌套展示:Provider 卡片展开即见其模型别名(可就地新增、编辑、删除),指向不存在 Provider 的别名单独分组展示。打开设置 → 模型与 Provider 查看。
- Updated dependencies [3434e64]
- Updated dependencies [bed368f]
- Updated dependencies [ebc9e8d]
- Updated dependencies [131a7a5]
- Updated dependencies [306614f]
- Updated dependencies [cfcbe83]
  - @byfriends/sdk@0.6.0
  - @byfriends/web-shared@0.1.1
