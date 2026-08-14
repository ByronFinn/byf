# PRD-0033: byf Web 客户端 UI 重设计（`apps/web/client`）

> **Status**: In Progress | **PRD**: PRD-0033 | **Created**: 2026-08-14 | **Last updated**: 2026-08-14

## Goal

将 `apps/web/client` 从"裸 HTML + 硬编码样式"重构为**基于 shadcn/ui + 三层设计 token 的产品级 agent 聊天客户端**：架构用 shadcn 生态（Radix + lucide 图标 + Shiki 高亮，保留现有 Tailwind v4），视觉语言 / 布局 / 交互精致度对标 deepseek-harness，支持深浅双主题 + system 三态。本 PRD 架设在 **PRD-0032** 已建好的传输骨架（SSE、反向 RPC、三包拆分、`byf web` 子命令）之上，**只重写渲染 / 组件层**，不动 server、不动 SSE / 反向 RPC 契约、不动状态机逻辑。

## What I already know

### 改造对象：`apps/web/client` 现状

- 16 文件 ~1733 行。React 19 + Vite 6 + Tailwind v4（CSS-first，无 config）+ @tanstack/react-query + react-markdown 9 + remark-gfm。
- **保留的资产**：`lib/chat.ts` 状态机扎实（增量合并 delta、`turnIndex`/`toolIndex` Map 做 O(1) 定位、显式忽略无关事件）；`hooks/useEventStream.ts` SSE 订阅（8 种 frame 各 `addEventListener`，`onFrame` 经 ref 透传）；wire DTO（`@byfriends/web-shared`）与 server 契约不变。
- **视觉短板（"丑"的根因）**：
  - `theme.css` 仅 100 行，颜色全硬编码 hex（`#0b0d10`/`#e6e8eb`/`#11151a`/`#0e1216`/`#2a2f36`），散落 6 个组件文件，**无 CSS 变量 token**。
  - 写死 `color-scheme: dark`，背景 `#0b0d10` 与卡片 `#11151a` 肉眼几乎分不出，**无 elevation 层次**；grep `shadow-` = 0。
  - **无代码语法高亮**（代码块纯白字 + 黑底）。
  - **无图标库**（全裸文字，状态靠色点 + emoji `✦`）。
  - **聊天页无会话侧边栏**，切换会话须回首页。
  - **滚动粗糙**：`Transcript.tsx:8-12` 每帧 `scrollIntoView`，用户上滑看历史会被流式更新拽回底部。
  - 7 种圆角混用（`rounded-sm`~`rounded-2xl`），原生 select / radio / checkbox 未美化。

### 参考 1：deepseek-harness（视觉 / 交互精致度对标）

- 三层 token：原始色 `--dsw-static-*` → 语义别名 `--dsw-alias-*` → 组件专用 `--dsw-specific-*`。
- 三栏 `sidebar | conversation | details`，可拖拽列宽 + 窄屏自动折叠。
- light / dark / system + **防闪烁 boot 脚本**（`index.html` 注入，读偏好前置设 `data-ds-dark-theme`）。
- 字体栈中文友好；字号 token 多级；阴影 3 级；动效曲线 `cubic-bezier(0.4,0,0.2,1)` + 三档时长；`prefers-reduced-motion` 降级。
- **增量 Markdown 流式解析**（`incremental.ts`，冻结前段只重渲染尾部 2 block）。
- 精细滚动：bottom-follow + 用户上滑检测 + back-to-bottom + 滚动位置持久化 + prepend anchoring。
- 用 CSS Modules + 全自建（连图标手写 SVG）——**架构对 byf 太重，不照搬架构，只借视觉语言与交互**。

### 参考 2：kimi-code（shadcn 路线的工程实证）

- `apps/vscode/webview-ui` 用 shadcn（`style: radix-nova`, `baseColor: zinc`）+ radix-ui + base-ui + `@tabler/icons-react`，**证明 shadcn 能做出产品级 agent 客户端**。
- `apps/vis/web/src/theme.css` 是该 repo **设计 token 最成熟**的范本：Tailwind v4 `@theme` 注册语义 token（`--color-surface-*`/`--color-fg-*`）、按事件类别分色（`--color-cat-*`）、**深色为基线 + 浅色 AA 对比覆盖**、`useTheme` 三态切换（`<html data-theme>` + localStorage + 同步 `<meta theme-color>`）。
- 工程亮点：Step 时间轴（执行流可视化）、Markdown 文本富化（路径变可点链接 / 颜色字面量变色块）、容器查询 `@container` 适配窄宽。

### 构建与约束

- `apps/web/client` 已是 Vite 6 + Tailwind v4，重构包袱小。
- 新版 shadcn 原生支持 Tailwind v4（`components.json` CSS-first）。
- 发布链路（PRD-0032）：`web-client build → web-server build(--target bun + copy web/dist) → 原生编译二进制内嵌 SPA 资产`。本次只动 `web-client`，**不影响发布链路与 Bun 构建约束**。

## Research References

无 `/research` 产出的权威记录。三方调研由 explore agent 对源码 inline 完成结论见 `## Technical Notes`。Shiki / shadcn / Radix / lucide 均为业界权威且版本稳定，未触发 `/research` 留档需求。

## Open Questions

无（`/grill` 已全部决议，详见 ADR 0035）。决议摘要：组件路线=shadcn 混合；品牌色=保留 emerald 绿；主题=深浅双主题 + system 三态；视觉=A 骨架 + B 步骤时间轴；token 命名=@theme 语义化 `--color-*`；色彩空间=OKLCH；流式高亮=流式纯文本 + settle 后上色；AA=所有文字 token 达 WCAG AA；侧边栏虚拟化=MVP 不做；会话搜索=纳入 MVP（list endpoint 加 `?q=` 过滤，`SessionSummary` 已有 `title`/`lastPrompt`，仅改 `routes.ts`，不动 DTO/SSE/RPC）。

## Requirements

### 设计基础设施

- **R1** 三层设计 token（参考 deepseek，用 Tailwind v4 `@theme` + CSS 变量表达）：原始色（green 多级品牌色 + neutral 多级 + red/amber/sky/状态色）→ 语义别名（`bg-base/layer-1/2/3`、`label-primary/secondary/tertiary`、`border-l1~l4`、`interactive-hover/active`、`state-*`）→ 组件专用（`bubble`、`sidebar-fill`、`input-major`）。含字号 token（`text-xs..xl`）、阴影 3 级、动效曲线 + 三档时长、圆角派生（`--radius` → sm/md/lg/xl）。
- **R2** 深色为基线 + 浅色覆盖（参考 kimi vis/web，每 token 给浅色 AA 对比变体）。三态：light / dark / system，存 localStorage `byf.theme`，经 `<html class>` 切换。
- **R3** 防闪烁 boot 脚本：`index.html` 注入内联脚本，在 React 加载前读 `byf.theme` 前置设 `<html class>` + `color-scheme`，避免白屏闪烁（参考 deepseek `boot-theme.ts`）。

### 组件库与图标

- **R4** 引入 shadcn/ui（`components.json`，baseColor: zinc，Tailwind v4）。按需引入：button、card、dialog、dropdown-menu、select、tooltip、popover、tabs、scroll-area、separator、switch、checkbox、badge、sonner(toast)、command。`cn() = twMerge(clsx())`。
- **R5** 图标用 **lucide-react**（shadcn 默认生态，tree-shakeable），统一尺寸 token，替换现有 emoji / 色点主视觉。
- **R6** 代码语法高亮用 **Shiki**：boot 语法（typescript / json / shell）静态打入，其余 `@shikijs/langs` 按需懒加载；代码块带语言 banner + 复制按钮（参考 deepseek `CodeBlock`）。

### 布局

- **R7** 两栏布局（CSS Grid，参考 deepseek `AppFrame`）：左 **会话侧边栏**（列表 + 新建 + 后端搜索 `?q=`）+ 右 **主聊天区**（Header + StatusBar + Transcript + Composer）。窄屏经容器查询折叠侧边栏（参考 kimi）。

### 核心聊天组件（保留 reducer，重写渲染层）

- **R8** Transcript 智能滚动：bottom-follow（贴底时新内容跟随）+ 用户上滑检测（不强制拽回）+ back-to-bottom 浮按钮。
- **R9** 用户气泡：右对齐 + `--color-bubble` + 22px 圆角（参考 deepseek）；assistant 消息走 Markdown。
- **R10** Markdown：Shiki 高亮 + GFM；流式期间 `memo` + 暂关富化（参考 kimi），避免每帧重渲染。
- **R11** ToolCallView：状态灯（pending 脉冲 / success 绿 / error 红）+ 工具图标 + 可折叠 + 按工具类型分发渲染器（参考 kimi `ToolRenderers`）。
- **R12** Composer：shadcn textarea + 自动增高（mirror 层）+ 工具栏（模型 / 权限 / Send-Stop 切换）；ThinkingBlock 折叠 + 首末行摘要 + 图标（参考 deepseek `ReasoningRow`）。
- **R13** 空状态：hero 欢迎屏 + 示例（参考 deepseek hero / kimi WelcomeScreen），替换现有"一行小灰字"。

### 交互与收尾

- **R14** 加载 / 空状态骨架；原生控件（select / radio / checkbox）替换为 shadcn 对应组件。
- **R15** 逐组件深浅对比度验证（AA）：所有文字 token（`fg` / `fg-muted` 等）达 WCAG AA（正文 4.5:1 / 大字 3:1），装饰色不强制。
- **R16** assistant 步骤时间轴（A 骨架 + B 时间轴融合）：assistant 消息按 thinking / tool / text 组织成 step，左侧竖线 + 圆点（活跃项辉光），可视化 agent 执行流。整体骨架用 deepseek 式精致（base/surface 多级色差 + 多层阴影 elevation + 半透明边框）。
- **R17** 会话搜索（后端）：侧边栏搜索框 → `GET /api/sessions?q=<term>&workDir=...` → 在 `SessionSummary` 的 `title`/`lastPrompt` 字段做字符串过滤。仅改 `routes.ts`，不动 wire DTO / SSE / RPC。
- **R18** 主题切换 UI：顶部状态栏 light / dark / system **三按钮分段控件**（对应三态，非单 toggle）。

## Acceptance Criteria

- [ ] **AC1** 所有颜色 / 字号 / 阴影 / 圆角来自 token，`apps/web/client/src` 内 `bg-[#…]` 等硬编码 hex 清零（grep 验证）。
- [ ] **AC2** 浅色 / 深色 / system 三态可切换；切换无白屏闪烁（boot 脚本前置）；逐组件 AA 对比度达标。
- [ ] **AC3** 聊天页有常驻会话侧边栏，窄屏自动折叠（容器查询）。
- [ ] **AC4** 代码块有 Shiki 语法高亮（boot 语法静态 + 其余懒加载）。
- [ ] **AC5** 全站有统一图标（lucide），无 emoji / 裸色点作主视觉。
- [ ] **AC6** 流式输出时用户上滑看历史不被拽回底部；离开底部时显示 back-to-bottom 按钮。
- [ ] **AC7** reducer / SSE 事件契约 + approval / question 反向 RPC 行为不破（现有功能回归通过：发消息、流式渲染、工具卡片、审批/问答回传、cancel、permission 切换）。
- [ ] **AC8** 发布链路不破：`web-client build` 产物可被 `web-server` 正常内嵌，`byf web` 启动后浏览器打开正常。
- [ ] **AC9** CI 全绿：lint / fmt / sherif / typecheck / build。

## Definition of Done

- 上述 AC 全部满足。
- Lint / fmt（oxfmt）/ typecheck / build 全绿。
- 视觉验收：浅色 + 深色双主题下逐组件目检通过。
- 生成 changeset（`@byfriends/web-client` minor，UI 重设计非破坏性 API 变更）。

## Out of Scope

- 右侧 details 三栏（byf 暂无强需求内容，列为未来扩展）。
- 流式增量 Markdown 解析优化（deepseek `incremental.ts` 级别）。MVP 先用 memo + 流式关富化（kimi 做法），若实测长回复卡顿再作为 Phase 2。
- 设计 token 抽成跨包共享（如 `@byfriends/web-theme`），供 `apps/vis/web` 复用。先在 `apps/web/client` 内落地。
- `apps/vis` 同步改造、专门移动端 / 触屏适配、会话分组 / 固定 / 重命名、可拖拽列宽、侧边栏虚拟化。
- **server 边界**：不改传输架构 / SSE / 反向 RPC / wire DTO；**唯一例外**是 R17 给 `GET /api/sessions` 加 `?q=` 过滤（仅 `routes.ts`，`SessionSummary` 不变）。状态机逻辑层（`lib/chat.ts`）不动。

## Technical Approach

### 五个支柱

1. **三层设计 token（地基）** — Tailwind v4 `@theme` + CSS 变量表达 deepseek 三层结构；深色基线 + 浅色 AA 覆盖；防闪烁 boot 脚本。
2. **shadcn/ui 接入** — `components.json`（zinc + Tailwind v4），按需引入组件；lucide 图标；`cn()` 工具；保留 Tailwind v4，不引入 CSS-in-JS。
3. **两栏布局** — CSS Grid（左会话侧边栏 + 右主区），容器查询窄屏折叠；details 三栏 Out of Scope。
4. **核心组件重写** — 保留 `chat.ts` reducer 与 `useEventStream`，只重写 Transcript / 气泡 / Markdown（Shiki）/ ToolCallView / Composer / ThinkingBlock / 空状态渲染层。
5. **交互精细化** — 智能滚动、空 / 加载骨架、深浅对比度逐组件验收。

### 关键技术约束

- **不动传输契约**：SSE frame 类型、反向 RPC（approval / question）协议、`@byfriends/web-shared` DTO 保持不变，server 不动。
- **不动状态机**：`lib/chat.ts` 的 reducer 与事件处理逻辑保留，仅消费其输出的 `entries/parts` 重写渲染。
- **构建兼容**：保持 `web-client build` 产物可被 `web-server`（`--target bun`）内嵌，不破坏 PRD-0032 发布链路。

## Feasible Approaches

### Approach A: shadcn 混合路线（Recommended ✅）

- **How**：保留 Tailwind v4，引入 shadcn/ui + Radix + lucide + Shiki。组件交互行为用 Radix / shadcn，样式用 Tailwind 自写，视觉 token / 布局 / 交互精致度参考 deepseek。
- **Pros**：复用成熟可访问组件，快速逼近精致度；kimi 已实证可行；与现有 Tailwind v4 无缝；品牌样式自控。
- **Cons**：需统一 shadcn 默认 zinc 风格与 deepseek 视觉语言（靠 token 层抹平）。

### Approach B: 完全照搬 deepseek（全自建）

- **How**：换 CSS Modules + 全自建原子组件 + 手写 SVG 图标。
- **Pros**：精致度天花板最高、完全可控、与 deepseek 架构一致。
- **Cons**：工作量最大（连图标手写），适合有专职前端；需重构现有 Tailwind 代码；ROI 低。

### Approach C: shadcn/ui 全家桶（预设样式）

- **How**：直接用 shadcn 预设样式组件，少自定义。
- **Pros**：开箱即用最快。
- **Cons**：风格偏 shadcn 系，品牌定制空间小，与 deepseek 视觉语言差距大。

## Decision (ADR-lite)

**Context**：`apps/web/client` 功能完整但视觉 / 体验为"骨架级"，无设计系统、无组件库、无图标、无高亮。需选一条兼顾精致度与工作量的改造路线。

**Decision**：采用 **Approach A（shadcn 混合路线）**。架构 / 组件用 shadcn 生态（Radix + lucide + Shiki，保留 Tailwind v4），视觉语言 / 布局 / 交互精致度对标 deepseek-harness。品牌色保留 byf emerald 绿（纳入三层 token）；主题做深浅双主题 + system 三态；布局两栏（侧边栏 + 主区）。

**Consequences**：

- ✅ ROI 最高，kimi 已实证 shadcn 能做产品级 agent 客户端。
- ✅ 保留现有 Tailwind v4 与状态机资产，重构包袱小。
- ⚠️ 需在 token 层统一 shadcn zinc 底与 deepseek 视觉语言（可抹平）。
- ⚠️ 深浅双主题 + system 同步做，工作量较"仅深色"翻倍（用户已确认一步到位）。
- 未来若 `apps/vis/web` 要复用设计系统，可再抽共享包。

> 核心决策已经 `/grill` 验证并升格为正式 ADR：**ADR 0035**（`docs/adr/0035-web-ui-redesign-shadcn-design-tokens.md`）。要点：D1 shadcn 混合路线；D2 三层 OKLCH token + @theme 语义化命名；D3 深浅双主题 + system 三态；D4 deepseek 精致骨架 + kimi 步骤时间轴；D5 保留 emerald 绿。

## Implementation Plan (small PRs)

- **PR1 地基**：`theme.css` 重构为三层 token + 深浅双主题 + 防闪烁 boot 脚本 + shadcn 初始化（`components.json`）+ lucide 接入 + Shiki 接入（boot 语法静态 + 懒加载）。不动业务逻辑。
- **PR2 布局**：`AppShell` 改两栏 Grid + 会话侧边栏 + 容器查询窄屏折叠。
- **PR3 核心组件**：Transcript / 气泡 / Markdown（Shiki）/ ToolCallView / Composer / StatusBar 接 shadcn + 图标，重写渲染层。
- **PR4 交互**：智能滚动 + 空状态 hero + 加载骨架 + token 用量美化。
- **PR5 收尾**：Approval / Question 卡片 + 原生控件替换 + 深浅对比度验收 + 回归测试 + changeset。

## Technical Notes

### 三方调研关键文件

**deepseek-harness（视觉 / 交互参考）：**

- 三层 token：`packages/client/ui-theme/src/styles/design-platform.css`
- 字体 / 阴影 token：`packages/client/ui-theme/src/styles/gradient-shadow-text.css`
- 三栏布局：`packages/client/ui-layout/src/client/AppFrame.tsx`
- 防闪烁主题：`packages/client/ui-theme/src/boot-theme.ts`
- 增量流式 Markdown：`packages/client/ui-primitives/src/markdown/incremental.ts`、`MarkdownText.tsx`
- 滚动：`packages/client/ui-conversation/src/client/chat/ChatView.tsx`
- 代码块：`packages/client/ui-primitives/src/markdown/CodeBlock.tsx`

**kimi-code（shadcn 实证 + token 范本）：**

- shadcn 配置：`apps/vscode/webview-ui/components.json`（radix-nova + zinc）
- shadcn 组件：`apps/vscode/webview-ui/src/components/ui/`（24 个）
- token 系统范本：`apps/vis/web/src/theme.css`（surface / cat / 深浅 AA 覆盖）
- 三态主题实现：`apps/vis/web/src/hooks/useTheme.ts`
- 工具渲染器：`apps/vscode/webview-ui/src/components/ToolRenderers.tsx`

**byf/apps/web/client（改造对象）：**

- 唯一主题文件：`apps/web/client/src/theme.css:1-100`
- 聊天页布局：`apps/web/client/src/pages/ChatPage.tsx:63-99`
- 消息列表 + 滚动：`apps/web/client/src/components/chat/Transcript.tsx:8-75`
- 状态机（保留）：`apps/web/client/src/lib/chat.ts:96-319`
- SSE 订阅（保留）：`apps/web/client/src/hooks/useEventStream.ts:22-46`
- 依赖清单：`apps/web/client/package.json:24-44`

## Domain Terms（draft — for /grill to refine）

| Term                       | Working Definition                                                                                                        | Status |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------ |
| 三层设计 token             | 原始色 → 语义别名 → 组件专用的 CSS 变量分层体系（源自 deepseek 三层思想，用 OKLCH + Tailwind v4 @theme `--color-*` 实现） | new    |
| 步骤时间轴 (Step Timeline) | assistant 消息按 thinking/tool/text 组织成 step，左侧竖线 + 圆点（活跃辉光），可视化 agent 执行流（源自 kimi）            | new    |
| 设计 token 地基            | 本 PRD 的 R1-R3：token 体系 + 深浅双主题 + 防闪烁 boot 脚本，是其余所有改动的依赖                                         | new    |
| 渲染层 / 逻辑层分离        | 保留 `chat.ts` reducer（逻辑层）与 `useEventStream`（传输），仅重写组件渲染层                                             | new    |

## Traceability

- **Created by**: `/think`（2026-08-14）
- **Prototyped by**: `/have-a-try`（2026-08-14）— 三变体 × 深浅 prototype（`spike/ui-visual.html`）验证「绿色 + 深浅双主题 + deepseek 精致度」实际观感达产品级；结论：方案成立，选定 A 骨架 + B 步骤时间轴融合
- **Grilled by**: `/grill`（2026-08-14 完成）— 11 项决议（技术路线/品牌色/主题/变体/token 命名/色彩空间/搜索/主题UI/流式高亮/AA/虚拟化），升格 ADR 0035
- **Sliced into**:
  - #300 — [PRD-0033] 设计 token + 深浅双主题系统 (Done)
  - #301 — [PRD-0033] shadcn/ui + 图标 + Shiki 代码高亮 (Done)
  - #302 — [PRD-0033] 两栏布局 + 会话侧边栏 + 后端搜索 (AFK, ←#300,#301)
  - #303 — [PRD-0033] 聊天消息流 + 智能滚动 + 用户气泡 (AFK, ←#300,#301,#302)
  - #304 — [PRD-0033] assistant 步骤时间轴 + Markdown + 工具卡片 (HITL, ←#303)
  - #305 — [PRD-0033] Composer + 审批/提问卡片 + 空状态 + 回归 (AFK, ←#303,#304)
- **Sliced by**: `/story`（2026-08-14）→ 6 个 vertical slices，依赖链 300→301→302→303→304→305
- **Implemented by**: —
- **Reviewed by**: —
- **New terms**: 三层设计 token、设计 token 地基、渲染层 / 逻辑层分离（见上）
- **New decisions**: shadcn 混合路线 + 深浅双主题 + 保留绿色品牌色（建议升格 ADR-0035）

## Issue

#299（父 Issue，由 `/think` 创建；`/story` 创建子 Issue 挂载到此）
