# PRD-0034: byf Web 工作台能力升级（`apps/web` + 周边）

> **Status**: Implemented | **PRD**: PRD-0034 | **Created**: 2026-08-14 | **Last updated**: 2026-08-14

## Goal

把 byf web 从"产品级聊天客户端"（PRD-0032 传输骨架 + PRD-0033 UI 重设计之后）升级为**具备远程访问、过程观测、富内容渲染、会话组织与可视化配置的 Agent 工作台**，对标 Kimi Code Web 的核心能力清单。本轮**解除 PRD-0033 的"只动客户端渲染层"边界**：按白名单方式扩展 web-server 路由与 wire DTO，并在两处谨慎向外辐射——agent-core（工具事件时间戳、会话元数据）与 CLI（LAN URL 呈现、TUI `/web` 命令）。

## What I already know

> 以下由三轮代码探查（web 现状 / core 能力 / CLI 链路）得出，基线 = `prd-0033-web-ui-redesign` 分支 HEAD `3bed20c` + 其上未提交的「web-workspace-sidebar-deepseek-alignment」批次。

### 已具备（不重复建设）

- **局域网访问服务端基础完整**：`byf web -H/--host`（默认 127.0.0.1）、`-p/--port`、`--no-open`、深链 `byf web <sessionId>` 已存在（`apps/cli/src/cli/sub/web.ts:132-152`）；非回环绑定强制 `WEB_AUTH_TOKEN`（`apps/web/server/src/config.ts:51-61`），timing-safe Bearer + `?token=`（`apps/web/server/src/app.ts:93-135`），客户端 token 入 localStorage。缺的只是便利性：banner/自动打开 URL 不含 token、不展示 LAN IP；TUI 无 `/web` 命令（registry 在 `apps/cli/src/tui/commands/registry.ts:3-189`，26 个内置命令无 web）。
- **Fork 引擎层完整**：`SessionStore.fork`（`packages/agent-core/src/session/store/session-store.ts:80-125`）整目录拷贝保留全部历史（main + 子 agent wire、`media-originals`、后台任务），`upToMessage` 支持截断分叉（ADR-0020/0023）；SDK 已导出 `forkSession`（`packages/node-sdk/src/byf-harness.ts:117-136`）。web 路由/DTO 完全未暴露。
- **子 Agent 数据通道已通**：`subagent.spawned/completed/failed` 事件 + 子 agent 全量事件（信封带 agentId 路由，`packages/agent-core/src/rpc/events.ts:212-236`）经 `agent.event` 透传到浏览器；resume 返回 `agents` map（含 `parentToolCallId`，`rpc/resumed.ts:40-46`）。客户端 `chat.ts:242-247` **显式忽略**这些事件，UI 为零。
- **会话元数据 core 已有**：`renameSession`（`rpc/core-api.ts:310`，支持自定义标题 `isCustomTitle`）、`updateSessionMetadata`（SessionMetadataPatch → `custom`，`session/rpc.ts:66-73`）；`SessionSummary.archived?` 仅类型占位、无读写方；**pinned 概念不存在**。web-server 的 `HarnessLike`（`session-manager.ts:47-56`）未投影这些方法。
- **配置读写 SDK 完整**：`getByfConfig/setConfig/removeProvider` RPC（`rpc/core-impl.ts:402-415`）、`config/toml.ts` 原子写（保留未识别键）。web 已有 `GET /api/config`（apiKey 脱敏为 `hasApiKey`，`routes.ts:303-323`）、`PATCH /api/config`（默认值三件套）、`DELETE /api/config/providers/:id`。
- **媒体引擎通道已有**：`ReadMediaFileTool` 压缩后以 data-URL ContentPart 返回（`tools/builtin/file/read-media.ts:333-345`），原图进内容寻址缓存 `media-originals/<sha>.<ext>`；`turn.prompt` record 持久化完整 ContentPart。web 客户端 replay 映射**跳过** image/audio/video（`chat.ts:173`），`PromptBody.input` 为纯 string。
- **wire 落盘有时间戳**：每条 record 落盘补 `time: Date.now()`（`agent/wire/record.ts:65-73`）⇒ replay 侧历史耗时可算；**live 事件无时间戳**（`tool.call.started/tool.result` payload 缺 startedAt/endedAt）。

### 分支未提交批次（直接基线）

「web-workspace-sidebar-deepseek-alignment」：20 文件 +2035/-456，含测试与 changeset，**完整待提交**。内容：工作区侧边栏（分组/排序/拖拽/macOS 原生目录选择器）、设置弹层（默认模型/权限/思考 + provider 移除 + 配置路径展示）、会话内切模型、resume 回放恢复。已覆盖本 PRD Wave D 的设置页地基。**开工前应先提交该批次。**

### 缺口清单（本 PRD 要填的）

| 能力                                  | 缺口                                        |
| ------------------------------------- | ------------------------------------------- |
| 工具调用归组 + 耗时                   | live 事件无时间戳；归组逻辑为零             |
| 子 Agent 看板                         | 事件已透传，展示为零                        |
| 多媒体内联预览                        | 客户端跳过 image/video part；无文件读取端点 |
| Mermaid / LaTeX / 宽表格              | 均无                                        |
| 生成文件侧栏查看                      | 无文件端点、无查看 UI                       |
| 会话置顶 / Emoji 重命名 / 归档 / Fork | core 大半有，web 路由 + UI 全无             |
| LAN URL + token 便利化 / TUI `/web`   | banner 不含 token/LAN IP；无 `/web`         |
| provider 增改                         | SDK 有，web 路由未开                        |

## Research References

无 `/research` 产出的权威记录。Mermaid（官方 npm 包，懒加载 + 按需 dynamic import）与 KaTeX（remark-math + rehype-katex）为业界标准选择、版本稳定，未触发留档需求；若流式渲染实测有问题再补记录。Wave D 配置管理蓝本来自对 deepseek-harness 设置系统的 inline 源码探查（用户指定参照，2026-08-14，要点见 Technical Notes）。

## Open Questions（留给 /grill）

无——全部决议，见下。

### 已决议（grill，2026-08-14）

第一批：

- **置顶/归档存储 = first-class**：`SessionMeta` 加 `pinned?/archived?`（`SessionMetadataPatch` 为 `Partial<SessionMeta>` 派生，自动可 patch；`session.meta.updated` 事件天然广播）。
- **Fork busy 语义 = 拒绝**：busy 会话 fork 返回 409 + 提示先停止（整目录拷贝对并发写入的 wire 有撕裂风险）。
- **归组粒度 = 按 `ToolInputDisplay.kind`**：同 turn 内时间相邻、同 kind 归组；中间被 text/thinking step 打断则各自成组，不跨断合并。
- **models 别名管理进 v1**：Wave D 设置页含 models 别名增删改表单（与 provider 增改同批交付，交互蓝本 = deepseek-harness settings，见 R-D3/Technical Notes）。

第二批：

- **TUI `/web` 语义 = 独立服务入口**：TUI 进程内后台起 web-server，服务新/历史会话；当前 TUI 会话实时镜像列为未来演化（Out of Scope）。
- **流内大媒体帧 = v1 实测不预建**：图片 data-URL 直接渲染，不预防性设计替换机制；若实测 SSE 帧过大，Phase 2 再做「sha 引用 + 文件端点替换」（需动信封）。
- **LaTeX 行内定界符 = 启用单 `$`**：LLM 输出习惯优先，货币文本误判为可接受的罕见代价（事后可切换）。
- **LAN 暴露 ADR 形式 = 新建 ADR-0036**：明确 LAN 威胁模型（token 持有者 = 全权用户）、文件端点白名单、密钥只写不读；部分取代 ADR-0034 D4。

第三批（原型裁决）：

- **子 Agent 呈现形态 = 时间轴卡片 + drawer**（`/have-a-try` 三变体原型，用户定夺）：子 agent 以主时间轴内**信息卡片**呈现（非内联展开、非独立看板条、非常驻 details 栏），点击卡片弹出右侧 drawer 查看该子 agent 的完整调用轨迹。

## Requirements

### Wave A：会话组织与分叉

- **R-A1** 会话重命名（支持 Emoji，自由文本，≤200 字符）：侧栏会话菜单 rename → `PATCH /api/sessions/:id`（统一元数据端点，body `{title?, pinned?, archived?}`，一次可改多项）→ harness `renameSession` / `updateSessionMetadata`；`isCustomTitle` 语义保留（不再被首条 prompt 覆盖）。
- **R-A2** 会话置顶：置顶排序为第一优先级——工作区分组视图下组内置顶排最前（叠加在现有 manual/updated 排序之上），flat 视图下全局置顶排前；`SessionMeta`/`SessionSummary` 增加 `pinned?`，经 `updateSessionMetadata` 写入。
- **R-A3** 会话归档：一键归档，列表默认隐藏；设置页新增「归档管理」区（按工作区分组列出、恢复、进入会话）；`archived` 字段启用。归档是纯列表标记，活跃会话也可归档（归档页仍可进入）。归档管理区数据源 = `session_index` 聚合（不依赖工作区注册表，hidden 工作区的归档会话也可见）；恢复时若其 workDir 在注册表 `hidden` 中则自动重新登记。侧栏搜索 `?q=` 不含归档会话。
- **R-A4** 会话 Fork：`POST /api/sessions/:id/fork`（body 可选 `upToMessage`）→ 返回新会话 summary；侧栏菜单「分叉此会话」；原会话不动。busy 会话返回 409。
- **R-A5** `GET /api/sessions` 支持 `archived` 过滤参数（默认仅未归档）；`HarnessLike` 投影 `renameSession/forkSession/updateSessionMetadata`。

### Wave B：过程观测

- **R-B1** agent-core 事件时间戳（加法、向后兼容，不违反 ADR-0031）：`tool.call.started` payload 增 `startedAt: number`（epoch ms），`tool.result` 同时携带 `startedAt` 与 `endedAt`（**单事件自包含耗时**，晚订阅/重连场景无需回看 started 事件）；发射点在工具执行边界，非转发边界。`agent.event` 为不透明信封，web-shared 无需改。
- **R-B2** 工具调用归组：客户端在同一 turn 内将**相邻同 kind**（`ToolInputDisplay.kind`：file_io/search/command/diff/…）的工具调用折叠为摘要行（类型图标 + 数量 + 总耗时），可展开查看完整调用链与单次耗时；「相邻」指时间上连续、中间无 text/thinking step 打断，被打断则各自成组。与 PRD-0033 步骤时间轴融合（归组发生在时间轴 step 内部，不取代时间轴）。流式期间未完结组实时更新；replay 历史耗时用 wire record `time` 计算。
- **R-B3** 子 Agent 时间轴卡片 + 深度查看 drawer（have-a-try 裁决形态）：子 agent 的 agent 工具调用在 PRD-0033 步骤时间轴中渲染为**信息卡片**（名称、description 分工、状态灯、耗时、usage、resultSummary/error）；**点击卡片**打开右侧 overlay drawer，展示该子 agent 自己的调用轨迹（与主时间轴同构：thinking / 工具（含归组）/ 输出）；消费 `subagent.*` + 按 agentId 路由的子 agent 事件；resume 时用 `agents` map 重建卡片，drawer 可打开任意（含已完成）子 agent。

### Wave C：渲染与预览

- **R-C1** 图片内联预览：tool.result 中 image data-URL ContentPart 直接在对话流内渲染；replay 同样渲染（records 已含 ContentPart）。
- **R-C2** 作用域白名单文件端点 `GET /api/files`：**只读**；realpath 规范化后必须命中白名单前缀 = 已注册工作区根集合 ∪ `BYF_HOME/sessions/**/media-originals`；防穿越（`..`/symlink escape）；文本 ≤2MB（返回文本 + 语言猜测供 Shiki）、媒体 ≤50MB、视频支持 HTTP Range（206）；目录请求 400；ETag（mtime+size）缓存。
- **R-C3** 生成文件侧栏查看：ToolCallView 文件类工具（display 携带路径）提供「查看」入口；assistant markdown 中命中 workDir 的路径可点；打开右侧 drawer 查看文本（Shiki 高亮）/图片/视频（走 R-C2 端点）。
- **R-C4** Mermaid：`lang=mermaid` 代码块在流式期间保持纯文本，settle 后懒渲染（dynamic import，沿 PRD-0033「流式纯文本 + settle 后上色」决策）；渲染失败降级回代码块并提示；主题跟随深浅双主题。
- **R-C5** LaTeX：remark-math + rehype-katex（行内 `$…$` / 块级 `$$…$$`，**启用单 `$` 定界**——LLM 输出习惯优先，货币误判为可接受代价），流式期间策略同 R-C4。
- **R-C6** 宽 Markdown 表格横向滚动：表格容器 `overflow-x-auto`，不挤压对话列。
- **R-C7** 视频预览：经 R-C2 文件端点 + Range 播放；**流内视频 data-URL 不做特殊处理**（见 Open Questions 3 的风险记录）。

### Wave D：访问与配置收尾

- **R-D1** LAN URL 呈现：启动 banner 列出所有非回环网卡的完整访问 URL（含 `?token=`）；自动打开浏览器仍用 localhost URL；非回环时输出一行提示（token 会进浏览器历史，建议用后轮换）。
- **R-D2** TUI `/web` 命令：TUI 内 `/web` 在同进程后台起 web-server（默认 4100，占用则递增找空闲；回环绑定 + 复用 token 语义），打印 URL 并自动打开浏览器，TUI 退出随进程关闭；需接线 registry/handlers/slash-host/byf-tui 四处。MVP 语义 = 入口便利（服务新/历史会话），**不做**当前 TUI 会话实时镜像。
- **R-D3** 配置管理（provider + models 别名），**交互蓝本 = deepseek-harness settings**（结合 byf 配置实际增减，详见 Technical Notes）：
  - **Provider 行卡 + 展开编辑**：provider 列表为描边行卡（绿点标注 key 状态，源 `hasApiKey`），点击展开行内填色编辑器，一次只开一张。
  - **编辑表单**：主区仅 API key（password 输入、只写不读、placeholder 表状态——已配置 →「已配置——输入新值可替换」；`env` 引用 → 输入禁用 +「由环境变量提供」；留空 = 不变）；base_url / type（select，五类型）/ customHeaders / extraBody 收进折叠「高级设置」；`oauth` provider 只读展示并引导 CLI `/login`。
  - **新增 provider**：Provider ID（小写 slug 校验 + 查重）、type、base_url（必填）、API key（可空）、至少 1 个模型别名，一次提交建全。
  - **models 别名表 CRUD**：行字段 = 别名（必填查重）、Model ID、Context window（支持 `256K`/`1M` 后缀输入）、capabilities（tool_use / image_in / video_in checkbox）；字段以 `config/schema.ts` 为准。
  - **Fetch available models（端点发现）**：对 openai-completions / openai_responses 类型，用**表单草稿**（未保存的 base_url + key）调远端 `/v1/models`，候选进勾选弹窗采纳，已存在的 id 不覆盖、手调过的行不动。
  - **默认值区**（已有，保持）：defaultModel（引用别名）/ defaultPermissionMode / defaultThinking。
  - **删除**：Modal 二次确认，文案区分是否连带删除已存 key；先删 key 再删配置（幂等可重试）。
  - **不抄清单**：revision 乐观锁（单用户 HTTP 场景收益低）、settings 热重载 watch、首跑 onboarding 卡、enable/disable 开关、provider 排序、「打开设置文档」按钮（保留现有配置路径复制）。
  - 路由：`POST/PATCH/DELETE /api/config/providers[/:id]`、`POST/PATCH/DELETE /api/config/models[/:id]`、`POST /api/config/discover-models`（草稿探测，不落盘）；沿用 `setConfig` 原子写（保留未识别键与注释）。

## Acceptance Criteria

- [ ] **AC-A1** 重命名（含 Emoji）持久化：改名后刷新页面/resume/CLI `sessions` 列表标题一致，且不再被自动标题覆盖。
- [ ] **AC-A2** 置顶会话在组内恒排最前，置顶/取消即时生效。
- [ ] **AC-A3** 归档会话从主列表消失，设置页归档管理可见并可恢复；恢复后回到主列表。
- [ ] **AC-A4** fork 产生的新会话 replay 出完整历史（含子 agent 与媒体），原会话不受影响；busy 会话 fork 返回 409。
- [ ] **AC-B1** `tool.call.started`/`tool.result` 事件含 `startedAt`/`endedAt`（agent-core 单测覆盖；旧消费者不受影响）。
- [ ] **AC-B2** 连续同类工具调用折叠为「类型 + 数量 + 总耗时」摘要行，展开可见逐条调用与单次耗时；replay 恢复的历史同样有耗时。
- [ ] **AC-B3** 派生子 agent 时主时间轴出现其信息卡片（分工/状态/耗时/usage/摘要），点击卡片在 drawer 中展示该子 agent 完整调用轨迹（与主时间轴同构，含工具归组行）；SSE 断连重连后卡片经 resume 重建。
- [ ] **AC-C1** 工具结果中的图片在对话流内直接显示（live 与 replay 一致）。
- [ ] **AC-C2** 文件端点安全用例全过：白名单外路径 403、`..`/symlink 穿越被拒、超限 413、目录 400、视频 Range 206。
- [ ] **AC-C3** 从工具卡片/文档路径打开侧栏 drawer 正确显示文本（高亮）/图片/视频。
- [ ] **AC-C4** Mermaid 图 settle 后渲染为图表，语法错误时降级为代码块。
- [ ] **AC-C5** LaTeX 行内与块级公式渲染正确，流式期间不抖动（settle 后渲染）。
- [ ] **AC-C6** 超宽表格出现横向滚动条，不破坏对话列布局。
- [ ] **AC-D1** 非回环启动时 banner 列出各 LAN IP 的完整 URL（含 token）；回环行为不变。
- [ ] **AC-D2** TUI 内 `/web` 启动服务并可浏览器访问，TUI 退出后服务关闭，端口占用时自动换端口。
- [ ] **AC-D3** 配置管理（蓝本对齐）：新增/编辑 provider 后 GET 恒不回显密钥（placeholder 表状态）；编辑留空不改 key；`env`/oauth 来源的 key 输入禁用；models 别名 CRUD 落盘 `config.toml`（保留未识别键与注释）且别名可被会话模型选择器引用；discover-models 能用**未保存的**草稿 base_url + key 列出远端模型并勾选采纳；删除有二次确认且区分是否连带删 key；CLI 侧正常可用。
- [ ] **AC-R** PRD-0033 全部验收回归通过（主题三态/智能滚动/审批问答/发布链路内嵌）。
- [ ] **AC-CI** lint / fmt / sherif / typecheck / test / build 全绿。

## Definition of Done

- 上述 AC 全部满足。
- 深浅双主题下逐组件目检通过（含子 Agent 看板、文件 drawer、归档页）。
- 文件端点与 provider 写入路径有针对性测试（安全用例 + fake harness 单测）。
- changesets：`@byfriends/web-server` / `@byfriends/web-client` / `@byfriends/cli` minor（cli = LAN banner + TUI `/web`）；agent-core 事件时间戳为向后兼容加法 → minor。

## Out of Scope

- 多用户 / 登录流 / HTTPS（沿 ADR-0034 D4 单用户假设；LAN 场景由 token 门控）。
- **用户侧图片上传输入通道**（`PromptBody.input` 开放 ContentPart）——引擎已支持，但本轮只做输出侧预览，输入通道另行立项。
- 流内大视频/大图 data-URL 的替换/剥离优化（v1 实测；若 SSE 帧过大再立项「sha 引用 + 文件端点替换」）。
- 移动端触屏专项适配、会话磁盘删除/导出分享、background/goal/cron 管理 UI（子 Agent 看板先行）。
- TUI 内 `/web` 附着当前会话的实时镜像（已决议列为未来演化）。
- 增量流式 Markdown 解析（沿 PRD-0033 决策）。
- TUI 端的工具归组/看板展示（TUI 仅白捡 R-B1 时间戳数据）。

## Technical Approach

### 改动分层（自底向上）

1. **agent-core**（两处加法）：tool 事件时间戳；会话元数据 `pinned/archived` first-class（`SessionSummary` 投影 + `SessionMetadataPatch` 扩展）。
2. **node-sdk**：上述类型再导出；`HarnessLike` 消费面不变（方法已存在）。
3. **web-shared**：新增 DTO（rename/pin/archive/fork 请求体、`files` 响应元信息、provider 增改请求体）；SSE 信封不动（`agent.event` 不透明透传，core 加字段自动到达客户端）。
4. **web-server**：新路由（sessions 元数据/fork、files、providers 增改）+ `HarnessLike` 投影扩展；banner 扩展（LAN IP + token URL）。
5. **web-client**：四波 UI，全部沿用 PRD-0033 的 token 体系与 shadcn 混合路线；mermaid/katex 按需 dynamic import（对齐 Shiki 懒加载先例）。
6. **apps/cli**：`web.ts` banner 接线、TUI `/web` 四处接线。

### 关键设计

- **归组是纯客户端投影**：按 turnId 内相邻同 kind 折叠，不改事件契约；replay 用 wire record `time` 补耗时，live 用事件时间戳。
- **看板复用现有事件流**：零新 RPC；子 agent transcript = 按 agentId 过滤的 `agent.event` 流 + resume `agents` map。
- **文件端点是唯一新攻击面**：realpath + 白名单前缀 + 大小/类型上限 + 既有 token 中间件；单测覆盖穿越/越界/超限/Range。
- **只写不读密钥**：PATCH 请求体 `apiKey?: string`，空/缺省 = 不变；GET 脱敏路径不扩。

## Feasible Approaches

### 归组与耗时

- **A（选定）**：core 事件加时间戳 + 客户端归组投影。
- B：纯客户端计时——耗时含 SSE 缓冲延迟不准，replay 无数据。
- C：server 转发盖戳——仍是转发时刻，且仅 web 受益。

### 子 Agent 可见性

- **A（选定）**：消费现有事件流 + resume agents map，零协议改动。
- B：新增聚合 RPC（`getSubagentStates`）——过度设计，事件已够。

### 文件预览通道

- **A（选定）**：作用域白名单 HTTP 端点 + 内联 data-URL 直渲染（图片）。
- B：全部媒体走端点（sha 引用替换 data-URL）——需动信封，v1 不做，留作大帧优化路径。

## Decision (ADR-lite)

**Context**：PRD-0033 完成后 web 具备产品级 UI，但距离"Agent 工作台"（远程操控、过程观测、富渲染、会话组织、可视化配置）存在系统性缺口；需决定立项方式、范围切分与三个有安全/契约权衡的技术点。

**Decision**（5 项，均经用户确认）：

- **D1 立项**：新建 PRD-0034；PRD-0033 保持 Done，仅补前向链接。
- **D2 范围**：四波全进，按 A 会话组织与分叉 → B 过程观测 → C 渲染与预览 → D 访问与配置收尾 交付。
- **D3 文件端点**：作用域白名单（注册工作区根 ∪ media-originals 缓存；只读、防穿越、大小上限、Range、token 门控）。
- **D4 provider 管理**：完整增改进 web；apiKey 只写不读（GET 恒脱敏，留空 = 不变）。
- **D5 工具耗时来源**：agent-core 事件加 `startedAt/endedAt`（加法、向后兼容、不违反 ADR-0031；replay 与 TUI 共同受益）。

**Consequences**：

- ✅ 大部分能力是"打通最后一公里"（core/SDK 已有 fork、元数据、配置、子 agent 事件），工作量集中在 web 层。
- ✅ 时间戳进 core 使耗时语义与 wire record 一致，TUI 未来可直接复用。
- ⚠️ 本 PRD 突破 ADR-0034 D4 的"单用户回环"假设（LAN 文件端点 + 配置写入）——**以新建 ADR-0036 承接**（LAN 威胁模型：token 持有者 = 全权用户），部分取代 ADR-0034 D4。
- ⚠️ agent-core 出现 web 驱动的改动，需守住"加法不破坏"边界（typecheck + 既有测试守护）。

## Implementation Plan (small PRs)

- **PR1 core 加法**（先行、独立可测）：tool 事件时间戳 + `pinned/archived` 元数据投影 + SDK 类型再导出 + agent-core 单测。
- **PR2 Wave A**：web 路由（rename/pin/archive/fork + `HarnessLike` 投影）+ 侧栏交互（菜单/置顶/归档/分叉）+ 设置页归档管理 + web-server 测试。
- **PR3 Wave B-归组**：客户端归组 reducer/视图 + replay 耗时 + 回归（时间轴融合）。
- **PR4 Wave B-看板**：子 agent 事件接入（去除 chat.ts 显式忽略）+ 时间轴卡片 + drawer + resume 重建。
- **PR5 Wave C-server**：文件端点（白名单/上限/Range/ETag）+ 安全用例测试。
- **PR6 Wave C-client**：图片内联 + 文件 drawer + Mermaid + LaTeX + 宽表格 + settle 渲染策略。
- **PR7 Wave D**：LAN banner + TUI `/web` + provider/models 配置管理（蓝本对齐）+ 新建 ADR-0036 + 全量回归 + changesets。

## Technical Notes

### Wave D 配置管理蓝本（deepseek-harness 探查，2026-08-14）

设置 UI 位于 `packages/client/ui-settings-models/src/client/`（ModelsSection / ProviderEditor / CustomProviderCard / ModelListEditor）；凭证契约 `packages/host/apiproxy/src/api/credentials.ts`——`CredentialView` 只有 `configured/source/writable`，**value 只在 set 时过线**（结构性只写不读）。

- **采纳**：行卡 + 展开编辑、key 只写不读 + placeholder 状态表达、折叠高级区、`256K/1M` 容量后缀输入、fetch available models（草稿探测 + 勾选采纳）、删除确认区分连带删 key、绿点 key 状态、单卡编辑互斥。
- **结合 byf 实际的增减**：保留全局 `defaultModel` 引用别名（byf 的模型选择器基于别名表，蓝本无全局默认概念）；增加 capabilities（tool_use/image_in/video_in）与 type 五选（byf schema 特有）；`oauth` provider 只读引导 CLI；不抄 revision 乐观锁 / 热重载 / onboarding 卡 / 开关 / 排序（单用户场景 + byf 已有 hero 引导与 update-config skill 兜底高级字段）。
- 用户实际配置形态（单个自建 openai-completions provider + 单别名 + capabilities 声明）验证了 fetch-models 端点发现与容量/能力编辑是主工作流，优先级高于表单全覆盖。

- 探查结论的关键锚点见 `## What I already know`（行号为探查时快照）。
- 开工前置：先提交分支上未提交的「web-workspace-sidebar-deepseek-alignment」批次（完整、带测试与 changeset），避免两批改动交织。
- TUI `/web` 接线四文件：`apps/cli/src/tui/commands/registry.ts`、`handlers/register.ts`（穷尽 `satisfies`）、`handlers/slash-host.ts`、`byf-tui.ts:555`。
- 视频路径仅走文件端点；引擎 data-URL 视频仅在模型 `video_in` 场景出现，SSE 大帧风险已记录（Open Questions 4）。

## Domain Terms（draft — for /grill to refine）

| Term                                                  | Working Definition                                                                                                       | Status |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------ |
| 工具调用归组 (tool call grouping)                     | 同一 turn 内相邻同 `ToolInputDisplay.kind` 的工具调用折叠为「类型 + 数量 + 总耗时」摘要行的客户端投影                    | new    |
| 子 Agent 时间轴卡片 + drawer (subagent timeline card) | 子 agent 在主步骤时间轴中的信息卡片（分工/状态/耗时/usage），点击经右侧 drawer 深度查看其调用轨迹（have-a-try 裁决形态） | new    |
| 作用域白名单文件端点 (scoped file endpoint)           | realpath 后限定注册工作区根 ∪ media-originals、带大小/类型上限与 Range 的只读文件 HTTP 端点                              | new    |
| 只写不读密钥 (write-only secret)                      | apiKey 仅接受写入、任何 GET 恒脱敏（`hasApiKey`）、编辑留空即不变的密钥管理语义                                          | new    |
| settle 后渲染 (render-after-settle)                   | 流式期间保持纯文本、块完结后再做 Mermaid/LaTeX/高亮等重渲染的策略（沿 PRD-0033）                                         | reused |

## Traceability

- **Implemented by**: /implement + /tdd(2026-08-14,分支 prd-0034-web-workbench-upgrade)

- **Created by**: `/think`（2026-08-14；三轮并行代码探查 → 5 项用户决议：新建 PRD-0034 / 四波全进 / 文件端点白名单 / provider 密钥只写不读 / 耗时进 core）
- **Prototyped by**: `/have-a-try`（2026-08-14）— 子 Agent 呈现形态三变体（`spike/subagent-board.html`，A 卡片流+drawer / B 时间轴内联展开 / C 常驻 details 栏）；裁决 = **时间轴卡片 + 点击弹 drawer**（用户定夺），原型已处置
- **Grilled by**: `/grill`（2026-08-14）— 三批共 9 项决议：置顶/归档 first-class、fork busy 409、按 kind 归组、models 管理进 v1（交互蓝本 = deepseek-harness settings）、TUI `/web` 独立入口、媒体帧 v1 实测、LaTeX 单 `$`、LAN 决策升格 ADR-0036、看板形态（原型裁决）；Open Questions 清零
- **Baseline**: `prd-0033-web-ui-redesign` @ `3bed20c` + 未提交 workspace-sidebar 批次（需先落盘）
- **Follows**: PRD-0032（传输骨架）、PRD-0033（UI 重设计）；PRD-0033 的 Out of Scope 项（会话管理/Fork/富渲染/远程访问）由本 PRD 承接
- **Related ADR**: ADR-0034（其 D4「单用户回环」假设由本 PRD 新建的 ADR-0036 部分取代）、ADR-0020/0023（fork 语义）、ADR-0031（wire 不做 v2 迁移——本 PRD 仅加法）

## Issue

#308（父 Issue，由 `/think` 创建；`/grill` 后由 `/story` 创建子 Issue 挂载到此）
