# 0020 - Fork Rewind 截断锚点

日期：2026-06-24

## 状态

已接受

## 背景

PRD-0015 为 `/fork` 命令添加了可选的回退步骤：用户选择一条历史用户消息，fork 后的会话从该消息之前分支（编辑消息语义）。实现此功能需要在持久化的 `wire.jsonl` 中定位截断记录流的精确点。

初始设计假设循环事件（`step.begin`、`tool.call`……）携带的 `turnId` 可以作为稳定的标识符来定位截断点。`/grill` 期间的代码交叉核对反驳了这一假设：

1. **`turnId` 未在 turn 边界上持久化。** `TurnFlow.prompt()`（`packages/agent-core/src/agent/turn/index.ts:79-86`）写入只包含 `{ type, input, origin }` 的 `turn.prompt` wire record——没有 `turnId`。turnId 是 `TurnFlow` 上的内存计数器（`turn/index.ts:64`，从 -1 开始，每 turn 递增），仅通过 `turn.started` / `turn.ended` 事件发出，而这些是 `LoopLiveOnlyEvent`，**从未写入 wire**（`packages/agent-core/src/loop/events.ts:113-119`）。
2. **没有 `turn.end` wire record。** Turn 的"完成"只能从下一个 `turn.prompt` / `turn.steer` 记录的出现或流结尾推断。通过 `turn.cancel` 中止的 turn 也会写入 wire（`types.ts:26`）并算作已结束。
3. **turnId 在 fork 时重置。** 因为 turnId 通过在重放期间计数派生，fork 后的会话的 turnId 从零重新计算——因此 fork 时存储的 turnId 在新会话中毫无意义。

因此，turnId 和持久化的 turn-end 标记都无法可靠地锚定截断点。

## 决策

通过 **`turn.prompt` / `turn.steer` wire records 的出现序数**（过滤到 `origin.kind === 'user'`）定位 fork 截断点。fork API 接受 `upToMessage: number`——用户消息的从 1 开始的索引。截断保留出现在第 N 个符合条件的 `turn.prompt`/`turn.steer` 记录**之前**的所有 wire record，丢弃该记录及其后的所有内容。这产生了编辑消息语义：fork 后的会话从所选消息之前的状态恢复，用户可以重新输入。

具体来说，`SessionStore.fork` 复制源会话目录，然后重写主 agent 的 `wire.jsonl` 为截断后的前缀，并从 `state.json` 的 `metadata.agents` 中移除孤儿子 agent（那些由被丢弃的 turn 产生的 agent）。

## 结果

### 正面

- 截断点是客观存在的 wire record 行——不需要推断 turn 边界（`turn.prompt` _就是_ 边界）。
- 自然兼容现有的基于重放的会话恢复：截断后的前缀无需额外快照逻辑即可免费重放为一致状态。
- 在压缩下安全：压缩事件是只追加的（`context.apply_compaction`、`context.clear` 从不删除之前的 `turn.prompt` 记录），因此保留的前缀包含压缩历史并连贯重放。
- 完全不依赖 turnId，避免了不稳定的 turnId 陷阱。

### 负面

- 截断逻辑必须正确区分 `turn.prompt` 和 `turn.steer`，并按 `origin.kind === 'user'` 过滤（后台任务和 hook 发起的 turn 不得计为用户可选择的回退点）。
- 孤儿子 agent 清理增加了复杂性：实现必须将保留的主 agent 工具调用映射到产生的子 agent，并从 `metadata.agents` 中修剪未引用的子 agent 及其 wire 目录。
- `upToMessage` 是位置序数，因此在 fork 时针对源会话的当前 wire 才有意义——它不是持久的、可移植的标识符。

## 考虑的替代方案

- **在 `turn.prompt` 记录上持久化 turnId**，使其可以直接锚定截断。被拒绝：需要 wire 协议迁移（现有记录类型上的新字段），并且仍然留下引用存储时的 turnId 在 fork 时重置的问题。序数方法不需要 schema 变更。
- **检查点语义（保留到所选 turn 结束）。** MVP 被拒绝：由于没有 `turn.end` wire 标记，"第 N 个 turn 的结束"只能近似为"就在第 (N+1) 个 `turn.prompt` 之前"——这对最后一个 turn（无后续锚点）和已取消的 turn 来说是脆弱的。编辑消息语义（在_第 N 个_ `turn.prompt` 处截断）有明确的锚点。检查点语义推迟到 v2。
- **从恢复快照重建会话，而不是截断 wire。** 被拒绝：需要重建 wire record，破坏"wire 是唯一事实来源"的不变式，并迫使每个子系统（重放、工具、后台）适应——影响范围大得多。

## 参考

- PRD-0015（Fork Step Rewind）
- `packages/agent-core/src/agent/turn/index.ts:79-86`（`turn.prompt` 写入位置）
- `packages/agent-core/src/loop/events.ts:113-119`（`LoopLiveOnlyEvent`——turnId 未持久化）
- `packages/agent-core/src/agent/records/types.ts:18-26`（`turn.prompt` / `turn.cancel` 记录形态）
- [Claude Code Checkpointing](https://code.claude.com/docs/en/checkpointing) ——编辑消息 fork 语义参考
