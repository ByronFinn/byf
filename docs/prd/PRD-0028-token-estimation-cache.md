# Token 估算缓存(承接 PRD-0026 R6 项 1)

> **Status**: Done | **PRD**: PRD-0028 | **Created**: 2026-08-12 | **Last updated**: 2026-08-12

## Goal

消除 PRD-0026 性能剖析定位的 #1 CPU 热点:`estimateTokens` 的逐字符循环。该函数在模式 A/B 占 **83% 自采样**(REPORT-0026 §2),根因是每 step 对整份历史(100-200K token)做 O(n) 逐字符扫描,且同一步内被 3 个调用点各自独立重复扫描。

本 PRD 用**纯函数字符串级缓存**把该热点从 O(字符数) 降到 O(唯一字符串数),首次访问后全部命中。**不碰调用点逻辑、不改估算语义、不需要 native。**

## What I already know

| 事实                                                                                                                                               | 来源                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `estimateTokens` 占模式 A/B 自采样 83%,是单一压倒性热点;GC 仅 ~6%,非根因                                                                           | `docs/perf/REPORT-0026.md` §1-§3                              |
| 同一步内 `applyObservationMasking`、`computeCompletionBudgetCap`、`buildLlmRequestMetadata` 三处各自全量扫描历史(3x 冗余)                          | REPORT-0026 §5 调用链                                         |
| `estimateTokens(text)` 是纯函数(同输入恒同输出),代码注释明确「transient — 下次 LLM 调用返回真实值即取代」                                          | `utils/tokens.ts:5-12`                                        |
| 字符串值在原始历史与投影克隆中相同(projector 克隆按值拷贝字符串)→ 字符串级缓存通吃所有路径                                                         | `projector.ts:154-155` cloneMessage + ECMA-262 字符串按值比较 |
| 投影路径每次产生新 Message 对象 → `WeakMap<Message>` 对投影路径失效;但字符串值不变 → `Map<string>` 不受影响                                        | Explore 变更点图谱 + `projector.ts:155`                       |
| Bun/JSC 对字符串哈希做惰性缓存,同一字符串对象的重复 `Map.get` 接近 O(1)(非负载依据——即使无哈希缓存,原生字节级哈希仍远快于 JS codePoint 逐字符循环) | JSC JSString m_hash 缓存机制(非 Tier 1,仅参考)                |
| WeakMap 对象键缓存是 ECMA-262 §24.3 + MDN 官方推荐用例(Caching);但原始值(字符串)不能做 WeakMap key,必须用 Map                                      | `docs/research/typescript-weakmap-memoization-6.md`(verified) |
| 5 个消息内容变更点中,4 个「替换为新对象」、1 个「流式原地 append」(仅影响 partial 消息)                                                            | Explore 变更点图谱                                            |

## Assumptions

| 假设                           | 验证结论                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 字符串级缓存可消除绝大部分热点 | ✅ 83% 自采样来自 `estimateTokens` 的逐字符循环;缓存命中后跳过循环,直接返回                                  |
| 缓存不需要失效逻辑             | ✅ 纯函数:`f(x)` 对同一 `x` 恒返回同一值;ECMA-262 保证字符串按值比较                                         |
| 内存增长可接受                 | ✅ live unique 文本受会话规模上界约束(200K token ≈ 数千唯一字符串 ≈ `<500KB>`);compaction/clear 时清理双保险 |

## Open Questions

- 无。范围已定(2026-08-12):仅第 1 层(字符串缓存),先测收益再评估第 2 层。

## Requirements

### R1 — `estimateTokens` 字符串级缓存

- 在 `packages/agent-core/src/utils/tokens.ts` 为 `estimateTokens` 加模块级 `Map<string, number>` 缓存:命中即返回,未命中走原有逐字符计算后写入。
- **不改函数签名、不改返回值、不改估算算法**——只是把「每次都算」变成「算过就记」。
- 缓存为模块级单例(非 per-agent、非 per-step),跨 agent、跨 step 共享(纯函数共享安全)。

### R2 — 缓存生命周期清理

- export 一个 `clearTokenEstimateCache()` 函数(或等价机制)。
- 在 `ContextMemory.applyCompaction`(`context/index.ts:129`)和 `ContextMemory.clear`(`context/index.ts:119`)调用清理,约束长会话多轮 compaction 后的内存增长。
- 不清理也可接受(live 数据上界约束),清理是长会话卫生保障。

### R3 — 回归验证

- 现有 `packages/agent-core/test/utils/tokens.test.ts` 全绿(纯函数输出不变,测试无需改动)。
- 补一个小的缓存行为测试(加到现有 `tokens.test.ts`,不新建文件):同一输入两次调用结果一致、`clearTokenEstimateCache()` 后仍正确。现有测试均检查输出值不检查调用次数,缓存不会破坏。
- 用 `scripts/perf/load.ts --mode a` 复跑,对比优化前后的 wall time 与 `estimateTokens` 自采样占比,确认收益。

## Acceptance Criteria

- [x] R1 `estimateTokens` 带 `Map<string, number>` 缓存,签名/返回值/算法不变
- [x] R2 `clearTokenEstimateCache()` 在 compaction 与 context clear 时调用
- [x] R3 现有 `tokens.test.ts` 全绿 + 新增 3 个缓存行为测试;**perf 复跑实测:`estimateTokens` 自采样 83.3% → 22.3%、模式 A wall time 4.3-4.5s → 0.55s(8 倍)**(阈值经 2026-08-12 用户确认校准:`<10%` 为预测值,实测残留 22.3% 为新内容一次性扫描的固有下限,见 Technical Notes)
- [x] 改动不碰调用点逻辑(`applyObservationMasking`/`computeCompletionBudgetCap`/`buildLlmRequestMetadata` 等零改动)
- [x] changeset 已生成(`gen-changesets` skill)

## Definition of Done

- 上述 AC 全部满足;全量测试通过。
- PR 标题遵循 Conventional Commit;PR 描述填 `.github/pull_request_template.md`。
- perf 复跑结果记录(可挂在 PR 上或追加到 REPORT-0026)。

## Out of Scope

- **第 2 层(`estimateTokensForMessage` 的 `WeakMap<Message,number>`)**——Layer 1 测完后若残留热点(主要为 `JSON.stringify(call.arguments)` 的 O(n) 序列化)再评估。当前不在本 PRD。
- **调用点合并 / 增量化**(REPORT-0026 项 2)——Layer 1 缓存后,3x 冗余扫描的第 2、3 次全命中,该项收益已被 Layer 1 覆盖,不再单独做。
- **`estimateTokens` 向量化 / 正则化**(REPORT-0026 项 3)——缓存命中时不执行循环,该函数不再进热点,无需向量化。
- **引入真实 tokenizer**(tiktoken / gpt-tokenizer)——代码注释明确「不付 tokenizer 成本」,估算精度已够用。
- **TUI 渲染、wire 序列化、事件风暴**等 REPORT-0026 已判定的非热点项。

## Technical Approach

1. **缓存实现**(`utils/tokens.ts`):

   ```ts
   const tokenEstimateCache = new Map<string, number>();

   export function estimateTokens(text: string): number {
     const cached = tokenEstimateCache.get(text);
     if (cached !== undefined) return cached;
     // ... 原有逐字符计算 ...
     tokenEstimateCache.set(text, result);
     return result;
   }

   /** Clear the estimate cache — call on compaction / context clear to bound memory. */
   export function clearTokenEstimateCache(): void {
     tokenEstimateCache.clear();
   }
   ```

2. **清理点**(`context/index.ts`):`applyCompaction` 末尾 + `clear` 末尾各加 `clearTokenEstimateCache()`。
3. **验证**:`bun test packages/agent-core/test/utils/tokens.test.ts`;perf 复跑 `bun --cpu-prof --cpu-prof-md scripts/perf/load.ts --mode a --json`。

### 为什么字符串级缓存通吃所有路径

`estimateTokens` 是叶子函数,被 `estimateTokensForContentPart`(文本/think)、`estimateTokensForMessage`(role + toolCalls 的 name/arguments)调用。这些字符串的来源:

- **原始历史路径**(`applyObservationMasking` 扫 `_history`):字符串是消息对象上的 `part.text`,跨 step 稳定 → 命中。
- **投影路径**(`computeCompletionBudgetCap` 等扫 `project()` 产物):projector 克隆消息对象但**按值拷贝字符串**;Map 按值比较 → 同一文本命中。
- **跨 step**:不变的消息内容字符串值相同 → 命中。

因此一个模块级 `Map<string, number>` 同时消除:同 step 内 3x 冗余 + 跨 step 重复扫描,不区分原始/投影路径。

## Feasible Approaches

**Approach A: 字符串级 Map 缓存(推荐)**

- How: `estimateTokens` 加 `Map<string, number>`,命中即返回。
- Pros: ~5 行核心改动;纯函数零失效逻辑;通吃原始 + 投影所有路径;消除同 step 冗余 + 跨 step 重复。
- Cons: Map 强引用 key,compaction 后旧文本不随消息 GC(但 live 上界约束,清理点双保险)。

**Approach B: 消息级 `WeakMap<Message>` 缓存(REPORT-0026 原建议)**

- How: `estimateTokensForMessage` 加 `WeakMap<Message, number>`,按对象身份缓存。
- Pros: WeakMap 弱引用,entry 随消息 GC;4/5 变更点自动失效。
- Cons: **投影路径失效**——projector 无条件克隆,投影产物是新对象,WeakMap 永不命中;只覆盖原始历史路径(约一半)。需额外处理流式 append 的 partial 排除。

**Approach C: 调用点增量化(用 tokenCountWithPending 取代全量扫描)**

- How: 让 `computeCompletionBudgetCap` / `buildLlmRequestMetadata` 改用已有的增量 `tokenCountWithPending` 而非重扫。
- Pros: 从根本上消除冗余扫描;用权威 tokenCount 更准。
- Cons: 改动面大(3 个调用点 + 消息集一致性校验);`tokenCountWithPending` 的覆盖范围与各调用点实际发送的消息集可能不一致(masking/offload 后),精度风险。

## Decision (ADR-lite)

**Context**: REPORT-0026 定位 83% CPU 在 `estimateTokens` 逐字符循环;需选缓存原语。代码核验发现 projector 无条件克隆消息,使 `WeakMap<Message>` 对投影路径失效。
**Decision**: 采用 **Approach A(字符串级 Map 缓存)**。`estimateTokens` 是 83% 热点的叶子函数,字符串值在原始/投影路径中相同,一个模块级 Map 通吃;纯函数保证零失效逻辑。WeakMap(Message 级)留作 Layer 2 备选。
**Consequences**: 最小改动(~7 行)、最低风险、覆盖所有路径;代价是 Map 强引用需清理点约束长会话内存(已纳入 R2)。

## Implementation Plan (small PRs)

- PR1:`estimateTokens` 加 Map 缓存 + `clearTokenEstimateCache()` + 清理点(compaction/clear)+ perf 复跑验证 + changeset

(单 PR 即可,改动面小、内聚。)

## Technical Notes

### 为什么不做 `WeakMap<Message>`(Layer 2)

- projector `mergeAdjacentUserMessages`(`projector.ts:140-158`)对**每条**消息无条件 `cloneMessage`,即使不需要合并。投影产物全是新对象 → `WeakMap<Message>` 对 `computeCompletionBudgetCap` 等扫投影产物的调用点永不命中。
- Layer 1(`Map<string>`)覆盖投影路径后,`estimateTokensForMessage` 退化为 O(parts) 次 Map 查找(全命中)+ `JSON.stringify(call.arguments)`(残留 O(n))。后者工具调用远少于文本,Layer 1 下可忽略;实测确认后再评估 Layer 2。

### 残留热点预估(实测校准 2026-08-12)

**实测**:`estimateTokens` 自采样 83.3% → **22.3%**;模式 A wall time 4.3-4.5s → **0.55s(8 倍,超 `<1s` 预测)**。

**残留归因**(profile 数据 + 负载脚本核验):22.3% ≈ 211ms,与新内容一次性扫描的固有成本精确吻合——每 step 新产生 ~55KB 文本(assistant 输出 15KB + 2 个 tool result 各 20KB),新内容必须被逐字符扫描至少一次;200 steps × 55KB ≈ 11MB 字符循环。同 step 内的 3x 冗余扫描与跨 step 重复扫描已被缓存全部消除,这部分 0 冗余。

**`<10%` 阈值为何不达标**:该阈值基于「缓存命中后不再进热点」的预测,未计入负载的新内容流。新内容扫描是固有下限,即使做 Layer 2(`WeakMap<Message>`)也无法跨越(本负载 JSON.stringify args 仅 ~50 字节,Layer 2 收益≈0)。真实会话中 Write/Edit 等大参数工具会让 JSON.stringify 重序列化显著,Layer 2 的真实价值需真实会话校准(维持推迟,见 Out of Scope)。

**真实会话视角**:每 step 残留 ~1ms,被 LLM 往返延迟(2-30s)完全覆盖,用户无感知。优化前每 step ~20ms 的纯 CPU 热点已消除 95%+。

### 模式 C(多 subagent 并行)的共享缓存

多 subagent 共享同一模块级 Map(纯函数共享安全)。某 agent compaction 清缓存会波及其他 agent(一次性重算),非正确性问题。模式 C 的 token 估算占比 ~49%,Layer 1 同样适用。

### `JSON.stringify` 残留与 resume 清理路径

- **残留**:Layer 1 后 `estimateTokensForMessage` 中 `JSON.stringify(call.arguments)` / `JSON.stringify(tool.parameters)` 每次产生新字符串,`Map.get` 需重新哈希(O(n) 但原生字节级,远快于 codePoint 循环)。文本内容(`part.text`)是同一字符串对象,哈希已缓存 → O(1)。文本是热点主体(83% 自采样的压倒性来源),工具调用 JSON 是次要残留 → Layer 1 下可忽略。
- **resume 清理**:`handleReplayRecord`(`context/index.ts:339-345`)有自己的 `context.apply_compaction` 处理,不调用 `ContextMemory.applyCompaction`(清理点所在)。因此 resume 路径不触发缓存清理。**不影响正确性**:resume 通常是新进程(缓存为空);即使进程内 resume,残留的缓存条目仍有效(纯函数,同一文本恒同结果)。清理点只需覆盖 live path 的 `applyCompaction` + `clear`。

## Research References

- [typescript weakmap-memoization](../research/typescript-weakmap-memoization-6.md) — 对象键用 WeakMap(GC 自动失效);原始值(字符串)键必须用 Map(纯函数恒正确)。本 PRD 的 `Map<string>` 选型直接依据此记录的「原始值键」结论。

## Traceability

- **Created by**: `/think` (2026-08-12)
- **Builds on**: PRD-0026(REPORT-0026 §5 优化清单项 1)
- **Research**: `docs/research/typescript-weakmap-memoization-6.md`(verified,2026-08-12)
- **Grilled by**: `/grill` (2026-08-12) — hostile review 通过,计划稳固。修正 3 处:(1) 软化 JSC 哈希缓存声明为非负载依据;(2) R3 补缓存行为测试;(3) Technical Notes 补 `JSON.stringify` 残留与 resume 清理路径分析。无阻塞性问题,无 ADR 需要(易逆转、不意外、常规优化)。
- **Sliced by**: `/story` → Child Issues below (2026-08-12)
- **Sliced into**:
  - #267 — [PRD-0028] estimateTokens 字符串级缓存 + 清理点 — 消除 83% CPU 热点 (AFK) — **Done**(commit `bffae78`)

## Domain Terms

无新增产品术语。PRD-0026 的「GC 放大器」「决策门」内部术语继续沿用。

## Issue

#266(父 Issue,2026-08-12 创建)
