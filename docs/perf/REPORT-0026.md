# PRD-0026 性能剖析报告与决策

> **Status**: Final | **PRD**: PRD-0026 | **Created**: 2026-08-11 | **Machine**: darwin arm64, Bun 1.3.14

本报告汇总三模式 CPU profile + GC 量化 + `--smol` 对照的结果,给出「切不切语言」的数据决策与第一轮定点优化清单。原始 profile 数据见同目录 `*.cpuprofile` / `*.md`(可重新生成,见 `scripts/perf/README.md`)。

## 1. 结论先行(决策门判定)

**决策:定点优化路径。不切语言。**

| 决策门要素 | 实测 | 阈值 | 判定 |
| --- | --- | --- | --- |
| GC 时间占比 | **~6%**(默认 6.0% / 关并发 GC 5.6% / --smol 5.9%) | <15% → 定点优化 | ✅ 落入定点优化区 |
| 热点集中度 | 前 1 函数(`estimateTokensForMessage`)**占 83%** 自采样 | >50% 集中 | ✅ 高度集中(单一函数) |
| 消除可行性 | 字符级 token 估算,可在 TS 层消除(缓存/向量化) | 总闸:固有不可消除才升格 native | ✅ 可消除,不触发总闸 |

GC 不是「单核 100%」的根因——**根因是 `estimateTokensForMessage` 的逐字符循环每 step 对整份历史跑多次**,纯 CPU、与 GC 无关。换语言无数据依据。

## 2. 热点归属百分比表(R2)

### 模式 A 交互长会话(主场景,默认基线 50 turn)

| 归属 | 自采样占比 | 代表函数 | 位置 |
| --- | ---: | --- | --- |
| **token 估算** | **~88%** | `estimateTokensForMessage` 83.3% + `estimateTokensForContentPart` 4.2% + `estimateTokens` 0.3% | `utils/tokens.ts:44,58,13` |
| native 运行时 | ~5% | `next`(JSC 迭代器) | `[native code]` |
| 其他(agent-core 各处) | ~7% | `cloneObject`、`structuredClone`、`stringify`、`applyCacheStaking`、`cloneMessage`、`applyPruning`、`maskToolResult` 等,各项 <0.5% | 散布 |

**调用链**(自顶向下,模式 A):`runTurn` → `beforeStep`(compaction) → `applyObservationMasking`(36.6% total) → `estimateTokensForMessages`(93.6% total) → `estimateTokensForMessage`(83.6% total)。同一路径还有 `buildLlmRequestMetadata`(18.7%)与 `computeCompletionBudgetCap`(18.3%)各自独立调用 token 估算——即**同一份历史每 step 被 O(n) 扫多次**。

### 模式 B resume 大会话(默认基线)

| 归属 | 自采样占比 | 备注 |
| --- | ---: | --- |
| token 估算 | **~89%**(`estimateTokensForMessage` 83.6%) | 与模式 A 一致:resume replay 重建状态后,后续 turn 仍是同一热点 |
| native / 其他 | ~11% | `next` 5.1%、`stringify`、`cloneObject` 等 |

模式 B 的 resume 阶段(replay 不调 LLM,5ms 完成 115KB wire)开销可忽略;热点出现在 replay 后的「继续会话」部分,与模式 A 同源。

### 模式 C 多 subagent 并行(5 子 agent × 4 turn)

| 归属 | 自采样占比 | 备注 |
| --- | ---: | --- |
| token 估算 | **~49%**(`estimateTokensForContentPart` 21% + `estimateTokens` 20.8% + 其他) | 子 agent 历史短,单次估算更快;占比下降但仍是第一 |
| native 调度 | ~31%(`(anonymous)` 22.3% + `(anonymous)` 9.0%) | 并发调度的运行时开销凸显 |
| 其他 | ~20%(`addUsage`、`async chatOnce` 等) | 多 agent 的 usage 聚合、请求构建 |

模式 C 验证了并发场景下 token 估算仍是第一热点,但相对份额下降——并发调度的 native 开销占比上升。

## 3. GC 量化(R3 + R4)

三组对照(模式 A 默认基线,各跑一次):

| 配置 | wall(ms) | gc 采样数 | gc 耗时(ms) | gc 占比 | peakHeap |
| --- | ---: | ---: | ---: | ---: | ---: |
| 默认并发 GC | 4485 | 50 | 271 | **6.0%** | 24.7MB |
| `BUN_JSC_useConcurrentGC=0` | 4466 | 50 | 252 | **5.6%** | 24.6MB |
| `--smol` | 4490 | 50 | 263 | **5.9%** | 24.6MB |

**关键观察**:

- 三组 GC 占比都在 **5.6-6.0%**,差异在噪声范围内(~20ms)。**关并发 GC 几乎不增主线程负担**,说明 GC 本就在后台并发跑,「GC 打满主线程」假设**不成立**。
- `--smol`(更频繁 GC)与默认组几乎无差,进一步确认「GC 是放大器」假设**在当前负载下不成立**——GC 既不是放大器也不是根因。
- 堆增长:171KB → 24.7MB,50 turn 后**趋于平缓**(`peakHeap=endHeap`),**无内存泄漏**。RSS 130MB → 178MB,稳定。
- 暂停统计:gc probe 在 turn 边界确定性采样,50 样本 × ~5.4ms/次 = 271ms 总 GC 时间,单次平均 ~5.4ms(无长暂停)。

**GC 量化的局限说明**:CPU 密集的同步热点会饿死 `setInterval`,所以内存采样在长同步运行中偏少(4.5s 运行只采到 2 个内存样本);GC 采样靠 turn 边界的确定性 `sampleOnce()` 补救(50 样本稳定)。真正的 GC 帧归属以 CPU profile 为准——而 CPU profile 中 GC 帧未进 top 50,印证 ~6% 占比。

## 4. 规模基线实测

| 模式 | 默认基线 wall | records | wire | peakHeap | 说明 |
| --- | ---: | ---: | ---: | ---: | --- |
| A | 4.3-4.5s | 14,395 | — | 25-90MB | 主场景,200 次 generate 调用 |
| B | 7.5-7.8s(含 resume) | — | 115KB-随规模 | 46-131MB | resume 阶段 5ms,可忽略 |
| C | 0.25s(5 子 × 4 turn) | — | — | 24MB | 并发,子 agent 历史短 |

(2x 压力档未单列,按 `--scale 2` 翻倍参数即可复跑。)

## 5. 第一轮定点优化清单(R6)

按「预期收益 × 可行性 / 风险」排序。**所有项均为 TS 层可消除,不需要 native。**

### 优化项 1:缓存 message 级 token 估算(最高优先)

- **位置**:`packages/agent-core/src/utils/tokens.ts`(`estimateTokensForMessage` / `estimateTokensForMessages`)
- **问题**:每 step 对整份历史(100-200K token)做 O(n) 逐字符扫描,且同一步内被 observation-masking、completion-budget、buildLlmRequestMetadata **各自独立调用一遍**(3 倍冗余)。`estimateTokens` 是 `for...of` 逐 codePoint 判断 ASCII/CJK。
- **预期收益**:**~80% CPU**(模式 A/B)。历史中绝大多数消息每 step 不变,按 message 引用缓存估算值即可把 3 次全量扫描降到「仅新消息」。实测 83% 自采样直接消除。
- **工作量**:中。在 `Message` 上挂懒计算的 token 计数(或 WeakMap),`estimateTokensForMessage` 命中缓存即返回;内容变更处(压缩、掩码、offload)失效。
- **风险**:低。token 估算本来就是「transient」(下次 LLM 调用返回真实值即取代),精度要求不高。需确保所有消息内容变更路径都失效缓存。

### 优化项 2:合并同 step 内的多次 token 估算

- **位置**:`applyObservationMasking`(context/index.ts:216)、`computeCompletionBudgetCap`(completion-budget.ts)、`buildLlmRequestMetadata`(agent/index.ts:741)
- **问题**:三处在同一 step 各自调 `estimateTokensForMessages`,重复扫描整份历史(调用链 total% 三处合计 >70%,去重后实际 unique 工作量约 1/3)。
- **预期收益**:**额外 ~10-15% CPU**(与项 1 叠加后,项 1 的缓存已基本覆盖此项;若项 1 不做,此项独立可省 2/3 重复扫描)。
- **工作量**:小。提出一个 per-step 的估算结果,三处共用。
- **风险**:低。需确认三处的输入消息集合一致(或差异可忽略)。

### 优化项 3:`estimateTokens` 向量化(若项 1 后仍需)

- **位置**:`utils/tokens.ts:13` `estimateTokens`
- **问题**:`for (const char of text)` + `codePointAt` 逐字符判断。
- **预期收益**:项 1 之后此函数不再进热点;若不缓存,改用正则计数 ASCII(`/[\x00-\x7f]/g` length)或按字节长度估算可快数倍。
- **工作量**:小。
- **风险**:低。纯函数,单测覆盖。

### 暂不优化(收益 <1%,排期后续)

- 投影深拷贝 `cloneMessage`(projector.ts:185):0.1% 自采样,非热点。
- cache-staking `applyCacheStaking`:0.0%,非热点。
- SHA256 指纹:未进 top 50,非热点(模式 A 静态系统提示 + 工具定义缓存命中后哈希开销可忽略)。
- 事件风暴(deepCopyPart):模式 A 未显现,模式 C 也未进 top 5——流式 part 的 deepCopy 在当前负载下不是瓶颈。
- wire 序列化:模式 A 内存持久化无 stringify 热点;模式 B 的 fsync/parse 在 5ms resume 内,可忽略。

## 6. 对「切语言」问题的直接回答

用户原始观察:「Bun 长会话单核 CPU 100%,怀疑 GC,考虑切语言」。

**数据结论**:

1. **GC 占比 ~6%**,远低于决策门的 15% 阈值;关并发 GC 与 `--smol` 均无显著变化——**GC 既不是根因也不是放大器**。
2. **83% CPU 集中在一个 TS 函数**(`estimateTokensForMessage` 的逐字符循环 × 每 step 多次 × 整份历史),**纯 CPU、与运行时无关、可在 TS 层消除**。
3. **堆内存稳定**(24MB 平缓,无泄漏);RSS 稳定。

**因此**:切到 Rust/Go/Zig **不会**解决这个热点——热点是应用层算法(每 step 重复 O(n) 扫描),换语言后同样的算法仍是 O(n),只是常数更小。**先做项 1(缓存 message 级估算)即可把 ~80% CPU 消除**;若之后仍有 native 需求,以实测数据再启 ADR。

## 7. 复跑方法

```sh
# 三模式 CPU profile(markdown 报告)
bun --cpu-prof --cpu-prof-md --cpu-prof-dir docs/perf --cpu-prof-name mode-a \
    --cpu-prof-interval=1000 scripts/perf/load.ts --mode a --json

# GC 量化三组对照
bun --expose-gc scripts/perf/load.ts --mode a --json
BUN_JSC_useConcurrentGC=0 bun --expose-gc scripts/perf/load.ts --mode a --json
bun --smol --expose-gc scripts/perf/load.ts --mode a --json
```

完整参数说明见 `scripts/perf/README.md`。规模参数化(`--turns --steps --tools --output-kb` 等),同参数可复现。

## Traceability

- **Closes**: #257(CPU 采谱与热点归属)、#258(GC 量化与对照)、#259(报告与决策)
- **Depends on**: #256(负载脚手架,已完成)
- **原始数据**:CPU/heap dump(`*.cpuprofile`、`mode-*.md`)为机器生成、含本机绝对路径,已 gitignore,按 §7 命令可复跑;本报告 §2 的归属百分比表是经人工提炼的结论,不依赖原始 dump 入库。
