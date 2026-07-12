# 会话内 Cron 的 slash 命令（/cron）

> **Status**: Done | **PRD**: PRD-0024 | **Created**: 2026-07-13 | **Last updated**: 2026-07-13
>
> **计划已批准** · **Grill** · **Sliced** · **Implemented** · **Reviewed**（2026-07-13）。父 Issue #245。

## Goal

在 PRD-0023 已交付「会话内 Cron」（工具创建/列表/删除 + TUI fire notice + headless hold）的前提下，补齐**人机直达**的可观测与撤销能力：用户在 TUI 用 `/cron` 查看当前 session 定时任务，并用 `/cron delete <id>` 撤销，无需经模型 `CronList` / `CronDelete`。解决「定时器静默挂着、`-p` hold 原因不明、只能口头让模型删」的可用性缺口。

## What I already know

### 产品背景

- PRD-0023 **有意**未做 slash（对齐 kimi 工具 + notice）；本 PRD 为人机控制面增量。
- `/goal` 是同类「session 长生命周期」人机控制面；`/tasks` 只覆盖 BPM 后台，**不含** session cron。

### 代码事实（grill 交叉核对 2026-07-13）

| 能力 | 状态 |
|------|------|
| 工具 `CronCreate` / `CronList` / `CronDelete` | 已有；默认 permission `ask` |
| `CronManager.listTaskSnapshots()` / `removeTasks()` / `emitDeleted` | 已有 |
| SDK/RPC `getCronTasks` | **已有** |
| SDK/RPC delete | **没有** — 仅工具路径 |
| `CronTaskSnapshot` | **无 `prompt`、无 `humanSchedule`** — 仅 id/cron/recurring/时间戳/nextFireAt |
| CLI 依赖 | **仅 `@byfriends/sdk`**，禁止直依赖 `@byfriends/agent-core`（根 AGENTS.md） |
| `cronToHuman` / `parseCronExpression` | 在 agent-core `tools/cron` 内 export，**未**进 package 主入口供 CLI 使用 |
| slash `/cron` | **没有** |
| id 校验 | `CronDelete`：`/^[0-9a-f]{8}$/` |
| 并发删 | `removeTasks` 在 fire 回调路径已处理「已删除则 no-op」 |

## Assumptions (resolved)

| 假设 | 决议 |
|------|------|
| A1 MVP 范围 | **list + delete**；create 不做 |
| A2 create out of scope | ✅ |
| A3 无全屏 browser | ✅ transcript / status 行 |
| A4 delete 用户特权 | ✅ **ADR-0030** |
| A5 无 session 对齐 `/tasks` | ✅ 报错不崩 |
| A6 snapshot 可直接 list 含 prompt | ❌ **否** — 须扩展 snapshot（见 G1） |

## Open Questions

_think 决议 + grill 代码交叉全部关闭。_

| ID | 决议 |
|----|------|
| OQ-1 范围 | list + delete；create Out of Scope |
| OQ-2 命名 | 主名 `/cron`；alias `schedule` |
| OQ-3 文法 | `/cron` ≡ `/cron list`；`/cron delete <id>`；非法 → Usage |
| OQ-4 权限 | 用户特权 host RPC；**ADR-0030** |
| OQ-5 availability | list 与 delete 均为 `always` |
| OQ-6 status/footer | **本 PRD 不做**（follow-up） |
| OQ-7 展示/空态 | R9–R12 |
| **G1** snapshot 缺 prompt | **扩展 `CronTaskSnapshot`**：增加 `prompt: string`（全文）；CLI 截断展示 ~80 |
| **G2** humanSchedule 如何得 | **在 `listTaskSnapshots` 内计算**并写入 snapshot 字段 `humanSchedule: string`（parse 失败则回退 raw `cron`）；CLI **不**复制 expr 解析、**不** import agent-core |
| **G3** API 命名 | **`deleteCronTask({ id: string })` → `{ deleted: boolean }`**（单 id MVP）；与 `getCronTasks` 并列；成功时 `emitDeleted` |
| **G4** 删正在 fire/buffer 的任务 | **允许**；与工具删同路径语义（`removeTasks` + 已有 concurrent 守卫） |
| **G5** 双路径是否 ADR | **是** → **ADR-0030** |

## Requirements

* **R1** 内置 slash **`/cron`**（alias **`schedule`**）；无参与 **`list`** 等价。
* **R2** **`/cron delete <id>`** 删除指定任务；成功后调度与 persist 不再含该 id。
* **R3** 与 `/tasks` 边界清晰（文案与文档）。
* **R4** 无 session / 空列表 / 未知 id / 非法文法 → 稳定可测反馈。
* **R5** 实现在 `commands/` + `handlers/` + `actions/`；不膨胀 `byf-tui.ts`。
* **R6** delete 经 **host RPC `deleteCronTask`** → `CronManager.removeTasks` + `emitDeleted`；**不**走 BuiltinTool permission（**ADR-0030**）；**不**合成 tool call。
* **R7** 更新 `docs/zh|en/reference/slash-commands.md`（写明用户删 vs 模型 `CronDelete` 权限差异）。
* **R8** list 与 delete **`availability: 'always'`**。
* **R9** 空列表：明确空态文案（语义对齐 “No cron jobs scheduled.”）。
* **R10** 未知 id：错误反馈；id 校验 **`/^[0-9a-f]{8}$/`**（对齐 CronDelete）。
* **R11** list 字段：`id`、`cron`、`humanSchedule`、`recurring`、`nextFireAt`（local ISO 或 none）、**prompt 截断 ~80 + …**（数据来自扩展后的 snapshot）。
* **R12** list → **transcript 持久行**；delete 成功 → **status toast**；错误 → error 反馈。
* **R13** SDK/Session/Agent：**`deleteCronTask({ id })` → `{ deleted: boolean }`**。
* **R14** 扩展 **`CronTaskSnapshot`**：增加 `prompt: string` 与 `humanSchedule: string`（在 `listTaskSnapshots` 填充）；`getCronTasks` 自动带上。additive，semver **minor**（或 patch 若团队对类型 additive 用 patch——实现时按 gen-changesets 默认 minor）。

## Acceptance Criteria

* [ ] **AC1**：有 session 且 ≥1 个 cron 时，`/cron` 与 `/cron list` 展示全部任务，含 id、humanSchedule（或 raw cron 回退）、nextFireAt（或 none）、截断 prompt。
* [ ] **AC2**：无 cron 时 list 明确空态，非 Unknown command、不崩溃。
* [ ] **AC3**：无 session 时 slash 报错并保持主布局（对齐 `/tasks`）。
* [ ] **AC4**：`/cron delete <valid-id>` 后 `getCronTasks` 不含该 id；未知 id / 非法 id / 缺 id → 错误或 Usage。
* [ ] **AC5**：delete **不**触发 permission ask（**ADR-0030**）。
* [ ] **AC6**：streaming 时 `/cron` / `/cron delete` 不被 busy gate 拦截。
* [ ] **AC7**：autocomplete 可见 `/cron` 与 alias `schedule`；registry 单测覆盖。
* [ ] **AC8**：zh/en `slash-commands.md` 已更新（含双路径说明）。
* [ ] **AC9**：`deleteCronTask` RPC/SDK 单测：存在则 `deleted: true` 且 store 空；不存在 `deleted: false`。
* [ ] **AC10**：`CronTaskSnapshot` 含 `prompt` 与 `humanSchedule` 的单测或既有 list 测扩展。
* [ ] **AC11**：相关 unit tests + lint/typecheck 绿；changeset（agent-core / node-sdk / cli）。

## Definition of Done

* Tests：parse、handler/actions、RPC/SDK delete、snapshot 字段、registry
* Lint / typecheck / 相关 test 绿
* 用户文档 slash 参考 + 双路径一句
* gen-changesets

## Out of Scope

* slash **create** / 编辑表达式 / 自然语言建 cron
* 并入 `/tasks` browser
* 改 headless hold（ADR-0029）
* 跨 session / 全局 / 系统 crontab
* `/status` 摘要、footer badge（follow-up）
* 全屏 cron UI
* 改模型侧 Cron* 工具契约与默认 permission（仍 `ask`）
* `rm` / `help` 子命令
* 批量 delete 多 id（host API 可内部复用 `removeTasks`，slash MVP 单 id）
* CLI 依赖 `@byfriends/agent-core`

## Technical Approach

1. **Snapshot（G1/G2）**：`listTaskSnapshots` 增加 `prompt`、`humanSchedule`（`parseCronExpression` + `cronToHuman`，catch → raw cron）。
2. **agent-core host API（G3/ADR-0030）**：`deleteCronTask({ id })`：校验 hex → `removeTasks([id])` → 若 removed 非空则 `emitDeleted` → `{ deleted: boolean }`。
3. **RPC/SDK**：`core-api` / session rpc / `Session.deleteCronTask` 与 `getCronTasks` 对称。
4. **CLI**（仅 SDK）：
   - `commands/cron.ts` parse tagged union
   - registry：`cron` + `schedule`，`always`
   - `handlers/cron.ts` + `actions/cron.ts`：list 格式化（prompt 截断、nextFireAt ISO）；delete 调 SDK
5. **文档**：slash-commands zh/en + CONTEXT 已更新术语。

## Research References

_无 docs/research 命中。_

## Feasible Approaches

**Approach A: List-only** — 否决。

**Approach B: List + Delete via user RPC** — **采纳**（+ snapshot 扩展）。

**Approach C: 合成 CronDelete tool call** — **否决**（ADR-0030）。

## Decision (ADR-lite)

**Context**: 人机 list/delete；snapshot 缺展示字段；delete 权限；CLI 不能依赖 agent-core。

**Decision**:
1. Approach B + **`deleteCronTask` 用户特权**（**ADR-0030**）。
2. **扩展 `CronTaskSnapshot`**（`prompt` + `humanSchedule`），格式化在 core list 路径完成。
3. `/cron` + alias `schedule`；无参 = list；`always`。

**Consequences**: SDK 类型 additive；双路径文档；create 仍仅工具。

## Implementation Plan (small PRs)

* **PR1**：扩展 `CronTaskSnapshot` + `deleteCronTask` RPC/SDK + 单测 + changeset（agent-core, node-sdk）
* **PR2**：CLI `/cron` list + delete + 文档 + tests + cli changeset
* **PR3**（非本 PRD）：`/status` 一行摘要（可选 follow-up Issue）

## Technical Notes

* 参照：`apps/cli/src/tui/commands/goal.ts`、`handlers/goal.ts`、`actions/goal.ts`
* Snapshot：`packages/agent-core/src/agent/cron/manager.ts` `CronTaskSnapshot` / `listTaskSnapshots`
* 权限：`default-permissions.ts`；**ADR-0030**
* 文档：`docs/zh|en/reference/slash-commands.md`
* 相关：PRD-0023；ADR-0029；ADR-0030；CONTEXT「会话内 Cron」「`/cron`」

## Domain Terms

* **会话内 Cron** — 已有；grill 补充双路径（工具 vs `/cron`/host）
* **`/cron`（会话 Cron slash）** — 用户 list/delete 当前 session cron；别名 `schedule`
* 三分：会话 Cron / `/tasks` 后台 / `/goal` 目标

## Traceability

- **Created by**: `/think` (2026-07-13)
- **Prototyped by**: —
- **Grilled by**: `/grill` (completed 2026-07-13) — 代码交叉：snapshot 扩字段；API 定名 `deleteCronTask`；双路径升 **ADR-0030**；CONTEXT 术语；G1–G5 关闭
- **Sliced into**:
  - #246 — [PRD-0024] CronTaskSnapshot 扩展 — prompt 与 humanSchedule (AFK) — Done
  - #247 — [PRD-0024] Host deleteCronTask — 用户特权删除 RPC/SDK (AFK) — Done
  - #248 — [PRD-0024] TUI /cron slash — list、delete 与文档 (AFK) — Done
- **Implemented by**: `/implement` (2026-07-13) — #246 #247 #248
- **Reviewed by**: `/review` (2026-07-13) — three-perspective Approve (Test: Comments with non-blocking gaps; Code/Impact: Approve); ship `b1dcbdd`
- **New terms**: `/cron`（会话 Cron slash）；会话内 Cron 双路径说明
- **New decisions**: ADR-0030 host cron delete 用户特权

## Issue

#245
