# 0025 - Goal Pause 软停 / Cancel 硬停

日期：2026-07-04

## 状态

已接受

## 背景

PRD-0019 的 goal 模式中，streaming 时 `/goal pause` 与 `/goal cancel` 都被 AC-8 要求"始终可用"（`availability: 'always'`，绕过 `idle-only` 拦截）。但"`availability: 'always'` 仅让命令在 streaming 时能被解析"，真正"急停"还需要决定是否中断当前 streaming 的 turn。

byf 的 turn 中断机制是 `AbortSignal`：abort 后当前 turn 以 `turn.ended.reason='cancelled'` 结束（`agent/turn/index.ts` 的 `turnWorker` catch 到 `isAbortError` 分支）。中断进行中的 turn 意味着模型可能正在执行的工具调用被截断（如 Write/Edit 写到一半、Bash 命令中途）。

两种语义都合理但冲突：

- **软停**（只置 goal 状态，不 abort 当前 turn）：保护进行中工具调用的原子性，但用户按下后还要等当前 turn 跑完才真正停下。
- **硬停**（立即 abort 当前 turn）：真急停，立即生效，但进行中的工具调用可能留下半成品状态。

`pause` 与 `cancel` 在用户心智里是不同动作：pause="暂停一下，待会儿继续"，cancel="我不要了"。统一语义会牺牲其中一方的直觉。

## 决策

**区分语义：`/goal pause` = 软停；`/goal cancel` = 硬停。**

- **`/goal pause`（软停）**：只把 goal 状态置为 `paused`，**不** abort 当前 turn。当前 turn 跑完后，`driveGoal` 在 turn 边界读到 status≠active，自然停止续跑。进行中的工具调用（Write/Edit/Bash）完整执行完，原子性不受影响。
- **`/goal cancel`（硬停）**：立即 abort 当前 turn 的 `AbortSignal`（等价 Esc），当前 turn 以 `cancelled` 结束；随后 clear goal 记录。半成品工具调用状态由用户承担——cancel 本就是"丢弃"语义，可接受。
- **Esc 路径**：goal 推进中按 Esc 中断当前 turn（abort 路径），driver `pauseOnInterrupt` 把 goal 置 paused。Esc 与 pause 都进 paused 但实现不同：Esc=abort 路径，pause slash=软停只置状态。

## 结果

### 正面

- pause 不破坏工具调用原子性（正在写文件/跑命令不会被截断成半个）。
- cancel 立即生效，符合"丢弃"的强意图。
- Esc 与 pause 各司其职：Esc 是物理中断（用户想立刻停手），pause 是逻辑暂停（用户想让 goal 停下但不动当前 turn）。两者都收敛到 paused 状态，resume 路径统一。

### 负面

- 两个"急停"入口（pause / cancel）行为不同，用户需学习差异。缓解：UI badge 状态变化一致（都收敛到非 active），差异只在"当前 turn 是否被打断"——这是用户能直接感知的（pause 后能看到当前 turn 跑完，cancel 后立即停）。
- cancel 硬停可能留下半成品文件/命令状态。缓解：cancel 是显式丢弃动作，用户预期承担；driver 不在 cancel 后做额外清理（与 Esc 中断普通 turn 一致）。

## 考虑的替代方案

- **A 方案（pause 软停 / cancel 软停）**：被拒绝。cancel 软停意味着用户明确说"不要了"后还得等当前 turn 跑完，与"丢弃"直觉不符。
- **B 方案（pause 硬停 / cancel 硬停）**：被拒绝。pause 硬停会截断进行中的工具调用（如 Write 写一半），破坏工具调用原子性，违背"暂停一下"的弱意图。
- **统一只提供一种（pause 或 cancel）**：被拒绝。pause（可 resume）与 cancel（不可 resume，记录丢弃）是不同的生命周期操作，合并会丢失语义。

## 参考

- PRD-0019（Autonomous Goal Mode，R3 状态机、AC-2、AC-8）
- byf turn abort 路径（`packages/agent-core/src/agent/turn/index.ts` `turnWorker` 的 `isAbortError` 分支）
