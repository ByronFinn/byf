# [DONE] PRD-0007: 缓存可观测性增强 — CLI Usage 面板

## Child Issues

- #126 — `cache hit rate foundation` — helpers + AppState + session-meta-handler (AFK)
- #127 — `footer cache hit-rate badge` — footer Line 2 cache badge (AFK, blocked by #126)
- #128 — `/usage panel cache hit-rate` — per-model and total-row cache suffixes (AFK, blocked by #126)
- #129 — `/status panel cache health section` — session-level Cache section (AFK, blocked by #126)
- #130 — `subagent chip cache hit-rate suffix` — running/done subagent token chip suffix (AFK, blocked by #126)

## 问题陈述

### 背景

BYF 的 prompt cache 架构（ADR 0009 + ADR 0011 + ephemeral-injection-cache-optimization）已实现多层级缓存策略。数据管道已经端到端完成：

- **Provider 层**：所有 provider 适配器（Anthropic、OpenAI、Google）已解析并填充 `inputCacheRead` / `inputCacheCreation` 字段
- **kosong 层**：`TokenUsage` 接口定义了完整的四字段模型（`inputOther` / `output` / `inputCacheRead` / `inputCacheCreation`），并提供 `cacheHitRate()` branded helper
- **agent-core 层**：`UsageRecorder` 在每次 LLM completion 时聚合 per-model 用量，并计算 `UsageStatus.cacheHitRate`
- **SDK 层**：`AgentStatusUpdatedEvent.usage?: UsageStatus` 携带 live cache 数据流；`SessionUsage` 携带完整 `TokenUsage` 结构

### 核心问题

CLI 展示层完全未利用已有的缓存数据：

1. **`/usage` 面板**：`buildSessionUsageSection()` 将 `inputCacheRead + inputCacheCreation + inputOther` 折叠为单个 `input` 聚合值，不显示缓存命中率或分项
2. **Footer**：`handleStatusUpdate()` **完全忽略** `event.usage`——仅提取 `contextUsage` / `contextTokens` / `maxContextTokens` / `permission` / `model`。`AppState` 中无任何缓存字段
3. **`/status` 面板**：展示 context window 和 managed usage，无缓存信息
4. **Subagent chip**：`SubagentTokenUsage` 接口已声明 `inputCacheRead` / `inputCacheCreation` / `inputOther` 字段，但 `formatSubagentTokens()` 仅输出 `Xk tok`

**结论**：数据管道 100% 到位，这是一个纯展示层增强。

### 与既有 PRD 的关系

`docs/prd/ephemeral-injection-cache-optimization.md` 在"非目标"中明确列出：

> 缓存可观测性增强（`inputCacheCreation` 估算 / Vis 展示）— 后续 follow-up

本 PRD 是该 follow-up 的 CLI 展示部分。

## 目标

在四个 CLI UI surface 上展示缓存命中率，让用户感知缓存效率：

1. **`/usage` 面板**：每个 model 行追加 `(cache XX%)` 后缀（命中率 > 0% 时）
2. **Footer Line 2**：在 context 指标后追加 `cache: XX%`（命中率 > 0% 时；首轮 / 无缓存 provider 时隐藏）
3. **`/status` 面板**：添加 `Cache` 字段行，显示命中率 + read/write 分项
4. **Subagent chip**：`Xk tok` 后追加 `(XX%)` 后缀（cache read > 0 时）

## 非目标 (Out of Scope)

- 成本 / 定价显示（cache 数据是其前置依赖，但本次不构建）
- Vis 工具的缓存可视化展示（独立 scope）
- Cache staking 调试 UI（`CacheHint` 标记可见性，ADR 0011 Story #12，独立功能）
- Provider / SDK 侧的数据变更（所有数据已存在）
- 新增 slash command

## 技术方案

### 数据流：Footer per-turn hit rate

**当前状态**：`AgentStatusUpdatedEvent` 携带 `usage?: UsageStatus`（含 `total`、`currentTurn`、`cacheHitRate`），但 CLI 的 `handleStatusUpdate()` 完全忽略 `event.usage`。

**关键语义区分**：`UsageStatus.cacheHitRate` 是 **session 累积值**（基于 `total`），会被首轮 cache creation 永久拉低。Footer 需要的是 **per-turn hit rate**（反映"刚才那一步的缓存效率"），应从 `event.usage.currentTurn` 自行计算。

**变更**：

1. `AppState` 新增 `cacheHitRate?: number` 字段（0..1 ratio 或 `undefined`）
2. `handleStatusUpdate()` 从 `event.usage.currentTurn` 提取 `TokenUsage`，用 `computeCacheHitRate()` 自行计算 per-turn hit rate
3. Footer 从 `state.cacheHitRate` 读取并渲染

```typescript
// session-meta-handler.ts — 变更前
if (event.contextUsage !== undefined) patch.contextUsage = event.contextUsage;
// ... 完全忽略 event.usage

// 变更后
if (event.contextUsage !== undefined) patch.contextUsage = event.contextUsage;
const ct = event.usage?.currentTurn;
if (ct !== undefined) {
  patch.cacheHitRate = computeCacheHitRate(ct.inputOther, ct.inputCacheRead, ct.inputCacheCreation);
}
// currentTurn === undefined（新 turn 刚开始）时不清除 cacheHitRate——
// footer 保持上一轮的值，避免 badge 闪烁消失
```

**Turn gap 行为**：`beginTurn()`/`endTurn()` 不触发 status event，但 context append（用户消息追加）会触发。此时 `currentTurn` 为 `undefined`。`handleStatusUpdate()` 仅在 `currentTurn !== undefined` 时更新 `cacheHitRate`，不清除——footer 保持上一轮值，直到新 turn 的第一个 step 完成后刷新。

**更新频率**：cache hit rate 在 **per-step**（每次 LLM completion 后）刷新，不是 streaming 中逐 token 更新。这与 context 百分比的行为一致。

**SDK 约束**：SDK 不 re-export kosong 的 `cacheHitRate()` 函数，且 AGENTS.md 禁止 CLI 直接 import `@byfriends/kosong`。CLI 必须在 `usage-format.ts` 中自行实现 `computeCacheHitRate()`——这不是可选方案，是架构约束下的唯一路径。

### Surface 1: `/usage` 面板 — Hit-rate compact

**文件**：`src/tui/components/messages/usage-panel.ts` → `buildSessionUsageSection()`

**当前输出**（每个 model 行）：

```
  claude-sonnet-4-20250514  input 12.3k  output 3.2k  total 15.5k
```

**变更后输出**（cache hit-rate > 0% 时）：

```
  claude-sonnet-4-20250514  input 12.3k (cache 87%)  output 3.2k  total 15.5k
```

cache hit-rate = 0% 或无数据时省略 `(cache XX%)`，保持当前格式。

**实现**：在 `buildSessionUsageSection()` 中，为每个 model 行用 `computeCacheHitRate(row.inputOther, row.inputCacheRead, row.inputCacheCreation)` 计算 hit rate，若 `formatCacheHitRate(hitRate)` 非 `undefined` 则在 `input {value}` 后插入 `muted(' (cache ') + accent(formatCacheHitRate(hitRate)) + muted(')')`。

多 model 总计行：当前只追踪 `totalInput` / `totalOutput`，需额外追踪 `totalCacheRead` / `totalCacheCreation` / `totalOther`，再用 `computeCacheHitRate(totalOther, totalCacheRead, totalCacheCreation)` 计算聚合 hit rate。

### Surface 2: Footer Line 2 — Inline cache badge

**文件**：`src/tui/components/chrome/footer.ts` → `render()`

**当前输出**（Line 2）：

```
                                    context: 45.2% (22k/48k)
```

**变更后输出**（`cacheHitRate > 0` 时）：

```
                                    context: 45.2% (22k/48k)  cache: 87%
```

`cacheHitRate = 0` 或 `undefined` 时省略 `cache: XX%`。

**实现**：

- `formatContextStatus()` **不修改**——保持返回纯文本的现有模式，由 caller 统一着色
- 在 `render()` 中构建 cache badge 字符串：`formatCacheHitRate(state.cacheHitRate)` 返回值非 `undefined` 时，用 `chalk.hex(colors.textDim)` 着色为 `  cache: 87%`，追加在 contextText 之后
- `contextWidth` 需包含 cache badge 宽度，以保证 transient hint 模式下的右对齐计算正确
- cache badge 使用 `colors.textDim` 着色（不与 context 的 `colors.text` 竞争视觉重心）

**着色分离原因**：context 文本由 `render()` 统一用 `colors.text` 着色；cache badge 需要 `textDim`。两种颜色不能在同一个 `formatContextStatus()` 返回值中混合（该函数返回纯文本，caller 统一着色）。因此在 `render()` 中分别构建、着色、拼接，保持 `formatContextStatus()` 职责单一。

**Transient hint 交互**：Line 2 有 transient hint 模式（如退出确认 "Press Ctrl+C again to exit"），hint 左对齐，context 右对齐。cache badge 追加在 context 右侧，`contextWidth` 需包含 badge 宽度。当 hint + context + badge 超过终端宽度时，hint 会被截断（已有逻辑），cache badge 不受影响。

### Surface 3: `/status` 面板 — Cache field row

**文件**：`src/tui/components/messages/status-panel.ts` → `buildStatusReportLines()`

**代码验证发现**：`buildStatusReportLines()` 当前完全不读取 `options.status.usage`——连基本的 input/output/total token 都没有展示。`SessionStatus.usage`（`SessionUsage`）通过 `session.getStatus()` → RPC `getUsage()` 获取并填充了完整数据，但 status 面板丢弃了它。

**当前字段行**：Model / Directory / Permissions / Session / [Title] → Context window section → (empty managed usage)

**变更后**：在 context window section 之后新增 `Cache` section（有缓存数据时）：

```
  Cache    87%  (10.7k read / 0.6k write)
```

无缓存数据时省略整个 section。

**数据来源**：`StatusReportOptions.status.usage.total`（`TokenUsage`，session 累积）。从 `total` 用 `computeCacheHitRate()` 计算 session 级 hit rate，并展示 `inputCacheRead` / `inputCacheCreation` 分项。

**注意**：`/status` 展示的是 session 累积值（与 footer 的 per-turn 不同），因为 `/status` 是"会话健康度"快照，不是实时状态。

### Subagent chip — Compact percentage

**文件**：`src/tui/components/messages/tool-call.ts` → `formatSubagentTokens()`

**当前输出**：`15.5k tok`

**变更后输出**（`inputCacheRead > 0` 时）：

```
15.5k tok (87%)
```

**数据来源**：`formatSubagentTokens()` 从已存储的 `SubagentTokenUsage`（含 `inputCacheRead` / `inputCacheCreation` / `inputOther`）中用 `computeCacheHitRate()` 计算 hit rate，追加 `(XX%)` 后缀。

**实时与最终两种 phase**：`formatSubagentTokens()` 在两个 phase 被调用：

- **Running phase**（`formatPhaseChip` line 1106）：live 累积 token 数，由 `updateSubagentLiveUsage()` 从 `agent.status.updated` 事件持续更新。chip 中的 `(XX%)` 也是实时的。
- **Done phase**（`formatPhaseChip` line 1114）：最终累积值，由 `onSubagentCompleted()` 从 `subagent.completed.usage.total` 设置。

两种 phase 的 `(XX%)` 都基于当前 `subagentUsage` 中累积的 `TokenUsage` 计算，语义一致（都是"子 agent 截至当前的累积缓存效率"）。

### 共享格式化 helper

**文件**：`src/utils/usage/usage-format.ts`

新增纯函数：

```typescript
/**
 * 格式化 cache hit rate 为百分比字符串，如 "87%"。
 * rate === undefined 或 rate <= 0 时返回 undefined（信号"不显示"）。
 */
export function formatCacheHitRate(rate: number | undefined): string | undefined;

/**
 * 计算 cache hit rate (0..1)。
 * 公式: inputCacheRead / (inputOther + inputCacheRead + inputCacheCreation)
 * 全零输入（分母 = 0）时返回 undefined——与 kosong cacheHitRate() 语义一致，
 * 让下游区分"无数据"和"零命中"。
 */
export function computeCacheHitRate(
  inputOther: number,
  inputCacheRead: number,
  inputCacheCreation: number,
): number | undefined;
```

遵循既有 `usage-format.ts` 的设计原则：纯函数、无 ANSI、可单元测试。

### 文件变更总览

| 文件                                             | 变更类型 | 内容                                                                       |
| ------------------------------------------------ | -------- | -------------------------------------------------------------------------- |
| `src/tui/types.ts`                               | 修改     | `AppState` 添加 `cacheHitRate?: number`                                    |
| `src/tui/events/session-meta-handler.ts`         | 修改     | `handleStatusUpdate()` 从 `event.usage.currentTurn` 计算 per-turn hit rate |
| `src/tui/components/chrome/footer.ts`            | 修改     | Line 2 追加 `cache: XX%`（从 `state.cacheHitRate`，per-turn）              |
| `src/tui/components/messages/usage-panel.ts`     | 修改     | 每个 model 行追加 `(cache XX%)` 后缀（session 累积）                       |
| `src/tui/components/messages/status-panel.ts`    | 修改     | 新增 Cache section（从 `status.usage.total`，session 累积）                |
| `src/tui/components/messages/tool-call.ts`       | 修改     | `formatSubagentTokens()` 追加 `(XX%)`（子 agent 累积）                     |
| `src/utils/usage/usage-format.ts`                | 修改     | 新增 `formatCacheHitRate()` / `computeCacheHitRate()`                      |
| `test/tui/components/usage-panel.test.ts`        | 修改     | 验证 cache hit-rate 后缀渲染和边界                                         |
| `test/utils/usage-format.test.ts`                | 修改     | 验证 `formatCacheHitRate` / `computeCacheHitRate`                          |
| `test/tui/components/status-panel.test.ts`       | 修改     | 验证 Cache section 渲染                                                    |
| `test/tui/components/messages/tool-call.test.ts` | 修改     | 验证 subagent chip cache 后缀                                              |

## 验收标准

### 功能正确性

1. **`/usage` 面板**：当 model 行的 cache hit rate > 0 时，`input {value}` 后显示 `(cache XX%)`（session 累积值）；命中率 = 0 或无数据时保持当前格式不变
2. **`/usage` 面板**：多 model 总计行在有缓存数据时同样显示聚合 session 级命中率
3. **Footer Line 2**：`state.cacheHitRate > 0` 时（per-turn 值），context 指标后显示 `cache: XX%`；为 0 或 `undefined` 时省略
4. **`/status` 面板**：`status.usage.total` 有缓存数据时显示 `Cache` section（session 级 hit-rate % + read/write 分项）；无数据时省略
5. **Subagent chip**：`inputCacheRead > 0` 时 `Xk tok` 后追加 `(XX%)`（子 agent 累积值）；为 0 时保持当前格式
6. **`handleStatusUpdate()`** 从 `event.usage.currentTurn` 用 `computeCacheHitRate()` 计算 per-turn hit rate 并写入 `patch.cacheHitRate`
7. **精度**：所有 cache hit rate 百分比使用整数格式（`87%`，非 `87.0%`）
8. **着色**：所有 surface 的 cache 信息使用 `textDim`/`muted` 着色，不使用 severity 着色

### 边界情况

9. **首轮（cache 正在写入，无命中）**：per-turn hit-rate = 0%，footer 隐藏 cache badge；`/usage` 面板省略 `(cache XX%)`
10. **Turn gap（新 turn 开始，currentTurn=undefined）**：footer 保持上一轮的 cache badge 值，不闪烁消失；新 turn 第一个 step 完成后刷新
11. **Provider 不支持缓存**（所有 cache 字段 = 0）：所有 surface 隐藏缓存信息，行为与首轮相同
12. **恢复的 session**：usage 数据从 records 重放恢复（scope='session'，不重建 currentTurn），footer 在首个 turn 完成前无 per-turn 数据，面板的 session 累积值正常展示
13. **`/compact` 之后**：聚合 usage 持续存在；per-turn hit rate 在新 turn 完成后恢复正常

### 主题合规

14. 所有新增的颜色输出使用 `colors.*` 语义 token，不使用 chalk named color
15. Footer cache badge 使用 `colors.textDim`（不与 context 指标的 `colors.text` 竞争视觉重心）
16. `/usage` 面板的 `(cache XX%)` 使用 `muted` 着色保持低噪声

### 不回归

17. **`/usage` 面板**在无缓存数据时的输出与当前完全一致
18. **Footer** 在 `cacheHitRate = undefined` 时的输出与当前完全一致
19. **Subagent chip** 在 `inputCacheRead = 0` 时的输出与当前完全一致
20. **`handleStatusUpdate()`** 的现有字段提取逻辑不受影响

## 风险与缓解

| 风险                                             | 影响                                      | 缓解                                                                            |
| ------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------- |
| Footer Line 2 空间不足                           | 窄终端下 `cache: XX%` 可能溢出            | 优先保证 context 指标完整；cache badge 在剩余空间不足时截断或省略               |
| 恢复 session 后 currentTurn 为空                 | footer 在首个 turn 完成前无 per-turn 数据 | footer 保持 `undefined`（隐藏 badge），用户无感知；session 累积数据在面板中正常 |
| `AgentStatusUpdatedEvent.usage` 在某些场景未填充 | footer 可能不显示 cache badge             | 首选 fallback 为不显示（当前行为），用户无感知                                  |

## 关键决策记录

| 决策                                 | 结论                                                         | 理由                                                                                                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Footer hit rate 语义                 | **per-turn**（从 `currentTurn` 计算）                        | Footer 是"当前状态"指示器。Session 累积值被首轮 cache creation 永久拉低（如 turn 2 实际 91.8% 但 session 级仅 47.8%），不能反映实时缓存效率                                                                          |
| 面板 hit rate 语义                   | **session 累积**                                             | `/usage` 和 `/status` 是"会话健康度"快照，session 累积值反映整体缓存投资回报                                                                                                                                         |
| Turn gap 行为                        | **保持上一轮值**                                             | `beginTurn()`/`endTurn()` 不触发事件，但 context append 会。`currentTurn=undefined` 时不清除 `cacheHitRate`，避免 badge 闪烁                                                                                         |
| 无 severity 着色                     | 统一 `textDim`/`muted`                                       | Cache hit rate 是参考信息不是警示指标——30% 不代表危险，90% 也不是成就。避免误导                                                                                                                                      |
| 精度格式                             | 整数 `87%`                                                   | Cache hit rate 不需要小数精度。更短，footer 空间更友好                                                                                                                                                               |
| Subagent chip 数据源                 | 子 agent 当前累积 `TokenUsage`（running 和 done phase 共用） | `formatSubagentTokens()` 在两个 phase 都被调用。running phase 用 `updateSubagentLiveUsage()` 持续更新的累积值；done phase 用 `onSubagentCompleted()` 设置的最终值。两种 phase 都从当前 `subagentUsage` 计算 hit rate |
| `/status` 范围                       | 仅加 Cache 行                                                | Token 使用量详情是 `/usage` 的职责。`/status` 保持 session 元信息 + context window 定位                                                                                                                              |
| CLI 自行实现 `computeCacheHitRate()` | 不 import `@byfriends/kosong`                                | AGENTS.md 约束 CLI 只通过 `@byfriends/sdk` 访问核心能力；SDK 不 re-export kosong 的 `cacheHitRate()`                                                                                                                 |
| Footer cache badge 构建              | 在 `render()` 中拼接，不改 `formatContextStatus()`           | `formatContextStatus()` 返回纯文本由 caller 统一用 `colors.text` 着色。cache badge 需要 `textDim`，颜色不同。在 `render()` 中分别构建、着色、拼接，保持函数职责单一                                                  |
| `computeCacheHitRate` 全零返回值     | `undefined`（非 0）                                          | 与 kosong `cacheHitRate()` 语义一致：区分"无数据"和"零命中"。下游用 `formatCacheHitRate(rate) !== undefined` 判断是否显示                                                                                            |

## 实现计划

| 阶段 | 任务                                                                                                  | 依赖   |
| ---- | ----------------------------------------------------------------------------------------------------- | ------ |
| 1    | `usage-format.ts` 新增 `formatCacheHitRate()` / `computeCacheHitRate()` + 测试                        | 无     |
| 2    | `types.ts` 添加 `AppState.cacheHitRate` + `session-meta-handler.ts` 提取逻辑（从 `currentTurn` 计算） | 阶段 1 |
| 3    | Footer Line 2 追加 cache badge                                                                        | 阶段 2 |
| 4    | `/usage` 面板每行追加 `(cache XX%)`（session 累积）                                                   | 阶段 1 |
| 5    | `/status` 面板新增 Cache section（从 `status.usage.total`）                                           | 阶段 1 |
| 6    | Subagent chip 追加 `(XX%)`（从 `subagent.completed.usage`）                                           | 阶段 1 |
| 7    | 全部测试通过 + 主题合规检查                                                                           | 全部   |

## Domain Terms

| 术语           | 定义                                                                                                                                                                                                                                                                                                              | 来源                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Cache Hit Rate | `inputCacheRead / (inputOther + inputCacheRead + inputCacheCreation)`。两个 scope：**per-turn**（仅当前 turn 的 `TokenUsage`，反映"刚才的缓存效率"）和 **session-cumulative**（所有 turn 的聚合 `TokenUsage`，反映"整体缓存健康度"）。Per-turn 值在首轮之后通常更高，因为排除了首轮 cache creation 的永久拉低效应 | kosong `cacheHitRate()`（session 级）；CLI `computeCacheHitRate()`（per-turn 和 session 级通用） |

CONTEXT.md 中已新增 "Cache Hit Rate" 条目。

## Expansion Considerations

### Future Evolution

- **成本 / 定价显示**：cache read tokens 的单价通常远低于 uncached input（Anthropic ~10%），展示成本需 cache 分项作为前置数据
- **Vis 工具集成**：将 cache hit-rate 趋势可视化在 `apps/vis` 的 session replay 中
- **Cache staking 调试**：在 transcript 中标注 `CacheHint` 标记的 message（ADR 0011 Story #12）
