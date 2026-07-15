# CLI 硬化：Headless drain · 图片 413 · Cron · Compaction 摘要 · /add-dir

> **Status**: Done | **PRD**: PRD-0023 | **Created**: 2026-07-12 | **Last updated**: 2026-07-12
>
> **计划已批准**（2026-07-12）。**Grill 完成**（2026-07-12）。**深度 Review 完成**（2026-07-12）。**Sliced 完成**（2026-07-12）。**Implemented / AC verified / pushed**（2026-07-12）。父 Issue #234（已关闭）。

## Goal

在 BYF 已具备较完整 CLI 能力、且 PRD-0022（引擎韧性 + 图片格式/压缩）已落地的前提下，按 **CLI 深度** 路线补齐脚本化正确性与生产会话防毒的关键缺口：`byf -p` 的后台/goal（及后续 cron）drain 行为、图片请求体过大（413）与多入口统一 limits、会话内 Cron 定时、Compaction 摘要可见、`/add-dir` 多工作区。本阶段明确不做 SSHKaos 与本地平台（server/web/desktop）；二者在本批交付完成后再单独规划。

## What I already know

### 产品决策（用户 2026-07-12）

- 本阶段 **做**：P0 headless drain（background/goal，cron 随 Cron 接入）、P0 图片管线增量（413 恢复、粘贴/多入口统一 limits）、P2 Cron、P2 Compaction 摘要可见、P2 `/add-dir`。
- 本阶段 **不做 / 延后**：SSHKaos、本地平台；Plugin / ACP / Swarm / Plan mode 回退 / Telemetry 均不在本 PRD。
- 定位：继续 CLI-first；平台化另开专题。

### 代码事实（BYF vs kimi-code）

- **Headless**：`apps/cli/src/cli/run-prompt.ts` 在主 agent 首次 `turn.ended` + `completed` 即 `finish()`；无 `waitForBackgroundTasksOnPrint`、无 goal keep-alive、无 headless-exit、无 `byf -p "/goal …"` 路径。kimi 在 `run-prompt.ts` 中：goal `active` 或 cron 有 `nextFireAt` 时 hold event loop；二者皆无再 drain 后台任务；另有 `goal-prompt.ts`、`headless-exit.ts`、`drainAgentTasksOnStop`。
- **图片（PRD-0022 已交付）**：`image-format-policy` / `image-compress` / `image-originals` 已在 agent-core。仍缺：`APIRequestTooLargeError` + turn-step 413 media-degraded 重发、毒图 strip 重发、`ImageLimits` 统一（kimi `image-limits.ts`）、粘贴入口与 ReadMedia 同预算、compaction 路径上对 413/毒图的降级（kimi `compaction/full.ts`）。
- **Cron**：BYF 整子系统缺失（kimi 有 `agent/cron`、`tools/cron`、wire 事件、TUI notice、`-p` keep-alive）。
- **Compaction 摘要**：BYF `CompactionComponent` 仅 token 前后数字；无 summary 正文与 Ctrl-O 展开。kimi 完成态提示 `(Ctrl-O to show/hide compaction summary)`，与 tool output 共用展开。
- **/add-dir**：引擎侧 `WorkspaceConfig.additionalDirs` 已存在（path-access / grep / read 等支持）；缺 CLI `--add-dir`、斜杠 `/add-dir`、会话动态追加与可选项目级记忆。测试中有 `--add-dir` 字样但 options **未实现**真实 flag。
- **架构约束**：ByfTui 不得再堆 private method（`docs/architecture-debt-roadmap.md` H1 / `apps/cli/AGENTS.md` Size Budget）；Cherry-pick 必须适配 Bun（ADR-0028）；Agent 可独立构造、不强制 Session（根 AGENTS.md）。
- **上游对照路径**：`/home/ubuntu/Projects/kimi-code`（同源上游，非运行时依赖）。

### 与 PRD-0022 边界

- PRD-0022 **Done**：529 / Retry-After / 格式门禁 / 压缩 / 原图缓存 / deriveCacheKey。
- PRD-0022 **非目标** 中已点名待后续：print drain、select_tools、SSHKaos、ACP。
- 本 PRD 承接 print drain + 图片 413/多入口；不重做 0022 已交付项。

## Assumptions (temporary)

_（全部已在 grill 中验证并转入 Requirements / Decision / ADR-0029）_

| 原假设                       | 决议                                                         |
| ---------------------------- | ------------------------------------------------------------ |
| A1 完整 cron + headless hold | Q1：有 `nextFireAt` **无限 hold**；R3.6 对齐 kimi 会话内契约 |
| A2 headless `/goal`          | Q3：exit 0/3/6；malformed create 预检失败                    |
| A3 项目记忆                  | Q4：`.byf/local.toml` → `workspace.additional_dir`           |
| A4 summary 在 core           | **代码验证**：仅 TUI 接线 + Ctrl-O                           |
| A5 413 分类                  | **R2.1**：对齐 kimi body-size vs context overflow            |

### Grill 代码交叉核对（完成）

- BYF `background.keepAliveOnExit`（默认 true）只影响 `Session.close` 是否 `stopAll`，**不是** print 结束前 wait；须新增 `waitForBackgroundTasksOnPrint` + `printWaitCeilingS`（默认 3600）。
- ceiling 超时后结束 wait；若仍有活跃后台任务则 **非 0 退出**；wait API 不隐式 kill 任务。
- `CompactionResult.summary` / `compaction_summary` origin 已存在；Ctrl-O 已绑定 `toggleToolOutputExpansion`。
- `additionalDirs` 已参与读写搜索门禁；`/add-dir` 是暴露 + 项目记忆。
- Cron 为 **会话作用域**（非系统 crontab / 非 workdir 全局）。

## Open Questions

_（无）Q1–Q4 已全部决议。_

## Requirements

### R1 · Headless `-p` drain（Wave 1，先不含 cron 分支）

- R1.1 Session/SDK 暴露 `waitForBackgroundTasksOnPrint`（或等价 API）：print 模式结束前等待后台任务完成。**不移植** kimi 的 turn 层 `drainAgentTasksOnStop`（该机制让模型在子代理完成后走一轮 wrap-up，影响模型行为且仅在 create session 开启）——BYF 只做 session 层纯等待退出，主 turn 结束后模型不再自动综合子代理结果。
- R1.1b **print 后台 wait ceiling**：`printWaitCeilingS` 默认 **3600**（可配置）；超时则 `waitForBackgroundTasksOnPrint` 结束并以 **非 0** 退出（grill Q2）。**不**作用于 cron keep-alive（Q1 仍无限 hold）。`waitForBackgroundTasksOnPrint` 在 print 模式下**无条件**执行，不门控 `background.keepAliveOnExit`（后者仅管 `Session.close` 时是否 `stopAll`，见 ADR-0029 第 2/5 节）。
- R1.2 `run-prompt` 在 turn 结束后 **不得** 仅因 `turn.ended/completed` 立即退出：若主 agent goal 为 `active`，保持 event loop（goal driver 续跑）；goal 进入 terminal 后再评估完成。完成判定须**同时**由 `turn.ended` 与 `goal.updated`（`status !== 'active'`）触发——driver 在 budget 耗尽时 `markBlocked` 后不发 `turn.ended` 即退出循环，仅监听 `turn.ended` 会导致 budget-blocked goal 卡在 hold 永不 release（对齐 kimi `evaluateRunCompletion` 双触发点）。
- R1.3 无 active goal、无未来 cron fire、无待 drain 后台任务时：flush 输出 → wait 后台（受 ceiling 约束）→ cleanup → 退出；提供 headless-exit 防挂死（stdio drain + unref force-exit）。
- R1.4 支持 headless goal 创建：`byf -p "/goal …"`（及文档化的等价形式）。**Exit code（grill Q3）**：`complete → 0`，`blocked → 3`，`paused → 6`。malformed create 在发模型前失败并非 0；非 create 的 `/goal …` 子命令不走 create 路径（与 kimi `parseHeadlessGoalCreate` 一致）。
- R1.5 Cron 上线后（R3）：有 `nextFireAt !== null` 的任务 **无限 hold** 进程（无 hard ceiling，对齐 kimi / grill Q1）；无未来 fire 不 hold。与 R1.2 组合：goal 或 cron 任一 pending 即 hold。用户文档与 changelog 须警告：`-p` 中创建周期性 cron 会导致进程不退出。

### R2 · 图片管线增量（Wave 1）

- R2.1 kosong：区分 **请求体过大**（`APIRequestTooLargeError` 等）与 context overflow；分类逻辑对齐 kimi（body-size 文案/状态码 vs token 超限；Vertex 等可能用 413 表示 prompt-too-long 的歧义须先判 overflow）。
- R2.2 agent-core loop：provider 返回 request-too-large 时，**最多一次** media-degraded 重发（旧 media → text marker，保留最近媒体策略对齐 kimi）；仍失败则原错误上抛。
- R2.3 图片格式/不可解码毒图：最多一次 media-stripped 重发；历史保留路径提示以便模型重读。
- R2.4 统一 `ImageLimits`（edge / byte budget 等，可配 config 或 env）；`ReadMediaFile`、CLI 粘贴（及当前已有的其他摄入点）共用同一实例；多 core 时不得互相覆盖 limits。
- R2.5 Full compaction 请求若遇 413/毒图类错误，采用与 turn 一致的 media 降级重试策略（对齐 kimi compaction 行为），避免压缩本身卡死会话。

### R3 · Cron 会话内定时（Wave 2）

- R3.1 内置工具：创建 / 列表 / 删除定时任务；表达式基于本地时区；触发时将 prompt 注入 **同一会话**（空闲时 steer 新 turn）。
- R3.2 持久化到 **当前 session 目录**（非全局 home 任务表）；同 session `resume` 恢复调度；新 session 不继承。
- R3.3 Wire/事件可观测（至少 fired / 任务变更）；TUI 以 notice 卡片展示触发，不静默吞掉。
- R3.4 Headless：接入 R1.5 keep-alive；scheduler tick 若 unref，必须有 ref 住的 hold 机制。
- R3.5 权限与安全：创建/删除受现有 permission 体系约束；不引入远程执行或跨会话广播。
- R3.6 **对齐 kimi 的会话内 Cron 契约**（完整移植语义，非另起一套）：
  - **会话作用域**：任务绑定当前 session，persist 在 session 目录；`resume` 同 session 恢复；**不**跨到新 session / 不按 workdir 全局共享。
  - **idle 交付**：仅在无 active turn 时 `steer` 注入；turn 进行中的 due fire 延后到 idle。
  - **coalesce**：睡过多个 ideal fire 时只交付一次，envelope 带 `coalescedCount`。
  - **7 日 stale**：recurring 存活超过 7 天 → 最后一次 `stale: true` 后自动删除；one-shot 不 stale。
  - **jitter**：确定性 per-task 抖动（防整点羊群）；细节对齐 kimi 上下限。
  - **one-shot vs recurring**：`recurring: false` 触发一次后删除。

### R4 · Compaction 摘要可见（Wave 2）

- R4.1 压缩完成后 transcript 显示完成态，并提示可用快捷键展开摘要；摘要正文取自已有 `CompactionCompletedEvent.result.summary`（不新增 core 字段）。
- R4.2 接入现有 **Ctrl-O / `toolOutputExpanded`** 全局展开开关（`toggleToolOutputExpansion`）：`CompactionComponent` 实现与 tool/thinking 相同的 expand 协议；默认折叠。
- R4.3 Help 面板记录快捷键；`summary` 为空时不显示「show summary」误导文案。

### R5 · `/add-dir` 多工作区（Wave 2）

- R5.1 斜杠 `/add-dir [path|list]`：追加额外工作目录；`list` 列出当前 roots。
- R5.2 CLI `--add-dir <path>`（可重复）在启动时注入 session workspace。
- R5.3 追加后 Read/Grep/Glob/Write/Edit/ReadMedia 等路径策略 **立即** 生效（基于已有 `additionalDirs`）。
- R5.4 可选「记住到项目」：写入 **项目根 `.byf/local.toml`** 的 `workspace.additional_dir` 字符串数组（grill Q4）；该项目后续会话启动时自动加载。与 `~/.byf/config.toml` 分离；建议文档提示可加入 `.gitignore`。
- R5.5 路径校验：存在性、规范化；必须是目录；跨根访问失败时错误信息列出允许 roots（已有 path-access 文案模式）。

### R6 · 工程约束（全波次）

- R6.1 新 TUI 能力走 handler/controller/registry，不向 `byf-tui.ts` 堆功能方法。
- R6.2 适配 Bun 工具链；不引入 Node-only 运行时假设。
- R6.3 上游对照仅作设计与行为参考，不建立 monorepo 运行时依赖。

## Acceptance Criteria

### Headless

- [x] AC-H1：主 turn 启动长时间后台子代理时，`byf -p` 在后台未完成前不退出；后台任务完成后进程可退出（不强制模型自动综合子代理结果——未移植 turn 层 drain）；超过 `printWaitCeilingS`（默认 3600）以非 0 退出（有测）。
- [x] AC-H2：goal `active` 期间 process 不因单次 `turn.ended` 退出；goal complete/blocked/cancelled 后进程可结束。
- [x] AC-H3：`byf -p "/goal <obj>"` 能创建并跑完 goal；complete/blocked/paused 分别 exit 0/3/6；malformed create 在发模型前非 0 失败。
- [x] AC-H4：无 goal、无 cron pending、无后台任务时，正常退出且不挂死（stdio drain + force-exit 单测或 e2e）。
- [x] AC-H5（依赖 R3）：存在未来 `nextFireAt` 的 cron 时 headless **无限保持**；仅「无未来 fire」的任务不保持；docs 含周期性 cron + `-p` 警告。

### 图片

- [x] AC-I1：模拟/注入 request-too-large 时，turn-step 发起一次 media-degraded 重发并记录日志字段；第二次失败上抛。
- [x] AC-I2：毒图/不支持格式导致的 provider 拒绝触发 media-stripped 重发一次。
- [x] AC-I3：413 与 context-overflow 分类单测覆盖（含易混淆文案/状态码）。
- [x] AC-I4：粘贴图与 ReadMedia 使用同一 ImageLimits（改 config/env 两边同时生效的测或接线断言）。
- [x] AC-I5：compaction 路径在 413/毒图场景可降级重试，不永久卡在 compacting。

### Cron

- [x] AC-C1：模型可通过工具创建/列表/删除任务；同 session resume 后恢复；新 session 不携带旧任务。
- [x] AC-C2：到点触发后同一会话 idle 时注入 turn；TUI 可见 notice；busy 时延后交付。
- [x] AC-C3：与 AC-H5 联调通过。
- [x] AC-C4：权限拒绝路径有测。
- [x] AC-C5：recurring 7 日 stale 最终 fire 后删除；one-shot 触发后删除；coalesce 单测。

### Compaction 摘要

- [x] AC-S1：完成后默认折叠摘要，Ctrl-O（共享快捷键）可展开/收起。
- [x] AC-S2：无 summary 时 UI 不展示「show summary」误导文案。
- [x] AC-S3：Help 含快捷键说明。

### /add-dir

- [x] AC-D1：`/add-dir /path` 后对该 path 的 Read/Grep 成功（在权限允许下）。
- [x] AC-D2：`--add-dir` 启动注入；可多次指定。
- [x] AC-D3：`list` 输出当前 workspace + additional。
- [x] AC-D4：选择记住后写入 `.byf/local.toml` 的 `workspace.additional_dir`；同项目新会话自动加载。

### 质量门禁

- [x] AC-Q1：相关包 typecheck / 测试绿；不破坏现有 print 与交互会话回归。
- [x] AC-Q2：用户可见行为变更写入 changelog / 中英文 docs（commands、config、env）。

## Definition of Done

- 上述 AC 对应测试已添加并通过
- Lint / typecheck / CI 绿
- 文档与 CONTEXT 术语（若有新词：如 Cron 任务、additional dir、media-degraded）已更新
- 风险回滚：各 Wave 可独立合并；关闭 flag 非必须，但行为变更需在 changelog 标明
- 本 PRD Status 仅在全部 Child Issues 合并且 AC 代码验证后 → Done

## Out of Scope

- SSHKaos / 远程执行环境
- 本地平台：`packages/server`、kimi-web、Desktop、protocol 多客户端
- ACP、Plugin marketplace、Swarm、Plan mode 恢复
- Telemetry、managed OAuth/usage/feedback
- micro-compaction（继续 observation-masking / offload 路线）
- select_tools 渐进工具加载
- 完整移植 kimi headless JSON 流的全部遥测字段（仅保证正确性与必要 stream-json 兼容）

## Technical Approach

### 波次

```
Wave 1（可两线并行）
  W1a  图片 413/毒图恢复 + ImageLimits 多入口
  W1b  Headless background + goal drain（无 cron 分支）

Wave 2（W1 合入后）
  W2a  Cron 子系统 + TUI + headless cron keep-alive（补全 R1.5）
  W2b  Compaction summary + Ctrl-O
  W2c  /add-dir + --add-dir + 可选项目记忆
```

### 关键设计点

1. **Headless 完成判定状态机**（借鉴 kimi `evaluateRunCompletion`）：`activeTurnId` 清空后检查 goal → cron → `waitForBackgroundTasksOnPrint` → settle。hold 使用 ref'd `setInterval`（或等价），finish 时 clear。判定由 `turn.ended` **与** `goal.updated`（非 active）双触发，覆盖 driver `markBlocked` 不发 `turn.ended` 的路径。
2. **图片恢复在 loop 层一次重试**：避免会话级「每次请求带同一大 base64」死循环；projection 与 history 分离（降级仅影响当次 request messages）。
3. **ImageLimits 为 per-core/per-agent 配置对象**，构造时注入，避免全局可变单例污染。
4. **Cron**：独立 `agent/cron` + `tools/cron`；persist 与 BackgroundManager 解耦；事件进入现有 Event 联合类型。
5. **Compaction UI**：扩展 `CompactionComponent` + CompactionHandler 传递 summary；快捷键挂到现有 transcript 展开机制，不新建全局模式。
6. **add-dir**：session workspace 可变 API + slash handler 模块（`commands/handlers/`）；项目记忆对齐现有 config 布局，新增键需 schema / update-config 技能可识别。

## Research References

- （无独立 `/research` 记录；行为权威来源为 kimi-code 源码与 BYF 现有 ADR-0006/0008/0028。若 413 分类或 cron 持久化格式需固化最佳实践，后续可补 research 记录。）

## Feasible Approaches

**Approach A: 分波 cherry-pick 行为对齐 + BYF 适配**（Recommended）

- How it works: 以 kimi 行为与模块边界为参考，在 BYF 包边界内重写/移植；Wave 1 正确性优先，Wave 2 能力与 UX。
- Pros: 风险可控；与 PRD-0022 成功模式一致；每 slice 可测可回滚。
- Cons: 需人工适配 Bun/分层；非机械 diff。

**Approach B: 大爆炸整包移植 cron+headless+image**

- How it works: 一次 PR 对齐 kimi 相关目录。
- Pros: 表面快。
- Cons: 审查/回滚困难；易带入 plan/plugin/telemetry 杂质；违反 small-PR 与 ByfTui 约束。

**Approach C: 仅做 headless + 图片，Cron/add-dir/摘要另开 PRD**

- How it works: 缩 scope 到 Wave 1。
- Pros: 更小。
- Cons: 用户已明确要 P2 三项；拆 PRD 增加协调成本。本 PRD 用 Wave 表达依赖即可。

## Decision (ADR-lite)

**Context**: 用户在 CLI 完善后选择「硬化 + 实用 P2」，并延后平台化。  
**Decision**: 采用 **Approach A**；Cron 完整会话内调度 + kimi 契约（7 日 stale / coalesce / jitter / session-scoped）；headless `/goal` + exit 0/3/6；add-dir 项目记忆 → `.byf/local.toml`；print 完成后判定见 **ADR-0029**。  
**Consequences**: Wave 2a Cron 是最大 slice；Headless W1 先 background+goal，W2a 再补 cron hold；脚本作者须知晓周期性 cron + `-p` 不退出、后台 wait 3600s ceiling、以及无 budget 的 goal 最坏跑满 `MAX_DRIVER_ITERATIONS`（50 轮）才以 exit 3 退出。

## Implementation Plan (small PRs)

- **PR1**（kosong）：`APIRequestTooLargeError` + 413/overflow 分类 + 单测
- **PR2**（agent-core）：turn-step / projector media-degraded & stripped 重发 + compaction 路径对齐
- **PR3**（agent-core + cli）：`ImageLimits` + 粘贴/Read 接线 + 配置/env
- **PR4**（agent-core + sdk）：`waitForBackgroundTasksOnPrint`（无条件 drain，不门控 `keepAliveOnExit`；不移植 turn 层 `drainAgentTasksOnStop`）
- **PR5**（cli）：`run-prompt` 完成判定 + headless-exit + goal-prompt 路径
- **PR6**（agent-core）：Cron 内核（tools + persist + scheduler + events）
- **PR7**（cli）：Cron TUI notice + headless cron keep-alive
- **PR8**（cli）：compaction summary TUI 接线（事件字段已有）+ Ctrl-O expand + help
- **PR9**（agent-core session + cli）：`/add-dir`、`--add-dir`、项目记忆
- **PR10**：docs / CONTEXT / changelog 收尾（可并入各 PR）

## Technical Notes

- 对照实现：
  - kimi headless：`apps/kimi-code/src/cli/run-prompt.ts`、`headless-exit.ts`、`goal-prompt.ts`
  - kimi session：`waitForBackgroundTasksOnPrint`、`drainAgentTasksOnStop`（`packages/agent-core/src/session/`）
  - kimi 413：`packages/kosong/src/errors.ts`、`packages/agent-core/src/loop/turn-step.ts`、`agent/context` media-degraded projection、`compaction/full.ts`
  - kimi ImageLimits：`tools/support/image-limits.ts`
  - kimi Cron：`agent/cron/*`、`tools/cron/*`
  - kimi compaction UI：`apps/kimi-code/src/tui/components/dialogs/compaction.ts`
  - kimi add-dir：`tui/commands/add-dir.ts`、CLI `--add-dir`
- BYF 落点：
  - `apps/cli/src/cli/run-prompt.ts`
  - `packages/agent-core/src/loop/*`、`tools/support/image-*`、`tools/support/workspace.ts`
  - `apps/cli/src/tui/components/dialogs/compaction.ts`、`events/compaction-handler.ts`
  - `apps/cli/src/tui/commands/handlers/*`
- 相关文档：`PRD-0022`、`docs/architecture-debt-roadmap.md`、ADR-0028、ADR-0008（plan 不回退）

## Domain Terms

| 术语                | 含义                                                            | 是否需写入 CONTEXT        |
| ------------------- | --------------------------------------------------------------- | ------------------------- |
| media-degraded 投影 | 请求侧将较旧 media 换成 text marker、保留最近媒体的一次重试投影 | 是（若实现落地）          |
| ImageLimits         | 每 core/agent 的图片 edge/byte 预算配置对象                     | 是                        |
| Cron 任务（会话内） | 绑定会话、本地调度、触发后注入 prompt 的定时任务                | 是                        |
| additional dir      | workspace 主目录之外的额外允许根                                | 可补强现有 Workspace 描述 |
| headless drain      | print 模式在退出前等待后台/goal/cron 条件满足的完成协议         | 是                        |

## Traceability

- **Created by**: `/think`（2026-07-12）— BYF vs kimi-code 路线分析 + 用户选定 Wave 范围；计划批准后创建父 Issue #234
- **Prototyped by**: —
- **Grilled by**: `/grill`（completed 2026-07-12）— Q1–Q4 决议；A1–A5 全部转入 Requirements；术语写入 CONTEXT；ADR-0029 headless print 完成协议
- **Reviewed by**: 深度 review（2026-07-12）— 代码事实全绿；敲定 P0-1（drain 无条件、解耦 keepAliveOnExit）、P0-2（只做 session 层 drain，不移植 turn 层 drainAgentTasksOnStop）、P1-1（goal hold 对齐 kimi，driver 机制可信但 ADR 措辞修正：release 须双触发 goal.updated、兜底是 MAX_DRIVER_ITERATIONS 而非 hard budget）；补丁落入 ADR-0029 与本 PRD
- **Sliced by**: `/story`（2026-07-12）→ Child Issues below
- **Sliced into**:
  - #235 — [PRD-0023] kosong 413/overflow 错误分类 — `APIRequestTooLargeError` 与 context overflow 分离 (AFK) — Done
  - #236 — [PRD-0023] ImageLimits 统一多入口 — Read/粘贴共用预算 + 配置/env (AFK) — Done
  - #237 — [PRD-0023] session 层 print drain — `waitForBackgroundTasksOnPrint` + ceiling（无条件，解耦 keepAliveOnExit） (AFK) — Done
  - #238 — [PRD-0023] Compaction 摘要可见 — Ctrl-O 展开 + handler 接线 (AFK) — Done
  - #239 — [PRD-0023] /add-dir 多工作区 — 斜杠命令 + `--add-dir` + 项目记忆 `.byf/local.toml` (AFK) — Done
  - #240 — [PRD-0023] turn-step media-degraded/stripped 一次性重发 — 413/毒图恢复 + compaction 路径对齐 (AFK, blocked by #235) — Done
  - #241 — [PRD-0023] headless 完成判定状态机 — goal hold + 双触发 + headless-exit (AFK, blocked by #237) — Done
  - #242 — [PRD-0023] headless `/goal` 创建与 exit code — `parseHeadlessGoalCreate` + 0/3/6 映射 (AFK, blocked by #241) — Done
  - #243 — [PRD-0023] Cron 内核 — scheduler/persist/jitter/types + manager facade (AFK, blocked by #241) — Done
  - #244 — [PRD-0023] Cron 工具与 TUI — Create/List/Delete + 权限 + notice + headless keep-alive (AFK, blocked by #243) — Done
- **Implemented by**: `/implement`（2026-07-12）— 全部 child seams 落地；commits on `dev`（含 print-wait NaN 修复 7b8f143）；issues #234–#244 closed
- **Debugged by**: `/implement` follow-up — `resolvePrintWaitCeilingS`（env>config>3600，避免 parseInt('') → NaN）
- **Arch reviewed by**: —
- **Reviewed by**: —
- **New terms**: Headless drain、Print wait ceiling、ImageLimits、media-degraded / media-stripped、会话内 Cron、项目本地配置 `.byf/local.toml`、Additional dir
- **New decisions**: ADR-0029；Approach A；SSHKaos/本地平台延后

## Issue

#234 — [PRD-0023] CLI 硬化：Headless drain · 图片 413 · Cron · Compaction 摘要 · /add-dir
