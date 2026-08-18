# 0037 - 单源工作台：apps/web 吸收 apps/vis，core 拥有 Inspector 与文件 owner

Date: 2026-08-17

## Status

Accepted

## Context

PRD-0033/0034 之后 `apps/web` 已是产品级聊天工作台（SSE 驱动 live agent、会话组织、provider/models 管理），但 `apps/vis` 仍是独立的只读调试工具：**两个 server 骨架**（`startWebServer` vs `startVisServer`，CLI 侧 `web.ts`/`vis.ts` 各一份启动胶水）、**两条会话读取链路**（web 走 `ByfHarness.listSessions`；vis 直接扫 `~/.byf/sessions/**`、自己读 `state.json`/wire）、**两套视觉体系**（web 的 OKLCH emerald shadcn 预设 vs vis 的 surface/fg/cat 工业风）、`resolveByfHome` 重复实现、`workspaces.json` owner 不清、vis 删除会话不重建 `session_index.jsonl`（数据残留）。

用户要求合并后 Web 工作台**1:1 复刻 deepseek-harness 的页面结构与功能**，且 `config.toml` 要能全量直接编辑（不止表单选择）。

## Decision

- **D1 单工作台**：`apps/web` 为唯一 Web 工作台；`apps/vis` 全部能力吸收为 Inspector 模块；`byf vis` 与 `@byfriends/vis-server` 保留一个版本兼容 shim 后弃用。`byf web` / `byf vis` / TUI `/web` 最终落到同一个 `startWebServer`，不存在第二个 HTTP server 代码路径。
- **D2 core 拥有 Inspector**：vis 的只读会话发现/健康检查/inventory、wire 读取、context 投影、agent 树全部上移 `packages/agent-core/src/session/inspector/`；web-server 只经 `@byfriends/sdk` 调用，维持 ADR 0006 的 host 分层约束。
- **D3 文件 owner 单一化**：`workspaces.json` 上移 core 的 `WorkspaceRegistry`（Web 与未来 TUI 共用；丢弃历史 string[] 格式兼容）；`tui.toml` 继续 TUI 独有；Web 外观/列宽/搜索状态存 `localStorage`。
- **D4 会话删除进 core**：新增 `SessionStore.deleteSession`（删除目录 + 原子重建 index）；live Session 实例或运行中后台任务存在时拒绝（409）；会话内 cron 随目录删除。
- **D5 页面与功能对齐 deepseek，自研实现**：页面结构/交互近 1:1 对齐 deepseek-harness 三栏工作台（Trajectory 视图、右侧 Details 栏、Settings 左侧导航、Composer 细节、GoalBar/后台任务/消息反馈/命令 popup 等周边组件）；技术栈保持 React 19 + Tailwind v4 + shadcn/Radix + 既有状态机与 SSE reducer，**不搬** deepseek 的 Cordis/slots/CSS Modules 架构。不兼容项（Agent Presets 引擎、Plugin Inventory、Plan mode〔ADR 0008 已移除〕、workflow）不抄。
- **D6 视觉单一源 = deepseek 精致风（已裁决）**：视觉 token 完全来自单一源，**采用 deepseek-harness 的精致风格**（bluish 中性色阶 + deepseek 蓝品牌、圆角 8-12px、柔和 rgba 边框、分层阴影、留白密度），由 `/have-a-try` 原型（`apps/web/client/proto.html`，A=vis 工业风 vs B=deepseek 精致风）于 2026-08-17 裁决选 B。emerald 品牌色移除（不再作为品牌点缀）。实现为 byf 自研 token 体系（语义命名 + shadcn 桥接），不照搬 CSS Modules；`cat-*` 事件类别色保留为 Inspector 调试视图的语义色（token 集扩展，不作主品牌）。

## Consequences

### Positive

- 消除两套 server、两套主题、两条会话读取路径；后续 Web 功能只做一次。
- Web/TUI/headless 对 `config.toml` 与 sessions 的认知完全一致（文件是真相、server 是网关、前端是投影）。
- Inspector 上移后 wire 读取成为 core 内部依赖，vis 的「第三条数据路径」消失，web 复用同一投影。
- `byf vis` 弃用期默认端口 3001 不变，已发布包与用户习惯不突然断裂。

### Negative

- 一次性迁移面大：批量样式替换、vis 页面迁入 web-client、CLI/构建链改造（native compile 从双资产改单资产）。
- `@byfriends/vis-server` 是已发布包，删除需要 deprecation 计划与 changelog（shim 只能保证方法兼容，无法保证历史 publicDir/embedded 全局语义完全一致）。
- 1:1 复刻 deepseek 功能面（Trajectory、Details、Settings 导航、Composer 细节、周边组件）显著扩大本次实现范围，需按 PR1-PR6 拆分控制。
- 移除 emerald 是视觉回归项：需逐组件目检深浅主题 AA 对比。

## Alternatives Considered

- **保留两个包、只抽共享 core/theme**：改动小，但两套 server/入口长期并存，风格与数据路径仍分叉，不满足目标。
- **新建第三个 `apps/workbench`，web/vis 都迁过去**：多一次重命名/发布/迁移，ROI 低。
- **照搬 deepseek 架构（Cordis + slots + CSS Modules）**：视觉精准但推翻 ADR 0035 的 shadcn 路线，投入重、维护贵，被否决。
- **保留 emerald 品牌色桥接**：被用户否决——要求完全移除品牌绿，强调色由事件类别色承担。

## References

- PRD-0035（`docs/prd/PRD-0035-web-vis-merge.md`）
- ADR 0006（monorepo 分层）、ADR 0034/0035/0036（web 传输骨架/UI 重设计/LAN 与密钥模型）
- deepseek-harness `packages/client/ui-layout/src/client/AppFrame.tsx`、`columns.ts`（布局几何契约）
- 视觉对比原型 `apps/web/client/proto.html`（have-a-try，2026-08-17）
