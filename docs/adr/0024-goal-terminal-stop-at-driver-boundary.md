# 0024 - Goal 终态停止靠 Driver 边界读状态

日期：2026-07-03

## 状态

已接受

## 背景

PRD-0019 的 goal 模式中，模型通过 `UpdateGoal` 工具声明 goal 的终态（`complete` / `blocked` / `paused`）。参照系 Kimi Code 的 `UpdateGoal` 工具在 `complete`/`blocked`/`paused` 时返回 `{stopTurn: true, stopBatchAfterThis: true}`，让当前 turn 在工具调用后**立即结束**，driver 随后读到非 active 状态停止续跑。

byf 的 loop 层（`packages/agent-core/src/loop/`）对工具返回值的 `stopTurn` 支持是不对称的：

- `ExecutableToolErrorResult`（`loop/types.ts:87`）有 `stopTurn?: boolean` 字段——但仅限错误结果。
- `ExecutableToolSuccessResult`（`loop/types.ts:64-75`）**没有** `stopTurn` 字段。
- `RunnableToolExecution`（`loop/types.ts:119-125`）的 `execute()` 返回 `ExecutableToolResult`，成功路径无法表达"停止当前 turn"。

要让 `UpdateGoal('complete')` 立即停 turn，要么 (a) 改 loop 层给 success result 加 `stopTurn`，要么 (b) 让 `UpdateGoal` 返回 `ExecutableToolErrorResult` 形状（`isError:true` + `stopTurn:true`）——但 complete/blocked 不是错误，这是 hack。

## 决策

**不改 loop 层。`UpdateGoal` 是普通工具，返回标准 success result；driver 在每个 `runOneTurn` 返回后读 goal status 决定是否续跑。**

具体：

- `UpdateGoal.execute()` 调用 `goal.markComplete/markBlocked/pauseGoal/resumeGoal`，返回 `{output: 'Goal marked complete.'}` 等普通成功结果，不设 `stopTurn`。
- 模型调完 `UpdateGoal` 后，当前 turn 可能还会继续跑几个工具调用（直到模型自然停止），然后 turn 结束。
- `driveGoal` 循环在每个 `runOneTurn` 返回后读 `agent.goal.getGoal().goal`：若为 null（complete 已清空）或 status≠active，停止续跑；否则续跑下一轮。

## 结果

### 正面

- 不侵入 loop 层：`ExecutableToolSuccessResult` 保持现状，`tool-call.ts` 的 stopTurn 合并逻辑不动。
- 语义诚实：complete/blocked 是正常的状态迁移，不是错误，不应伪装成 error result。
- 与 byf 既有的"turn 边界做决策"模式一致（compaction、dedup、hook 都在 turn/step 边界处理）。

### 负面

- `UpdateGoal('complete')` 后当前 turn 可能多跑几个工具调用才结束。实践中模型调完 `UpdateGoal` 通常就停止生成，多跑的概率低；即使多跑，driver 也会在 turn 边界正确停止续跑，不影响正确性。
- 终态的"决定"与"生效"之间有一个 turn 的延迟窗口——但这恰好是可接受的，因为 goal 状态已被工具调用修改，多跑的工具调用是在"已知 goal 终态"下执行的。为保证此陈述成立，`markComplete` **不立即 clear**：只置 `complete` 瞬态 + emit completion 事件，clear durable record 延迟到 driver 在 turn 边界读到 `complete` 后执行（见 PRD-0019 关键技术发现 #7）。这样多跑的工具调用期间 reminder 仍反映 complete 档，而非 goal 已 clear 后的空 reminder。

## 考虑的替代方案

- **扩展 `ExecutableToolSuccessResult` 加 `stopTurn` 字段**：被拒绝。改动 loop 层（types.ts + tool-call.ts 的合并逻辑 + turn-step.ts 的 stop reason 推导），影响面大于 goal 模式本身的价值；且 byf 现有工具都不需要此能力，为单一工具改通用层是过度设计。
- **让 `UpdateGoal` 返回 `ExecutableToolErrorResult`**：被拒绝。语义错误（complete 不是 error），且会触发 PostToolUseFailure hook 与错误遥测，污染数据。

## 参考

- PRD-0019（Autonomous Goal Mode）
- Kimi Code `tools/builtin/goal/update-goal.ts`（参照系，采用 stopTurn，byf 因 loop 层差异改用 driver 边界）
