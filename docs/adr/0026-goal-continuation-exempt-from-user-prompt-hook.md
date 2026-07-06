# 0026 - Goal continuation turn 豁免 UserPromptSubmit hook

日期：2026-07-06

## 状态

已接受

## 背景

PRD-0019 R5 原含一条要求：`UserPromptSubmit` hook 拦截 goal continuation prompt 时，driver 应 `markBlocked({reason:'Blocked by UserPromptSubmit hook'})`（PRD line 253 与 R3 状态机 `active → blocked` 转移条件中也列了"UserPromptSubmit hook 拦截"）。

但 OQ-8（grill 决议）同时把 continuation turn 的 origin 定为 `{kind:'system_trigger', name:'goal_continuation'}`。byf 的 `applyUserPromptHook`（`packages/agent-core/src/agent/turn/index.ts:470`）第一行即：

```ts
if (origin.kind !== 'user') return undefined;
```

即 `UserPromptSubmit` hook **只对 `origin.kind === 'user'` 的 turn 触发**。continuation turn 是 `system_trigger` origin，hook 在它上面**永不触发**。两条要求互斥，R5 的 hook 拦截分支在当前 origin 设计下是死路径——既不会被触发，driver 里也没有对应的 `markBlocked` 调用点（`markBlocked` 的全部调用点 reason 为 `'A configured budget was reached'`、`'Goal driver iteration limit reached'`、模型 `UpdateGoal('blocked')` 三类，无 hook 拦截类）。

## 决策

**`system_trigger` origin 的 continuation turn 刻意豁免 `UserPromptSubmit` hook，删除 R5 的 hook 拦截条款。**

具体：

- continuation turn 继续使用 origin `{kind:'system_trigger', name:'goal_continuation'}`（OQ-8 不变）。
- `applyUserPromptHook` 的 `origin.kind !== 'user'` 短路保持不变——系统注入的 prompt 不经用户 hook 拦截。
- driver 的 reason 分支不再有 hook 拦截路径（`cancelled`/`failed`/`complete`/非 active 四类即全部）。
- 用户若想中断 goal 推进，用既有入口：`/goal pause`（软停，ADR-0025）/`/goal cancel`（硬停，ADR-0025）/ Esc（abort → paused）。

## 结果

### 正面

- 与 Claude Code 的既有语义一致：系统/agent 内部注入的 prompt 不被用户侧 `UserPromptSubmit` hook 拦截。hook 是"用户输入"的扩展点，不是"agent 自主行为"的拦截点。
- continuation turn 是 driver 内部循环的产物，让它走 user-prompt hook 会引入隐式耦合（hook 改了行为就影响 goal 续跑稳定性），豁免后 driver 行为更可预测。
- 消除 PRD 内部矛盾（R5 ↔ OQ-8），driver 状态机的 blocked 转移条件收敛到两个明确来源：模型声明 + 预算耗尽。

### 负面

- 用户无法用 `UserPromptSubmit` hook 在 goal 续跑中途做细粒度策略干预（如"检测到 continuation 在循环同一个 prompt 时拦截"）。缓解：这类需求用 `/goal pause`（软停后可调 steer / 发普通 turn 再 resume）或 budget 上限（turnBudget/tokenBudget/wallClockBudgetMs）表达，语义更清晰。
- 用户若期望 hook 对所有 turn 生效，需理解 origin 区分。缓解：这是 byf 既有设计（非本 ADR 引入），hook 文档已说明仅对 user-origin 触发。

## 考虑的替代方案

- **A 方案（让 continuation 也跑 UserPromptSubmit hook）**：被拒绝。要么改 continuation origin 为 user-kind（破坏 OQ-8"进 wire 作为 system trigger 重放"的 replay 语义），要么改 `applyUserPromptHook` 的过滤条件让 system_trigger 也触发（破坏"hook 是用户输入扩展点"的既有边界，且会让其它 system_trigger origin 的 turn 也被波及）。两者都因局部需求牺牲全局一致性。

## 关联

- 修订 PRD-0019 R5 / R3 状态机 / "续跑循环与 byf 既有路径的协同" hook 条目。
- 与 ADR-0025（pause 软停 / cancel 硬停）互补：本 ADR 删除 hook 拦截路径，ADR-0025 提供用户侧的中断入口。
