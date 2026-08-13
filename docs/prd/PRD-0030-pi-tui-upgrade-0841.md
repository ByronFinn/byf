# pi-tui 升级 0.80.6 → 0.84.1

> **Status**: In Progress | **PRD**: PRD-0030 | **Created**: 2026-08-13 | **Last updated**: 2026-08-13

## Goal

把 TUI 框架 `@earendil-works/pi-tui` 从 `0.80.6` 升到 `0.84.1`（2026-08-07 发布的最新版），消除唯一破坏点（`new TUI` 构造），拿到上游 0.81+ 的全部改进：渲染性能（冷渲染 -30%、overlay -12%、全量重绘 -10%、流式 -6%，原型实测）、`TuiMainScreen`/`TuiAltScreen` 拆分、布局原语（VStack/HStack/ScrollView）、latex 渲染、Kitty placement 机制（alt-screen 视口图片滚动，本轮不启用）。本轮只升级并保持现有行为，不采用任何新特性。

## What I already know

- BYF 的 TUI（`apps/cli`）基于 `@earendil-works/pi-tui@0.80.6`（精确钉版，`apps/cli/package.json:65`），非 Ink/React，是 Mario Zechner 的 pi 框架的差分渲染 TUI。
- kimi-code 的 `@moonshot-ai/pi-tui@0.80.8`（私有 fork）与 BYF 安装的 0.80.6 在图片渲染三模块（`terminal-image`、`components/image`、`tui.js` 的 Kitty 图片集成）**逐行一致**——BYF 已具备与 kimi-code 相同的 TUI 图片渲染能力（粘贴图内联显示，`apps/cli/src/tui/components/media/image-thumbnail.ts`）。
- npm 版本线：0.80.6 → 0.80.10 为纯修复档（已验证零 API 变化）；0.81.0+ 为破坏性重构（`TUI` 类 → `TUI` 接口 + `TuiBase` 抽象类 + `TuiMainScreen`/`TuiAltScreen` 具体类）。
- 0.84.1 破坏面实测（have-a-try 原型）：**只有一处**——`new TUI(terminal)` 在 0.84.1 抛 `undefined is not a constructor`（`TUI` 变纯接口）。`type TUI` 类型导入仍有效；`MarkdownTheme`/`EditorTheme`/`Editor`/`Text`/`Box`/`Image`/overlay API 逐键一致；依赖未变（`marked 18.0.5` + `get-east-asian-width 1.6.0`）。
- 0.84.1 的 `TuiBase` 构造签名 `(terminal, showHardwareCursor?, logDirectory?)` 与旧 `TUI` 前两参同形；BYF 只传 `terminal`（`byf-tui.ts:262`）。
- 图片发射序列两版逐字节一致（`\x1b_Ga=T,f=100,q=2,C=1,c=<w>,r=<h>,i=<id>`）；Kitty placement 函数（`getKittyImagePlacement`/`deleteAllKittyPlacements`/`cropKittyImageLine` 等）服务于 `TuiAltScreen` 视口滚动，不在 index 导出面、未接入 `Image` 组件。
- 仓库已有 pi-tui 升级先例：PRD-0025（0.74.0 → 0.80.6，Done，独立 PR 先行）。

## Assumptions (temporary)

- ~~除 `byf-tui.ts:262` 外，BYF 其余 pi-tui 使用点（`type TUI`、Editor/Text/Box/Image/Markdown、overlay、`getCapabilities` 等）在 0.84.1 下编译通过、行为不变~~ → **已验证（grill /have-a-try 2026-08-13）**：把 0.84.1 真装进 apps/cli 跑 `tsc --build`，全仓**仅 2 个 TS 错误、都在 `byf-tui.ts`、都关于 `TUI`**（TS1484 import + TS2693 构造）；无 MarkdownTheme/EditorTheme/Editor/overlay/其它组件破坏。运行时语义差异仍由 AC3 手动冒烟兜底（本会话 shell 为 `TERM=dumb`，无法全自动 TUI 冒烟）。

## Open Questions

* （无）方向、版本、PRD 与否均已决议。

## Requirements

- R1：`apps/cli/package.json` 将 `@earendil-works/pi-tui` 钉到 `0.84.1`（精确版本，延续现有钉法），lockfile 同步更新。
- R2：`byf-tui.ts` 两处机械迁移（typecheck 实测仅此 2 个错误）：① 第 34 行混合 import 里 `TUI,` 改为 `type TUI,` 并新增值导入 `TuiMainScreen,`；② 第 262 行 `new TUI(terminal)` 改为 `new TuiMainScreen(terminal)`。
- R3：不采用 0.81+ 新特性（TuiAltScreen 视口、VStack/HStack/ScrollView、latex、Kitty placement）——本轮只升级。
- R4：CLI 分发路径（`bun build --compile`）不受影响（pi-tui 纯 JS、无原生依赖）。

## Acceptance Criteria

- [ ] AC1：`bun install` 后 lockfile 解析到 `@earendil-works/pi-tui@0.84.1`。
- [ ] AC2：`typecheck` 全绿（apps/cli + monorepo）。注：`type TUI` 导入需改为 type-only（`verbatimModuleSyntax`），并新增 `TuiMainScreen` 值导入——见 R2。
- [ ] AC3：TUI 启动冒烟：转录 / 编辑器 / overlay / 状态栏渲染正常（headless 或受支持终端）。
- [ ] AC4：粘贴图片内联渲染回归：kitty 序列与 0.80.6 逐字节一致（现有 `image-thumbnail` 路径）。
- [ ] AC5：现有测试全绿（`bun test` / `bun build/run-tests.mjs`）。
- [ ] AC6：`bun build --compile` 产物可运行。

## Definition of Done

- 依赖 bump + 一行迁移 + 验证全过，PR 合入 `dev`
- Lint / typecheck / CI 绿
- changeset（`patch`：内部依赖升级，无用户可见 API 变化）
- 本 PRD Status → Done（验证以代码为准）

## Out of Scope

- `TuiAltScreen` 视口模式 / 布局原语 / latex / Kitty placement 的**采用**（后续独立评估）
- 工具读图内联展示、markdown 图片渲染、回放图片还原、GIF 动画（独立议题，非本 PRD）

## Technical Approach

1. `apps/cli/package.json`：`"@earendil-works/pi-tui": "0.80.6"` → `"0.84.1"`
2. `bun install` 更新 lockfile
3. `byf-tui.ts:262`：`new TUI(terminal)` → `new TuiMainScreen(terminal)`（从 `@earendil-works/pi-tui` 导入）
4. 验证链：typecheck → TUI 相关测试 → 编译冒烟 → 终端手动冒烟

## Research References

* （无 `/research` 记录；升级调研结论来自本 PRD 的 have-a-try 原型与 npm 包对比，如需持久化可另走 `/research`）

## Feasible Approaches

**Approach A: 一步到位 0.84.1**（已选，用户 2026-08-13 决议）

* How it works: 直接升到最新版；迁移面经 grill /have-a-try 真装 0.84.1 跑 `tsc --build` 实测
* Pros: 拿到全部上游改进与性能提升；迁移成本实测仅 `byf-tui.ts` 两处机械改动；依赖未变、主题接口零变化
* Cons: 需完成一次 typecheck + 回归冒烟；0.81+ 运行时行为细节变化无法穷举（由 AC3 手动冒烟覆盖）

**Approach B: 先 0.80.10 观察**

* How it works: 先升到零破坏档，观察后再评估 0.84.1
* Pros: 零风险
* Cons: 拿不到 0.81+ 的性能与功能改进；二次升级成本叠加

## Decision (ADR-lite)

**Context**: 用户原始问题是 kimi-code 如何在 TUI 渲染图片、可否引入 BYF。调研发现 BYF 已具备同源同能力（粘贴图内联渲染已实现），真正可做的增量是 pi-tui 升级。grill 阶段把 0.84.1 真装进 apps/cli 跑 `tsc --build`：全仓仅 2 个 TS 错误、都在 `byf-tui.ts`、都关于 `TUI`（TS1484 import 须 type-only + TS2693 构造改值）；图片发射序列与 0.80.6 逐字节一致、`TuiMainScreen` 主屏路径完整保留 Kitty 图片 diff 逻辑（`parseKittyImageHeader`/`collectKittyImageIds`/`deleteKittyImage`）、渲染性能全面不劣（最多快 30%）。
**Decision**:
1. 直接升级 0.84.1（Approach A），本轮不启用新特性。
2. 钉 **exact `0.84.1`**（非 caret）——pi-tui 在 minor 里发破坏性变更（0.80→0.81 即破 `TUI` 构造），caret 会静默拉入未来破坏性 minor；`apps/cli` 其余依赖虽用 caret，但 pi-tui 作为 TUI 基座不守 semver，例外钉 exact（lockfile 已保证可重现，exact 仅约束 `bun update` 行为）。不另起 ADR。
**Consequences**: 升级零性能代价、迁移两处机械改动；后续如需 TuiAltScreen 视口或布局原语，可从 0.84.1 直接采用。风险集中在 0.81+ 运行时语义差异（非类型），由 AC3 手动冒烟兜底。

## Implementation Plan (small PRs)

* PR1: 依赖 bump（exact `0.84.1`）+ lockfile + `byf-tui.ts` 两处机械迁移（import type-only + 构造换 `TuiMainScreen`）+ typecheck + 测试 + 编译冒烟 + changeset（patch）

## Technical Notes

* 原型：`/tmp/pi-tui-compare/proto/`（have-a-try，一次性，收尾后删除）——`api-probe.ts`（构造/导出/字节捕获）+ `bench.ts`（5 组工作负载 × 2 版本）
* **grill 决定性测试**：把 0.84.1 真装进 apps/cli 跑 `tsc --build`（已回退到 0.80.6 干净态），全仓仅 2 个 TS 错误：
  - `src/tui/byf-tui.ts(34,3): error TS1484: 'TUI' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled.`
  - `src/tui/byf-tui.ts(262,18): error TS2693: 'TUI' only refers to a type, but is being used as a value here.`
* **Kitty 图片 diff 验证**：0.84.1 把 `tui.js` 拆成 `tui.js`+`tui-main-screen.js`+`tui-alt-screen.js`；BYF 走的 `TuiMainScreen`（`tui-main-screen.js`）**完整保留** Kitty 图片 diff 逻辑（`parseKittyImageHeader`/`extractKittyImageIds`/`extractKittyImageRows`/`collectKittyImageIds`/`deleteKittyImage`），`deleteAllKittyImages` 仍从 index 导出——AC4 图片回归有保障。
* **版本钉法事实**：`apps/cli` 所有第三方依赖用 caret，唯独 pi-tui 钉 exact；pi-tui 在 minor 发破坏性变更（0.80→0.81 破 `TUI` 构造），故延续 exact。
* 0.84.1 新导出（本轮不用）：`TuiMainScreen`/`TuiAltScreen`/`VStack`/`HStack`/`ScrollView`/`renderLatex`/`Marked`/`isViewportTUI`/`stripTerminalSequences`/`getOsc8LinkAtColumn`/`compositeTuiLine`
* 参考文件：`apps/cli/package.json:65`、`apps/cli/src/tui/byf-tui.ts:34` 与 `:262`、PRD-0025（0.74.0 → 0.80.6 先例）

## Traceability

- **Created by**: `/think`（2026-08-13，基于 kimi-code 调研 + pi-tui 版本线分析）
- **Prototyped by**: `/have-a-try`（2026-08-13）— 0.84.1 图片序列与 0.80.10 逐字节一致、渲染性能全面不劣（冷渲染 -30%）、迁移面仅 `new TUI` 一处（实测 THROWS → `TuiMainScreen` 替代可行）
- **Grilled by**: `/grill`（2026-08-13）— 真装 0.84.1 跑 typecheck 把迁移面从"1 处假设"收敛到"实测 2 处（import + 构造）"；验证 TuiMainScreen 主屏路径保留 Kitty 图片 diff；决议 exact 钉版（pi-tui 非 semver）。exhaustiveness gate 通过。
- **Sliced into**:
  - #285 — [PRD-0030] pi-tui 升级 0.80.6 → 0.84.1 — 依赖 bump + byf-tui 两处机械迁移 + 全量验证 (AFK) — Done（commit 27a4156；AC1/2/4/5/6 绿，AC3 终端手动冒烟待人工）
- **Reviewed by**: `/review`（2026-08-13）— 三视角（Test/Code/Impact）一致 Approve / Approve with Comments，无矛盾。实测 R2 偏差（彻底移除 `type TUI` 而非保留）正确优于计划。唯一门：AC3 终端手动冒烟（typecheck 看不到的运行时回归：Markdown 渲染/Editor 默认键位/overlay 定位/IME 光标）。低优 finding：exact 钉版策略缺持久化记录（建议补一行注释或短 ADR）。PRD Status 维持 In Progress（AC3 未过不升 Done）。

## Issue

#284（父 Issue）
