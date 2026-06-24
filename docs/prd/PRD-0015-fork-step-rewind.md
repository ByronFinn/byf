# Fork Step Rewind

> **Status**: Done | **PRD**: PRD-0015 | **Created**: 2026-06-24 | **Last updated**: 2026-06-24

## Goal

升级 `/fork` 命令：从"整会话盲拷"变为"可选回退步骤的 fork"。用户在执行 `/fork` 时，可从用户提问列表中选定某条提问，fork 出的新会话丢弃该提问及其后的一切内容（含其触发的子 agent），等价于"回到该提问之前、重新开始"。新会话里用户可重新输入/编辑该提问。语义对齐 pi-rewind / Claude Code 的 edit-message 分叉模型。

## What I already know

### 现状（代码事实）

- `/fork` 命令注册：`apps/cli/src/tui/commands/registry.ts:82-87`，description "Fork the current session"。
- TUI handler：`apps/cli/src/tui/byf-tui.ts:3879-3907`。关键：第 3880 行 `void args;` —— **参数完全被忽略**，没有任何"截止到哪一步"的概念。
- handler 调用 `this.harness.forkSession({ id, title })`，然后 `switchToSession(forked, ...)`。
- SDK 层 `ForkSessionInput`：`packages/node-sdk/src/types.ts:84-89`，只有 `id / forkId / title / metadata`，**无任何截止字段**。
- Core impl：`packages/agent-core/src/rpc/core-impl.ts:304-319`，透传到 `sessionStore.fork(...)`。
- 存储层 `SessionStore.fork`：`packages/agent-core/src/session/store/session-store.ts:73-111`。核心是 `cp(source.sessionDir, targetDir, {recursive:true})` 的**整目录盲拷**，然后 `writeForkedState` 重写 `state.json`。
- `ForkSessionRecordInput`：`session-store.ts:27-32`，只有 `sourceId / targetId / title / metadata`。

### 关键技术发现（grill 期间代码交叉验证）

1. **会话状态靠重放 wire 记录重建**。`switchToSession` → `hydrateTranscriptFromReplay`（`apps/cli/src/tui/actions/replay-ops.ts:97`）→ `resumeSessionResult`（`core-impl.ts:720`），context / replay / 工具状态全部来自重放。**因此只要把 wire.jsonl 截断到某个前缀，重放出来就是那一刻的一致状态**，无需额外快照逻辑。
2. **🔴 wire 中 `turn.prompt` 记录不含 turnId**（`packages/agent-core/src/agent/turn/index.ts:80-84`，只写 `{ type, input, origin }`）。turnId 是 TurnFlow 的内存计数器（`turn/index.ts:64`，从 -1 递增的 number），仅通过 `turn.started`/`turn.ended` live event 发出，而这两者是 **`LoopLiveOnlyEvent`（不进 wire）**。**所以 wire 里定位 turn 的唯一可靠锚点是 `turn.prompt`/`turn.steer` 记录本身的出现序数，而非 turnId。** 见 ADR-0020。
3. **🔴 wire 中没有任何 turn 结束记录**。无 `turn.end` 这种 AgentRecord。一个 turn 的"结束"只能靠"下一个 `turn.prompt`/`turn.steer` 出现，或 wire 结束"推断。被 `turn.cancel`（`turn/index.ts:156`，写入 wire，`types.ts:26`）打断的 turn 也算已结束。这决定了"保留到某轮结束"语义不干净，而"回到某轮之前"（在第 N 个 turn.prompt 处截断）干净——故选重发型语义。
4. **截断=保留前缀，对 compaction 安全**。`context.apply_compaction`（`context/index.ts:112-116`）和 `context.clear`（`context/index.ts:98-99`）都是**追加**记录到 wire（append-only），不删除已有 `turn.prompt` 记录。`records.rewrite()`（`records/index.ts:141-143`）只在 wire 协议版本迁移时触发，不删语义记录。截断保留前缀会自然含 compaction 记录，重放自洽。
5. **🔴 孤儿子 agent 问题**（已确认）。子 agent 注册写入 `session.metadata.agents[agentId]`（`session/index.ts:250-251`）→ `state.json`。`writeForkedState`（`session-store.ts:188-226`）只改 homedir 路径、原样保留成员。resume 时（`session/index.ts:159-176`）遍历 `Object.keys(agents)` 对每个子 agent 调 `agent.resume()`。**故截断 main wire 后，被丢弃轮次产生的子 agent 会残留为新会话的孤儿**——能 resume（子 agent wire 全量保留）但在 `/tasks`、`/agent` 列表悬空显示。决策：清理孤儿（见 R7）。
6. **picker 现成可复用**：`ChoicePickerComponent`（`apps/cli/src/tui/components/dialogs/choice-picker.ts`）自带 `value/label/description` 和"← current"标记；`SearchableList`（`apps/cli/src/tui/utils/searchable-list.ts`）+ `paging.ts` 提供游标/分页/模糊搜索。
7. **fork 命令 idle-only**：无 `availability` 字段（`registry.ts:82-87`），默认 idle-only，streaming/compacting 时被 `slashCommandBusyReason` 拦截（`resolve.ts:99-105`）。**保证 fork 时会话静止，无 in-flight turn，截断语义安全。**
8. **用户首条 prompt 的 turnId 在 TUI 侧为 undefined**（`byf-tui.ts:1597`），因为 live event 在 `prompt()` 内异步发出后才更新 `currentTurnId`。印证 turnId 不适合做稳定标识，选择器改用 1-based 用户提问序号呈现。

### 研究结论（业界现行标准）

- **Pi Coding Agent（earendil-works/pi，即本仓库依赖的 `@earendil-works/pi-tui` 母体）原生没有 rewind**：[discussion #1223](https://github.com/earendil-works/pi/discussions/1223) 仍只是 feature request。其"可选步骤"体验来自第三方扩展 [pi-rewind](https://github.com/arpagon/pi-rewind)，语义是 git 快照 + 按 turn 回退。
- **业界现行标准是 [Claude Code `/rewind`](https://code.claude.com/docs/en/checkpointing)**，同一命令提供两种选项：
  - _Rewind to checkpoint_：回退到某轮结束后的快照，保留 `1..N`。
  - _Edit message_：编辑历史用户消息后分叉出新分支（回到该消息之前）。
- 经代码交叉验证，**Edit message 语义在本架构落地最干净**（截断点 = 第 N 个 `turn.prompt` 记录处，无需推断 turn 边界）。本 PRD MVP 采用此语义。

## Assumptions (validated in grill)

- fork 的回退粒度 = 一个用户提问（`turn.prompt`/`turn.steer` 记录，`origin.kind === 'user'`）。选择第 N 个提问 = 在该记录处截断，保留其前所有内容。
- **不使用 turnId 作标识**（代码已证伪：turnId 是内存计数器、不进 wire、fork 后重置）。截断点用"第 N 个 turn.prompt 记录的 wire 行位置"定位，选择器用 1-based 用户提问序号呈现。
- 截断 main agent 的 `wire.jsonl`；**同时清理被截断轮次产生的孤儿子 agent**（从 `state.json` 的 `metadata.agents` 移除，并删除其 wire 目录）。
- 无参 `/fork` 弹出选择器；`upToMessage` 省略时为全量 fork（向后兼容）。

## Open Questions

- 无（grill 期间全部解决；见 Traceability）。

## Requirements (evolving)

- **R1 截断字段**：在 `ForkSessionInput`、`ForkSessionPayload`、`ForkSessionRecordInput` 三层增加可选的 `upToMessage?: number`（1-based 用户提问序号）。省略时行为与现状完全一致（全量 fork，向后兼容）。
- **R2 选择器 UI**：`/fork`（无参）时，基于 `state.transcriptEntries` 中 `kind === 'user'` 的条目，弹出 `ChoicePickerComponent` 按时间正序列出每个用户提问。每项 label = 序号 + 提问摘要（截断的文本）。选中第 N 个 = 从该提问重新开始（保留 `1..N-1`，丢弃 `N..` 末尾）。允许选择"最后一个之后的分支点"等价全量 fork。
- **R3 存储层截断**：`SessionStore.fork` 在 `cp` 整目录后，当 `upToMessage` 存在时，重写 main agent 的 `wire.jsonl`：定位第 `upToMessage` 个 `turn.prompt`/`turn.steer` 记录（且 `origin.kind === 'user'`）的 wire 行，只保留该行之前的所有记录（含 `metadata` 头、之前的 `context.*` / `turn.*` / loop 事件），删除该行及之后的所有内容。
- **R4 状态重建**：fork 后 `state.json` 的 `updatedAt` 刷新为当前；`lastPrompt` 若指向被截断的提问则清空。
- **R5 兜底**：`upToMessage` 超出实际用户提问数时，报错并放弃 fork（不产生半截会话）。复用 `SessionStore.fork` 现有 try/catch + `rm(targetDir, recursive, force)` 兜底（`session-store.ts:107-110`）；此路径需有单测覆盖。
- **R6 向后兼容**：`upToMessage` 省略或 RPC 端为旧版时，退化为整目录复制（现状行为）。
- **R7 清理孤儿子 agent**：截断后，交叉比对 main wire 保留区间内被引用的子 agent（通过 loop 事件里的 tool.call → parentToolCallId 映射），从 `state.json` 的 `metadata.agents` 移除不再被引用的子 agent 条目，并删除其 `agents/<id>/` wire 目录。
- **R8 溯源元信息**：当 `upToMessage` 存在时，在 fork 出会话的 `state.json` 记录 `forkedFromMessage: <N>`（复用现有 `writeForkedState` 机制 + 现有 `forkedFrom` 字段），便于溯源。

## Acceptance Criteria (evolving)

- [ ] AC1 无参 `/fork` 弹出用户提问选择器，按时间正序列出每个用户提问（序号 + 文本摘要）。
- [ ] AC2 选择第 N 个提问后，fork 出的新会话 transcript 重放只显示 `1..N-1` 个提问及其回复，第 N 个提问及之后完全消失。
- [ ] AC3 fork 后的新会话 context 状态与原会话在第 N 个提问之前一致（工具状态、permission、config 等通过 replay 自洽重建）。
- [ ] AC4 `upToMessage` 省略（或选"不回退"）时，行为与改造前的全量 fork 完全一致。
- [ ] AC5 中途发生过 compaction 的会话，截断后重放依然自洽、无悬空引用。
- [ ] AC6 被截断轮次产生的子 agent **不**残留在新会话的 `metadata.agents` 中，其 wire 目录被删除；保留区间内产生的子 agent 仍能被正确引用。
- [ ] AC7 `upToMessage` 超出实际用户提问数时，显示明确错误且不产生残留会话目录。
- [ ] AC8 含 background task 的会话，截断后 background 状态与所选分支点一致（被截断轮次产生的 background 不残留）。
- [ ] AC9 fork 出的会话 `state.json` 含 `forkedFrom` + `forkedFromMessage`，可溯源分叉点（仅在 `upToMessage` 生效时）。
- [ ] AC10 被截断的提问若曾被 `turn.cancel` 打断，截断仍正确（cancel 记录一并丢弃，无半截状态）。

## Definition of Done (team quality standards)

- 在既有对应测试文件中补充单测/集成测试（SessionStore.fork 截断、ChoicePicker 列表构建、replay 一致性），不新增多余测试文件。
- Lint / typecheck / CI 通过。
- `gen-changesets` 生成 changeset（`@byfriends/node-sdk` 公共类型新增字段，倾向 `minor`；需按规则与用户确认级别）。
- 更新 `/fork` 命令 description / help 文案以反映可选步骤。

## Out of Scope (explicit)

- **Checkpoint 型 fork（保留到选中轮结束）**：选中第 N 轮后保留 `1..N` 含助手回复。代码证明 wire 无 turn.end 锚点，"第 N 轮结束"只能靠下个 turn.prompt 推断，实现不干净。本 PRD 选 Edit-message 型（回到选中提问之前）。Checkpoint 型留作 v2。
- **Step 级（同一轮内）回退**：回退到某次模型调用之后。需处理悬空 tool_call/result 配对，复杂度显著上升，Out of Scope。
- **文件状态回退（git 快照）**：Claude Code / pi-rewind 的 `/rewind` 还回退工作区文件。本 fork 只处理会话记录，不改用户工作区文件 —— 这是 BYF fork 的既有语义边界，保持不变。
- **对原会话的 in-place rewind**：本 PRD 只做 fork（创建新会话），不修改原会话。
- **直接编辑选中的提问文本**：MVP 只"回到该提问之前"，不在选择器内原地编辑文本（用户 fork 后在新会话自由输入）。原地编辑留作 v2。

## Research References

- [Pi 是否有 undo/rewind（discussion #1223）](https://github.com/earendil-works/pi/discussions/1223) —— Pi 原生无 rewind，仍为 feature request。
- [pi-rewind 扩展](https://github.com/arpagon/pi-rewind) —— 第三方实现，git 快照 + 按 turn 回退。
- [Claude Code Checkpointing 官方文档](https://code.claude.com/docs/en/checkpointing) —— 现行标准：checkpoint = prompt/编辑完成后的快照，`/rewind` 提供回退 + edit-message fork。
- [Claude Code Agent SDK file-checkpointing](https://code.claude.com/docs/en/agent-sdk/file-checkpointing) —— 文件级 checkpoint 机制（本 PRD 不实现文件回退，仅作语义参考）。
- [Reddit: Claude Code's /rewind isn't an undo button](https://www.reddit.com/r/ClaudeAI/comments/1u8cgpc/claude_codes_rewind_isnt_an_undo_button_it_doesnt/) —— 澄清 rewind 只跟踪文件编辑与 prompt checkpoint，不跟踪 bash 副作用。
- [Codex issue #11626: Add /rewind checkpoint restore](https://github.com/openai/codex/issues/11626) —— 同类 feature request，佐证 checkpoint 为业界共识语义。

## Feasible Approaches

### Approach A: 在第 N 个 turn.prompt 处截断 wire 前缀（Recommended）

- **How**: `SessionStore.fork` 在 `cp` 整目录后，读取 main agent 的 `wire.jsonl`，数 `turn.prompt`/`turn.steer` 记录（`origin.kind === 'user'`）的出现次数，定位第 `upToMessage` 个的 wire 行号，重写文件只保留该行**之前**的所有记录。随后按 R7 清理孤儿子 agent。
- **Pros**:
  - 截断点是 wire 里客观存在的记录行，无需推断 turn 边界（turn.prompt 本身就是边界）。
  - 与现有 replay 重建机制天然契合，截断后重放即一致状态。
  - 对 compaction 安全（append-only，保留前缀含 compaction 历史）。
  - 重发型语义与用户直觉一致（"从这条提问重新开始"）。
- **Cons**:
  - 需正确识别 `turn.prompt` vs `turn.steer`（两者都可能由用户产生），以及 `origin.kind` 过滤。
  - 孤儿清理需处理 main tool-call → 子 agent 的映射。

### Approach B: 基于 resume snapshot 重建而非截断文件

- **How**: 不动 wire.jsonl，而是读取 resume snapshot，丢弃检查点之后的 context messages，再据此重建一个干净的会话目录。
- **Pros**: 概念上"干净"，新会话不含历史噪音。
- **Cons**:
  - 需自行重建 wire 记录，破坏现有"wire = 唯一事实源"的不变量，replay/工具/background 等子系统都要适配，风险大。
  - 与现有 replay 架构相悖，改动面远大于 A。
  - **不推荐**。

## Decision (ADR-lite)

**Context**: `/fork` 需支持可选回退步骤；会话状态靠重放 wire.jsonl 重建；但 wire 中 turnId 不稳定、无 turn.end 锚点。
**Decision**: 采用 Approach A（在第 N 个 `turn.prompt` 处截断 wire 前缀）。在 `ForkSessionInput` / `ForkSessionPayload` / `ForkSessionRecordInput` 增加 `upToMessage?: number`；`SessionStore.fork` 在 `cp` 后按用户提问序数截断 main agent 的 wire.jsonl 前缀，并清理孤儿子 agent。语义为 Edit-message 型（回到选中提问之前）。截断点选择的理由见 ADR-0020。
**Consequences**:

- 复用 replay 不变量，状态一致性免费获得。
- turnId 不稳定问题被绕开（用记录序数定位）。
- 孤儿子 agent 需同步清理，否则造成悬空显示。
- 公共类型新增可选字段，向后兼容；changeset 倾向 `minor`，按规则与用户确认。

## Technical Notes

- 受影响文件清单（端到端链路）：
  | 关注点 | 路径 |
  |---|---|
  | `/fork` 命令定义 | `apps/cli/src/tui/commands/registry.ts` |
  | `/fork` handler（建选择器） | `apps/cli/src/tui/byf-tui.ts:3879` |
  | `ForkSessionInput`（加 `upToMessage`） | `packages/node-sdk/src/types.ts:84` |
  | `forkSession` SDK | `packages/node-sdk/src/byf-harness.ts:117` |
  | `forkSession` core impl（透传） | `packages/agent-core/src/rpc/core-impl.ts:304` |
  | `ForkSessionRecordInput`（加 `upToMessage`） | `packages/agent-core/src/session/store/session-store.ts:27` |
  | `SessionStore.fork`（截断 + 清理孤儿实现点） | `packages/agent-core/src/session/store/session-store.ts:73` |
  | `writeForkedState`（溯源元信息） | `packages/agent-core/src/session/store/session-store.ts:188` |
  | TurnFlow.prompt（turn.prompt 写入处） | `packages/agent-core/src/agent/turn/index.ts:79-86` |
  | resume 遍历 metadata.agents（孤儿影响点） | `packages/agent-core/src/session/index.ts:159-176` |
  | wire 记录类型（含 `turn.prompt`） | `packages/agent-core/src/agent/records/types.ts:18-21, 91-97` |
  | wire 持久化（read/rewrite 参考） | `packages/agent-core/src/agent/records/persistence.ts:103-108` |
  | `TranscriptEntry`（带 `turnId`，建选择器用） | `apps/cli/src/tui/types.ts:169-184` |
  | ChoicePicker（选择器模板） | `apps/cli/src/tui/components/dialogs/choice-picker.ts` |
- 编码规则遵循根 `AGENTS.md`：可选属性直接传 `undefined`，不写 `T | undefined`；`upToMessage` 省略时等价现状。

## Domain Terms (resolved in grill)

| Term              | Working Definition                                                                            | Status                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Fork（会话 fork） | 基于一个已有会话创建新会话，原会话不变。BYF 中表现为整目录复制 + state 重写 + 可选截断。      | conflicts with existing（"fork" 在通用语境含 git 分叉义，此处特指会话级）→ sharpened in CONTEXT.md |
| upToMessage       | fork 时指定的 1-based 用户提问序数；新会话在对应 `turn.prompt` 记录处截断，保留其前所有内容。 | new → CONTEXT.md                                                                                   |
| Fork Rewind       | `/fork` 的可选回退能力：从指定用户提问处分叉新会话，丢弃该提问及之后内容。                    | new → CONTEXT.md                                                                                   |
| Step              | 一次模型调用 + 其 tool 批次；一个 turn 含多个 step。                                          | new（与 loop/events.ts 的 step 概念一致）                                                          |
| Turn              | 一次用户提问到助手 end_turn 的完整往返。                                                      | existing in CONTEXT.md（sharpened：补充 turnId 不稳定、wire 锚点说明）                             |

## Traceability

- **Grilled by**: `/grill` (completed 2026-06-24) — 推翻了原"用 loop 事件 turnId 定位"的技术假设（代码证伪：turnId 不进 wire、无 turn.end 锚点）；将语义从"checkpoint 型"改为"edit-message 型"（回到选中提问之前）；新增孤儿子 agent 清理需求（R7）；术语 Fork/upToMessage/Fork Rewind 锐化入 CONTEXT.md；截断点选择创建 ADR-0020。6 项代码交叉验证全部完成，Open Questions 清零。
- **Sliced by**: `/story` (completed 2026-06-24)
- **Sliced into**:
  - #184 — [PRD-0015] fork rewind 端到端骨架 — 选提问截断 main wire (AFK) — Done
  - #185 — [PRD-0015] fork rewind 孤儿子 agent 清理 — 截断后无悬空 agent (AFK, blocked by #184) — Done
  - #186 — [PRD-0015] fork rewind 边界与兜底 — cancel/compaction/越界 (AFK, blocked by #184) — Done
  - #187 — [PRD-0015] fork rewind 溯源元信息与文档/changeset (AFK, blocked by #184, #185) — Done
