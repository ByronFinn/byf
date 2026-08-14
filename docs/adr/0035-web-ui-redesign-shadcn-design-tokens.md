# 0035 - Web 客户端 UI 重设计：shadcn 路线 + 三层 OKLCH token + 深浅双主题

日期：2026-08-14

## 状态

已接受

## 背景

PRD-0032 / ADR 0034 建立了 byf web 客户端的**传输骨架**（SSE + 反向 RPC + 三包拆分 + `byf web` 子命令）。其 client（`apps/web/client`）功能完整但视觉层为「骨架级」：颜色硬编码 hex 散落 6 个文件、无设计 token、无组件库、无图标、无代码语法高亮、无会话侧边栏、写死深色、滚动粗糙。

本 ADR 记录 UI 重设计（PRD-0033）的一组互相关联决策：组件路线、设计 token 如何组织、主题如何处理、视觉风格走哪条路、品牌色怎么定。这些决策**难逆转**（整个渲染层重写），且未来读者会问「为什么不照搬 deepseek 全自建」「为什么保留绿色而不换蓝」。

**调研依据**（三方源码对比）：

- **deepseek-harness**：三层 token（`--dsw-static/alias/specific-*`）+ CSS Modules + 全自建（连图标手写 SVG）。精致度天花板最高，但投入重。
- **kimi-code**：`apps/vscode/webview-ui` 用 shadcn（radix-nova + zinc）+ radix-ui + tabler 图标，**实证 shadcn 能做出产品级 agent 客户端**；`apps/vis/web` 的 token 系统（surface/fg + 8 类事件色 + 深浅 AA 覆盖）最成熟。
- **byf 现状**：裸 HTML + 硬编码样式，但状态机（`lib/chat.ts`）扎实。

**验证依据**：用 throwaway prototype（have-a-try，`spike/ui-visual.html`，3 结构变体 × 深浅）+ 图像分析确认「绿色 + 深浅双主题 + deepseek 式精致度」实际观感达到产品级。

## 决策

### D1：组件路线用 shadcn 混合，非 deepseek 全自建

保留现有 Tailwind v4，引入 shadcn/ui（`components.json`，baseColor zinc）+ Radix primitives + lucide-react 图标 + Shiki 代码高亮。组件交互行为用 Radix/shadcn，样式用 Tailwind 自写，视觉/布局/交互精致度对标 deepseek。

deepseek 的全自建（CSS Modules + 手写 SVG 图标）精致度更高但**投入过重**（适合有专职前端），且需重构现有 Tailwind 代码。kimi 已证明 shadcn 路线能逼近同等精致度，ROI 显著更高。

### D2：三层设计 token，OKLCH 色彩空间，命名走 Tailwind v4 `@theme` 语义化

三层（源自 deepseek 三层思想）：

- **原始色板**：`--color-green-*`（品牌多级）+ `--color-neutral-*` + 状态色（red/amber/sky）。
- **语义别名**：`--color-bg` / `--color-surface-1/2/3` / `--color-fg` / `--color-fg-muted` / `--color-border` / `--color-brand` / `--color-state-*`。
- **组件专用**：`--color-bubble`（用户气泡）/ `--color-sidebar` / `--color-input` 等。

色彩空间用 **OKLCH**（深浅感知均匀，AA 对比易达标，kimi 同款）。命名遵循 Tailwind v4 `@theme` 的 `--color-*` 约定，工具类（`bg-surface-1` / `text-fg` / `border-border`）自动生成，与 shadcn/kimi 一致，**零桥接**——不用品牌前缀 `--byf-*`（会与 Tailwind 工具类约定冲突，需手动桥接）。

### D3：深浅双主题 + system 三态，深色为基线

支持 light / dark / system 三态，存 localStorage `byf.theme`，经 `<html class>` 切换。**深色为基线 + 浅色 AA 覆盖**（参考 kimi `apps/vis/web`：深色态每 token 给浅色变体保证 WCAG AA）。防闪烁 boot 脚本（`index.html` 注入内联脚本，React 加载前读 `byf.theme` + `prefers-color-scheme` 前置设 class + `color-scheme`，参考 deepseek `boot-theme.ts`）。

主题切换 UI = **顶部状态栏的 light / dark / system 三按钮分段控件**（非单 toggle，对应三态）。

### D4：视觉风格 = deepseek 精致骨架 + kimi 步骤时间轴

- **骨架**用 deepseek 式精致：base / surface 多级色差（解决 byf 当前「背景 `#0b0d10` 与卡片 `#11151a` 几乎分不出」的硬伤）+ 多层阴影 elevation（3 级）+ 半透明边框 + 绿色点缀。
- **吸收** kimi 的步骤时间轴：assistant 消息按 thinking / tool / text 组织成 step，左侧竖线 + 圆点（活跃项辉光），作为 agent 执行流的可视化。
- 流式渲染策略：流式期间 Markdown 渲染纯文本 + 组件 memo（关闭高亮），turn 结束后一次性上 Shiki 高亮（deepseek/kimi 验证的最佳实践）。增量解析（deepseek `incremental.ts` 级别）列为未来扩展。

prototype 三变体验证后（A=deepseek 精致 / B=kimi 时间轴 / C=极简扁平），**A 骨架 + B 时间轴**融合方案视觉最佳。

### D5：保留 byf emerald 绿品牌色

品牌色保留 byf 现有 emerald 绿，纳入三层 token（`--color-brand` = green-500/600）。绿色作**点缀色**（用户气泡 / send 按钮 / 状态点 / 时间轴圆点），不主导大面积——prototype 验证深色背景下绿色协调精致、不刺眼。不换 deepseek 蓝（保留品牌识别）。

## 结果

### 正面

- ROI 最高：kimi 实证 shadcn 能做产品级 agent 客户端，保留现有 Tailwind v4 与状态机资产，重构包袱小。
- 三层 OKLCH token 使改色/主题只动一处，深浅双主题一次到位。
- 步骤时间轴让 agent 执行流（thinking → tool → text）可读性强，是 agent 客户端的差异化体验。
- 防闪烁 boot 脚本 + 三态主题，体验对标 deepseek。

### 负面

- 深浅双主题 + system 同步做，工作量较「仅深色」显著增加（每组件需验证浅色 AA 对比）。
- shadcn 默认 zinc 风格需在 token 层与 deepseek 视觉语言抹平（可做，但需纪律）。
- 未来若 `apps/vis/web` 要复用设计系统，需再把 token 抽成跨包共享（当前仅在 `apps/web/client` 内）。

## 备选

- **完全照搬 deepseek（全自建）**：CSS Modules + 手写 SVG 图标库 + 全自建原子组件。精致度天花板最高、完全可控，但工作量最大，需重构现有 Tailwind 代码，适合有专职前端。否决理由：ROI 低。
- **shadcn/ui 全家桶（预设样式）**：直接用 shadcn 预设组件少定制。开箱最快，但风格偏 shadcn 系，与 deepseek 视觉语言差距大，品牌定制空间小。否决理由：达不到对标精致度。
- **品牌前缀 `--byf-*` token**：专属感强，但与 Tailwind v4 `@theme` 工具类约定冲突，需手动桥接。否决理由：零收益的额外复杂度。

## 引用

- PRD-0033（`docs/prd/PRD-0033-web-ui-redesign.md`）
- ADR 0034（web 客户端传输骨架，本 ADR 架设其上）
- 三方调研：deepseek-harness（`/Users/baifan/Projects/ByronFinn/agents/deepseek-harness`）、kimi-code（`apps/vscode/webview-ui` + `apps/vis/web`）、byf `apps/web/client`
- 验证 prototype：`spike/ui-visual.html`（have-a-try，已验证后清理）
