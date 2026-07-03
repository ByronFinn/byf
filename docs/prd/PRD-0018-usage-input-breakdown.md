# Usage 面板 Input Token 分项展示

> **Status**: Sliced | **PRD**: PRD-0018 | **Created**: 2026-07-02 | **Last updated**: 2026-07-03 | **Think skill**: converged | **Grilled by**: grill skill | **Sliced by**: story skill

> **修订（2026-07-03）**：百分比分母由「六项 token 估算之和」（最大余数法归一化强制相加=100%）改为「模型 `max_context_tokens`」。这样各行百分比与同面板 "Context window: used/max" 行同口径，直接回答「某类占窗口多少」。原先的「自洽估算 + 强制闭合」方案废弃——其百分比与窗口脱钩、无法回答占比问题。详见下方技术发现 #3/#9、Decision 与 Traceability 的 Debugged by。

## Goal

增强 CLI `/usage` 面板：在现有 "Session usage" / "Context window" 之外，新增 **"Context breakdown (estimated)"** 小节，按 6 个互斥类别展示 input token 的估算占比，并展示会话累计的 **"Average cache hit rate"**。目标视觉对齐：

```
Context breakdown (estimated)
  MCP tools          5.0%  ~9.9K
  System tools       4.6%  ~9.1K
  Messages           2.9%  ~5.8K
  Meta context       0.5%  ~1.0K
  Skills             0.5%  ~0.9K
  System prompt      0.3%  ~0.5K
Average cache hit rate    81%
```

每项百分比 = 该类估算 token / 模型 Context window（与上方 "Context window" 行 max 值同口径）。各行之和 = 估算 input 占窗口的总比例（上例约 13.8%），**不互斥相加到 100%**——除非窗口被估算值完全占满。

## Motivation

- 当前 `/usage` 面板只能看到按模型的 input/output 总量和 context window 进度条，无法回答"上下文被什么占满了"这个高频问题。
- 用户需要判断是否该 `/clear` skills、关掉某个 MCP server、或精简 AGENTS.md——这些决策依赖**按类别的 token 占比**，而非总量。
- 参考面板（Claude Code usage）已展示此类分项，BYF 缺这块可观测性。

## What I already know

### 现状（代码事实）

- **面板入口**：`apps/cli/src/tui/components/messages/usage-panel.ts`，`buildUsageReportLines()`（line 176）组装 `/usage` 面板，现有三节：`Session usage`（per-model + total，含 `(cache NN%)` 后缀）、`Context window`（进度条 + 百分比 + used/max）、`Plan usage`（休眠，未接数据）。
- **现有数据流**：`showUsage()`（byf-tui.ts:3535）→ `loadSessionUsageReport()`（3596）→ `session.getUsage()`，返回 `UsageStatus { byModel, currentTurn, total, cacheHitRate }`。live footer 从 `AgentStatusUpdatedEvent.usage.currentTurn` 取值（`session-meta-handler.ts:45-52`）。
- **TokenUsage 只有 4 个 cache 维度字段**（`packages/kosong/src/usage.ts:7`）：`inputOther / output / inputCacheRead / inputCacheCreation`。**没有任何"按类别拆分"的字段。**
- **System prompt 是 PromptPlan 的 4 个块**（`prompt-plan/builder.ts:39`）：`base`（身份/第一性原理/工具安全指令，→ 对应面板 "System prompt"）、`projectInstructions`（`# Project Information`，AGENTS.md 合并）、`workingEnvironment`（`# Working Environment`，OS/shell/cwd/git）、`sessionContext`（`# Skills`，skills 列表，→ 对应面板 "Skills"）。
- **估算工具已齐备**（`packages/agent-core/src/utils/tokens.ts`）：`estimateTokens(text)`（char 启发式）、`estimateTokensForMessages(msgs)`、`estimateTokensForTools(tools)`。其中 `estimateTokensForTools` 接受 `readonly Tool[]` 子集，可分两批调用。
- **工具来源可区分**：`agent.tools.loopTools`（`tool/index.ts:409`）返回 `ExecutableTool[]`，用 `isMcpToolName(name)`（`mcp/tool-naming.ts:21`，匹配 `mcp__` 前缀）可拆出 MCP 工具 vs 其余（内置+user）。
- **agent-core 已有半成品 3-way 估算**（`agent/index.ts:642-669`，`buildLlmRequestMetadata`）：`estimateTokens(systemPrompt) + estimateTokensForMessages(history) + estimateTokensForTools(tools)`，但只用于打日志，不存储、不返回、不区分 MCP/内置。
- **cache hit rate 会话累计平均已存在**：`UsageStatus.cacheHitRate`（`UsageRecorder.data()`，`usage/index.ts:54`）基于 `total`（会话累计）算出，可直接当 "Average cache hit rate"。注意 CLI footer 当前用的是 `currentTurn` 瞬时值，与本 PRD 不冲突——footer 不改。

### 关键技术发现

1. **provider 不返回按类别的 token 数**。Anthropic/OpenAI/Google 的响应只给一整坨 `inputTokens` / `cachedTokens`，无法区分花在 system prompt 还是 tools 还是 messages。**分项百分比只能是估算值**（行业现状，参考面板本身也是估算）。代码里用 char 启发式 `estimateTokens`，已在 `applyCompletionBudget`、`buildLlmRequestMetadata` 等多处验证可用。
2. **互斥切分映射**（已与用户确认）：
   - `System prompt` ← PromptPlan 的 `base` 块
   - `Meta context` ← `projectInstructions` + `workingEnvironment` 两块合并
   - `Skills` ← PromptPlan 的 `sessionContext` 块（即 `# Skills` 内容）
   - `MCP tools` ← `loopTools.filter(isMcpToolName)` 的 `estimateTokensForTools`
   - `System tools` ← `loopTools.filter(!isMcpToolName)`（内置+user 工具）的 `estimateTokensForTools`
   - `Messages` ← `estimateTokensForMessages(context.getMessages())`
   - 注意：plan/todos 是工具调用结果（在 messages 里）、会话状态是 `<system-reminder>` 注入消息（在 messages 里），都不在 system prompt——故 "Meta context" 用环境+项目指令两块近似，这是用户已确认的取舍。
3. **百分比口径**：分母 = 模型 `max_context_tokens`（即面板 "Context window" 行的 max 值，同口径）。各项 = `该项估算 token / max_context_tokens * 100`，一位小数四舍五入。6 项之和 = 估算 input 占窗口比例，通常远小于 100%。
4. **PromptPlan 不驻留 Agent，但可在 idle 时按需重建**（grill 验证）。`Agent` 无 `promptPlan` 字段；`buildPromptPlan` 在 turn 内是临时构建（`kosong-llm.ts:162`）。但 `agent.config.systemPrompt`（`config/index.ts:115`）持久可用，`getProviderCacheCapability(provider)`（`kosong-llm.ts:185`）在 model 已配置时可用——`askSide`（`agent/index.ts:250-289`）已用同一模式在 turn 外重建 plan，证明 idle 重建可行。无 model 时退化为 `{ strategy: 'none' }`（仍能产出 plan/blocks 用于估算）。
5. **`getUsage` handler 已持有完整 Agent**（grill 验证）。`agent/index.ts:506` 的 `getUsage: () => this.usage.data()` 闭包内可访问 `this.config`/`this.tools`/`this.context`，无需新接线。
6. **`getMessages()` 返回 post-masking/pruning/offloading 的大小**（grill 验证）。observation masking（`full.ts:277`）、pruning（`full.ts:289`）、output offloading（`context/index.ts:343`，append 时即改写）都物理重写 `_history`，`project()` 不做这些变换——故 `estimateTokensForMessages(getMessages())` 估算的是**实际发送**的 token 量，而非原始工具输出。这正合需求。
7. **`/usage` 是 `availability: 'always'`**（`registry.ts:102`），可在 streaming/compacting 中触发（grill 验证）。故 breakdown 计算必须能在 mid-turn 安全运行——按需在 `getUsage` 内算（读当前快照）满足此点，因为 `getMessages()`/`loopTools` 无 turn 状态守卫、不在 turn 中调用也不会抛。
8. **`userTools` 在普通会话恒为空**（grill 验证）。唯一写路径 `registerUserTool`（`tool/index.ts:108`）只被 SDK/headless 嵌入者经 RPC 调用，CLI 无任何 UI 触发。故 `!isMcpToolName(name)` 精确等价于 builtin（+ 理论上可忽略的 user），"System tools" 归类无歧义。
9. **口径决策**：breakdown 百分比分母 = 模型 `max_context_tokens`（即面板 "Context window" 行的 max 值），每项 = `该项估算 token / max_context_tokens * 100`，一位小数四舍五入。百分比与上下文窗口**直接挂钩**，回答的是「该类占窗口多少」，与同面板的 "Context window: used/max (NN%)" 行口径一致。这比「分母=六项之和」更能回答用户的真实问题（「上下文被什么占满了」），且与同面板窗口行口径统一、避免心算错位。
10. **百分比不相加到 100%**：由于分母是窗口而非六项之和，六行百分比之和等于「估算 input 占窗口比例」，通常远小于 100%（除非窗口被估算值完全占满）。退化条件：无 model / `max_context_tokens` 缺失或为 0 时 `percent` 全为 `undefined`，面板仅显示估算绝对值。

### 研究结论

- Claude Code 的 usage 面板展示了同类分项（MCP tools / System tools / Messages / Skills / System prompt / cache hit rate），明确是估算值。
- 主流 provider（Anthropic、OpenAI、Google）均**不**在 API 响应中报告 per-block / per-tool token，无法精确拆分。

## Assumptions

- 分项 token 是**估算值**（char 启发式），面板明确标注 `(estimated)`，不冒充精确。
- 估算复用现有 `estimateTokens` 系列，不引入 tokenizer 依赖（如 tiktoken）——保持轻量、provider 无关。
- 6 个分项类别与用户的参考面板一致，互斥；每项百分比 = 该类估算 token / 模型 `max_context_tokens`（一位小数），**与 "Context window" 行同口径**（见技术发现 9）。
- breakdown 百分比与 "Context window" 的真实 token **直接挂钩**（同 max_context_tokens 分母）；每项额外显示估算绝对值（`~9.9K`）让用户看到估算量级。
- footer 和 `/status` 面板**不改**（本 PRD 只动 `/usage` 面板）。
- 估算在 `getUsage` RPC handler 内按需计算（`/usage` 触发时），不进每轮 LLM 热路径（grill 决策，见 OQ1 解决）。

## Open Questions

- 无（grill 期间全部解决）。
  - **OQ1（估算时机）已决**：按需，在 `getUsage` handler（`agent/index.ts:506`）内算。理由：(a) handler 已闭包持有 Agent；(b) `/usage` 低频、用户触发；(c) `getMessages()` 返回 post-masking 大小，idle 与 mid-turn 都能正确估算；(d) PromptPlan 可在 idle 重建（askSide 先例）；(e) 不污染每轮 generate 热路径。不走 emit-status-updated 实时方案。

## Requirements

- **R1 估算纯函数**：在 `packages/agent-core/src/utils/tokens.ts` 新增 `estimateInputBreakdown(input)`，输入 `{ promptPlan, tools, messages, maxContextTokens? }`，返回 `InputTokenBreakdown`：
  - `tokens`: 6 个 number 字段（`systemPrompt`/`metaContext`/`skills`/`mcpTools`/`systemTools`/`messages`）——原始估算 token 数。
  - `percent`: 6 个对应字段——每项 = `tokens[field] / maxContextTokens * 100`，一位小数四舍五入；`maxContextTokens` 缺失或 `<= 0`（无 model）时 `percent` 全为 `undefined`（信号退化，仅显示绝对值）。
  - 纯函数，复用 `estimateTokens` / `estimateTokensForTools` / `estimateTokensForMessages`。块名映射：`base`→systemPrompt，`projectInstructions`+`workingEnvironment`→metaContext，`sessionContext`→skills；tools 按 `isMcpToolName` 拆 mcp/非 mcp。百分比口径见技术发现 9。
- **R2 Agent 计算 + 注入 UsageStatus**：在 `UsageStatus`（`packages/agent-core/src/rpc/events.ts:13`）加可选 `inputBreakdown?: InputTokenBreakdown`。**由 `Agent` 计算**（它持有 config/tools/context，能重建 PromptPlan），在 `getUsage` handler（`agent/index.ts:506`）内调 `estimateInputBreakdown` 后注入返回值，并传入 `maxContextTokens: this.config.modelCapabilities.max_context_tokens` 作为百分比之分母。`UsageRecorder` 不改——保持只管 cache 维度累计，不反向依赖 PromptPlan。重建 plan：`buildPromptPlan(this.config.systemPrompt, getProviderCacheCapability(this.config.provider))`；`hasModel === false` 时退化为 `{ strategy: 'none' }`（仍产 blocks 可估，但 `max_context_tokens` 缺失 → `percent` 全 undefined）。
- **R3 SDK 类型镜像**：在 `packages/node-sdk/src/types.ts` 的 `SessionUsage`（line 118）加 `inputBreakdown?: InputTokenBreakdown`（从 agent-core re-export 类型，遵循现有 `TokenUsage` 镜像模式）。
- **R4 CLI 面板渲染**：在 `usage-panel.ts` 的 `buildUsageReportLines()` 加 `Context breakdown (estimated)` 小节：
  - 标题含 `(estimated)`，诚实标注。
  - 6 行，顺序 MCP tools / System tools / Messages / Meta context / Skills / System prompt；每行 `名称  XX.X%  ~N.NK`（百分比取自 `percent`，分母为 `max_context_tokens`；**6 行相加不再=100%**；右对齐 + 估算绝对值）。
  - `max_context_tokens` 缺失或为 0（`percent` 全 undefined）→ 全行退化只显示绝对值，不显示百分比。
  - 紧接一行 `Average cache hit rate  NN%`，取 `session.getUsage().cacheHitRate`（会话累计，已在 agent-core 算好）。
  - 小节位置：`Context window` 之后、`Plan usage` 之前。
- **R5 空值与边界**：plan/块空或 loopTools 空 → 对应项 token 为 `0`，不报错；`max_context_tokens` 缺失/为 0 → 退化显示绝对值（`percent` 全 undefined）；`cacheHitRate` undefined → 不显示该行；`/usage` 在 streaming/compacting 中触发也安全（读快照，无写）。
- **R6 测试**：`apps/cli/test/tui/components/messages/usage-panel.test.ts` 加新小节用例（含空值/退化边界）；agent-core 对应测试覆盖 `estimateInputBreakdown` 纯函数（块映射、tools 拆分、空入参）。

## Acceptance Criteria

- **AC1**：`/usage` 面板渲染 `Context breakdown (estimated)` 小节，6 行按序，每行 `名称  XX.X%  ~N.NK`，百分比 = 该项估算 token / `max_context_tokens`（一位小数）。各行之和 = 估算 input 占窗口比例。
- **AC2**：面板显示 `Average cache hit rate  NN%`，取 `session.getUsage().cacheHitRate`（会话累计），与 footer 瞬时值互不影响。
- **AC3**：MCP tools 的 token 估算 = `loopTools` 中 `mcp__` 前缀工具 schema 的 `estimateTokensForTools`；System tools = 其余工具的同口径估算。两类的百分比 = 各自估算 / `max_context_tokens`。
- **AC4**：无 skills → Skills 项 `0`；无 MCP server → MCP tools `0`；不报错。
- **AC5**：`max_context_tokens` 缺失或为 0（无 model）→ 该小节退化为只显示绝对值（`percent` 全 undefined，不显示百分比）。
- **AC6**：`/usage` 在 streaming/compacting 中触发能正常渲染，不抛错（按需读快照）。
- **AC7**：无 model 配置时（`hasModel === false`）breakdown 仍能渲染（用 `{strategy:'none'}` 重建 plan），不抛。

## Out of Scope

- footer / `/status` 面板的分项展示（本 PRD 只动 `/usage`）。
- 引入精确 tokenizer（tiktoken 等）——保持 char 启发式估算。
- provider-reported per-block usage（技术上不可行，provider 不返回）。
- vis web 应用的 TokenBar 改造。
- plan/todos 单独成项（已确认并入 messages，因它们是工具结果消息）。
- managed/Plan usage 接线（与本 PRD 无关，保持休眠）。

## Technical Approach

**分层**（agent-core 估算 → SDK 类型 → CLI 渲染）：

1. **agent-core：`estimateInputBreakdown` 纯函数 + `InputTokenBreakdown` 类型**
   - 新增类型 `InputTokenBreakdown`（6 字段，全 number）。
   - 纯函数 `estimateInputBreakdown({ promptPlan, tools, messages })`：按 PromptPlan 块名取文本估算（`base`→systemPrompt，`projectInstructions`+`workingEnvironment`→metaContext，`sessionContext`→skills）；tools 按 `isMcpToolName` 拆两批估；messages 用 `estimateTokensForMessages`。
   - 在 `Agent` 的 `getUsage` 路径或新增的 breakdown 计算方法里调用，把结果注入 `UsageStatus.inputBreakdown`。

2. **SDK：类型镜像**
   - `SessionUsage` 增加 `inputBreakdown?: InputTokenBreakdown`，从 agent-core re-export 类型。

3. **CLI：面板小节**
   - `usage-panel.ts` 的 `buildUsageReportLines()` 在 `Context window` 后插入 `Context breakdown (estimated)` 小节；末尾插 `Average cache hit rate` 行。
   - 复用 `usage-format.ts` 的 `formatTokenCount`（绝对值）和新增的百分比格式化。

**估算时机**（OQ1 倾向后者）：`/usage` 触发 → `session.getUsage()` → agent-core 用当前 plan/tools/messages 快照算 breakdown → 返回。不在 emit-status-updated 热路径上算。

## Decision (ADR-lite)

- **估算放 agent-core**，因为 PromptPlan、tool registry、context messages 都只在 agent-core 内可见；CLI 规则也禁止 app 直接依赖 agent-core。CLI 只负责渲染。
- **分项是估算值，面板标注 `(estimated)`**。provider 不支持精确拆分，这是行业现状；诚实标注优于冒充精确。
- **6 类互斥切分**：System prompt=base 块，Meta context=projectInstructions+workingEnvironment，Skills=sessionContext 块，MCP tools/System tools 按工具名前缀拆，Messages=历史消息。已与用户确认。
- **百分比口径=模型 Context window**：分母为 `max_context_tokens`，每项 = `token / max_context_tokens * 100`。这比「分母=六项之和」更能回答用户的真实问题（「上下文被什么占满了」），并与同面板 "Context window" 行口径统一、避免心算错位。代价：六行之和通常远小于 100%（除非窗口被占满），初次阅读可能略意外，用 Goal 段与面板标题 `(estimated)` 缓解。
- **cache hit rate 用会话累计平均**（`UsageStatus.cacheHitRate`，基于 `total`），不动 footer 的瞬时值。
- **`UsageRecorder` 不反向依赖 PromptPlan**。breakdown 由 `Agent` 计算（它持有 plan/tools/context），`UsageRecorder` 只管 cache 维度累计——保持职责单一。
- **不引入 tokenizer 依赖**，复用现有 `estimateTokens` char 启发式。

## Implementation Plan (small PRs)

1. **PR-1 agent-core：估算函数 + 类型 + 接线**
   - 新增 `InputTokenBreakdown` 类型 + `estimateInputBreakdown` 纯函数（`utils/tokens.ts`）。
   - `UsageStatus` 加 `inputBreakdown` 字段；`Agent` 在 `getUsage` 路径计算并注入。
   - 单测：`estimateInputBreakdown` 各块/tools 拆分/空值。
2. **PR-2 SDK + CLI：面板渲染**
   - SDK `SessionUsage` 镜像类型。
   - `usage-panel.ts` 新增 `Context breakdown (estimated)` + `Average cache hit rate` 小节。
   - 单测：新小节渲染、空值边界、百分比退化。
3. **PR-3 changeset + 文档**
   - 跑 `gen-changesets`（默认 minor）。
   - 更新 `apps/cli/AGENTS.md`（如有 usage 面板相关说明）。

## Domain Terms

- **Input token breakdown（input token 分项）**：按来源类别拆分的 input token 估算占比。本 PRD 引入。
- **估算值（estimated）**：基于 char 启发式的 token 估算，非 provider 报告的精确值。

## Traceability

| Requirement         | AC      | 决策来源                                          |
| ------------------- | ------- | ------------------------------------------------- |
| R1 估算纯函数       | AC1 AC3 | 代码事实：estimateTokens 系列已存在               |
| R2 UsageStatus 接线 | AC1 AC2 | UsageRecorder.data() + Agent 持有 plan/tools      |
| R3 SDK 镜像         | AC1     | 现有 TokenUsage 镜像模式                          |
| R4 面板渲染         | AC1 AC2 | usage-panel.ts buildUsageReportLines              |
| R5 边界             | AC4 AC5 | 空块/空 tools/无 model（max_context_tokens 缺失） |
| OQ1 估算时机        | AC6     | 倾向按需（/usage 触发）                           |
| 百分比口径=窗口     | AC1 AC3 | 见顶部修订说明；grill 初版要求严格=100%，已废弃   |

- **Debugged by**: `/debug` (2026-07-03) — 百分比分母由「六项估算之和 + 最大余数法归一化」改为 `max_context_tokens`；移除 `normalizePercent`，`estimateInputBreakdown` 增加 `maxContextTokens` 参数，`Agent.getUsage` 传入 `modelCapabilities.max_context_tokens`。

**Sliced into:**

- #196 — [PRD-0018] agent-core 估算引擎 + SDK 接线 — estimateInputBreakdown + UsageStatus (AFK)
- #197 — [PRD-0018] /usage 面板 Context breakdown 小节 — 6 行百分比 + cache hit rate (AFK, blocked by #196)
- #198 — [PRD-0018] 变更集 + 文档同步 — gen-changesets + AGENTS.md (HITL, blocked by #196 #197)

## Issue

- 无父 Issue（本 PRD 由 `/think` 直接产出，已直接拆为 3 个 child issues：#196 / #197 / #198）。
