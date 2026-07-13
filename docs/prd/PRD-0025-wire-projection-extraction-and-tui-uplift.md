# wire 投影纯函数抽取与 pi-tui 升级

> **Status**: Sliced | **PRD**: PRD-0025 | **Created**: 2026-07-13 | **Last updated**: 2026-07-13
>
> 父 Issue #249。

## Goal

来自一次"对比 kimi-code `agent-core-v2` 的 `wire`/`wireRecord` 与 byf `agent-core`"的架构评审。评审结论：byf **不**全面迁移 v2（移动靶、on-disk 格式需重对齐、成本高），而是捕获其中**已经在发生**的两类确认收益，外加两件确定的小事：

1. **消除核心 / vis 的 wire 投影重复**——`apps/vis/server/src/lib/context-projector.ts` 的 `projectContext`（170 行）镜像了 `agent-core` 的 `ContextMemory.appendLoopEvent` 折叠逻辑，两边已出现**可见的行为分歧**（tool 输出美化、partial compaction 丢消息），且**零跨边界一致性测试**。
2. **堵上 live/restore 双写的漂移口**——31 个 live 写点 vs 21 个 restore 分支；`context.output_offloaded`、`context.pruning` 写了从不读；所有 `restoreRecord` switch **主动关掉** `exhaustiveness-check`。
3. **pi-tui 升级** `0.74.0` → `0.80.6`（拿 CJK 宽度 guard、Kitty graphics 图片生命周期、PasteBurst 等）。
4. **修 `wire-scan.ts`** 的 `turn_begin` 陈旧匹配。

## What I already know

### 评审关键证据

| 事实                                                                                                                       | 来源                                                                |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `apps/vis/context-projector.ts` 的 8 个分支 mirror `appendLoopEvent`，前 4 个逐行同构                                      | `apps/vis/server/src/lib/context-projector.ts:31-171`               |
| **已存在行为差**：tool.result——内核走 `toolResultOutputForModel`（加 `TOOL_EMPTY_STATUS`、offload），vis 直接拿 raw output | 内核 `context/index.ts:362-400`；vis `context-projector.ts:97-114`  |
| **已存在行为差**：apply_compaction——内核保留 summary + 剩余未压缩消息，vis 只留 summary（**丢消息**）                      | 内核 `context/index.ts:118-138`；vis `context-projector.ts:119-140` |
| vis 唯一同步保证是源码注释 "mirrors agent-core's logic"                                                                    | `context-projector.ts:17-30`                                        |
| 8 个类实现 `RecordRestoreHandler`                                                                                          | `agent/index.ts:231-240` 注册；`records/index.ts:92-101` 路由       |
| 31 个 `logRecord(` 写点 vs 21 个 `restoreRecord` 分支                                                                      | 全量 grep                                                           |
| `context.output_offloaded`、`context.pruning` **写了从不读**（死代码）                                                     | types.ts:59-75 定义；无 restore 分支                                |
| `GoalMode.wallClockResumedAt` 派生状态漏恢复，靠 `normalizeAfterReplay` 后置修正                                           | `goal/index.ts:294-304` vs `107,370`                                |
| 所有 `restoreRecord` switch 主动 `oxlint-disable typescript(switch-exhaustiveness-check)`                                  | `context/index.ts:442` 等                                           |
| agent-core **没有 export 纯投影函数**——`appendLoopEvent` 是实例方法，和写盘/offload/通知副作用耦合                         | `agent-core/src/index.ts:60-95` 只 export 类型                      |

### ADR-0010 / PRD-0004 已落地（DONE）

之前那次重构（"AgentRecords 恢复机制重构"）把 restore 从中心 switch 下放到各子系统，实现了"写/读路径架构对称"，但**没做统一 apply**——每个子系统仍是两套方法，靠 `_restoring` 标志共享。本 PRD **不**重做那一步，只补其遗留的两个具体缺口（纯函数抽取 + exhaustive 守护）。

### 不纳入范围（已自行排除）

| 候选                                                            | 排除理由                                                                                                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/cli/src/tui/actions/replay-ops.ts`                        | 它消费 SDK 已折叠好的 `AgentReplayRecord`（含已组装的 `ContextMessage.toolCalls`），**不**重复 wire 折叠逻辑。它是 `ContextMessage → TranscriptEntry` 的 TUI 私有投影，另一层。 |
| 全面 v2 迁移（Op 即数据 + `silent` 统一 + 派生模型 + DI scope） | kimi v2 仍是 WIP（移动靶）；on-disk 格式需重新对齐（byf v1.1 vs kimi v1.4）；重写已 shipped 的 records 层，成本数周-数月、风险高。收益不足，留作未来长期演进备选。              |
| background 任务双轨制持久化（wire + tasks 目录）                | 真实但独立，不在本次 scope。                                                                                                                                                    |

## Assumptions (resolved)

| 假设                                                                  | 决议                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 抽纯函数后 on-disk wire 格式不变                                      | 是。只移动内存折叠逻辑，不碰 `AgentRecord` 形状、不动 `protocol_version`（仍 `1.1`）。                                                                                                                                                                                                                                                                                                                         |
| vis 是纯投影函数的**唯一**外部消费者                                  | 是。cli/replay-ops.ts 在另一层，不消费。SDK 不消费（它走 `ReplayBuilder` 的 `AgentReplayRecord`）。                                                                                                                                                                                                                                                                                                            |
| pi-tui 升级与 A+B 解耦                                                | 是。pi-tui 升级**单独 PR 先行**，确认稳定后再做 A+B。                                                                                                                                                                                                                                                                                                                                                          |
| `context.output_offloaded` / `context.pruning` 是"写了从不读"的死代码 | **Grill 已定论（非 bug）**：两者是 **live-only 调试 record**。offload 是临时内存优化（临时文件易失、restore 路径 @369 有意 `!restoring` 守卫跳过）；pruning 同理（restore 重建原始未裁剪内容，`beforeStep` 重做）。两者写入 wire 仅供 vis wire-list 视图的调试徽章（'offload'/'pruned'），不参与 restore。**保留现状 + 加显式注释**（见 R4/ADR-0031）。已同步更新 CONTEXT.md「输出卸载」「Wire Records」条目。 |

## Requirements

### R1 — pi-tui 升级（独立 PR，先行）

- `@earendil-works/pi-tui` `^0.74.0` → `0.80.6`。
- 跑全量测试（`bun test` + `apps/cli` 组件/流程测试 + e2e），修复 break。
- 特别回归：CJK/emoji 宽度、Kitty graphics 图片、Editor 继承点（`CustomEditor`）、caps_lock 修复。

### R2 — 修 wire-scan 陈旧匹配（trivial，并入 R1 PR 或独立小 PR）

- `session/export/wire-scan.ts:44` 的 `record.type === 'turn_begin'` → `turn.prompt`，字段 `userInput` → `input`（核对 `origin`）。

### R3 — 抽取纯投影函数（A）

- 从 `ContextMemory.appendLoopEvent` 剥出一个**纯函数** `replayWireToHistory(records): readonly ContextMessage[]`（或拆成 `replayLoopEvents` + `replayAppendMessage` 等），放 `agent-core` 并 export。
- 纯函数**无副作用**：不写盘、不 offload、不通知、不调 `scratchManager`/`background`/`emitStatusUpdated`。
- `ContextMemory.appendLoopEvent` 改为"调纯函数 fold + 应用副作用"。
- `apps/vis/server/src/lib/context-projector.ts` 改为调用 agent-core 暴露的纯函数，删除其 mirror 逻辑。
- **保留 vis 独有的投影**（usage 聚合、config 快照、permission mode）——这些是 vis 特有，不属于 wire 折叠。

### R4 — 恢复 exhaustive 守护 + 消除漂移（B）

- **未知 record 容错不动**：`routeToHandler`（records/index.ts:70-73）层对 unregistered type 静默 skip，**这层保持原样**——它处理跨版本/未知 record 的兼容，与 exhaustive 守护无关。
- 移除子系统 `restoreRecord` switch 上的 `oxlint-disable typescript(switch-exhaustiveness-check)`，改为穷尽性 switch。exhaustive 只覆盖**已路由到本子系统**的 record type 子集，不影响未知 record 容错。
- 对 `context.output_offloaded`、`context.pruning`：**保留现状 + 加显式 case 注释**（`// no-op: live-only debugging record, see ADR-0031 / CONTEXT.md`）。它们在 `ContextMemory.restoreRecord` 里显式列出但 no-op，让 exhaustive 检查通过且语义清晰。
- 加测试：断言"每个 `AgentRecordEvents` 成员都有对应的 restore 处理或显式忽略清单"，防止未来再次漂移。

## Acceptance Criteria

1. `apps/vis` 不再包含任何 mirror `appendLoopEvent` 的逻辑；`context-projector.ts` 的 wire 折叠部分被对 agent-core 纯函数的调用取代。
2. 新增跨边界一致性测试：用 agent-core 跑一段含 step/tool/compaction 的 turn 产出 wire，分别用 (a) 内核 fold、(b) 纯函数、(c) vis projectContext 投影，断言三者消息序列相等。覆盖 tool 空输出、partial compaction 两个已知分歧点。
3. `restoreRecord` 的 switch 恢复穷尽性检查；新增"record type 覆盖"测试通过。
4. `output_offloaded` / `pruning` 的归属明确（grill 已定论：保留现状 + 加显式 no-op case 注释，见 ADR-0031），并有注释说明 live-only 语义。
5. pi-tui 升级后全量测试绿；重点回归矩阵全过（见 Technical Approach）。
6. wire on-disk 格式不变；`AGENT_WIRE_PROTOCOL_VERSION` 仍为 `1.1`。

## Definition of Done

- 上述 AC 全部满足。
- 生成 changeset（`gen-changesets` skill）：R1/R3/R4 涉及 `@byfriends/agent-core` 与 `@byfriends/cli` / vis 消费，按 skill 规则定 bump 级别。
- PR 标题遵循 Conventional Commit；PR 描述填 `.github/pull_request_template.md`，说明评审来源与取舍（不全面迁移 v2 的理由）。

## Out of Scope

- 全面迁移到 kimi `agent-core-v2` 的 Op/silent/DI-scope 架构。
- background 任务的双轨制持久化统一。
- `byf-tui.ts` 上帝对象拆分（另有架构债 roadmap）。
- wire 流式 delta 事件的录制（`text.delta` 等仍 live-only）。

## Technical Approach

### 抽取纯函数的剥离策略（R3 的难点）

`appendLoopEvent` 当前混合三类逻辑：

| 逻辑类                                  | 例子                                                                                                                        | 去向                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **纯折叠**（wire event → history 结构） | `step.begin` 开 assistant、`content.part` push、`tool.call` push、`tool.result` 开 tool 消息                                | → 纯函数                                                     |
| **落盘副作用**                          | `logRecord(context.append_loop_event)`                                                                                      | 留在 `appendLoopEvent`，replay 时 `_restoring` 抑制          |
| **派生副作用**                          | output offload（`scratchManager`）、`background.markDeliveredNotification`、`emitStatusUpdated`、`injection.onContextClear` | 留在 `appendLoopEvent`，纯函数只返回"该做什么"，由调用方应用 |

关键：纯函数对 tool.result 返回**结构化的 offload 指令**而非自己执行 offload，调用方（内核）应用指令，vis 忽略指令（只取 history）。这样既消除重复，又保留内核的 offload 能力——直接解决 tool 输出美化分歧。

**grill 确认（全纠）**：纯函数需完整复刻内核 fold 语义，包括 (a) tool 输出美化（空输出加 `TOOL_EMPTY_STATUS`/`TOOL_ERROR_STATUS`）、(b) partial compaction 保留 summary + 剩余未压缩消息。vis 任何场景都应与内核一致，不留"调试近似"。offload 指令的具体形状（如 `{ toolCallId, shouldOffload, originalOutput }` 还是 visitor 回调）留给实现阶段，PRD 只约束行为契约。

### partial compaction 分歧的修复

内核 `applyCompaction` 保留 `history.slice(compactedCount)`（summary + 剩余），vis 当前直接重置为只剩 summary。纯函数化后，vis 复用内核逻辑，自然正确——无需 vis 侧改动。

### pi-tui 升级的风险点（grill 已查证）

`CustomEditor extends Editor`（`apps/cli/src/tui/components/editor/custom-editor.ts`）是继承式扩展，且手工修了 pi-tui 的 caps_lock bug。

**grill 查证结论（上游 CHANGELOG 0.74 → 0.80.6 全量 + 源码逐行对比）**：**低风险，无硬 breaking change**。byf 使用的所有 API（`Editor.handleInput/render`、`TUI.requestRender/start/showOverlay`、`matchesKey`/`Key`/`decodeKittyPrintable`、`fuzzyFilter`/`fuzzyMatch`、`Component`/`Focusable`/`Container`、`Terminal` 接口）签名字节级一致。caps_lock bug 上游未修，byf 的 `normalizeCapsLockedCtrl` 仍必要，**不要因升级删除**。

需重点回归的点（风险按序递减）：

1. **Editor 换行 + paste-burst（中风险）**：0.80.0 新增 `Ctrl+J` 默认换行绑定、0.80.4/0.80.5 新增 paste-burst fallback（快速非 bracketed 多行粘贴时把 Enter 当换行）。byf 的 `getNewlineInput` 只处理 `\n`/`ESC\r`/`[13;2~`/`Ctrl+J`，不处理裸 `Enter`。回归：bracketed paste 多行 + 强制非 bracketed 快速粘贴多行。若行为退化，传 `{ disablePasteBurst: true }`（官方 opt-out）。
2. **Slash 自动补全 Esc 取消（中风险，最脆弱）**：`custom-editor.ts` 经 `this as unknown as AutocompleteInternals` 访问 Editor **私有**成员 `cancelAutocomplete`/`autocompleteAbort`/`autocompleteDebounceTimer`。私有字段上游不保证稳定。回归：补全 in-flight 时按 Esc 确认取消。建议补集成测试。
3. **Markdown 渲染微变（低风险）**：0.79.2 修了 list marker preservation（`+` 列表不再渲染成 `-`）、marked 升级。回归：扫 byf 里 `+` 列表/反斜杠的渲染。
4. **Overlay 焦点恢复（低）**：0.78.1 修了 overlay focus restoration，`OverlayHandle.unfocus` 加可选参数（放宽，兼容）。回归：开关 dialog 确认焦点恢复。
5. **Node 引擎**：0.75.0 起 `engines.node >=22.19.0`（BREAKING）。byf `@types/node ^22.20.1` 已满足，CI/runtime 若无 node 20 即无影响。

`typecheck` 预期零错误（所有签名变化都是 additive）。

## Implementation Plan (small PRs)

1. **PR-1**：pi-tui 升级 0.80.6 + wire-scan 修复。独立、先行、可回滚。
2. **PR-2**：R3 纯函数抽取 + vis 改造 + 跨边界一致性测试（AC1/AC2）。
3. **PR-3**：R4 exhaustive 守护 + output_offloaded/pruning 归属 + 覆盖测试（AC3/AC4）。

PR-2 与 PR-3 可串行也可并行（R3 动 context，R4 动 records/各子系统 restore），无强依赖。

## Domain Terms

- **wire 折叠**：把 wire record / loop event 流重建为 `ContextMessage[]` 时间线的过程。
- **投影函数**：本文特指"wire record → history"的纯函数，区别于 `projector.ts` 的"history → provider 请求体"。
- **live 写 / restore 读**：wire 的两条路径——正常 turn 执行时写、resume/replay 时读。
- **漂移**：live 写与 restore 读两套代码因人肉维护而失配。

## Open Questions

（grill 后全部解决；详见上方 Assumptions/Requirements/Technical Approach 的内联结论。）

## Traceability

- **Grilled by**: grill skill，2026-07-13。hostile-eyes 审查覆盖 8 项挑战：wire-scan 字段映射（代码可答，已确认）、R3 纯函数 offload 指令（全纠，已细化）、vis 是否需 partial compaction 正确性（全纠）、exhaustive 守护兼容性（代码可答，两层分离已确认）、术语投影函数（已补 CONTEXT.md）、output_offloaded/pruning 归属（代码可答，非 bug）、pi-tui 升级风险（已查证，低风险）、不迁移 v2 的 ADR（已创建 ADR-0031）。
- **Related ADRs**: ADR-0031（暂不迁移 v2）、ADR-0010（上一代 restore 重构，本 PRD 不重做）。
- **Parent Issue**: #249。
- **Domain terms added/updated**: CONTEXT.md「Wire Records」「输出卸载 (Output Offloading)」补充 live-only 语义；新增「wire 折叠 / 投影函数」条目。
- **Sliced into**（3 个纵切，#250 先行、#251/#252 并行）:
  - #250 — pi-tui 升级 0.74→0.80.6 + wire-scan turn_begin 修复（AFK，先行，无依赖）— Done
  - #251 — 抽取 wire 折叠纯函数，消除核心/vis 投影重复（AFK，R3，与 #252 并行）— Done
  - #252 — 恢复 restoreRecord exhaustive 守护 + live-only record 文档化（AFK，R4，与 #251 并行）— Done
