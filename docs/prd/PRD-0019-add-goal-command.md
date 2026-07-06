# Autonomous Goal Mode (`/goal`)

> **Status**: Sliced | **PRD**: PRD-0019 | **Created**: 2026-07-03 | **Last updated**: 2026-07-04 | **Grilled by**: grill skill（4 ADR：0022/0023/0024/0025；二轮 grill 2026-07-04 补全 cancel 语义、replace record 序列、pause 软停/cancel 硬停、sub 工具门控、模型 CreateGoal 入口、completion clear 延迟、budget 接口与口径、status transcript 输出、compaction 计入 budget、输入锁、错误码边界）| **Sliced by**: `/story` 2026-07-04（6 issues：#200-#205）

## Goal

新增 `/goal` 斜杠命令与 agent-core 内的 goal 模式：用户给出一个**有可验证终态**的目标后，agent 自主**多轮**推进，直到模型判定完成、被阻塞、被用户暂停/取消，或触及硬预算。goal 是 agent 的**持久化结构状态**，而非对话里的文本约定。

语义参照系：Kimi Code 的 `/goal`。本 PRD 借鉴其分层架构与状态机设计，但**不照搬代码**——按 byf 现有边界（`Agent` 子系统、records 恢复、prompt-plan cache、injection projector）重写。

**MVP 范围（本次落地）**：

- 状态机：`active` / `paused` / `blocked`（持久化）+ `complete`（瞬态）+ absent。
- 预算：token / turn / wall-clock 三类硬上限 + 模型侧 `SetGoalBudget` 工具。
- 工具：`CreateGoal` / `GetGoal` / `SetGoalBudget` / `UpdateGoal`（仅 main agent）。
- 续跑驱动：`driveGoal` 在 turn 边界读状态决定续跑/停止。
- 注入：三档（active/blocked/paused）ephemeral `before_user` reminder（ADR-0022，不进 wire）。
- Records：`goal.create` / `goal.update` / `goal.clear`，含 fork 清空与 replay 降级。
- SDK + 事件：5 个 session 方法 + `goal.updated` 事件。
- slash 命令：`/goal <objective>` 与 `status|pause|resume|cancel|replace`。
- UI：footer goal badge + transcript 状态消息 + completion 卡片。

**明确不做（Out of Scope，见下文）**：goal queue（`/goal next ...`）、headless `byf -p "/goal ..."`、创建时的 permission-mode 选择弹窗。

## Motivation

- **让"长跑型"任务可被托管**。重构、迁移、批量修复这类任务天然跨多轮，当前 byf 每轮都需要用户手动"继续"。goal 模式把这个"继续"自动化，并给出明确的完成/阻塞信号。
- **把"目标"从模糊文本升级为结构化状态**。当前目标只能藏在对话里，模型每轮都要重新推断"我还在做这件事吗"。结构化的 durable goal 让模型每轮拿到一致、新鲜的提醒，也支持暂停/恢复/预算等生命周期操作。
- **对齐同类产品能力**。Claude Code、Kimi Code 已有类似机制；byf 作为 agent-assisted dev 工具缺这一层会限制可托管任务的复杂度。

## What I already know

### 参照系：Kimi Code `/goal` 的分层（去表象后）

核心本质只有一个问题的回答——**"一个 turn 何时算结束？"**。普通 turn 模型自然停就结束；goal turn 只有当持久化状态说"完成/放弃"或硬上限说"停止"时才结束。其余一切（状态机、注入、工具、UI、budget、permission）都是为这个决策服务的分层。Kimi 把它拆成 6 层：

| 层              | 文件                                                             | 职责                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TUI 命令        | `apps/kimi-code/src/tui/commands/goal.ts`                        | 文法解析（tagged union）+ handler switch；registry 登记 availability 函数（status/pause/cancel 始终可用，create/resume 仅 idle）                         |
| SDK Session     | `packages/node-sdk/src/session.ts:398`                           | `createGoal/getGoal/pauseGoal/resumeGoal/cancelGoal`；**故意没有 `updateGoal`**——终态只由模型经工具决定                                                  |
| agent-core 状态 | `packages/agent-core/src/agent/goal/index.ts` `GoalMode`         | 单一 durable owner；状态 `active/paused/blocked` + 瞬态 `complete`；从 agent record log 重建；`normalizeAfterReplay` 在恢复时把 `active` 降级为 `paused` |
| agent-core 工具 | `packages/agent-core/src/tools/builtin/goal/*`                   | `CreateGoal/GetGoal/SetGoalBudget/UpdateGoal`，仅 main agent；`loopTools` 在无 goal 时隐藏 mutation 工具                                                 |
| agent-core 驱动 | `packages/agent-core/src/agent/turn/index.ts:393` `driveGoal`    | 真正的发动机：顺序跑普通 turn，每次 turn 边界读 goal 状态决定续跑/停止；interrupt→pause，fail→pause，budget→block                                        |
| agent-core 注入 | `packages/agent-core/src/agent/injection/goal.ts` `GoalInjector` | 在**续跑边界**（非每 step）追加-only 注入，保护 prompt cache；三档强度                                                                                   |

**值得借鉴的设计判断（思想，非代码）**：

1. **终态决策权三权分立**：模型=完成/阻塞（经工具），用户=暂停/取消（经 SDK/slash），runtime=预算耗尽/中断（经 driver）。三者不互相覆盖。
2. **durable owner 单例**：每 agent 至多一个 current goal，从 record log 重建，不另起存储。
3. **状态极简**：只有 `active/paused/blocked` 持久化，`complete` 瞬态（宣告即清空，从不停留磁盘）。`paused` 与 `blocked` 是同类（都可 resume），只差"谁停的"。
4. **续跑而非递归**：goal driver 不是新流程，而是把"用户敲 continue"自动化——每轮跑一个普通 turn，读状态，决定再来一轮。
5. **注入边界化**：goal reminder 在 turn 边界追加一次，不是每 step 注入——保护 prompt cache、避免 context O(n²) 增长。
6. **fork 即清空**：fork 时把 goal 丢掉并打 system reminder，避免残留。

### byf 现状（代码事实）

byf 当前对 goal **零支持**，是干净底座。关键扩展点已存在：

- **slash 命令注册**：`apps/cli/src/tui/commands/registry.ts` `BUILTIN_SLASH_COMMANDS`（如 `yolo`/`btw` 条目），含 `availability` 字段（`'always' | 'idle-only' | (args)=>...`）。
- **slash 命令解析**：`apps/cli/src/tui/commands/resolve.ts` `resolveSlashCommandInput` → 区分 `builtin/skill/message/blocked/invalid`；`availability: 'idle-only'`（默认）在 `isStreaming`/`isCompacting` 时返回 `blocked`。
- **slash 命令分发**：`apps/cli/src/tui/byf-tui.ts:1370` `handleBuiltInSlashCommand`（单体 switch，每个 `BuiltinSlashCommandName` 都有 case）。AGENTS.md 规定复杂执行逻辑下沉到 `src/tui/actions/`。
- **SDK Session**：`packages/node-sdk/src/session.ts`，每方法 = 一段 `rpc` 转发（如 `setPermission:174`、`compact:185`）。
- **SDK RPC**：`packages/node-sdk/src/rpc.ts`，每方法转发 `sessionId` + payload 到 `core-impl`。
- **agent-core RPC 接口**：`packages/agent-core/src/rpc/core-api.ts` `AgentAPI`（line 236）+ `SessionAPI`（line 266）+ `CoreAPI`（line 280）；实现 `SessionAPIImpl`（`packages/agent-core/src/session/rpc.ts:47`）与 `ByfCore`（`rpc/core-impl.ts`）。
- **Agent 类与子系统**：`packages/agent-core/src/agent/index.ts:119`，子系统化模式（`records`/`fullCompaction`/`context`/`config`/`turn`/`injection`/`permission`/`usage`/`tools`/`background`/`replayBuilder`）。构造里依次 new，最后 `records.registerHandlers({context,config,usage,turn,permission,tools,fullCompaction})`。AGENTS.md 硬规则：`Agent` 类必须能独立使用，构造不能强制要 `Session`/`agentId`——goal 子系统照此拿 `Agent` 引用即可。
- **turn 流程**：`packages/agent-core/src/agent/turn/index.ts`，`turnWorker`（line 215）目前只跑一轮（hook → runTurn → emit `turn.ended`）。续跑循环是**新增**点。
- **注入**：`packages/agent-core/src/agent/injection/manager.ts`，当前只有 `PermissionModeInjector` + `TimestampInjector`；`inject()` 在每 step 的 `beforeStep` 调（`turn/index.ts:401`）。byf 注入分两类：**持久化 message**（`context.appendSystemReminder(content, origin)`，origin 含 `system_trigger`/`injection`/`hook_result`/`user`，见 `context/index.ts:72` 与 `context/types.ts:51`）与**临时 injection**（projector 的 `after_system`/`before_user` 位置，见 `context/projector.ts:46-62`）。
- **prompt-plan cache 结构**：byf 有比 kimi 更显式的缓存分块——`packages/agent-core/src/prompt-plan/builder.ts` + `packages/kosong/src/prompt-plan.ts`。goal reminder **必须**走 ephemeral `before_user` 注入（`getEphemeral()`），**不**进 wire、不破坏 cache prefix（kimi 的持久化追加方案被否，见 ADR-0022）。
- **records 恢复**：`packages/agent-core/src/agent/records/index.ts`，`registerHandlers({key: handler})` + `RecordRestoreHandler` 接口（`restore-handler.ts:33`，方法 `restoreRecord(record)`）；`getHandlerKey` 把 record type 前缀映射到 handler key（如 `context.* → context`）。`AgentRecordEvents`（`records/types.ts:11`）枚举所有 record 类型。
- **事件**：`packages/agent-core/src/rpc/events.ts`，`AgentEvent` 联合（line 315）；`Event = AgentEvent & {agentId, sessionId}`（line 353）。新增事件加进联合即可。
- **工具注册**：`packages/agent-core/src/agent/tool/index.ts:461` `initializeBuiltinTools`，按条件 new 工具并 filter；`loopTools`（line 409）返回模型可见工具列表。这里加 goal 工具 + 存在性门控。
- **错误码**：`packages/agent-core/src/errors.ts`，需加 `GOAL_*` 系列码。
- **TUI transcript**：`apps/cli/src/tui/types.ts` 定义 transcript entry 形状；`components/messages/` 下注册 renderer（见 AGENTS.md "New transcript message types"）。
- **TUI footer**：`apps/cli/src/tui/components/chrome/footer`，badge 注册位。

### 关键技术发现

1. **🔴 续跑循环必须复用现有 `runTurn`，不发明新流程**。byf 的 `turnWorker`（`turn/index.ts:215`）目前硬编码"跑一轮就 return"。goal 续跑 = 抽出"跑一轮普通 turn"为内部方法（命名 `runOneTurn`），外层 `turnWorker` 根据是否有 active goal 决定走单轮还是 `driveGoal` 循环。这跟 kimi 的 `turnWorker → driveGoal → runOneTurn` 同构，但落在 byf 已有的 hook/compaction/dedup 路径上。
2. **🔴 goal reminder 走 ephemeral `before_user`，不走持久化 message**（grill 决议，ADR-0022）。byf 有两层注入：持久化（`appendSystemReminder`，进 wire + 进 cache prefix）与 ephemeral（`getEphemeral()`，projector `before_user`，不进 wire、不破坏 cache）。projector 注释（`context/projector.ts:53`）明确"Prefer `before_user` for all new injectors"。`GoalInjector` 实现 `getEphemeral()`，每 step 重生，三档强度。这比 kimi 的"边界追加持久化 message"更适合 byf（wire 不膨胀、cache 不被污染、resume 后 paused 档语义自然正确）。
3. **🔴 records 恢复顺序依赖**。`AgentRecords.registerHandlers` 在构造末尾调用，`replay()` 在 `Agent.resume()`（`agent/index.ts:399`）里调。goal handler 必须在 records 注册时加入，并在 replay 时正确重建状态——包括把 `active` 降级为 `paused`（因为续跑只在 live turn 内推进，进程重启后 active goal 不可能还在跑）。
4. **🔴 fork 总是清空 goal，靠 fork 路径追加 `goal.clear` record**（grill 决议，ADR-0023）。byf fork 是目录复制 + wire.jsonl 截断 + 重放（ADR-0020），**不经 live agent 的 records replay**。决策：`SessionStore.fork` 截断后若前缀含 `goal.create` 则追加一条 `goal.clear` record。不追加 fork reminder（ephemeral 注入下无 goal 即无提示）。
5. **预算的 wall-clock 计时**。kimi 用 `wallClockResumedAt` 锚点 + 离开 active 时折叠的方式，保证 mid-turn 读取也准确。byf 照此实现，但注意 `normalizeAfterReplay` 必须清零 `wallClockResumedAt`（进程重启后计时锚点失效）。
6. **🔴 `UpdateGoal` 不设 stopTurn，靠 driver 边界读状态**（grill 决议，ADR-0024）。byf 的 `ExecutableToolSuccessResult`（`loop/types.ts:64`）没有 `stopTurn`，只有 error result 有（`:87`）。决策：不改 loop 层，`UpdateGoal` 返回普通 success，当前 turn 让模型自然走完（通常调完就停），driver 在 `runOneTurn` 返回后读 status 决定续跑/停止。complete 后可能多跑几个工具调用，可接受。
7. **completion 是瞬态，文本由 CLI 层生成，clear 延迟到 driver 边界**。`markComplete` 在工具内**只**置 `complete` 瞬态 + emit `goal.updated({snapshot, change:{kind:'completion'}})`，CLI 用纯函数从 snapshot 渲染卡片（agent-core 不生成文本）；**不**立即 clear。driver 在 `runOneTurn` 返回后读到 `complete`，才 clear durable record 并 emit `goal.updated({snapshot:null})`。理由：ADR-0024 允许 complete 后当前 turn 多跑工具调用，立即 clear 会让这些多跑的工具调用失去 goal 上下文（reminder 为空），与 ADR-0024"多跑的工具调用是在已知 goal 终态下执行（reminder 已反映新状态）"的陈述矛盾。延迟 clear 保证多跑期间 reminder 仍反映 complete 档，driver 边界才落地为 absent。两个事件按序到达（completion 卡片先、null snapshot 后），UI 据此"先显示卡片再隐藏 badge"，且 badge 在 turn 中途不闪烁。

## Assumptions

- goal 模式仅对 **main agent** 启用（sub/independent agent 不持有 goal）。与 kimi 一致。
- 续跑 turn 的 input 是一段固定的 continuation prompt（如 `"Continue pursuing the active goal."`），origin 为新增的 `goal_continuation`（属于 `system_trigger` 类）。这段不进 slash 历史，但**进** wire.jsonl（保证 resume 可重现）。
- 预算单位：turns（整数）、tokens（整数）、wall-clock（毫秒，模型侧工具接受 seconds/minutes/hours 换算）。
- goal 状态查询（`/goal status`、`GetGoal`）始终可用；`pause`/`cancel` 也始终可用（它们需要能中断 streaming 中的 goal）；`create`/`resume`/`replace` 在 streaming 时被 `idle-only` 拦截（它们要发起新 turn）。
- completion 卡片文本由 **CLI 层**纯函数从 `goal.updated` 事件的 snapshot 生成（agent-core 只 emit 事件）；live 与 replay 一致性靠"同事件 + 同纯函数"保证。

## Open Questions

> 全部在 `/grill` 阶段解决。决议见下，相关 ADR：0022 / 0023 / 0024。

- ✅ **OQ-1（ToolExecution stopTurn）**：byf 的 `ExecutableToolSuccessResult`（`loop/types.ts:64`）**没有** `stopTurn`，只有 `ExecutableToolErrorResult` 有（`:87`）。决策：**不改 loop 层**，`UpdateGoal` 返回普通 success，driver 在 turn 边界读状态停止续跑。见 **ADR-0024**。
- ✅ **OQ-2（fork 路径）**：byf fork 是目录复制 + wire.jsonl 截断 + 重放（ADR-0020），**不经 records replay on a live agent**。决策：**fork 总是清空 goal**——`SessionStore.fork` 截断后若前缀含 `goal.create` 则追加一条 `goal.clear` record。不追加 fork reminder（ephemeral 注入机制下无 goal 即无提示）。见 **ADR-0023**。
- ✅ **OQ-3（continuation prompt 位置）**：放 `agent/goal/constants.ts`，便于后续 i18n。
- ✅ **OQ-4（blocked reason 进事件）**：进。`goal.updated` 的 `change.reason` 携带，UI badge 显示 ⚠ + reason。
- ✅ **OQ-5（预算耗尽处理）**：直接 `markBlocked({reason:'A configured budget was reached'})`，不先 warning。
- ✅ **OQ-6（grill 新增 - reminder 注入机制）**：原 PRD 误写"走 `appendSystemReminder` 追加-only"。byf 有两层注入，projector 注释（`context/projector.ts:53`）明确"Prefer `before_user` for all new injectors"。决策：**走 ephemeral `before_user`**（实现 `getEphemeral()`），不进 wire、不破坏 cache prefix。见 **ADR-0022**。
- ✅ **OQ-7（grill 新增 - completion 文本生成层）**：原 R14 误写"agent-core 生成"。修正：agent-core 只 emit `goal.updated({snapshot, change})` 事件，**CLI 层**用纯函数从 snapshot 渲染卡片。live/replay 一致性靠"同事件 + 同纯函数"保证。
- ✅ **OQ-8（grill 新增 - continuation origin）**：用 `turn.prompt` record + origin `{kind:'system_trigger', name:'goal_continuation'}`。进 wire，replay 时作为 system trigger 重放。

## Requirements

### 功能需求

- **R1**（命令注册）：`/goal` 注册到 `BUILTIN_SLASH_COMMANDS`，`availability` 函数对 `status`/`pause`/`cancel` 返回 `'always'`，对其余返回 `'idle-only'`。
- **R2**（命令文法）：`parseGoalCommand(rawArgs)` 返回 tagged union：`status | pause | resume | cancel | create{objective,replace,budget?} | error{message,severity?}`。`--` 用于让以保留字开头的 objective 被正确解析。objective 长度上限 4000 字符。create 支持可选 budget flag：`--max-turns N`（整数）、`--max-tokens N`（整数）、`--max-seconds N`（整数秒，内部换算 ms）；flag 可任意组合，省略的字段为 `undefined`（无该维度的硬上限）。`/goal replace [--max-turns N ...] <objective>` 的 budget flag 作用于新 goal。
- **R3**（状态机）：
  - absent → `active`（create，含 replace 语义：已有 goal 时必须 `replace:true` 才覆盖，否则 `GOAL_ALREADY_EXISTS`）。`replace` 是**原子地 cancel 旧 goal + create 新 goal**：写入 wire 的 record 序列为 `goal.clear`（旧）→ `goal.create`（新），不是 update；旧 goal 不走 completion 路径，不发 completion `goal.updated` 事件。
  - `active` → `paused`（用户 pause **软停**——只置状态，当前 turn 跑完后 driver 读到 paused 停止续跑；**不** abort 当前 turn，保护进行中工具调用的原子性 / interrupt / fail / 进程重启降级）。
  - `active` → `blocked`（模型 `UpdateGoal('blocked')` / 预算耗尽 / UserPromptSubmit hook 拦截）。
  - `active` → `complete`（瞬态，模型 `UpdateGoal('complete')`，工具内置 complete 瞬态 + emit completion 事件）→ driver 在 turn 边界读到 complete 后 clear 回 absent（关键技术发现 #7，不立即 clear）。
  - `paused`/`blocked` → `active`（resume）。
  - 任意持久化态 → absent（cancel **硬停**——立即 abort 当前 turn 的 AbortSignal，等价 Esc，再 clear goal 记录；半成品工具调用状态由用户承担）。
- **R4**（预算）：`GoalBudgetLimits {tokenBudget?, turnBudget?, wallClockBudgetMs?}`。`computeBudgetReport` 给出 remaining 与 `overBudget` 布尔。driver 在每个续跑迭代开始与结束时检查 `overBudget`，超了则 `markBlocked({reason:'A configured budget was reached'})` 并停止。**计数口径**：`turnBudget` = driver 跑过的轮数（含首个 turn + 每个 continuation turn）；`tokenBudget` = driver 每轮把本轮 turn token（input+output，含 reminder 注入与 compaction 摘要 token）累加到 goal 的 `tokenUsed`——**只算 driver 跑的 turn**，paused/blocked 期间用户普通 turn 不经 driver，不计入；`wallClockBudgetMs` = active 区间累加的墙钟（见关键技术发现 #5）。
- **R5**（驱动）：`driveGoal` 循环——每次迭代：检查预算 → `incrementTurn` → `runOneTurn` → 按 `turn.ended.reason` 与读到的 goal 状态决定续跑/停止。`cancelled`→`pauseOnInterrupt`，`failed`→`pauseActiveGoal`，hook 拦截→`markBlocked`。
- **R6**（注入）：`GoalInjector extends DynamicInjector`，实现 `getEphemeral()`（**不**实现 `getInjection()`），走 projector `before_user` 位置，每 step 重新生成。三档：active=完整 reminder+budget 指引；blocked=轻提示+objective；paused=守卫提示。无 goal 时返回空数组。**不**进 wire、**不**破坏 cache prefix。见 **ADR-0022**。
- **R7**（工具，两层门控）：
  - **注册层**：`initializeBuiltinTools` 仅在 `agent.type === 'main'` 时 new 这 4 个 goal 工具（`CreateGoal`/`GetGoal`/`SetGoalBudget`/`UpdateGoal`）。非 main agent（sub/independent）根本不注册，工具表里没有，模型 schema 看不到——保证 sub agent 永远无法触碰 goal。
  - **loopTools 层**：main agent 的 `loopTools` 加 goal 存在性门控——无 goal 时隐藏 `SetGoalBudget`/`UpdateGoal`（mutation 工具），`CreateGoal`/`GetGoal` 始终可见。
  - **工具参数 schema**：
    - `CreateGoal`：`{objective: string, replace?: boolean, budget?: {turnBudget?, tokenBudget?, wallClockBudgetMs?}}`——创建时可选带初始 budget（避免模型发两次工具调用）。
    - `SetGoalBudget`：`{turnBudget?, tokenBudget?, wallClockBudgetMs?}`——部分更新，未传字段保留原值（不会清零未传字段）。
  - `UpdateGoal` 的 status 取值 `active/complete/paused/blocked`。
- **R8**（records）：新增 `goal.create`/`goal.update`/`goal.clear` 三类 record。`GoalMode implements RecordRestoreHandler`，`restoreRecord` 据类型重建/更新/清空。`AgentRecords.registerHandlers` 加入 `goal`。`getHandlerKey` 把 `goal.*` 映射到 `goal`。
- **R9**（replay 降级）：`normalizeAfterReplay` 在 replay 完成后调用：`active`→`paused`（reason `Paused after agent resume`），`complete`→清空，`paused`/`blocked` 保留。清零 `wallClockResumedAt`（进程重启后旧锚点无意义），但**保留**已累积的 `wallClockMs`/`turnBudget`/`tokenBudget` 计数——budget 是用户设定的硬上限，重启不"赠送"额外时间，paused 状态下不计时，resume 时锚定新锚点继续累加；若已达上限，resume 时 driver 首次 `overBudget` 检查立即 `markBlocked`。
- **R10**（fork 清空）：fork **总是清空 goal**。`SessionStore.fork` 截断 wire.jsonl 后，若截断前缀含 `goal.create` record，则向新会话 wire 追加一条 `goal.clear` record。**不**追加 fork reminder（ephemeral 注入下无 goal 即无提示）。见 **ADR-0023**。
- **R11**（SDK）：`Session.createGoal(objective, options?: {replace?, budget?})`/`getGoal()`/`pauseGoal()`/`resumeGoal()`/`cancelGoal()`，转发到 `core-impl` → `SessionAPIImpl` → `Agent.goal.*`。**无 `updateGoal`**（终态由模型经工具决定）；**无 `setGoalBudget`**（budget 经 slash flag 或 `CreateGoal`/`SetGoalBudget` 工具设置，SDK 不单独暴露调整方法）。
- **R12**（事件）：`GoalUpdatedEvent {type:'goal.updated', snapshot: GoalSnapshot|null, change?: GoalChange}`。snapshot 变化（含 null）必发；纯 token/wall-clock 计步可用 `silent` 抑制。
- **R13**（UI - badge）：footer 显示当前 goal 状态徽标（无/▶active/⏸paused/⚠blocked）+ 用量摘要（turns/tokens/elapsed）。`/goal status` 始终向 transcript 输出一行状态快照（objective + status + budget remaining），**不**开浮层——与 lifecycle marker/badge 同一信息通道；streaming 时该行会被滚动覆盖，用户需往上翻（与其它 transcript 输出一致）。
- **R14**（UI - transcript）：goal 生命周期变化（pause/resume/blocked/cancel）渲染低存在感 marker；**仅 completion** 渲染独立卡片（objective + reason + 最终用量）。`cancel` 是用户主动丢弃，**不**渲染 completion 卡片，只渲染 lifecycle marker（与 pause/resume/blocked 同档）。`/goal status` 的状态行也属 transcript 通道，与 marker 同档渲染。卡片文本由 **CLI 层**纯函数从 `goal.updated` 事件的 snapshot 生成（agent-core 只 emit 事件）；live 与 replay 一致性靠"同事件 + 同纯函数"保证。
- **R15**（错误码）：新增 `GOAL_*` 系列，触发条件：
  - `GOAL_NOT_FOUND`：操作要求存在 goal 但当前 absent（`/goal resume`/`pause`/`cancel`、`GetGoal`/`SetGoalBudget`/`UpdateGoal` 工具在无 goal 时）。
  - `GOAL_ALREADY_EXISTS`：create 时已有 goal 且未带 `replace:true`。
  - `GOAL_OBJECTIVE_EMPTY`：create/replace 的 objective 为空字符串或纯空白。
  - `GOAL_OBJECTIVE_TOO_LONG`：objective 超过 `MAX_GOAL_OBJECTIVE_LENGTH`（4000 字符）。
  - `GOAL_STATUS_INVALID`：`UpdateGoal` 工具传入非 `active/complete/paused/blocked` 的 status 值。
  - `GOAL_NOT_RESUMABLE`：`/goal resume` 时 goal 存在但 status 非 `paused`/`blocked`（如 active——正在跑——resume 无意义；或 complete 瞬态）。
  - `GOAL_BUDGET_INVALID`：budget 值非法（负数、非整数、turn/token < 0、wall-clock ≤ 0 等）。

### 非功能需求

- **N1**：goal reminder 注入不得破坏 prompt-plan cache 前缀——走 ephemeral `before_user`（实现 `getEphemeral()`），不进 wire、不进缓存 prefix（见 ADR-0022）。
- **N2**：续跑循环不得在 compaction/streaming 时抢资源——driver 内每次迭代都走正常 `runOneTurn`，享受既有的 compaction/dedup/hook 路径。
- **N3**：records 体积可控——`goal.update` 在纯计步时 silent（不每步 emit UI 事件），但**仍写 record**（保证 replay 一致）。
- **N4**：tests 跟随既有放置规则（AGENTS.md）：parser 测试在 `apps/cli/test/tui/commands/`；core 测试在 `packages/agent-core/test/agent/` 与 `test/tools/`；SDK 测试在 `packages/node-sdk/test/`。**不新增泛化测试文件**。

## Acceptance Criteria

- **AC-1**：`/goal Ship feature X` 在空闲 session 中创建 active goal，footer 出现 ▶ badge，agent 自主多轮推进；模型调 `UpdateGoal('complete')` 后 badge 消失、transcript 出现 completion 卡片、record log 含 `goal.create`+`goal.update(complete)`+`goal.clear`。
- **AC-2**：goal 推进中按 Esc 中断 → 当前 turn 被 abort（`turn.ended.reason='cancelled'`），driver `pauseOnInterrupt`，goal 变 `paused`，badge 变 ⏸；`/goal resume` 后恢复推进。（Esc 与 `/goal pause` 走不同实现：Esc=abort 路径，pause slash=软停只置状态。）
- **AC-3**：模型调 `UpdateGoal('blocked', reason)` → goal 变 `blocked`，badge 变 ⚠ 并显示 reason；`/goal resume` 可恢复。
- **AC-4**：创建带 budget 的 goal（`/goal --max-turns 3 <objective>`、或 `CreateGoal({objective, budget:{turnBudget:3}})`、或创建后经 `SetGoalBudget({turnBudget:3})`），第 3 轮后 driver 自动 `markBlocked({reason:'A configured budget was reached'})`，不再续跑。
- **AC-5**：已有 active goal 时 `/goal Another thing` 报 `GOAL_ALREADY_EXISTS`；`/goal replace Another thing` 覆盖（wire 序列 `goal.clear`→`goal.create`，旧 goal 不发 completion 事件）。
- **AC-6**：kill 进程后 `byf` resume 同 session → goal 自动降级为 `paused`（reason `Paused after agent resume`），`/goal resume` 可继续。
- **AC-7**：fork session → fork 后无 goal：无 goal badge、reminder 因无 goal 自然为空（ephemeral `before_user` 在无 goal 时返回空，ADR-0022）；wire 前缀若含 `goal.create` 则 fork 后追加一条 `goal.clear` record（ADR-0023）。**不**出现 fork reminder。
- **AC-8**：streaming 中 `/goal status`、`/goal pause`、`/goal cancel` 始终可用。`/goal pause` = **软停**（置 paused，不 abort 当前 turn，等当前 turn 跑完 driver 停止续跑）；`/goal cancel` = **硬停**（立即 abort 当前 turn 的 AbortSignal + clear goal，等价 Esc）。`/goal <objective>`、`/goal resume`、`/goal replace ...` 被拦截并提示先 Esc。
- **AC-9**：compaction 发生在 goal 推进中 → compaction 后 reminder 重新注入（ephemeral 每 step 重算），goal 状态与预算计数不丢（goal 状态在 `GoalMode` 实例，不在 history）。compaction 耗时计入 wall-clock budget、compaction 的 LLM 摘要 token 计入 token budget——budget 诚实反映 goal 总成本，不因 compaction 是"引擎开销"而豁免。
- **AC-10**：sub agent（如 `/btw` 触发的旁路、Agent 工具的子 agent）**不**持有 goal，`loopTools` 不含 goal 工具。

## Definition of Done

- 上述 AC-1..AC-10 全部通过，含单元测试与（适用项的）集成测试。
- `pnpm typecheck` / `pnpm lint` / `pnpm test` 全绿。
- 文档：`docs/zh/reference/slash-commands.md` 与 `docs/en/reference/slash-commands.md` 加入 `/goal`；新增 `docs/zh/guides/goals.md` 与 `docs/en/guides/goals.md`（参照 kimi 的 goals 指南）。
- 按 `gen-changesets` 规则生成 changeset（预期 `minor`：新增能力，无破坏性变更；若 SDK/事件类型加入导致外部类型推断变化，仍是 minor）。
- 不在 commit/PR 文本中暴露 agent 身份。

## Out of Scope（本次不做，留待后续）

- **goal queue**：`/goal next <objective>`、`upcoming-goals.json` sidecar、queue manager 对话框、完成自动提升、blocked 时排队提示。依赖 TUI 对话框子系统与 sidecar 文件，本次先做单 current goal。
- **headless 模式**：`byf -p "/goal <objective>"` 一发即跑完输出 summary 后退出。需要额外 CLI 解析 + 终态 waiter + summary 序列化。
- **创建时的 permission-mode 选择弹窗**：kimi 在 manual/yolo 模式下 `/goal <obj>` 会弹窗让用户选权限模式。byf 直接复用当前 permission 系统，不额外弹窗。
- **goal queue 之外的多 actor 跟踪可视化**：runtime/model/user 区分的详细时间线。budget 与状态变化已记录 actor，但 UI 不做专门可视化。
- **headless goal summary 的 JSON/markdown 输出格式**。

## 技术方案

### 分层与文件落点

| 层                  | byf 文件（新增/改动）                                                                             | 说明                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| agent-core 状态     | `packages/agent-core/src/agent/goal/index.ts`（新）                                               | `GoalMode` 类 + 类型 `GoalStatus/GoalSnapshot/GoalBudgetLimits/GoalChange/...`。implements `RecordRestoreHandler`。                                                                                                     |
| agent-core 常量     | `packages/agent-core/src/agent/goal/constants.ts`（新）                                           | `GOAL_CONTINUATION_PROMPT`、`GOAL_CONTINUATION_ORIGIN`（`{kind:'system_trigger', name:'goal_continuation'}`）、`MAX_GOAL_OBJECTIVE_LENGTH`。**不含** `GOAL_FORK_CLEARED_REMINDER`（ephemeral 注入下不需要，ADR-0023）。 |
| agent-core 工具     | `packages/agent-core/src/tools/builtin/goal/{create,get,update,set-budget}-goal.ts` + `.md`（新） | 4 个工具 + 描述 markdown。`UpdateGoal` 返回普通 success（**不**设 stopTurn，ADR-0024）。`outcome-prompts.ts`（completion summary / blocked reason prompt 构造）。                                                       |
| agent-core 驱动     | `packages/agent-core/src/agent/turn/index.ts`（改）                                               | 抽出 `runOneTurn`，`turnWorker` 加 goal 路由，新增 `driveGoal`。driver 在 `runOneTurn` 返回后读 goal status 决定续跑/停止。                                                                                             |
| agent-core 注入     | `packages/agent-core/src/agent/injection/{manager.ts 改, goal.ts 新}`                             | `GoalInjector extends DynamicInjector`，实现 `getEphemeral()`（**不**实现 `getInjection()`），走 projector `before_user`。加入 `injectors` 数组。见 ADR-0022。                                                          |
| agent-core 工具注册 | `packages/agent-core/src/agent/tool/index.ts`（改）                                               | `initializeBuiltinTools` 加 4 工具（`agent.type === 'main'`）；`loopTools` 加 goal 存在性门控（无 goal 时隐藏 `SetGoalBudget`/`UpdateGoal`）。                                                                          |
| agent-core records  | `packages/agent-core/src/agent/records/{types.ts 改, index.ts 改}`                                | `AgentRecordEvents` 加 `goal.create/update/clear`；`getHandlerKey` 加 `goal.* → goal`。                                                                                                                                 |
| agent-core Agent    | `packages/agent-core/src/agent/index.ts`（改）                                                    | 加 `goal: GoalMode` 字段 + 构造里 new + `registerHandlers({..., goal: this.goal})`。                                                                                                                                    |
| agent-core 事件     | `packages/agent-core/src/rpc/events.ts`（改）                                                     | 加 `GoalUpdatedEvent`；加入 `AgentEvent` 联合。                                                                                                                                                                         |
| agent-core RPC      | `packages/agent-core/src/rpc/{core-api.ts 改, core-impl.ts 改}` + `session/rpc.ts 改`             | `AgentAPI` 加 5 方法；`SessionAPIImpl`/`ByfCore` 实现。                                                                                                                                                                 |
| agent-core 错误码   | `packages/agent-core/src/errors.ts`（改）                                                         | `GOAL_*` 系列。                                                                                                                                                                                                         |
| **fork 路径（新）** | `packages/agent-core/src/session/store/session-store.ts`（改）                                    | `fork` 截断 wire.jsonl 后，若前缀含 `goal.create` 则追加 `goal.clear` record。见 ADR-0023。                                                                                                                             |
| node-sdk            | `packages/node-sdk/src/{session.ts 改, rpc.ts 改, types.ts 改, events.ts 改}`                     | 5 个 Session 方法 + RPC 转发 + 类型 re-export。                                                                                                                                                                         |
| CLI - 命令          | `apps/cli/src/tui/commands/{registry.ts 改, goal.ts 新, index.ts 改}` + `byf-tui.ts 改`           | registry 登记 + `parseGoalCommand`/`handleGoalCommand` + dispatch case。复杂逻辑下沉 `apps/cli/src/tui/actions/goal.ts`（新）。                                                                                         |
| CLI - UI            | `apps/cli/src/tui/components/{chrome/footer 改, messages/goal-*.ts 新}` + `types.ts 改`           | badge + transcript marker + completion 卡片。                                                                                                                                                                           |
| CLI - 事件          | `apps/cli/src/tui/events/goal-event-handler.ts`（新） + `byf-tui.ts handleEvent 改`               | 处理 `goal.updated`。                                                                                                                                                                                                   |
| 文档                | `docs/{zh,en}/guides/goals.md`（新）+ `docs/{zh,en}/reference/slash-commands.md`（改）            | 用户指南 + 命令参考。                                                                                                                                                                                                   |

### 数据流（创建到完成）

**两个创建入口，收敛到同一个 driver：**

- **slash 入口**：用户敲 `/goal <objective>` → 首个 turn 的 user input = objective 本身（origin=user）。
- **模型工具入口**：模型在普通 turn 内调 `CreateGoal({objective})` → 首个 turn 的 user input = 用户原话，objective 由模型在工具参数里给出。`CreateGoal.execute()` 调 `goal.createGoal` 后返回普通 success，当前 turn 继续跑（reminder 已是 active 档），turn 结束时 driver 读到 active 接管续跑。

两条路径都使 goal 进入 `active`、写入 `goal.create` record，并在首个 turn 结束时由 `driveGoal` 接管。

```
入口 A: 用户敲 /goal Ship feature X
  → parseGoalCommand → {kind:'create', objective, replace:false}
  → handleGoalCommand → actions/goal.ts
  → Session.createGoal → rpc → SessionAPIImpl → Agent.goal.createGoal
    → persistState(active) → emit goal.updated({snapshot}) → records goal.create
  → sendNormalUserInput(objective)  [发起首个 turn，origin=user]

入口 B: 模型在普通 turn 内调 CreateGoal({objective})
  → CreateGoal.execute() → Agent.goal.createGoal
    → persistState(active) → emit goal.updated({snapshot}) → records goal.create
    → 返回普通 success（无 stopTurn，ADR-0024），当前 turn 继续跑
  [首个 turn 的 user input 是用户原话，objective 在工具参数里]

收敛 → turnWorker: initialGoalStatus==='active' → driveGoal
  loop:
    check budget → incrementTurn → runOneTurn
      → beforeStep: injection.inject()
          → PermissionMode/TimestampInjector.inject() [持久化]
          → GoalInjector.getEphemeral() [ephemeral before_user，每 step 重生]
      → 模型可能调 UpdateGoal('complete') → goal.markComplete → 置 complete 瞬态 + records goal.update(complete) + emit goal.updated({snapshot, change:{kind:'completion'}})
        [当前 turn 不立即 clear；complete 后若模型继续跑工具调用，reminder 仍反映 complete 档]
    [turn 自然结束]
    read goal.status:
      complete → driver clear durable record → records goal.clear → emit goal.updated({snapshot:null}) → return
      null（不应出现，complete 必经 driver clear）/其他非active → return
      overBudget → markBlocked → return
      否则 → 下一轮（continuation turn，origin=system_trigger/goal_continuation）
  → CLI 收到 completion 事件，纯函数渲染 completion 卡片入 transcript
  → CLI 收到 driver 发的 null snapshot → 隐藏 badge
```

### 续跑循环与 byf 既有路径的协同

- **compaction**：续跑每轮走 `runOneTurn`，享有既有的 `fullCompaction.beforeStep/afterStep`。compaction 后 reminder 自动重新生成（ephemeral 每 step 重算，无需像持久化方案那样专门"compaction 后重注入"）。
- **dedup**：`ToolCallDeduplicator` 是 per-turn 的，续跑每轮重置，不受 goal 影响。
- **steer**：用户在 goal 推进中 steer，`flushSteerBuffer` 在 `beforeStep` 调——steer 内容追加到当前 turn，goal driver 不需特殊处理。
- **输入锁（用户普通消息）**：driver 推进期间 TUI 视为 streaming 等价态——`idle-only` 命令被拦、普通新消息输入被锁。用户要发新 turn 必须先 `/goal pause` 或 Esc（goal 进 paused），再发普通消息。即 driver 推进期间**只允许 steer**（追加到当前 turn），不允许新 turn——避免用户 turn 与 goal continuation turn 交错导致 driver 状态机混乱（用户 turn 结束时 goal 仍 active，driver 会续跑，下一轮 continuation 又来，用户消息被夹中间）。
- **hook**：`UserPromptSubmit` hook 拦截 continuation prompt 时，driver `markBlocked({reason:'Blocked by UserPromptSubmit hook'})`（与普通 turn 一致）。
- **fork**：`SessionStore.fork` 截断后追加 `goal.clear`（若前缀含 `goal.create`），fork 后会话无 goal（ADR-0023）。

### 预算计时的 wall-clock 实现

`GoalState.wallClockResumedAt`：进入 active 时锚定 `Date.now()`，离开 active 时折叠进 `wallClockMs`，replay 时清零。`liveWallClockMs(state, now)` 报告时加上当前 active 区间的增量，保证 mid-turn 读取准确。`normalizeAfterReplay` 必须清零锚点（进程重启后旧锚点无意义）。

## 实现拆分（建议 5 个垂直切片，每片可独立 PR）

> 每片都包含相应测试，按 AC 对应验收。顺序按依赖关系。

1. **Slice-1：agent-core 状态机 + records + 事件 + fork 清空（无驱动、无工具、无 UI）**
   - `agent/goal/{index.ts, constants.ts}`、`records/types.ts`、`rpc/events.ts`、`errors.ts`、`Agent` 字段、`session/store/session-store.ts` fork 路径追加 `goal.clear`。
   - AC-6（replay 降级）、AC-7（fork 清空）。
   - 测试：`packages/agent-core/test/agent/goal.test.ts`（状态机迁移、预算计算、replay 降级）+ 扩展 `test/session/` 既有 fork 测试覆盖 goal.clear 追加。

2. **Slice-2：驱动 + 注入（让 active goal 真正续跑）**
   - `agent/turn/index.ts`（`runOneTurn` + `driveGoal` + turnWorker goal 路由）、`agent/injection/{manager.ts, goal.ts}`（`GoalInjector.getEphemeral()`）。
   - 依赖 Slice-1。AC-1（完成闭环）、AC-2（interrupt→pause）、AC-4（预算耗尽→block）、AC-9（compaction 协同）。
   - 测试：扩展 `test/agent/` 既有 turn 测试 + `test/agent/injection/` 既有 injection 测试（验证 ephemeral before_user 渲染）。

3. **Slice-3：工具（Create/Get/Update/SetBudget）+ loopTools 门控**
   - `tools/builtin/goal/*`、`agent/tool/index.ts`。`UpdateGoal` 返回普通 success（ADR-0024，driver 边界停 turn）。
   - 依赖 Slice-1、2。AC-1（模型经 UpdateGoal 完成）、AC-3（blocked）、AC-4（SetGoalBudget）、AC-10（sub agent 无 goal 工具）。
   - 测试：`test/tools/goal.test.ts`。

4. **Slice-4：SDK + RPC（Session 方法 + 事件类型导出）**
   - `node-sdk/src/{session.ts, rpc.ts, types.ts, events.ts}`、`agent-core/src/rpc/{core-api.ts, core-impl.ts}`、`session/rpc.ts`。
   - 依赖 Slice-1。AC-5（createGoal/replace 错误码经 SDK 抛出）。
   - 测试：`packages/node-sdk/test/session-goal.test.ts`（参照既有 `session-set-permission.test.ts` 模式）。

5. **Slice-5：CLI slash 命令 + UI（badge/marker/completion 卡片）+ 事件处理 + 文档**
   - `apps/cli/src/tui/commands/{registry,goal,index}.ts`、`actions/goal.ts`、`byf-tui.ts`、`components/{chrome/footer, messages/goal-*}`、`events/goal-event-handler.ts`、`types.ts`、文档。
   - 依赖 Slice-4。AC-1（badge/卡片）、AC-2/3/4/8（slash 交互与可用性）。
   - 测试：`apps/cli/test/tui/commands/goal.test.ts`（parser）+ `test/tui/events/goal-event-handler.test.ts`。

## Domain Terms

- **goal**：用户给出的、有可验证终态的自主任务目标。每 agent 至多一个 current goal。
- **continuation turn**：goal driver 自动发起的、用于推进 active goal 的 turn，input 是固定 prompt，origin 是 `{kind:'system_trigger', name:'goal_continuation'}`。
- **terminal status**：`complete`（成功，瞬态，渲染 completion 卡片）或经停止后的 `paused`/`blocked`（持久化、可 resume）。`cancel`（用户主动丢弃，任意持久化态 → absent）**非** terminal status：不渲染 completion 卡片，只渲染 lifecycle marker。
- **budget**：用户/模型设定的硬上限（turn/token/wall-clock），driver 在续跑边界强制执行，超限即 `blocked`。
- **goal reminder**：注入到 context 的 goal 上下文提示，三档强度（active/blocked/paused），走 ephemeral `before_user` 注入（ADR-0022），不进 wire。

## Traceability

- **Grilled by**: grill skill，2026-07-03（一轮，ADR-0022/0023/0024）；2026-07-04（二轮，新增 ADR-0025，补全 15 项：cancel 不渲染卡片/replace record 序列/pause 软停 cancel 硬停/sub 工具两层门控/模型 CreateGoal 入口/completion clear 延迟到 driver 边界/budget slash flag 与工具 schema/replay 保留累积计数/status 走 transcript/compaction 计入 budget/driver 期间输入锁/错误码触发条件）。
- **Debugged by**: `/debug` (2026-07-06) — slash 入口 `/goal <objective>` 创建 goal 后未发起首个 user turn，导致 `turnWorker` 的 driver 接管条件（user-origin turn 结束时 goal 仍 active）永不满足，goal 卡在 active、turns/tokens 恒为 0。修复：`byf-tui.ts handleGoalCommand` 在 create 成功后调用 `sendNormalUserInput(objective)` 发起首个 turn（对齐 PRD 数据流）。
- **Debugged by**: `/debug` (2026-07-06) — footer 的 turns/tokens/elapsed 计数在 goal 推进中不刷新（恒为 0/0/0）。根因：计步方法 `incrementTurn`/`addTokenUsage` 按 N3 设计 silent（写 record 不 emit），而 `driveGoal` 从未调用补偿用的 `emitUsageUpdate()`，footer 又是纯事件驱动（无定时刷新），故只有生命周期事件（▶/⏸/⚠）送达、计数永不更新；同时 `emitUsageUpdate` 读取的 snapshot.usage.wallClockMs 在 active 期间为 0（只在离开 active 时折叠），导致 elapsed 也会恒为 0。修复：`driveGoal` 续跑前调用 `emitUsageUpdate()`；`emitUsageUpdate()` 在 active 期间把 live wall-clock 叠进 emit 的 snapshot（与 computeBudgetReport 口径一致），落盘 record 仍写折叠累积值。
- **Debugged by**: `/debug` (2026-07-06) — goal 完成后 completion 卡片与 `/goal status` 显示 `tokens=0`（elapsed 正确）。根因：`markComplete()` 在 turn **中途** 经 `UpdateGoal(complete)` 触发时 emit 的 completion 快照，读到的 `snapshot.usage.tokens=0`——因为 driver 把"本轮 token 累加进 goal"（`addTokenUsage`）放在 turn **结束之后**，而完成事件已在 `markComplete` 内部 emit 出去。后续 `addTokenUsage` 确实更新了 snapshot，但事件已发，UI（纯事件驱动的 completion 卡片 + `/goal status` 读的 snapshot）永远看不到。修复：`GoalMode` 新增 `emitFinalCompletionSnapshot()`，driver 在 token 记账后、`clearInternal` 前补发一次带最终 usage（turns=N tokens=M）的 completion 快照。回归测试在 `driver.test.ts`（修复前断言 `tokens > 0` 失败，修复后通过）。
- **Debugged by**: `/debug` (2026-07-06) — 模型在**首个 user turn 内**调 `UpdateGoal(complete)` 时，completion 卡片与 `/goal status` 显示 `turns=0 tokens=0`（elapsed 正确）。根因：`driveGoal` 是 goal 记账（`incrementTurn`/`addTokenUsage`/`emitFinalCompletionSnapshot`/`clearInternal`）的唯一发生地，但它的接管条件 `getSnapshot()?.status === 'active'` 在"首个 turn 内已完成"时为假（此时为 `complete` 瞬态）——driver 从不运行，首个 turn 既不计入 turnBudget（违反 R4），complete 瞬态也无人 clear。这与上一条"continuation turn 完成时序"是不同路径。修复：`turnWorker` 在首个 user turn 边界检测到 complete 瞬态时，镜像 driver 的 complete 分支补做结算（`incrementTurn` + `addTokenUsage` + `emitFinalCompletionSnapshot` + `clearInternal`）。回归测试在 `driver.test.ts`（修复前断言 `turns === 1` 实得 0、snapshot 残留 complete、无 `goal.clear`，修复后通过）。
- **Reviewed by**: `/review` (2026-07-06) — 三视角（Test/Code/Impact）并行 review 发现并修复 3 项：(1) `/goal cancel` 未硬停（违反 ADR-0025/AC-8）——`actions/goal.ts` cancel 分支只调 `cancelGoal()` 清状态，从不调 abort；修复：新增 `GoalActionCallbacks.abortActiveTurn()`，cancel 分支调它（接 `byf-tui.ts cancelCurrentStream` → `session.cancel()` → AbortSignal），pause 分支不调；回归测试 `commands/goal.test.ts` 锁定"cancel abort、pause 不 abort"。(2) AC-9 compaction 计入 budget 无测试——新增 `driver.test.ts` 测试，注入已知大小的 compaction-summary usage 后断言它出现在 goal 最终 tokenUsed 里（关闭注入后测试失败，证明有效性）。(3) changeset `prd-0019-goal-state-machine.md` 错误列出 `@byfriends/vis-server`（该包源码未改动，唯一 vis 改动在私有的 vis-web）——删除该行。附带：`commands/goal.ts` 条件展开 `...(budget ? {budget} : {})` 改直传（AGENTS.md 硬规则）。
- **相关 ADR**：
  - ADR-0022（Goal Reminder 走 Ephemeral Injection）
  - ADR-0023（Fork 总是清空 Goal）
  - ADR-0024（Goal 终态停止靠 Driver 边界读状态；二轮补：completion clear 延迟到 driver 边界）
  - ADR-0025（Goal Pause 软停 / Cancel 硬停）
- **相关既有 ADR**：ADR-0011（cache staking，reminder 机制需遵守）、ADR-0020（fork 截断锚点，fork 清空 goal 落在其路径上）。
- **Parent Issue**：#199（手动创建；本 PRD 由 `/think` 产出但未自动建 Issue，grill 阶段补建）。
- **Sliced by**: `/story` → Child Issues below（2026-07-04）
- **Sliced into**:
  - #200 — [PRD-0019] agent-core goal 状态机 + records + 事件 + fork 清空 (AFK)
  - #201 — [PRD-0019] goal 续跑驱动 + ephemeral reminder 注入 (AFK, blocked by #200)
  - #202 — [PRD-0019] goal 工具 + loopTools 两层门控 (AFK, blocked by #200, #201)
  - #203 — [PRD-0019] SDK + RPC (AFK, blocked by #200)
  - #204 — [PRD-0019] CLI /goal slash 命令 + 事件处理 + 文档 (AFK, blocked by #203)
  - #205 — [PRD-0019] goal UI — footer badge + completion 卡片 + transcript marker (HITL, blocked by #204)

## Research References

- Kimi Code 源码（`/home/ubuntu/Projects/kimi-code`）：状态机、驱动、注入、工具、records、SDK、TUI 命令的分层范本。本 PRD 借鉴其架构思想，按 byf 边界重写，不照搬代码。**关键差异**（grill 确认）：(1) reminder 走 byf ephemeral 而非 kimi 持久化追加；(2) fork 清空靠追加 `goal.clear` record 而非 kimi 的 `restoreForked`；(3) 终态停 turn 靠 driver 边界而非 kimi 的工具 `stopTurn`。
- Claude Code `/goal`：业界参照系之一（自主多轮 + 完成判定）。
