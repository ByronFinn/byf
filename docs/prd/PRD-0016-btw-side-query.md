# Btw Side Query (`/btw`)

> **Status**: Sliced | **PRD**: PRD-0016 | **Created**: 2026-06-25 | **Last updated**: 2026-06-25 | **Grilled by**: grill skill

## Goal

新增 `/btw <question>` 斜杠命令：在不干扰主任务的前提下，基于**当前完整对话上下文**回答一个旁路问题。答案**不写入主对话历史**、**不调用任何工具**、只在一个**可关闭的浮层 overlay** 中展示。语义对齐 Claude Code 的 `/btw` 命令（Codex CLI 目前尚无此命令）。

支持两种时机：

- 主任务**空闲**时（无活动 turn）：用户随时可问。
- 主任务**进行中**（streaming）时：用户可插入一个旁路问题，不打断主任务的工具调用与历史。

## Motivation

- **省 token**：旁路问题复用已缓存的上下文前缀，无需重启一个新会话。
- **不打断长任务**：主任务跑着工具调用时，用户能快速问"那个配置文件叫什么"，而不必等待或新开 turn。
- **保持主上下文干净**：旁路问答不进主历史，不污染后续主任务的上下文窗口。

## What I already know

### 现状（代码事实）

- 斜杠命令注册：`apps/cli/src/tui/commands/registry.ts` 的 `BUILTIN_SLASH_COMMANDS`（如 `yolo` / `feedback` 等条目）。
- 命令解析：`apps/cli/src/tui/commands/resolve.ts` 的 `resolveSlashCommandInput` → 区分 `builtin` / `skill` / `message` / `blocked`。
- 命令分发：`apps/cli/src/tui/byf-tui.ts:1300-1442`，`executeSlashCommand` → `handleBuiltInSlashCommand` switch（每个 `BuiltinSlashCommandName` 都有 case）。
- `busy` 拦截：`resolveSlashCommandInput` 对 `availability: 'idle-only'`（默认）的命令，在 `isStreaming` / `isCompacting` 时返回 `blocked`。
- 旁路 LLM 调用**当前不存在**：agent-core 只有 `prompt`（入历史、跑工具循环）和 `steer`（入历史、注入到活动 turn）两条会话内路径，**没有**"一次性、不入历史、空 tools"的旁路调用。
- agent 入口：`packages/agent-core/src/agent/index.ts`，`Agent.config` 持有 `provider` / `systemPrompt` / `modelCapabilities`；`Agent.context.getMessages(ephemeral?)` 返回投影后的 provider-ready `Message[]`（`packages/agent-core/src/agent/context/index.ts:163`）。`context.messages` 经 `project()`（`context/projector.ts`）转成 provider 格式。
- 单次 generate：`Agent.generate`（`agent/index.ts:169-188`）内部解析 auth、记日志后调用 kosong `generate()`。`KosongLLM`（`agent/turn/kosong-llm.ts`）展示了完整的单次调用模式（provider + systemPrompt + tools + messages + callbacks + options，options 含 `promptPlan`）。
- RPC 接口：`AgentAPI`（`packages/agent-core/src/rpc/core-api.ts:229-253`），含 `prompt` / `steer` / `getContext` 等。
- overlay/浮层模式：`apps/cli/src/tui/components/dialogs/` 下的选择器（如 `file-viewer.ts`、`task-output-viewer.ts`）通过 `mountEditorReplacement` 临时替换编辑区展示内容、Esc/Enter 关闭。
- 事件：`AgentEvent`（`packages/agent-core/src/rpc/events.ts:286-318`）。

### 关键技术发现

1. **并发读取 context 的一致性是核心难点**。主任务 streaming 时，`ContextMemory._history` 正被 loop 改写（`appendLoopEvent` 追加 assistant 消息 / tool call / tool result，`context/index.ts:250-349`）。旁路查询并发读取必须拿到一份**一致快照**——尤其要避免读到"有 tool_call 但还没对应 tool result"的非法中间态（provider 会拒绝此类消息）。JS 单线程下，同步克隆 `_history` 数组是一个原子的快照点。
2. **🔴 projector 已经是干净的、非变更快照**。`context.getMessages()` → `project()`（`context/projector.ts:23-65`）已**过滤**空/partial 的 assistant 占位符（line 30-41），并对每条消息 `cloneMessage`（line 155、183-192）。所以 `getMessages()` 本身就是一份隔离副本，旁路查询可安全地在末尾追加自己的 user 消息——**无需**在 `Agent`/`ContextMemory` 上再做一次克隆。
3. **🔴 真正唯一的快照缺口是"in-flight tool call"**。`project()` 只剔除*空/partial* 的 assistant，**不**剔除"有 tool_calls 但缺配对 tool_result"的消息。而 `appendLoopEvent` 的 `tool.call` 分支（`context/index.ts:292-306`）会把 tool_call 写入已 push 进 `_history` 的 openStep 消息——所以 streaming 中 `_history` **确实**含这种悬空 tool_call 的 assistant 消息。`ContextMemory.pendingToolResultIds`（`context/index.ts:42`，`hasOpenToolExchange()` line 371）正是这个状态的权威信号。**决策**：在 `ContextMemory` 增加快照方法（它独占 `openSteps` / `pendingToolResultIds` 私有态），当存在 pending tool result 时，把尾部那组"悬空 assistant + 之后的 tool 消息"截掉，回退到上一个完整结束的 step。`Agent` 层看不到这些私有态，所以该方法**必须落在 `ContextMemory`**，而非 PRD 初稿写的 `Agent` 上。
4. **🔴 compaction 是现成先例，且已证明"游离 generate + 并发只读"安全**。`FullCompaction.compactionWorker`（`agent/compaction/full.ts:493-500`）直接调 `agent.generate(provider, systemPrompt, tools, messages, undefined, { signal })`，入参是 `context.history` 的快照切片，**不**写主 turn 流、**不** emit turn 事件，结果只在最后 `applyCompaction` 一次性写回。btw 复用同一模式（空 tools + 流式 callbacks）。这同时验证了：compaction 进行中发起 btw 是安全的（两者都是对 `context.history` 的只读快照，JS 单线程下互不干扰）——**R1 的 `availability: 'always'`（含 compacting）由代码证实**。
5. **system prompt / provider / cache 复用**。旁路查询复用 `Agent.config.provider` / `systemPrompt` / `modelCapabilities`，以及 `buildPromptPlan`（`prompt-plan/builder.ts`）生成的缓存块结构——旁路请求命中主任务已建立的 prompt cache 前缀，真正省 token。tools 传**空数组**（强制只读、单轮）。
6. **🔴 kosong 层回调是 `onMessagePart`，不是 `onTextDelta`**。`Agent.generate` → kosong `generate()` 的 `GenerateCallbacks` 只有 `onMessagePart(part: StreamedMessagePart)`（`kosong/src/generate.ts:56`，part 是 `TextPart | ThinkPart | ToolCall | ToolCallPart`）。`onTextDelta` 是 loop 层（`KosongLLM`/`LLMChatParams`）的抽象，btw 刻意绕过 loop，所以**必须**用 `onMessagePart` 并自行过滤 `part.type === 'text'`。空 tools 下不会收到 ToolCall part，但 ThinkPart 可能出现——决策：忽略 ThinkPart（btw 不需要展示推理）。
7. **🔴 不带 ephemeral injection**。`getMessages(ephemeral)` 的 ephemeral 注入在 `before_user` 位置（`projector.ts:60-64`），即"整段历史之后"。主 turn 这样做是对的（timestamp 跟在历史后面），但 btw 在快照后还要追加*自己的*问题消息——若带 ephemeral，timestamp 会落在主历史与 btw 问题之间，语义错乱。**决策**：btw 快照调 `getMessages()`（无 ephemeral），再自行追加问题。
8. **答案不进历史 = 不调用任何写 context 的方法**。旁路调用绕开 `TurnFlow`（`turn/index.ts`，会 `appendUserMessage` + `records.logRecord` + emit turn events），直接用 `Agent.generate` 做一次游离的 `generate()`，回调只把 delta 推给 RPC 事件 / CLI 浮层，**不**调 `context.appendMessage`、**不**调 `records.logRecord`（不进 wire.jsonl，保证 resume/fork 后无残留）。
9. **可取消**。`Agent.generate` 的 options 接受 `signal`（`GenerateOptionsWithRequestLog`，`kosong-llm.ts:40`）；`generate()` 在 await 前后及每个 chunk 都检查 abort（`kosong/src/generate.ts:114-135`），Esc 关闭即 abort。

### 研究结论（业界现行标准）

- **[Claude Code `/btw`](https://code.claude.com/docs/en/commands)**：单轮、只读、不进主历史、答案在可关闭 overlay 展示，主任务进行中可用。社区反馈省 token 明显。
- **Codex CLI**：目前**没有** `/btw`，社区在 [issue #18884](https://github.com/openai/codex/issues/18884) 提需求。
- 参照系即 Claude Code。

## Assumptions

- `/btw` 复用当前 session 选定的主模型（`Agent.config.modelAlias` → provider）。不为 btw 引入独立模型配置。
- 答案以浮层 overlay 展示，**不**进主 transcript，**不**进 wire.jsonl。
- 主任务 streaming 时可用：旁路读 context 快照副本，不触碰主 loop 状态。
- 旁路查询不挂 hooks、不走权限系统（空 tools，无副作用）、不触发 compaction。

## Open Questions

- 无（grill 期间全部解决）。
  - OQ1（cache 共享）：代码可证——同一 `provider` + `systemPrompt` + `buildPromptPlan` 产出的 `promptPlan`，cache key 一致，旁路命中主任务前缀。
  - OQ2（token 归属）：决策为**独立、不进 `/usage`**。`UsageRecorder` 与 `/usage` 面板**不改动**；btw 的 token 只在 overlay 当场显示，丢弃后不持久化。

## Requirements

- **R1 命令注册**：在 `BUILTIN_SLASH_COMMANDS` 增加 `btw` 条目：`name: 'btw'`，`description: 'Ask a side question without affecting the main conversation'`，`availability: 'always'`。`availability: 'always'` 使 `resolveSlashCommandInput` 在 streaming/compacting 时都**不**返回 `blocked`（busy 拦截只作用于 `idle-only` 命令，`resolve.ts:50-59`）——这是安全的，因为旁路只读快照、不写 context，与 compaction/streaming 互不干扰（见技术发现 4）。
- **R2 命令分发**：在 `handleBuiltInSlashCommand` 增加 `case 'btw'`，调用新的 btw handler；handler 接收 `args`（即用户问题文本）。
- **R3 agent-core 旁路能力**：在 `Agent` 增加旁路查询方法（如 `Agent.askSide(query, { signal })`），语义：
  - 调 `context.getStableSnapshot()`（新增于 `ContextMemory`，见 R3a）：拿到一份**剔除了悬空 tool_call 尾部**的、已 project+clone 的 provider-ready 快照；**不带 ephemeral injection**。
  - 在快照末尾追加 btw 的问题消息 `{ role:'user', content:[{type:'text', text:query}], toolCalls:[] }`。
  - 以 `[]` 作为 tools 调用 `this.generate(provider, systemPrompt, [], messagesWithQuery, callbacks, { signal, promptPlan })`，`promptPlan` 由 `buildPromptPlan(systemPrompt, cacheCapability)` 生成以命中缓存。
  - callbacks 用 kosong 的 `onMessagePart`，过滤 `part.type === 'text'` 把 delta 流式回传（忽略 ThinkPart）；**不**写 context、**不**写 records、**不** emit turn events。
  - 返回本次查询的 `queryId`；最终文本与本次 `result.usage` 通过 `btw.completed` 事件流式回传（供 overlay 显示，**不**调 `usage.record`，不进 `/usage`）。
- **R3a ContextMemory 快照方法**：新增 `getStableSnapshot(): Message[]`：
  - 读 `this.getMessages()`（无 ephemeral，已 clone+过滤空/partial）。
  - 若 `pendingToolResultIds.size > 0`，从尾部回溯，截掉最后一个含 pending tool_call id 的 assistant 消息及其后的所有消息，回退到上一个完整结束的 step 边界。
  - 该方法**必须**在 `ContextMemory` 上，因为只有它持有 `openSteps` / `pendingToolResultIds` 私有态（`Agent` 层看不到）。复用 `hasOpenToolExchange()` 既有判定。
- **R4 RPC 接口**：在 `AgentAPI` 增加 `askSide: (payload: AskSidePayload) => void` 和 `cancelSideQuery: (payload: CancelSideQueryPayload) => void`。`AskSidePayload` 为 `{ query: string; queryId: string }`，由调用方生成 `queryId` 以便在请求起飞前即可关联/取消。新增事件 `BtwStartedEvent` / `BtwDeltaEvent`（text delta）/ `BtwCompletedEvent`（含最终文本 + 本次 token 用量）/ `BtwFailedEvent`。事件命名与现有 `AssistantDeltaEvent` 区分，避免 TUI 把 btw delta 当成主 transcript 流。
- **R5 CLI 浮层组件**：在 `apps/cli/src/tui/components/dialogs/` 新增 `btw-viewer.ts`（或复用 `file-viewer`/`task-output-viewer` 的 overlay 模式），通过 `mountEditorReplacement` 挂载：
  - 展示用户问题（Q）+ 实时流式的答案（A）。
  - Esc / Enter 关闭；关闭时若有在途请求则 abort。
  - 关闭后浮层销毁，主 transcript 不受影响。
- **R6 CLI handler**：在 ByfTUI slash-command handler 段增加 `handleBtwCommand(args)`：
  - 校验 args 非空（空则提示 `Usage: /btw <question>`）。
  - 校验模型已配置（复用 `LLM_NOT_SET_MESSAGE`）。
  - 打开 btw overlay，调用 SDK 的旁路 RPC，订阅 btw 事件把 delta 投到 overlay。
  - Esc 关闭时取消。
- **R7 空参数兜底**：`/btw`（无参）给出 usage 提示，不发起请求。
- **R8 telemetry**：`track('input_command', { command: 'btw' })` + 旁路完成时 track `btw_query`（含 duration / 是否 streaming 时发起 / token）。

## Acceptance Criteria

- **AC1**：空闲时 `/btw 那个配置文件在哪` 能基于当前对话上下文给出答案，答案出现在浮层；关闭浮层后主 transcript 无任何 btw 痕迹。
- **AC2**：主任务 streaming 时（如正在跑 bash 工具）`/btw ...` 同样可用，主任务不被打断、不丢失工具调用、历史不含 btw 问答。
- **AC3**：旁路查询期间主 transcript 不出现 assistant.delta / tool.call 等主任务事件的串扰（btw 走独立事件流）。
- **AC4**：resume / fork 该会话后，wire 重放出的上下文**不含**任何 btw 问答。
- **AC5**：Esc 能取消在途的 btw 查询，浮层关闭且无悬挂请求。
- **AC6**：`/btw`（无参）显示 usage 提示，不发请求。
- **AC7**：`/btw` 在 compacting 时不阻塞主会话（旁路不依赖 compaction 状态）。

## Out of Scope

- 多轮 btw 对话（追问需重新 `/btw`，每次单轮）。
- 为 btw 配置独立/专用模型。
- btw 答案转存到主对话或剪贴板以外的持久化（如自动写文件）。
- btw 期间允许工具调用（始终空 tools）。
- btw 用量计入主会话 `/usage` 统计（OQ2 已决策为**独立不计入**，故 `/usage` 面板与 `UsageRecorder` 不改动）。

## Technical Approach

**分层**（agent-core 能力 → RPC → CLI overlay）：

1. **agent-core：`ContextMemory.getStableSnapshot()` + `Agent.askSide()`**
   - `getStableSnapshot()`：`getMessages()`（无 ephemeral，已 clone）→ 若 `pendingToolResultIds` 非空，回溯截掉悬空 tool_call 的尾部 assistant 消息及其后续消息，回退到上一完整 step 边界。
   - `askSide(query, { signal, queryId })`：`const messages = [...context.getStableSnapshot(), userQueryMsg]`；`callbacks = { onMessagePart: (part) => part.type==='text' && emit(btw.delta, part.text) }`；调 `this.generate(provider, systemPrompt, [], messages, callbacks, { signal, promptPlan })`；完成 emit `btw.completed { text, usage }`，**不**写 context/records、**不** emit turn 事件。若调用方提供 `queryId` 则复用之，否则由 `Agent` 生成。

2. **RPC：`AgentAPI.askSide` / `AgentAPI.cancelSideQuery` + 事件**
   - `AskSidePayload { query: string; queryId: string }`，`queryId` 由调用方生成。
   - `CancelSideQueryPayload { queryId: string }`：取消进行中的旁路查询，`Agent` 内按 `queryId` 维护 `AbortController`。
   - 事件：`btw.started { queryId }` / `btw.delta { queryId, delta }` / `btw.completed { queryId, text, usage? }` / `btw.failed { queryId, error }`。`queryId` 串起一次 btw 的生命周期，与主 transcript 的 turnId 体系隔离（无字段冲突）。

3. **CLI：`btw-viewer.ts` overlay + `handleBtwCommand`**
   - overlay 复用 `mountEditorReplacement` 模式（`byf-tui.ts:3117`）；渲染 Q + 流式 A；Esc/Enter 关闭。
   - handler 订阅 `session.onEvent`，按 `event.type` 命中 `btw.*` 且 `queryId` 匹配当前 overlay 的才投递——与主 transcript 的 `assistant.delta{turnId}` 事件天然不冲突。

**并发安全**：主 loop 写 `ContextMemory._history`（同步执行段内），旁路读快照副本（独立 promise）——不共享可变状态。compaction 与 btw 可并发（两者都是对 `history` 的只读快照）。`Agent.generate` 无状态（每次解析 auth、委托 kosong stateless `generate`），并发调用独立。

## Decision (ADR-lite)

- **旁路能力放 agent-core（`Agent.askSide`），而非 SDK/CLI 自行组装**。理由：provider/systemPrompt/projector/promptPlan/cache 逻辑都在 core 内，搬出去会破坏封装且失去 cache 命中；CLI 规则也禁止 app 直接依赖 agent-core。
- **🔴 compaction 是"游离 generate"的现成先例，btw 直接复刻该模式**。`FullCompaction` 已用 `agent.generate(...)` 跑独立 LLM 调用、不写主 turn 流——btw 只是空 tools + 流式 callbacks 版本。这把"能否并发跑第二个 generate"从设计假设降级为已验证事实。
- **快照的"剔除悬空 tool_call"逻辑落在 `ContextMemory.getStableSnapshot()`**，而非 `Agent`。`openSteps`/`pendingToolResultIds` 是 ContextMemory 私有态，只有它能正确判定 step 边界。
- **不带 ephemeral injection**。timestamp/permission 注入在 `before_user` 位置（历史之后），btw 要在快照后再追加问题，带 ephemeral 会导致 timestamp 落在历史与问题之间，语义错乱。
- **空 tools、不入历史、独立事件流**，精确对齐 Claude Code 的只读、单轮、隔离语义。
- **token 独立、不进 `/usage`**。btw 是游离旁路调用，不计入让 quota / cache 命中率 / `/usage` 面板保持"主会话花了多少"的干净语义。
- **streaming 与空闲都支持**，靠"快照读取"而非"加锁等待"实现并发，符合 JS 单线程模型。

## Implementation Plan (small PRs)

1. **PR-1 agent-core：旁路能力 + RPC**
   - `Agent.askSide()` + `AskSidePayload` + `btw.*` 事件 + `AgentAPI.askSide` 接线。
   - 单测：快照剔除未完成 step；空 tools 调用；不入 records/context。
2. **PR-2 CLI：命令注册 + handler + overlay**
   - `BUILTIN_SLASH_COMMANDS` 加 `btw`；`handleBuiltInSlashCommand` 加 case；`btw-viewer.ts` overlay；`handleBtwCommand`。
   - 单测：命令解析；overlay 挂载/关闭；Esc 取消；空参兜底。
3. **PR-3 changeset + 文档**
   - 跑 `gen-changesets`（默认 minor）。
   - 更新 `apps/cli/AGENTS.md` 的 slash command / dialog 目录说明（如有必要）。

## Domain Terms

- **旁路查询（side query）**：基于当前上下文的一次性、只读、不入历史的提问。本 PRD 引入。
- **浮层 overlay**：临时替换编辑区、可关闭的展示层，btw 答案的唯一出口。

## Traceability

| Requirement             | AC          | 决策来源                                                                        |
| ----------------------- | ----------- | ------------------------------------------------------------------------------- |
| R1/R2 命令注册与分发    | AC1 AC6 AC7 | 代码事实；availability always 由 compaction 并发先例证实                        |
| R3/R3a 旁路能力 + 快照  | AC1–AC5     | 技术发现 1–4、6–7（compaction 先例 + projector + onMessagePart + 无 ephemeral） |
| R4 RPC + 独立事件流     | AC3         | queryId 与 turnId 隔离                                                          |
| R5/R6 overlay + handler | AC1 AC5     | mountEditorReplacement 先例（byf-tui.ts:3117）                                  |
| R3 不写 records/context | AC4         | 技术发现 8（绕开 TurnFlow）                                                     |
| OQ2 token 独立          | —           | 用户决策（不进 /usage）                                                         |

**Sliced into:**

- #189 — [PRD-0016] agent-core 旁路查询引擎 + SDK 接线 — getStableSnapshot/askSide/btw 事件 (AFK)
- #190 — [PRD-0016] /btw 命令 + 浮层 overlay — idle & streaming 双场景端到端 (AFK, blocked by #189)
- #191 — [PRD-0016] 变更集 + 文档同步 — changeset & AGENTS.md (HITL, blocked by #190)

## Issue

- 无父 Issue（本 PRD 由 `/think` 直接产出，未创建 parent Issue）。
