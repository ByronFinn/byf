# 0023 - Fork 总是清空 Goal

日期：2026-07-03

## 状态

已接受

## 背景

PRD-0019 引入 goal 模式后，需要确定 fork 会话时 goal 的处理方式。byf 的 fork（ADR-0020）是**目录复制 + wire.jsonl 截断 + 重放**：fork 复制源会话目录，按 `upToMessage` 截断主 agent 的 `wire.jsonl`，新会话首次加载时重放截断后的 wire records 重建内存状态。

如果 goal 的 `goal.create` / `goal.update` records 落在截断点之前，fork 后的会话会自然重放出一个 goal（经 `normalizeAfterReplay` 降级为 paused）；若落在截断点之后，则没有 goal。这是"继承"语义——fork 是源会话的状态快照。

但 fork 在产品语义上是"从某个点重新开始"，携带一个 paused goal 会让用户困惑：fork 后看到一个 ⏸ badge，指向一个他们并未发起、上下文可能已不存在的目标。

## 决策

**fork 总是清空 goal**，无论截断点位置。实现上，在 `SessionStore.fork`（`packages/agent-core/src/session/store/session-store.ts`）截断主 agent 的 `wire.jsonl` 后，向新会话的 wire **追加一条 `goal.clear` record**（若截断后的前缀里出现过 `goal.create`，否则无需追加，因为本来就没有 goal）。fork 后的会话首次加载重放时，`goal.clear` 抹掉之前重放的 goal 状态，`GoalMode` 无 goal。

不追加 `GOAL_FORK_CLEARED_REMINDER`（kimi 的做法）——byf 的 reminder 走 ephemeral injection（ADR-0022），无 goal 时 `getEphemeral()` 返回空，模型根本看不到任何 goal 提示，无需额外"忽略历史 reminder"的告知。

## 结果

### 正面

- fork 后的会话始终无 goal，语义干净：fork = 全新开始，不残留源会话的目标状态。
- 用户不会被一个上下文不存在的 paused goal 困惑。
- 复用已有的 `goal.clear` record 类型与 `GoalMode` 的 clear 路径，无需新的 record 类型或 `restoreForked` handler。
- 与 ADR-0022 协同：无需 fork-specific 的 system reminder。

### 负面

- `SessionStore.fork` 需要在截断后判断前缀是否含 `goal.create`，并条件追加 `goal.clear`。这是 fork 路径上的新逻辑（非纯目录复制）。
- 若用户确实想"带着目标 fork 继续"，需在 fork 后手动 `/goal resume <new objective>` 重新发起——可接受，因为 fork 的语义本就是重新开始。

## 考虑的替代方案

- **继承并降级（靠现有 fork→replay→normalizeAfterReplay）**：被拒绝。技术上最省事（零额外代码），但产品语义上 fork 残留 paused goal 会让用户困惑，且 goal 的 objective 可能引用 fork 截断后已不存在的上下文。
- **新增 `goal.fork_clear` record 类型 + GOAL_FORK_CLEARED_REMINDER**：被拒绝。`goal.clear` 已足够表达"无 goal"，新增类型是过度设计；reminder 在 byf 的 ephemeral 机制下不需要（ADR-0022）。

## 参考

- PRD-0019（Autonomous Goal Mode）
- ADR-0020（Fork Rewind 截断锚点）
- ADR-0022（Goal Reminder 走 Ephemeral Injection）
