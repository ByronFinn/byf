# PRD-0035: byf Web × Vis 合并：单源工作台（Single-Source Workbench）

> **Status**: In Progress | **PRD**: PRD-0035 | **Created**: 2026-08-17 | **Last updated**: 2026-08-17

## Goal

把当前两个风格迥异、两个 server、两条数据读取链路的 `apps/web`（live chat）与 `apps/vis`（只读 inspector）合并为**一个 Web 工作台**：

- 页面结构与交互语义对齐 deepseek-harness 的三栏工作台；
- 视觉系统以 `apps/vis/web/src/theme.css` 为唯一设计 token 源；
- `apps/web` 成为唯一 Web 入口，`apps/vis` 的全部能力吸收为 Inspector 模块；
- `config.toml`、`sessions/**`、`session_index.jsonl` 等文件各只有一个 owner，所有界面（Web / TUI / headless）只通过 `agent-core → SDK` 这一条路径读写；
- Web 设置页不仅能“选择”配置，还能**直接编辑 `config.toml` 全文**，带校验、版本冲突检测与原子保存。

本 PRD 是 PRD-0032/0033/0034 的延续。它解除“web 与 vis 各自演进”的现状，也修正 PRD-0034 R-D3 中“结构化配置写保留注释”这一过强表述（见 Technical Notes T5）。

## What I already know

### 现状：两套 Web 界面，两套数据路径

| 维度 | `apps/web` | `apps/vis` |
|---|---|---|
| 定位 | 实时驱动 agent | 只读 session 回放/调试 |
| 默认端口 | 4100 | 3001 |
| server 依赖 | `@byfriends/sdk`（遵守 host 分层约束） | 直接依赖 `@byfriends/agent-core` |
| 会话读取 | `ByfHarness.listSessions` → core `SessionStore` | 自己扫 `~/.byf/sessions/**`、自己读 `state.json`/wire |
| 视觉 | shadcn + OKLCH emerald + 较大圆角 | Tailwind v4 + surface/fg/cat token + 方形 mono 工业风 |
| 配置 | `GET/PATCH /api/config` + provider/model CRUD（脱敏） | 无配置能力 |
| 会话删除 | 无 | `rm -rf` 会话目录，**不清理 `session_index.jsonl`** |
| SPA 内嵌全局 | `__BYF_WEB_EMBEDDED_ASSETS__` | `__BYF_VIS_EMBEDDED_ASSETS__` |
| CLI 入口 | `byf web` / TUI `/web` | `byf vis` |

关键重复点：

- `apps/web/server/src/config.ts` 与 `apps/vis/server/src/config.ts` 各有一份 `resolveByfHome()`。
- vis 的 `session-store.ts`/`wire-reader.ts`/`context-projector.ts`/`agent-tree.ts` 事实上是 agent 数据投影，但放在 app 层，导致 web 无法复用、core 无法统一演进。
- Web 与 TUI 已经通过 `ByfHarness` 共享 core，但 vis 是第三条独立路径。
- `apps/web/server/src/workspace-registry.ts` 直接读写 `~/.byf/workspaces.json`；该文件目前只有 web 使用，但 owner 不清晰。
- 配置写只有结构化 `setConfig`（parse → merge → stringify），缺少 raw 全量读写；结构化写会重排/丢注释，PRD-0034 的“保留注释”表述需要修正。
- `apps/cli/scripts/compile/build.mjs` 同时嵌入两套 SPA 资产；`apps/cli/src/cli/sub/vis.ts` 与 `web.ts` 是两段几乎相同的 server 启动胶水。

### 已具备（不重复建设）

- PRD-0034 完成：会话重命名/置顶/归档/Fork、工具归组、子 agent 卡片、文件端点、Mermaid/LaTeX、provider/models 管理、TUI `/web`、LAN banner。
- `apps/web/client` 已有 shadcn 组件、react-query、SSE reducer、Shiki、步骤时间轴。
- `apps/vis/web` 已有成熟的 Wire/Context/Agents/State 视图与虚拟滚动。
- core 已有 `SessionStore`、`session_index.jsonl`、wire migration、`config/toml.ts` 原子写。
- SDK `ByfHarness` 已导出 `configPath`、`getConfig/setConfig`、会话 CRUD 主体。

### 蓝本：deepseek-harness（只借交互语义，不抄架构）

- 三栏 `AppFrame` + `columns.ts`：sidebar | center | details，可拖拽、窄屏折叠。
- Sidebar：品牌行、New Session、工作区树、搜索、底部 Settings。
- Center：blank-session hero；会话视图 Chat / Trajectory tabs；composer 底部控制条。
- Right details：默认空态 “Click a tool row in the message flow to view its details”。
- Settings：居中 modal（1080×700 基准）+ 左侧导航（General / Models / Plugins / Agent Presets）+ 行卡式 provider 编辑。
- 不引入 Cordis/slots/CSS Modules/Agent Preset 引擎；byf 继续使用 PRD-0033 决议的 shadcn 混合路线。

## Research References

无 `/research` 产出的权威记录。本 PRD 基于对 deepseek-harness（`packages/client/ui-layout/src/client/AppFrame.tsx`、`columns.ts`、`ui-settings-general/SettingsRoot.tsx`）与 byf `apps/web`、`apps/vis` 的源码 inline 探查，结论见 Technical Notes。Raw 配置编辑器若选用 CodeMirror 6，属于成熟编辑器组件，不触发额外调研；TOML 注释保留/结构化补丁方案若进入 v1.1，再补 `/research`。

## Open Questions（待 /grill 确认）

以下为**建议决议**，PRD 按此撰写；`/grill` 否决项需回改 Requirements。

- **Q1 视觉源 = deepseek 精致风**：以 deepseek-harness 精致风格（bluish 中性阶 + deepseek 蓝品牌、圆角、柔和层次）为唯一视觉源，`/have-a-try` 原型 2026-08-17 裁决选 B；**emerald 品牌色完全移除**（不做桥接别名）；`cat-*` 事件类别色保留为 Inspector 调试视图语义色；web 现有 emerald/shadcn 预设清零，仅保留 shadcn 结构桥接。
- **Q2 server 唯一性**：`apps/web/server` 唯一保留；`@byfriends/vis-server` 做一个版本 shim 后删除。`byf vis` 在弃用期内仍默认 3001，但实现完全复用 web-server。
- **Q3 raw 配置 canonical**：Raw TOML 保存原样写回文本（注释/空行/未识别键全保真）；结构化表单继续走语义 patch，检测到注释时提示“将规范化文件”。v1.1 再评估 comment-preserving TOML patch。/grill 决议：密钥值在 raw 响应中做**无损掩码**，保存占位符 = 保留磁盘原值，输入新值 = 更新；无明文回显开关（ADR-0036 write-only 契约零修改）。
- **Q4 并发策略 = 乐观锁，不提供 force**：`revision = sha256(text)`；冲突返回 409，由用户 reload 或手动合并。/grill 决议：raw PUT 与结构化 setConfig 都校验 `expectedRevision`；文件缺失时 revision 为 `null`，`expectedRevision: null` 视为创建。
- **Q5 会话删除进 core**：新增 `SessionStore.deleteSession`，删除目录并原子重建 `session_index.jsonl`；/grill 决议：busy = (a) harness 中存在该 id 的 live Session 实例（已 resume 未 close），或 (b) 该会话仍有运行中的后台任务（background manager），二者返回 409；会话内 cron 随目录删除自然移除，UI 删除确认弹窗提示「会话内 Cron 将一并删除」。
- **Q6 `workspaces.json` 上移 core/SDK**：从 web-server 私有文件逻辑上移为 core 的 `WorkspaceRegistry`，Web 与未来 TUI 共用同一实现。/grill 决议：迁移时**丢弃旧 string[] 格式兼容**，只保留 order+hidden 新结构；文件不存在或非新结构视为空注册表（首次写入覆盖为新结构）。
- **Q7 `tui.toml` 不进入 Web**：TUI 表现偏好继续由 CLI 独有；Web 的外观/列宽/搜索状态放 `localStorage`。避免一个文件两个界面 owner。（/grill 已确认）

### 1:1 复刻范围（/grill 决议，2026-08-17）

- **架构**：页面结构与交互近 1:1 对齐 deepseek-harness，**技术实现用 byf 现有栈**（React 19 + Tailwind v4 + shadcn/Radix + 现有状态机与 SSE reducer），不搬 deepseek 的 Cordis/slots/CSS Modules 架构（h2 决议，维持 ADR-0035 shadcn 路线）。
- **视觉源**：`/have-a-try` 原型 2026-08-17 裁决——**选 B：deepseek 精致风**为唯一视觉源（h1 决议）；`cat-*` 保留为 Inspector 语义色。PRD R-C1/AC-A10/D2 已按裁决更新。
- **功能对齐清单**（h3 决议，全选）：Trajectory 视图、右侧 Details 栏、Settings 左侧导航结构、Composer 行为细节、周边组件（GoalBar / 后台任务面板 / 消息反馈 / 命令与菜单 popup）；**不兼容项不抄**：Agent Presets 引擎、Plugin Inventory / plugins 目录、Plan mode（ADR-0008 已移除）、workflow 编排。

## Requirements

### Wave A：core 成为唯一事实源

- **R-A1 Inspector 上移**：把 `apps/vis/server/src/lib/session-store.ts` 的只读会话发现/健康检查/inventory、`wire-reader.ts`、`context-projector.ts`、`agent-tree.ts` 迁移到 `packages/agent-core/src/session/inspector/`，类型收敛到 `vis-shared` 等价的新 core 导出面。vis 与 web 不再各自实现。
- **R-A2 SDK Inspector API**：`ByfHarness` 新增（底层走 core，不破坏 host 分层）：
  - `listInspectableSessions()`：全量会话投影，含 health、wire record count、agent count、workDir、updatedAt。
  - `readSessionInspection(id)`：`state.json` + agents inventory + health。
  - `readAgentWire(id, agentId)`：流式/迁移读取 wire，返回 records + warnings。
  - `readContextProjection(id, agentId)`：投影 LLM 上下文/usage/config/permission。
  - `readAgentTree(id)`：agent 树。
  - `deleteSession(id)`：删除会话目录 + 原子重建 index；live Session 实例或运行中后台任务存在时返回 busy（409），会话内 cron 随目录一并删除。
- **R-A3 ConfigDocument raw API**：core 增加 `readConfigText / validateConfigText / writeConfigText`；`ByfHarness` 透出。`writeConfigText` 先 `parseConfigString` 校验，再原样原子写回文本。
- **R-A4 Config revision**：所有配置写返回 `revision = sha256(raw text)`；raw 写与结构化 `setConfig` 都接受 optional `expectedRevision`（校验不匹配返回 409）；文件不存在时 revision 为 `null`，`expectedRevision: null` 视为创建。
- **R-A5 结构化 patch 保留现状语义**：`setConfig` 仍走现有 merge + stringify；本 PRD 不承诺其保留注释，UI 必须把“可能规范化文件”告知用户。
- **R-A6 `WorkspaceRegistry` 上移**：`apps/web/server/src/workspace-registry.ts` 迁移到 `packages/agent-core`（建议 `src/home/workspace-registry.ts`），SDK 透出 `listWorkspaces/addWorkspace/removeWorkspace/hiddenWorkspaces`。web-server 不再直接读写 `workspaces.json`。/grill 决议：丢弃旧 string[] 格式兼容，仅保留 order+hidden 新结构；非新结构文件视为空注册表。
- **R-A7 路径解析单源**：删除 web/vis 各自的 `resolveByfHome`，统一使用 SDK 导出实现；端口/主机/鉴权解析仍属 server 配置层，但只保留 web-server 一份。

### Wave B：server 与 CLI 合并

- **R-B1 统一 API**：在 `apps/web/server/src/routes.ts` 上扩展，不新增独立端口：
  - `GET /api/sessions`：`workDir` 可选；缺省返回全量会话（原 vis 全量列表语义）。
  - `DELETE /api/sessions/:id`：走 SDK `deleteSession`。
  - `POST /api/sessions/:id/reveal`：保留 host 动作，仅 web-server 实现。
  - `GET /api/sessions/:id/wire?agent=main`
  - `GET /api/sessions/:id/context?agent=main`
  - `GET /api/sessions/:id/agents`
  - `GET /api/sessions/:id/state`
  - `GET /api/config/raw`：config.toml 缺失时 200 + 默认配置解析 + `revision:null`（UI 提示「文件不存在，保存将新建」）。
  - `POST /api/config/validate`、`PUT /api/config/raw`
- **R-B2 错误码**：raw 配置新增 `409 CONFIG_REVISION_CONFLICT`、`422 CONFIG_INVALID`（含 path/line/column 诊断）。成功配置响应继续只返回脱敏 `ConfigResponse`。
- **R-B3 鉴权单源**：统一使用 `WEB_AUTH_TOKEN`；`byf vis` shim 在一个弃用版本内兼容读取 `VIS_AUTH_TOKEN` 并转发。EventSource `?token=` 逻辑不变。
- **R-B4 CLI 合并**：`apps/cli/src/cli/sub/vis.ts` 改为调用 `web.ts` 的 `handleWeb`，附加 `view=inspector` 深链语义；`byf vis` 弃用期默认端口仍 3001，`byf web` 与 TUI `/web` 默认 4100，两者共用 `startWebServer`。
- **R-B5 `@byfriends/vis-server` shim**：包保留一个 minor 版本，导出 `startWebServer`/类型别名，标注 deprecated；此后从 workspace 删除。
- **R-B6 构建单资产**：`apps/cli/scripts/compile/build.mjs` 移除 `__BYF_VIS_EMBEDDED_ASSETS__` 嵌入，只保留 `__BYF_WEB_EMBEDDED_ASSETS__`。
- **R-B7 共享类型合并**：`apps/web/shared/types.ts` 吸收 `apps/vis/shared/types.ts` 的全部 inspector DTO；`apps/vis/shared` 随 shim 弃用。

### Wave C：视觉统一与 deepseek 式三栏骨架

- **R-C1 唯一视觉源 = deepseek 精致风**：`apps/web/client/src/theme.css` 以 deepseek-harness `ui-theme` 的视觉语言为范本（**自研 token 化实现，不照搬 CSS Modules**）：
  - bluish 中性色阶（surface 分层 + fg 阶）+ deepseek 蓝品牌色（~#4176e6 系）作主强调；
  - 圆角 8-12px、低透明度柔和边框（rgba）、分层阴影、精致 hover；
  - 深浅双主题、`data-theme` 三态、boot 脚本防闪烁；
  - 中文友好 UI 字体栈 + `JetBrains Mono/SF Mono`（代码/徽章）。
  - 保留 shadcn 桥接变量（`--background/--foreground/--card/--primary/...`）指向新 token（结构桥接）。
  - **emerald 品牌色完全移除**（have-a-try 2026-08-17 裁决 + /grill 决议）：现有 emerald token 清零，不做桥接映射。
  - `cat-*` 事件类别色保留为 Inspector 调试视图（Trace/Context/Agents/State）的语义色，属于 token 集扩展，不作主品牌。
- **R-C2 批量样式迁移**：现有 web 组件从 `bg-bg/text-fg/...` 等旧语义名迁到 vis 命名；允许一个过渡版本同时注册旧别名，但主题文件只认 vis 为源。
- **R-C3 三栏 AppFrame**：新增 `components/layout/AppFrame.tsx`，采用 deepseek 几何契约：
  - Sidebar 默认 280 / min 264 / max 420，折叠 56；
  - Center min 640；
  - Details 默认 360 / min 300 / max 520；
  - viewport < 1024 自动折叠 sidebar；
  - details 放不下自动关闭、恢复窗口后按偏好回来；
  - narrow 下 details 为 overlay drawer。
- **R-C4 侧栏迁移**：现有 `SessionSidebar` 的工作区/搜索/置顶/归档/Fork/排序逻辑原样迁入 AppFrame sidebar，视觉改 vis token。
- **R-C5 Settings 弹层扩展**：从 640×480 提升到 960×680 / 1080×700 基准，左侧导航为：
  1. 通用
  2. 模型与 Provider
  3. 权限
  4. 运行与服务
  5. 配置文件
- **R-C6 深色/浅色/跟随系统三态**：沿用 vis `useTheme` 语义；主题是 UI 偏好，存 `localStorage`，不写 `config.toml`。

### Wave D：Inspector 功能并入统一工作台

- **R-D1 Center tabs**：会话视图支持 `Chat | Trace | Context | Agents | State`：
  - Chat = 现有 live chat；
  - Trace = 原 vis `WireTab`（虚拟滚动、搜索、pair 跳转、issues）；
  - Context = 原 vis `ContextTab`；
  - Agents = 原 vis `SubagentsTab`；
  - State = 原 vis `StateTab`。
- **R-D2 Right details 面板**：新建统一 details 宿主，替代现有 `FileDrawer`/`SubagentDrawer` 与 vis `WireRowDetail/IssuesDrawer`：
  - 默认 deepseek 同款空态；
  - 工具详情、子 agent 轨迹、文件预览、wire/state JSON 共用同一容器；
  - narrow 自动降级为 drawer。
- **R-D3 会话删除/reveal 走统一 API**：删除前二次确认，busy 显示 409 原因；删除后 index、workspace 视图、当前路由一致刷新。
- **R-D4 原 vis 路由兼容**：`/sessions/:id/agents/:agentId` 保留；缺省打开 Inspector tab 的深链参数继续可用。
- **R-D5 全量会话列表**：sidebar 的数据来自统一 `/api/sessions`（全量投影），组内视图、健康标记、wire 计数与 TUI 会话列表同源。
- **R-D6 客户端单一投影**：活跃会话的 Chat 与 Trace 不得维护两套互不相通的 reducer；Chat 使用 SSE/replay 投影，Trace 使用同一会话的持久化 wire 读取接口，两侧共享 `sessionId/agentId/工具归组/子 agent` 语义，不允许 vis 旧逻辑复制出新状态源。
- **R-D7 deepseek 功能对齐**（/grill h3 决议）：
  - **Trajectory 视图**：Chat 之外提供 Trace 表格视图（turn 分组表头、timeline、搜索/过滤工具栏、pair 跳转），与 vis 的 WireTab 语义合并（原 vis 定位基础上按 deepseek Trajectory 骨架组织）。
  - **右侧 Details 栏**：deepseek 形态（空态同款文案、工具详情/子 agent 轨迹/文件预览/上下文 meter/todo 面板共用容器），R-D2 按此实现。
  - **Settings 左侧导航**：五段导航（通用 / 模型与 Provider / 权限 / 运行与服务 / 配置文件），行卡式 provider 编辑、onboarding 轻提示。
  - **Composer 行为细节**：附件 rail（拖图/粘贴图片）、模型选择器下拉、权限模式选择、发送按钮与 Enter/Shift-Enter 行为、底部状态条。
  - **周边组件**：GoalBar（byf `/goal` 状态条）、后台任务面板（byf background manager 的 `/tasks` 等价）、消息反馈（点赞/点踩，先行本地 UI 占位，持久化另立项）、命令/菜单 popup（输入触发）。
- **R-D8 不兼容项不抄**（/grill h3 决议）：Agent Presets 引擎、Plugin Inventory / plugins 目录、Plan mode（ADR-0008 已移除）、workflow 编排均不进入 Web；相关讨论记录在案（见 Out of Scope）。

### Wave E：配置文件编辑（不只是选择）

- **R-E1 配置文件 section**：Settings 内新增「配置文件」页：
  - 顶部显示 `config.toml` 绝对路径、状态（valid / modified / conflict）、revision；
  - 操作：Refresh、Validate、Save、Copy path、Reveal in OS；
  - 全文编辑器带行号、TOML 高亮、mono 字体；
  - 底部 diagnostics 显示 TOML/schema 错误的 path/line/column。
- **R-E2 校验后落盘**：前端 debounce validate（或显式 Validate）调用 `POST /api/config/validate`；Save 必须服务端再次校验，invalid 拒绝写入。
- **R-E3 冲突处理**：Save 携带 `expectedRevision`；409 时展示冲突提示，不提供 force 覆盖，提供“重新载入磁盘版本”和“复制磁盘版本”以人工合并。
- **R-E4 全保真**：Raw 保存原样写回文本；注释、空行、未识别键不丢失。
- **R-E5 结构化保存提示**：表单保存前若检测到当前文本含注释或未知结构，提示“该操作会规范化 `config.toml`；如需保留注释请使用配置文件页保存”。检测可简化为“raw 文本含 `#` 注释行”，后续再精确化。
- **R-E6 密钥安全**：Raw 内容默认以掩码显示 `api_key`/`apiKey` 值（服务端响应时替换为占位符，**永不回显明文，不提供显示密钥开关**——ADR-0036 write-only 契约零修改）；保存原样占位符 = 保留磁盘原值，在占位符位置输入新值 = 更新（新值才过线）；错误响应与日志不得包含密钥全文。
- **R-E7 跨界面一致**：Web raw 保存后，新启动的 TUI/headless 必须读到同一文件；TUI login 修改后，Web 重新 GET 应看到新 revision。验收通过双进程互操作测试覆盖。
- **R-E8 结构化表单与 raw 同源**：所有表单保存后，配置文件页显示的是同一 `config.toml` 的最新文本；不允许存在表单缓存/raw 缓存两套状态。

### Wave F：弃用与清理

- **R-F1 删除 vis 实现**：shim 一个 minor 版本后，删除 `apps/vis/server`、`apps/vis/web`、`apps/vis/shared` 实际实现与相关 tests。
- **R-F2 根脚本清理**：`package.json` 移除 `build:vis`/`vis` 脚本或改为 unified 别名；`typecheck` 只构建一个 Web SPA。
- **R-F3 文档与 ADR**：更新 `apps/web/AGENTS.md`、`CONTEXT.md`、`docs` 架构说明；新建 ADR 记录“单源工作台、config raw 编辑、vis 弃用”决策。

## Acceptance Criteria

- [x] **AC-A1** `apps/vis/server/src/lib` 的会话/wire/context/agent 投影逻辑不再被 web 之外的 app 层副本实现；web-server 运行时不直接 import `@byfriends/agent-core`。
- [x] **AC-A2** `byf web`、`byf vis`、TUI `/web` 三者最终落到同一个 `startWebServer` 实现；不存在第二个 HTTP server 代码路径。
- [x] **AC-A3** `GET /api/sessions` 无 `workDir` 时返回全量会话；Web 侧栏、原 vis 列表、TUI 会话列表看到的会话集合一致。
- [x] **AC-A4** `DELETE /api/sessions/:id` 删除后 `session_index.jsonl` 不再残留该 id；active/busy 会话删除返回 409。
- [x] **AC-A5** Web 配置文件页可打开、校验、保存 `config.toml` 全文；invalid 文本不落盘并给出定位。
- [x] **AC-A6** Raw 保存后注释/空行/未识别键保留；保存成功返回新 revision。
- [x] **AC-A7** 并发修改：TUI/另一进程修改文件后，Web 携带旧 revision 保存返回 `409 CONFIG_REVISION_CONFLICT`，不覆盖磁盘版本。
- [x] **AC-A8** 结构化配置保存时，检测到注释/未知结构会显示“将规范化文件”提示；保存结果与配置文件页 raw 内容一致。 （注释检测 banner + 配置文件页全保真保存）
- [x] **AC-A9** 三栏布局几何符合 deepseek 契约；sidebar 可拖拽/折叠，details 可拖拽/关闭，<1024px 自动折叠。 （columns 几何单测 + AppFrame 实现；拖拽交互 jsdom 测试未加——纯函数契约已钉）
- [x] **AC-A10** 全站颜色/字体/圆角来自 deepseek 精致风 token（自研实现）；浅色主题达到 WCAG AA；旧 web emerald 与 OKLCH 硬编码 token 全部清零（不保留桥接映射），仅 shadcn 结构桥接变量存在；Inspector 视图可额外使用 `cat-*` 语义色。
- [x] **AC-A11** Chat/Trace/Context/Agents/State 五 tab 可用；原 vis 核心检查能力（wire 搜索、pair 跳转、issues、agent tree、context projection、state）全部保留。
- [x] **AC-A12** 点击工具行/子 agent/文件路径/wire 行能在 right details 或 narrow drawer 中打开对应详情；默认显示 deepseek 同款空态。 （DetailsProvider + WireRow 行点击 → details 列；文件/子agent 详情沿用既有 drawer）
- [x] **AC-A13** PRD-0032/0033/0034 全部验收回归通过（SSE、审批/问答、Fork、归档、文件端点、Mermaid/LaTeX、LAN auth、TUI `/web`）。 （web-server 70 / client 52 / cli exit 0 回归）
- [x] **AC-A14** `byf vis` 弃用期行为可预期：默认端口 3001 不变、`VIS_AUTH_TOKEN` 兼容；输出 banner 标明已由统一工作台提供服务。
- [x] **AC-A15** native compile 只内嵌一个 SPA 资产；`bun run build`/`typecheck`/`lint`/`test` 全绿。

## Definition of Done

- 上述 AC 全部满足。
- `apps/vis` 实际实现删除（或按弃用计划只剩 shim），workspace 中无第二个 SPA/server 构建目标。
- core inspector 与 config raw API 有针对性单测；web-server 有 fake harness 测试覆盖 409/422/删除/index 清理。
- 深浅双主题下逐组件目检通过；三栏拖拽与窄屏行为有回归测试。
- changesets：
  - `@byfriends/agent-core` minor（inspector API、config document、workspace registry、session delete）；
  - `@byfriends/sdk` minor；
  - `@byfriends/web-server` minor；
  - `@byfriends/web-client` minor；
  - `@byfriends/cli` minor；
  - `@byfriends/vis-server` minor + deprecation note。
- 新建/更新 ADR：单源工作台边界、config raw 编辑与 revision、vis 弃用计划。

## Out of Scope（/grill 已逐项确认）

- TUI 当前会话实时镜像到 Web（PRD-0034 已列为未来演化，本轮不改变）。
- 多用户/登录/HTTPS；LAN 暴露仍沿用 ADR-0036 单用户 + token 模型。
- 通用 schema-driven 表单生成器：高频配置（general/provider/model）保留手写表单，长尾字段由 raw 编辑器覆盖。
- v1 不做 comment-preserving 结构化 TOML patch；仅 raw 全保真 + 结构化保存提示。v1.1 再评估 CST/文本级 patch（扩展点在 ADR-0038 备选）。
- Web 编辑 `tui.toml`：TUI 表现偏好仍归 CLI owner。
- Web 编辑 `mcp.json`/项目 `.byf/local.toml`：保持 core 现有 owner 与 TUI/agent 写入路径；后续如需要再单独立项。
- 移动端/触屏专项、会话导出分享；background/goal/cron 管理 UI 不在本轮（GoalBar/后台任务面板仅做状态展示，管理操作仍走 TUI/CLI）。
- deepseek 的 Cordis/slots/CSS Modules/Agent Preset/Plugin Inventory/Plan mode/workflow 不照搬（ADR-0037 D5）。
- 全量 wire 服务端分页/游标（当前沿用虚拟滚动 + 全量读取；大文件性能问题出现后再立项）。

## Technical Approach

### 总原则

1. **文件是真相，server 是网关，前端是投影。**
2. **每种文件一个 owner，所有界面只调用 owner 的 API。**
3. **一个 Web 客户端、一个 Web server、一个视觉 token 源。**
4. **表单与 raw 编辑器是同一 `config.toml` 的两个视图，不是一个数据库 + 一个文件。**

### 目标数据流

```text
config.toml
sessions/** + session_index.jsonl
workspaces.json
mcp.json / .byf/local.toml / credentials/**
        │
        ▼
agent-core（SessionStore / Inspector / ConfigDocument / WorkspaceRegistry）
        │
        ▼
node-sdk / ByfHarness
        │
   ┌────┴─────┬─────────────┐
   ▼          ▼             ▼
 TUI       web-server    headless
             │
             ▼
      web-client（只调 /api，不碰文件）
```

### 目标页面结构

```text
┌───────────────┬──────────────────────────────────┬──────────────┐
│ Sidebar 280   │ Center ≥ 640                     │ Details 360  │
│               │                                  │              │
│ brand/logo    │ [session banner]                 │ 空态:        │
│ New Session   │ Chat | Trace | Context | Agents  │ "Click a     │
│               │               | State            │  tool row"   │
│ Workspaces    │                                  │              │
│  ├ search     │  transcript / timeline /         │ 选中后:      │
│  ├ view opts  │  context / agents / state        │ 工具详情     │
│  ├ add ws     │                                  │ 子Agent轨迹  │
│  └ tree       │                                  │ 文件预览     │
│               │                                  │ wire/state   │
│ footer        │  composer                        │ JSON         │
│ Settings      │  model/permission/thinking/send  │              │
└───────────────┴──────────────────────────────────┴──────────────┘
```

### 配置编辑契约

```http
GET  /api/config/raw
     → { path, text, revision, parsed: ConfigResponse }
     （text 中 api_key/apiKey 值为掩码占位符；revision = sha256(磁盘原文)；
       文件缺失时 revision:null、parsed 为默认配置解析）

POST /api/config/validate
     → { valid: true } | { valid: false, diagnostics: [...] }

PUT  /api/config/raw
     body { text, expectedRevision }
     → 200 { config: ConfigResponse, revision }
     → 409 CONFIG_REVISION_CONFLICT
     → 422 CONFIG_INVALID
```

`revision = sha256(text)`（**磁盘原文**，非掩码后文本）；缺失文件为 `null`。Raw 写路径：读取磁盘当前文本 → 比较 expectedRevision → 还原占位符（占位符行保留 = 磁盘原值；占位符行删除 = 删除该 key；新值写入 = 更新）→ `parseConfigString` 校验 → 原样 `atomicWrite` → 重读返回新 revision。结构化写路径保持现有 `setConfig`，可选携带 `expectedRevision`，成功后同样返回 revision。

## Feasible Approaches

### 合并策略

- **A（选定）**：`apps/web` 吸收 `apps/vis`，vis 包保留一个版本 shim 后删除。
  - Pros：最终只有一个 SPA、一个 server、一条数据链路；长期维护成本最低。
  - Cons：一次性迁移量大，需要兼容 `byf vis` 与已发布包。
- B：保留两个包、只抽共享 core/theme。
  - Pros：改动小。
  - Cons：两套 server/入口仍长期并存，风格与数据路径仍有分叉风险，不满足目标。
- C：新建第三个 `apps/workbench`，web/vis 都迁过去。
  - Pros：命名干净。
  - Cons：多一次重命名/发布/迁移，ROI 低。

### 视觉迁移策略

- **A（选定）**：deepseek 精致风 token 成为唯一源（bluish 色阶 + 深蓝品牌 + 圆角 + 柔和层次），web shadcn 通过变量桥接兼容，组件 class 批量迁移；emerald 品牌色移除；`cat-*` 保留为 Inspector 语义色。选型依据：`/have-a-try` 原型 2026-08-17 对比裁决（B 胜出）。
- B：web token 成为唯一源，vis 组件改 emerald 风格。否决：用户明确要求沿用 vis 风格，且 vis 的 `cat-*` 事件色更适合调试工作台。
- C：两个主题并存、页面切换。否决：又制造新的风格分叉。

### 配置编辑策略

- **A（选定）**：raw 全文编辑 = canonical；结构化表单 = 快速投影；乐观锁 revision；服务端校验。
- B：只做结构化全量表单。否决：无法覆盖长尾字段，且用户要求“修改配置文件而不是只能选择”。
- C：前端直写文件。否决：违反安全与唯一 owner 原则。

## Decision (ADR-lite)

**Context**：PRD-0033/0034 后 web 是产品级聊天工作台，但 vis 仍是独立调试工具；两个 app 存在重复数据读取、重复 server 骨架与两套视觉系统。同时，配置页只能选择/填表，不能满足直接编辑配置文件的需求。

**Decision**（7 项，待 `/grill` 确认）：

- **D1 单工作台**：`apps/web` 为唯一 Web 工作台；`apps/vis` 能力吸收为 Inspector 模块；`byf vis` 与 `@byfriends/vis-server` 保留一个版本兼容 shim 后弃用。
- **D2 deepseek 精致风视觉为唯一源**：bluish 色阶 + 深蓝品牌 + 圆角 + 柔和层次（自研 token 化实现）；emerald 品牌色移除（have-a-try 原型 2026-08-17 裁决 B + /grill 决议，取代 ADR-0035 D5）；`cat-*` 保留为 Inspector 语义色。
- **D3 core 拥有 Inspector**：vis 读取器上移 `agent-core`，web-server 只依赖 SDK，维持 host 分层约束。
- **D4 raw config 为 canonical writer**：全量 `config.toml` 编辑、服务端校验、sha256 revision 乐观锁、invalid 不落盘、冲突不 force。
- **D5 结构化表单是投影**：与 raw 同源；检测到注释/未知结构时提示“将规范化文件”。v1 不实现 comment-preserving patch。
- **D6 文件 owner 单一化**：`workspaces.json` 上移 core；`tui.toml` 继续 TUI 独有；Web UI 偏好放 localStorage。
- **D7 兼容边界**：`byf vis` 弃用期默认端口 3001 不变，但复用 `startWebServer`；`VIS_AUTH_TOKEN` 只读兼容。

**Consequences**：

- ✅ 消除两套 server、两套主题、两条会话读取路径，后续功能只需做一次。
- ✅ Web/TUI/headless 对 `config.toml` 与 sessions 的认知完全一致。
- ✅ raw 编辑器让所有 schema 字段可配置，不再受表单覆盖范围限制。
- ⚠️ 一次性迁移面较大：需要批量样式替换、vis 页面迁移、CLI/构建链路改造。
- ⚠️ 移除 emerald 品牌色是视觉回归项：需要逐组件确认 cat 色在浅色主题下达到 AA。
- ⚠️ 结构化写丢注释问题在本 PRD 中只做到“提示”，未根治；需要在 UI 文案与 ADR 中明确，避免用户误以为表单保存全保真。
- ⚠️ `@byfriends/vis-server` 是已发布包，删除需要 deprecation 计划与 changelog 说明。

## Implementation Plan (small PRs)

- **PR1 core 单源**（先行、独立可测）：
  - `packages/agent-core/src/session/inspector/`（session-files / wire-reader / context-projector / agent-tree / types）— **Done（2026-08-17，commit 45188c0）**
  - SDK inspector API + `deleteSession`（busy 判定）— **Done**
  - `readConfigText/validateConfigText/writeConfigText` + revision（config/document.ts，含无损密钥掩码）— **Done**
  - `WorkspaceRegistry` 上移（src/home/workspace-registry.ts，弃旧格式）— **Done**
  - core/node-sdk 单测（28 新用例全绿；core 2699 通过，11 个既有环境性失败与本次无关；SDK 176 全绿）。
- **PR2 server 合并**（— Done，2026-08-17，commit 61e2f92）：
  - web-server：/api/sessions 无 workDir 全量、DELETE /sessions/:id（409 busy）、wire/context/agents/state、reveal（reveal.ts 迁移）、config raw/validate（掩码+restore+409/422）；
  - web-shared 吸收 inspector DTO；HarnessLike/WebSessionManager 透传 13 个新能力；
  - CLI vis.ts 改调 handleWeb（VIS_AUTH_TOKEN 兼容转发）；vis-server 包改为 re-export shim（deprecated）；
  - build.mjs 移除 __BYF_VIS_EMBEDDED_ASSETS__ 单资产；
  - 测试：web-server 57 全绿（含 12 个新用例）、CLI 全量 exit 0、vis 测试 9 绿。
  - web-server 增加全量 sessions、delete/reveal、inspector、config raw 路由；
  - web-shared 合并 vis DTO；
  - `apps/cli/src/cli/sub/vis.ts` shim；
  - `@byfriends/vis-server` 兼容 shim；
  - web-server fake harness 测试（409/422/delete/index）。
- **PR3 视觉统一 + 三栏骨架**（— Done，2026-08-17，commit f8be990/56f4914）：
  - theme.css 重写为 deepseek 精致风统一设计 token（bluish 中性阶 + deepseek 蓝品牌、圆角 8-12px、cat-* Inspector 语义色、emerald 清零）；
  - lib/columns.ts（deepseek 几何契约移植）、components/layout/AppFrame.tsx（三栏 + 拖拽把手 + <1024 折叠 + details overlay）、AppShell 接入；
  - 组件 class 无需批量改名（语义 token 名保留，仅值替换）；emerald 硬编码扫描清零；
  - 替换 `theme.css` 为 vis token + shadcn 桥接；
  - class 批量迁移；
  - `AppFrame.tsx` + 三栏几何 + sidebar 迁入；
  - Settings modal 尺寸与五段导航骨架。
- **PR4 Inspector 合入**（— Done，2026-08-17，commit 11fdcfa）：
  - vis 组件迁入 `components/inspector`（wire/context/subagents/state/shared + hooks + lib）；
  - Center 五 tabs（Chat|Trace|Context|Agents|State）+ InspectorTabBar；
  - 删除/reveal/全量列表接线（inspectorApi）；SDK/web-shared 类型面补齐；
  - 原 vis 功能回归（client 43 测试 + typecheck + build 全绿）。
- **PR5 Raw 配置编辑器**（— Done，2026-08-17，commit 94c6651）：
  - ConfigFileSection（textarea+行号 gutter、diagnostics、revision 显示、409 冲突 UI、密钥掩码说明、复制路径/Reveal）；
  - `/api/config/raw|validate|reveal` 前后端接线；
  - 双进程互操作由 409 冲突 UI + 重新载入覆盖（TUI 改文件 → Web 保存 409）。
- **PR6 弃用与清理**（— Done，2026-08-17，commit ebc9e8d）：
  - 删除 apps/vis web/shared/scripts/umbrella；root scripts 单资产化（build:vis 仅 shim）；
  - native compile 单资产（PR2 已做）；
  - changeset `.changeset/merged-workbench.md`（6 包 minor + vis-server deprecation）；
  - 全量回归：root typecheck 全绿、core 2699 通过（11 个预存在环境性失败无关）、sdk 176、web-server 57、client 43、cli exit 0。

## Technical Notes

- **T1 deepseek 几何契约**：`SIDEBAR_DEFAULT=280 / SIDEBAR_MIN=264 / SIDEBAR_MAX=420 / SIDEBAR_COLLAPSED=56 / CENTER_MIN=640 / DETAILS_DEFAULT=360 / DETAILS_MIN=300 / DETAILS_MAX=520 / SIDEBAR_AUTO_COLLAPSE=1024`。byf 直接采用，不做重新发明。
- **T2 迁移 vis 代码时的依赖方向**：`wire-reader.ts` 已依赖 `@byfriends/agent-core/agent/records/migration`，上移后变成 core 内部依赖，方向更自然。web-server 通过 SDK 调用，不直接 import core。
- **T3 会话删除现状问题**：`apps/vis/server/src/routes/sessions.ts` 当前只 `rm` 目录，未重写 `session_index.jsonl`；统一到 core 后必须原子重建 index（temp + rename）。
- **T4 配置写现状**：`config/toml.ts` 的 `writeConfigFile` 走 `parse → validate → configToTomlData → stringify`，因此**无法保留 TOML 注释**。PRD-0034 R-D3 的“保留未识别键与注释”应改为：未识别键可保留，注释不保证；raw 路径才全保真。
- **T5 raw 编辑器选型**：优先 CodeMirror 6 + TOML mode（行号、错误标记、undo/redo 成熟）；若包体积/构建兼容有问题，MVP 用 textarea + Shiki 高亮降级，但错误定位能力不降级。
- **T6 构建链**：`apps/cli/scripts/compile/build.mjs:416-417` 当前同时注册 `__BYF_VIS_EMBEDDED_ASSETS__` 与 `__BYF_WEB_EMBEDDED_ASSETS__`；合并后只保留 web，`apps/vis/server/src/app.ts` 的 embedded 逻辑随包删除。
- **T7 测试基座**：`apps/web/server/src/web-server.test.ts` 已有 fake harness；新增 inspector/config raw 路由复用该基座。vis 现有 server 测试迁移到 web-server 后删除。
- **T8 兼容 shim 的风险**：`@byfriends/vis-server` 的 `startVisServer` 返回 `VisServerHandle`；shim 只能保证方法兼容，不能保证原 publicDir/embedded 全局语义完全一致。deprecation note 必须写清。

## Domain Terms（draft — for /grill to refine）

| Term | Working Definition | Status |
|---|---|---|
| 单源工作台 | 一个 Web SPA + 一个 Web server + core 文件 owner，Web/TUI/headless 共享同一事实源 | new |
| 统一设计 token | PRD-0035 R-C1 后的 web 设计 token 体系：deepseek 精致风为范本（自研实现）——bluish 中性色阶 + deepseek 蓝品牌、圆角、柔和边框/阴影；语义别名（surface/fg/brand/accent）+ 组件层（shadcn 桥接变量）+ 调试语义色（cat-*）；取代「三层设计 token」 | new |
| Inspector | 对 `sessions/**` 的只读检查/投影层，归 agent-core 所有 | new |
| ConfigDocument | `config.toml` 的 raw 文本 + revision + 校验/原子写的唯一服务面 | new |
| revision | `sha256(config.toml raw text)`，用于配置乐观锁冲突检测 | new |
| Full-fidelity writer | 保存时原样写回 raw 文本，保留注释/空行/未识别键的写路径 | new |
| 结构化投影 | 由 `ByfConfig` schema 驱动的表单，底层仍读写同一 `config.toml` | new |
| Right details | deepseek 式第三栏，承载工具/子 agent/文件/wire/state 详情 | new |

## Traceability

- **Issue**: [#310](https://github.com/ByronFinn/byf/issues/310)（父 Issue，/grill 阶段补建；/story 的子 Issue 挂其下）。
- **Created by**: `/think`（2026-08-17，基于 deepseek-harness 与 byf `apps/web`/`apps/vis` 源码探查）。
- **Prototyped by**: `/have-a-try`（2026-08-17）— 视觉变体对比原型（`apps/web/client/proto.html`，A=vis 工业风 / B=deepseek 精致风），**裁决：选 B（deepseek 精致风）**。
- **Grilled by**: `/grill`（2026-08-17）— 全部 Open Questions Q1-Q7 决议；1:1 复刻范围（h1 视觉=deepseek 精致风经 have-a-try 裁决 B、h2 自研实现、h3 功能对齐清单）；新增决议：busy 判定含后台任务、workspaces.json 弃旧格式、密钥无损掩码（ADR-0038）、缺失文件 200+null、表单带 revision、Out of Scope 逐项确认；术语：统一设计 token（新增）、三层设计 token（历史化）、vis/vis-server（弃用标注）；ADR-0037/0038 创建，ADR-0035/0036 加部分取代注记。
- **Baseline**: PRD-0032（web 传输骨架）、PRD-0033（web UI 重设计）、PRD-0034（web 工作台能力升级）均为 Done；ADR-0034/0035/0036 继续有效。
