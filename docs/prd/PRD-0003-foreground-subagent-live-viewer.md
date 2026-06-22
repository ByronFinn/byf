# [DONE] PRD-0003: 前台 Sub-agent 实时查看器

**Status**: Sliced
**Created**: 2026-06-18
**Author**: BYF
**Related**: ADR 0006（monorepo 分层）

## Problem

前台 sub-agent 运行时，用户无法查看其完整的实时活动。当前 `ToolCallComponent` 的 single-subagent view（`apps/cli/src/tui/components/messages/tool-call.ts`）只渲染一张极紧凑的卡片：

- 头部：`● Code Agent Running (描述) · 3 tools · 12s`
- 正文（最多 4 行子工具活动 + 最后一行 thinking + 最后一行 output）

完整的工具调用序列、完整思考、完整输出都无法查看。

**关键事实**：子 agent 事件**已经通过 `routeSubagentEvent()`**（`apps/cli/src/tui/events/subagent-event-handler.ts:104-170`）路由到了父 `ToolCallComponent`，存为 `subToolActivities` / `subagentText` / `subagentThinkingText` / `subagentUsage` 等字段。**事件数据已在父侧就绪，缺的是"完整渲染 + 可钻取查看"的展示层，不需要改造 agent-core 的事件模型。**

## Goal

通过 `/agent` 斜杠命令打开一个**全屏实时查看器**，完整展示前台 sub-agent 的实时活动：完整工具调用序列、完整输出、完整思考流（默认折叠）。复用本仓已验证的 `/tasks` → 全屏 takeover 范式。

> **命令名选择 `/agent`（单数）**：与 Codex 的 `/agent` 同名且语义完全对齐——Codex 的 `/agent` 正是单 session 内 sub-agent threads（inspect/switch active agent）。Claude Code 的 `/agents`（复数）语义是跨 session 独立 sessions，场景不同，故不沿用复数。

## Not Building (Out of Scope)

- **输入栏下方常驻面板**（Claude Code agent view 风格的树形常驻面板）。与本仓紧凑的固定垂直栈布局冲突，改动面最大。见"方案对比"。
- **transcript 内逐卡片按键钻取**。本仓 transcript 无焦点模型（焦点恒在编辑器），无法定位"当前卡片"。走不通。
- **上下文快捷键**（如空编辑器时 Ctrl+某键直开）。v2 演进项，MVP 先行 `/agents`。成本评估见"决策依据"。
- **查看器内控制 sub-agent**（停止 / 暂停）。本期只读观察。
- **后台 agent 的查看**。后台 agent 已由 `/tasks` 覆盖（走 `listBackgroundTasks()`，数据源不同）。`/agents` 只管前台 sub-agent。

## What I Already Know (ground truth from code)

### 数据源已就绪：事件已路由到父侧

- `routeSubagentEvent()`（`subagent-event-handler.ts:104-170`）把 `assistant.delta` / `thinking.delta` / `tool.call.started` / `tool.call.delta` / `tool.result` / `agent.status.updated` / `hook.result` 全部路由进父 `ToolCallComponent`。
- 父组件持有：`ongoingSubCalls` / `finishedSubCalls` / `subToolActivities`（带 `orderSeq` 的完整序列）/ `subagentText` / `subagentThinkingText` / `subagentUsage` / `subagentPhase` / `subagentStartedAtMs` / `subagentError` / `subagentResultSummary`。

### 变更通知钩子已就绪

- `ToolCallComponent.setSnapshotListener(cb)` + `onSnapshotChange()`（`tool-call.ts:583-663`）。`AgentGroupComponent` 已用此模式订阅子 agent 状态。live viewer 可用同一模式订阅实时更新。

### 全屏容器替换机制已就绪

- `showFullscreen(component)` / `closeFullscreen(savedChildren)`（`byf-tui.ts:3263-3278`）：保存 `ui.children` → 清空 → 挂单个组件 → setFocus → Esc 还原。当前接在 `TasksBrowserEnv` 上。

### 全屏可滚动查看器模板已就绪

- `TaskOutputViewer`（`apps/cli/src/tui/components/dialogs/task-output-viewer.ts`）：全屏 header/body/footer、j/k/PgUp/g/G 滚动、`setProps` 已带"贴底跟随"逻辑（`task-output-viewer.ts:97-107`）。骨架可复用，需从"一次性快照"改成"订阅实时流"。

### 触发范式已验证

- `/tasks` → `tasksBrowserController.show()`（`byf-tui.ts:1364`）是本仓"斜杠命令打开全屏查看器"的成熟模板。`/agents` 照搬结构。
- 斜杠命令注册：`apps/cli/src/tui/commands/registry.ts`（`BUILTIN_SLASH_COMMANDS` 数组 + `findBuiltInSlashCommand`）。
- 命令分发：`handleBuiltInSlashCommand`（`byf-tui.ts:1338`）的 switch。

### 快捷键分发点已存在（修正评估）

- `CustomEditor.handleInput`（`custom-editor.ts:194-278`）已是成熟的 app 级 Ctrl 快捷键分发点，已有 `onToggleToolExpand`（Ctrl+O）、`onCtrlS`、`onUndo`、`onOpenExternalEditor`（Ctrl+G）。v2 补上下文快捷键的成本**低于初始评估**（只需在既有分发点加一个 `matchesKey` + 回调，与 Ctrl+O 同构）。

### 数据源差异（关键约束）

- `tasksBrowser` 列的是 `listBackgroundTasks()`。前台 sub-agent **不在 background tasks 里**，存在于 `pendingToolComponents` 中 `name==='Agent'` 的 `ToolCallComponent`。live viewer 的数据源是 `pendingToolComponents`，不能直接复用 tasks browser 的数据层。

## Requirements

### R1 触发入口

- 新增斜杠命令 `/agent`，注册到 `BUILTIN_SLASH_COMMANDS`，进入 `/help` 补全。
- `/agent` 打开全屏 sub-agent 列表层（始终先列表，见决策 D1）。

### R2 列表层

- 列出当前所有前台 sub-agent。**数据源（双源，见 G1 修订）**：
  - 运行中：`pendingToolComponents` 中 `name==='Agent'` 的项。
  - 已完成：遍历 `transcriptContainer` 收集所有带 subagent 状态的 `ToolCallComponent`（含被 `AgentGroupComponent` 包裹的，经其新增的 `getSubagentEntries()` 只读 getter 定位）。
- 每行显示：agent 名称 / 描述 / phase（running 青色、done 绿色、failed 红色）/ tool 计数 / token / 耗时。
- `Enter` 进入选中项的 live viewer；`Q/Esc` 返回主 transcript。
- **空列表边界（G7）**：无任何前台 sub-agent 时，显示 "No foreground sub-agents" + 指引 "Use /tasks for background agents"，`Q/Esc` 返回。

### R3 Live Viewer（实时）

- 全屏，基于 `TaskOutputViewer` 骨架。
- 内容：完整子工具调用序列（`subToolActivities`，按 `orderSeq`）+ 每个工具的关键参数与输出 + 子 agent 的 text 输出。
- 实时更新：通过 `setSnapshotListener` 订阅；有新内容且用户贴底时自动跟随（复用 `TaskOutputViewer` 的贴底逻辑）。
- 键位：与 `TaskOutputViewer` 一致（j/k/PgUp/PgDn/g/G），`t` 切换思考流可见性（D2），`Q/Esc` 返回列表层。

### R4 思考流处理

- 子 agent 思考流（`subagentThinkingText`）默认折叠，按 `t` 切换可见（D2）。

### R5 完成后只读保留

- 前台 sub-agent 结束后，查看器不自动关闭，降级为只读历史（D3）。重新打开 `/agents` 时刷新列表。

### R6 发现性 hint

- 在 `buildSingleSubagentHeader`（`tool-call.ts:1176`）加 hint `· /agent to inspect`，让用户知道有查看器。

## Acceptance Criteria

- AC1：输入 `/agent` 回车，打开全屏 sub-agent 列表层。
- AC2：列表层正确显示所有前台 sub-agent 的名称/描述/phase/工具数/token/耗时；运行中项实时刷新（phase、tool 计数、token、耗时）。
- AC3：`Enter` 进入选中 sub-agent 的 live viewer，看到完整的子工具调用序列（全部，非截断的 4 行）+ 各工具参数与输出。
- AC4：live viewer 打开期间，新的工具调用、输出、token 增量实时追加显示（用户贴底时自动跟随）。
- AC5：按 `t` 能切换思考流可见性，默认隐藏。
- AC6：sub-agent 结束后，viewer 仍可查看其完整 transcript（只读），phase 变 done/failed。
- AC7：`Q/Esc` 正确返回（列表层 → 主 transcript）。
- AC8：运行中的 sub-agent 卡片头部出现 `/agent to inspect` hint。
- AC10：无任何前台 sub-agent 时，`/agent` 列表层显示空状态提示并指引 `/tasks`（G7）。
- AC9：同时存在多个前台 sub-agent 时，列表层可上下选择，逐个钻取。

## Definition of Done

- 所有 AC 通过。
- 新增/修改的代码有对应测试（优先加到既有测试文件）。
- 通过 `gen-changesets` 生成 changeset（`apps/cli` 的 minor，除非用户另定）。
- PR 标题遵循 Conventional Commit；PR 按 `.github/pull_request_template.md` 填写。

## Technical Approach

### 选定方案：B. 实时聚焦查看器（全屏容器替换）

复用 `showFullscreen`/`closeFullscreen` 全屏容器替换 + `TaskOutputViewer` 骨架 + `setSnapshotListener` 实时订阅。详见"决策依据"。

### 触发方式：斜杠命令 `/agent`

（见 D-触发）

### 对接抽象：`FullscreenHost`（G2 修订）

- `SubagentsController` 通过 `FullscreenHost` 接口（`apps/cli/src/tui/types.ts:33`，即 `TasksBrowserController` 用的 `TasksBrowserEnv.host`）对接，不直接戳 `byf-tui` 内部——符合 ADR 0016"ByfTui remains sole state owner"，controller 经 env 注入访问器。

### 新增组件

1. `SubagentsController`（仿 `TasksBrowserController`）：管理列表层 + viewer 层的生命周期、全屏 takeover、轮询/订阅刷新。
2. `SubagentsListApp`（仿 `TasksBrowserApp`）：全屏列表组件。
3. `SubagentLiveViewer`（基于 `TaskOutputViewer` 骨架，对齐 `approval-fullscreen-viewer` 先例的 G3 要点）：全屏可滚动实时 viewer。
   - props 在打开时预计算首次快照（对齐 FileViewerComponent 的 props 预计算模式），后续靠订阅增量刷新。
   - `onClose` 回调恢复焦点（对齐 approval viewer 的 `onClose` → `setFocus` 模式）。
   - footer 复用 `TaskOutputViewer` 的位置指示 + 键位 hint 样式，追加 `t thinking` 提示。
   - 不读快照字符串，而是订阅 `ToolCallComponent.setSnapshotListener`，把 `subToolActivities` / `subagentText` / `subagentThinkingText` 渲染成完整 transcript。
   - 内部维护 `showThinking: boolean`（默认 false，`t` 切换）。

### 接线点（`byf-tui.ts`）

- `BUILTIN_SLASH_COMMANDS` 注册 `agent` 命令。
- `handleBuiltInSlashCommand` 加 `case 'agent'` → `this.subagentsController.show()`。
- 新增 `subagentsController` 实例（仿 `tasksBrowserController`），其 env 注入 `FullscreenHost` + 两个访问器：
  - `collectActiveSubagents()`:从 `pendingToolComponents` 取运行中 Agent 项。
  - `collectCompletedSubagents()`:遍历 `transcriptContainer` 收集已完成 Agent 项（经 `AgentGroupComponent.getSubagentEntries()` 定位 group 内组件，见 G5）。
- `AgentGroupComponent` 新增 `getSubagentEntries(): readonly { toolCallId: string; tc: ToolCallComponent }[]` 只读 getter（G5）。
- `buildSingleSubagentHeader` 加 hint。

### 数据流（G1 修订：双源）

```
运行中: pendingToolComponents(name==='Agent')
         └─ ToolCallComponent ─ setSnapshotListener(cb) ─┐
已完成:   transcriptContainer ─┐                         │
           ├─ solo ToolCallComponent ────────────────────┼─ SubagentLiveViewer 订阅
           └─ AgentGroupComponent.getSubagentEntries()   │     cb() → 重渲染(贴底跟随)
                └─ entry.tc ─ setSnapshotListener(cb) ───┘
注:已完成组件 setResult 后仍保留完整 subagent 字段(progressLines 被清,但
   subToolActivities/subagentText/subagentThinkingText/subagentUsage 不清),
   故只读历史数据完整。
```

### 小步拆分（implementation plan）

- **Step 1**：注册 `/agent` 命令 + `SubagentsController` 空壳 + `show()` 接 `FullscreenHost`，打开一个占位全屏。验证全屏 takeover 链路通。
- **Step 2**：`SubagentsListApp` 列表渲染，数据双源（`collectActiveSubagents` + `collectCompletedSubagents`）；`AgentGroupComponent.getSubagentEntries()` getter（G5）；上下选择 + Enter + 空列表态（G7）。
- **Step 3**：`SubagentLiveViewer`，基于 `TaskOutputViewer` 骨架（对齐 approval viewer 先例 G3），渲染完整 `subToolActivities` + text；订阅 `setSnapshotListener` 实时刷新 + 贴底跟随。
- **Step 4**：思考流 `t` 切换 + 完成后只读保留（D2/D3）。
- **Step 5**：头部 hint + 完成态降级 + 列表层完成态刷新。
- **Step 6**：测试 + changeset。

## Decision (ADR-lite)

### D-触发：斜杠命令 `/agent`（vs 上下文快捷键 / 卡片按键 / 命令名复数）

- **决策**：`/agent` 斜杠命令（单数）。
- **理由**：① 完全复用 `/tasks` 验证过的全屏 takeover + controller 范式，零新机制；② 命名与 **Codex `/agent`** 完全同名且语义对齐——Codex 的 `/agent` 正是单 session 内 sub-agent threads（inspect/switch active agent），与本仓场景一致；③ 数据源（`pendingToolComponents` + transcript 双源）就绪；④ 发现性靠命令补全 + 卡片 hint 补救。
- **否决**：上下文快捷键（v2 补——成本低于初始评估，见 "What I Already Know"）；卡片按键（transcript 无焦点模型，走不通）；`/agents` 复数（Claude Code 的 `/agents` agent view 列的是跨 session 独立 sessions，文档明说 "Subagents aren't listed as separate rows"，语义不对应）；`/subagent`（更长且偏离业界习惯）。

### D-方案：全屏容器替换（B）

- **决策**：方案 B（实时聚焦查看器）。
- **理由**：
  - **A 内联展开不成立**：① Ctrl+O 是全局开关（`toggleToolOutputExpansion` 遍历所有 `isExpandable` 子节点，`byf-tui.ts:3126-3134`），会同时展开所有卡片；② `setExpanded` 当前只影响 Write/Edit 的 args 预览，`buildSingleSubagentBlock` 完全不读 `this.expanded`，仍需新写渲染；③ 致命伤——subagent transcript 可达数百行，塞进固定垂直栈会顶掉编辑区，且 transcript 内无区域级滚动，展开后无法滚动查看。
  - **B 零新基础设施**：`showFullscreen`/`closeFullscreen` 已存在；`TaskOutputViewer` 可作骨架；实时数据 + 通知钩子已就绪。
  - **C 常驻面板最重**：布局是手动组合的固定垂直栈，常驻面板需永久抢占竖向空间（与紧凑 CLI 定位冲突），改动面最大。

### D1：首屏——始终先列表

- **决策**：`/agent` 始终先显示列表（运行中高亮 + 已完成历史），再 `Enter` 进入。
- **理由**：用户在 D1 中明确选择；更统一，且完成后的只读历史浏览（D3）也依赖列表存在。前台 sub-agent 虽通常唯一，但列表层为完成态浏览和多 agent 场景提供一致性。

### D2：思考流——默认折叠，t 切换

- **决策**：live viewer 内默认只渲染工具调用序列 + 输出摘要；完整 `subagentThinkingText` 默认折叠，`t` 切换可见。
- **理由**：思考流可能很长且含中间推理，默认展开易刷屏；`t` 切换给需要完整推理的用户。

### D3：完成后只读保留

- **决策**：子 agent 完成后查看器仍可打开查看其完整 transcript（只读历史），不自动关闭。
- **理由**：用户在 D3 中明确选择；简单够用，符合"观察 + 事后回看"诉求。

## Domain Terms

> 已与 `CONTEXT.md` 对齐检查（见 G4）：CONTEXT.md 已有 "Sub-agent Activity Trace"（用户可见的 sub-agent 活动记录）。本 PRD 的 `live viewer` 是该 Trace 的**全屏实时展示载体**，不冲突。新增 `live viewer` 与 `前台 sub-agent` 两个术语会同步进 CONTEXT.md。

- **前台 sub-agent (foreground sub-agent)**：通过 Agent 工具调用派生、阻塞父 agent 的子 agent。事件经 `routeSubagentEvent` 路由到父 `ToolCallComponent`。运行中存于 `pendingToolComponents`，完成后该组件仍存活于 `transcriptContainer`（solo 或 `AgentGroupComponent` 内）。与走 `listBackgroundTasks()` 的后台 agent（已由 `/tasks` 覆盖）区分。
- **live viewer**：全屏、可滚动、实时订阅子 agent 活动的查看器，数据来自父 `ToolCallComponent` 的实时状态（非一次性快照）。是 `Sub-agent Activity Trace`（见 CONTEXT.md）的展示载体。
- **列表层 (list layer)**：`/agent` 的首屏，列出所有前台 sub-agent（运行中 + 已完成），`Enter` 钻取进入 live viewer。

## Open Questions

（暂无阻塞项。v2 待定：上下文快捷键的具体键位与触发条件。）

## Grill 修订记录

| #   | 项                                                                                                                                 | 性质     | 解决方案                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | R5 数据源矛盾：完成后 `pendingToolComponents` 已删除（`byf-tui.ts:2713`），PRD 却说"从 pendingToolComponents 取"且"完成后只读保留" | 代码证伪 | 改双源：运行中取 `pendingToolComponents`；已完成遍历 `transcriptContainer`（含 group 内）。已完成组件 `setResult` 后仅清 `progressLines`，subagent 字段完整保留。 |
| G2  | `SubagentsController` 对接抽象未指明                                                                                               | 代码补全 | 明确用 `FullscreenHost`（`types.ts:33`），与 `TasksBrowserController` 同构，符合 ADR 0016。                                                                       |
| G3  | 全屏 viewer 应对齐 `approval-fullscreen-viewer`（已 Done 先例）                                                                    | 代码补全 | props 预计算、`onClose` 焦点恢复、footer 样式三项对齐。                                                                                                           |
| G4  | 术语与 CONTEXT.md "Sub-agent Activity Trace" 关系未定义                                                                            | 术语检查 | live viewer 定位为该 Trace 的展示载体；新增 2 词进 CONTEXT.md。                                                                                                   |
| G5  | group 形态下定位目标组件：`AgentGroupComponent.entries` 是 private                                                                 | 设计缺口 | 新增 `getSubagentEntries()` 只读 getter。                                                                                                                         |
| G6  | 命令名                                                                                                                             | 用户决策 | `/agent`（单数，对齐 Codex）。                                                                                                                                    |
| G7  | 空列表边界                                                                                                                         | 边界     | 显示空状态提示 + `/tasks` 指引（AC10）。                                                                                                                          |

## Child Issues

| Issue | Title                                                                        | Type | Status            |
| ----- | ---------------------------------------------------------------------------- | ---- | ----------------- |
| #147  | `/agent` 命令骨架打通 — 命令注册 + 全屏 takeover + 空列表态                  | AFK  | **Done (v0.3.0)** |
| #148  | 前台 sub-agent 列表层 — 双源收集 + group getter + 选择交互 (blocked by #147) | AFK  | **Done (v0.3.0)** |
| #150  | 实时 live viewer 钻取 — 全屏可滚动 + 订阅实时流 + 贴底跟随 (blocked by #148) | HITL | **Done (v0.3.0)** |
| #151  | 打磨与测试 — thinking 切换 + 卡片 hint + 完成态刷新 + 单测 (blocked by #150) | AFK  | **Done (v0.3.0)** |

依赖链：#147 → #148 → #150 → #151。每片为端到端可演示的 vertical slice。全部已随 v0.3.0 发布完成。

## Traceability

**Grilled by**: grill skill, 2026-06-18。所有 Open Questions 已解决，术语与 CONTEXT.md 对齐，scope 边界确认，代码交叉核对完成（G1/G5 经 `byf-tui.ts`/`tool-call.ts`/`agent-group.ts` 代码证伪并修订）。

**Sliced into**: #147, #148, #150, #151（story skill, 2026-06-18）。

- **Debugged by**: `/debug` (2026-06-18) — Fixed frame misalignment in `SubagentsListApp`/`SubagentLiveViewer` by replacing local ANSI-counting `visibleWidth` with `@earendil-works/pi-tui`'s ANSI-aware helper and padding header/body to full terminal width.
- **Debugged by**: `/debug` (2026-06-18) — Fixed `/agent` browser freeze/unresponsiveness by adding missing `FullscreenHost.requestRender()` calls in `SubagentsController` after list polling updates and live-viewer snapshot updates.
- **Debugged by**: `/debug` (2026-06-18) — Fixed list-layer detail/preview staleness on arrow-key selection by adding `onSelectionChange` callback to `SubagentsListApp` and wiring `SubagentsController.pushListProps` to refresh immediately; fixed detail-pane tool-status miscounts by encoding ongoing tools as `… Name` in `selectedDetail.toolList`; added real-time activity stream to Output preview via `SubagentPreviewPane.activityLines`.
- **Reviewed by**: `/review` (2026-06-18) — Fixed `ToolCallComponent` snapshot-listener single-slot collision by adding `addSnapshotListener()` (multi-cast) while keeping `setSnapshotListener()` for backward compatibility; updated `AgentGroupComponent`/`ReadGroupComponent`/`SubagentsController` to unsubscribe individually. Filtered `backgrounded` agents out of `/agent` list (they belong to `/tasks`). Removed unused `prev` variable and corrected `renderBody` return type in `SubagentLiveViewer`.
- **Debugged by**: `/debug` (2026-06-18) — Fixed streaming freeze + garbled output ("one character per line", layout collapse) when a foreground sub-agent streams `assistant.delta`/`tool.call.delta`. Root cause: `SubagentLiveViewer`'s snapshot subscription had no throttle, so every token triggered a full-trail `renderLines` + `requestRender`, overwhelming the terminal diff renderer. Fix: (1) coalesce snapshot callbacks into one render every 80ms in `SubagentsController` (mirrors `AgentGroupComponent.THROTTLE_MS`), cancelling the pending timer on viewer close; (2) extract `sanitizeForDisplay` to strip raw C0 control chars (`\r`/`\b`/`\x07`/vt/ff) from streamed text/output/error before rendering; (3) soft-wrap long body lines via `wrapTextWithAnsi` instead of hard-truncating. Regression tests: coalescing 100 deltas → 1 render, control-char stripping, soft-wrap preserves full content.
