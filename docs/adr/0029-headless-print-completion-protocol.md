# 0029 - Headless print 完成协议（drain / hold / exit codes）

日期：2026-07-12

## 状态

已接受

## 背景

`byf -p`（print / headless）历史上在主 agent 首次 `turn.ended` + `completed` 即退出。这在以下场景不正确：

1. 后台子代理 / 后台任务仍在运行，主 turn 已结束；
2. Goal 模式仍 `active`，driver 会续跑后续 turn；
3. 会话内 Cron 仍有未来 `nextFireAt`，scheduler tick 常为 unref，进程会过早 drain。

上游 kimi-code 已用「完成判定状态机 + 后台 wait ceiling + goal/cron hold」处理。PRD-0023 grill（Q1–Q3）将行为定为脚本契约，难逆转且不写进 ADR 则易被误改。

## 决策

### 1. 完成判定顺序（print 模式）

主 agent 无 active turn 后，按序评估：

1. **Goal**：`status === 'active'` → **hold** event loop（等待 driver / 后续 turn / terminal goal 事件）；
2. **Cron**（Cron 子系统上线后）：存在任一任务 `nextFireAt !== null` → **无限 hold**（无 hard ceiling）；
3. 否则 **`waitForBackgroundTasksOnPrint`**（见下）→ settle → cleanup → 退出。

Hold 须使用 **ref'd** 句柄（如 interval）；settle 时清除。Scheduler 自身 unref 时不得单独依赖它保活进程。

完成判定须由 **两个事件** 触发，缺一不可：(a) 主 agent 的 `turn.ended`；(b) `goal.updated` 且 `snapshot.status !== 'active'`。后者是关键——goal driver 在 budget 耗尽时调 `markBlocked` 后**不发** `turn.ended` 即退出循环，仅监听 `turn.ended` 会导致 budget-blocked 的 goal 卡在 hold 永不 release（对齐 kimi `evaluateRunCompletion` 的双触发点）。

### 2. 后台 wait ceiling

- 配置项语义对齐：`printWaitCeilingS`，**默认 3600**。
- 仅约束「等后台任务」路径；**不**约束 goal hold 与 cron hold。
- 超时后结束 wait；若仍有活跃后台任务，进程以 **非 0** 退出。wait API 不负责 kill 任务；进程退出 / session close 路径负责清理。
- **与 `keepAliveOnExit` 解耦**：`waitForBackgroundTasksOnPrint` 在 print 模式下**无条件**执行，不读取 `keepAliveOnExit`。`keepAliveOnExit` 仅管 `Session.close` 时是否 `stopAll`（见第 5 节）。这与 kimi（`keepAliveOnExit` 默认 false 且门控 drain）有意不同——BYF 的 `keepAliveOnExit` 默认 true，若沿用 kimi 门控会让一个语义模糊的字段同时控制两条路径；解耦后 AC-H1 的「后台未完成前不退出」作为默认行为成立。

### 3. Goal headless 入口与 exit code

- 支持 `byf -p "/goal <objective>"` 创建路径（malformed create 在发模型前失败）。
- 终端状态映射（脚本契约）：

| Goal 终态                          | Exit code |
| ---------------------------------- | --------- |
| `complete`（及无 goal 的成功路径） | `0`       |
| `blocked`                          | `3`       |
| `paused`                           | `6`       |

### 4. Goal / Cron hold 与兜底

**Cron**：有未来 fire 的 cron 使 `-p` **可以永不退出**（与 kimi 一致）。用户文档与 changelog **必须**警告：在 print 会话内创建周期性 cron 会导致进程挂起直至外部 kill 或任务无未来 fire。

**Goal**：goal `active` 时 hold 同样无 hard ceiling，依赖 goal driver 把状态推向终态来 release。driver 的终态路径包括：模型经 `UpdateGoal` 声明 complete/blocked/paused、可选 budget（turn/token/wallClock 三维均 optional，`createGoal` 不设默认值）耗尽 → `markBlocked`、用户 cancel/pause。**注意 `GoalBudgetLimits` 三维全部 optional 且默认不设**——无 budget 的 goal 在模型不调 `UpdateGoal` 的最坏情况下，仅靠 `MAX_DRIVER_ITERATIONS = 50`（driver 迭代硬上限）兜底，表现为跑满 50 个 continuation turn 后以 exit 3（blocked）退出。用户文档应提示：`byf -p "/goal …"` 在无显式 budget 时可能长时间运行后才终态。unref 的 force-exit timer **救不了** goal hold——ref'd keepAlive 让 event loop 持续存活，unref timer 永不触发。

### 5. 与 `keepAliveOnExit` 的边界

现有 `background.keepAliveOnExit` 只表示 **session close 时是否 stopAll**，**不得**被误用作 print 完成协议的替代。print 须显式 `waitForBackgroundTasksOnPrint`（及 ceiling），不得仅依赖 close 钩子。

## 后果

- **正面**：脚本可依赖稳定 exit code；后台/wedged 任务有 1h 上限；goal/cron 长任务可跑完。
- **负面**：周期性 cron + `-p` 对不读文档的用户表现为「挂死」；无 budget 的 goal + `-p` 最坏跑满 50 轮才退出；须文档与错误提示兜底。
- **后续**：Cron 子系统（PRD-0023 W2a）接入步骤 1 的第 2 步；W1 可先实现 goal + background，cron 分支占位或 no-op。

## 关联

- PRD-0023（Grilled）
- CONTEXT：Headless drain、Print wait ceiling、会话内 Cron
- 对照：kimi-code `run-prompt.ts` / `waitForBackgroundTasksOnPrint` / `goal-prompt.ts`
