# 缓存发布契约 — 破坏侧归因、CI 门禁与真实探针

> **Status**: Done | **PRD**: PRD-0029 | **Created**: 2026-08-12 | **Last updated**: 2026-08-12

## Goal

把 byf 的「缓存稳定」从 ADR/注释里的架构原则，升级为**可执行、可观测、可回归的发布契约**。在 PRD-0007（读侧命中率展示，已 Done）之上补三块能力：(1) **破坏侧归因**——当缓存前缀被打破时，能定位到是 system/tools/哪一块变了，而不只是看到命中率掉；(2) **CI 门禁**——把前缀稳定性变成自动化回归测试 + PR 影响标注；(3) **真实 provider 探针**——opt-in 对真实 API 验证缓存行为，弥补 mock 与现实的断层。另含一个前置快胜：补全 DeepSeek `prompt_cache_hit_tokens` 解析（PRD-0007 假设「provider 层数据管道 100% 到位」，但对 DeepSeek 直连不成立）。

详细现状审计与证据见 [docs/cache-optimization-audit.md](../cache-optimization-audit.md)。

## What I already know

来源：四路代码探索 + 直接读码验证（详见审计报告）。

**已验证的实锤（直接读码）**：

- `packages/kosong/src/providers/openai-common.ts:222-245` 的 `extractUsage` 只读顶层 `cached_tokens`（"Byf proprietary"）与 `prompt_tokens_details.cached_tokens`（OpenAI 标准）；全仓 `rg "prompt_cache_hit|prompt_cache_miss"` 生产代码零命中。→ DeepSeek 直连命中率永远显示 0%。
- `packages/kosong/src/providers/openai-completions.ts:528-534` 在 `createParams` spread 之后写 `prompt_cache_key`，`completionsCacheKey`（:134-136）总返回值 → 永远覆盖 generationKwargs 里 sessionId 映射来的 key（AGENTS.md 宣称的 sessionId 提示在 completions 路径是死配置）。

**既有基础设施（可复用）**：

- `PromptPlan` + `CacheStrategy`（`explicit-block`/`prompt-cache-key`/`prefix-match`/`none`）+ `CacheScope`（`global`/`project`/`session`/`none`）已是 vendor 中立模型（`packages/kosong/src/prompt-plan.ts`、`capability-registry.ts`）。
- `cacheBlockHashes` / `providerCacheStrategy` 的 per-block SHA256 指纹**设计已完成**，但**只存在于测试脚手架**（`packages/agent-core/test/agent/cache-observability.test.ts:164-235`、`cache-observability-integration.test.ts`），注释 `// After implementation, LlmConfigMetadata should include: ...`；生产 src 零命中。
- 读侧命中率展示链路已端到端打通（PRD-0007 Done）：`usage.ts:57-71` `cacheHitRate()` → CLI footer / `/usage` / `/status` / subagent chip / vis。
- 前缀稳定性纪律已落地：时间戳在 `before_user`（`injection/timestamp.ts:6-9`）、确定性工具排序（`tool/index.ts:426-451`）、稳定章节头 + 边界退化告警（`prompt-plan/builder.ts:186-223`）、cache staking 浅拷贝不 mutate（`cache-staking/index.ts:29`）。
- CI 现状：`.github/workflows/ci.yml` 是单一 quality job（install/lint/typecheck/test/build），无任何缓存行为门禁。
- 所有 e2e 用 `FakeLLM`（`streaming.e2e.test.ts:6-9`），`it.live`/`RUN_LIVE` 零命中；无真实 provider 探针。

**官方事实（DeepSeek/Anthropic/OpenAI 文档）**：

- DeepSeek：缓存全自动、不支持 `prompt_cache_key`、用顶层 `prompt_cache_hit_tokens`/`prompt_cache_miss_tokens` 上报、miss≈hit 的 50–120 倍（V4 定价）。
- Anthropic：最多 4 个 `cache_control` 断点、`tools→system→messages` 顺序、`tool_use` key 顺序随机化会失效、命中 0.1×。
- OpenAI：`prompt_cache_key` 是 best-effort 路由提示、必须跨请求稳定复用、命中 0.5×。

## Assumptions (temporary)

- DeepSeek（及兼容端）是 byf 用户的主要 provider 之一，且随「user-provided API key」转型会更重要——故命中率不可见是真实痛点，而非假问题。
- 「把缓存做成发布契约」的收益（成本节约 + 回归防护）大于其复杂度税（critique #1）。此假设需 grill 压力测试。
- mock-based 守卫有价值（能抓到「前缀字节变化」这类确定性回归），但不能替代真实探针——两者互补。
- 现有 `cacheBlockHashes` 测试脚手架反映的是「已设计但未实现」的真实意图，可作为破坏侧归因的起点。

## Open Questions

> grill 进度跟踪。✅ = 已决，🔍 = 进行中，⬜ = 待决。

1. ✅ **Scope 切分** — R1（DeepSeek 解析）作为 PR1 留在本 PRD 内、最先落地（trivial 但属可验证性故事的地基，不单独立 PRD）。
2. ✅ **指纹粒度（B）** — **逐块**：每个 PromptPlan 块按 `块名 → SHA256(text)` 哈希（覆盖全部块，因 scope 只影响 cache 断点位置、不影响是否发送）；桩2 沿用既有 `toolsHash`（确定性排序已保证稳定性，无需逐工具）。聚合 `systemPromptHash` 保留为 roll-up。历史维度（桩3/压缩）由 Approach A 推迟。
3. ✅ **破坏事件模型（B）** — 持久化 wire op `context.cache_churn`，per-block 指纹比对检测到块变化时 dispatch；payload `{ blockName, cacheScope, beforeHash, afterHash }`；单级（payload 带 scope 让读者推导严重度：global 块变 = 打破所有会话缓存最该报警，session 块在会话内变 = 本会话回归信号）；比对状态 in-memory 挂 Agent。
4. ✅ **归因呈现（B）** — **user-visible**（升级到 Approach B 深度）：CLI `/status` Cache 段加「Last prefix change: `<blockName>` (`<scope>`) <N turns ago>」+ 发生当 turn 低存在感 notice；vis 渲染为 ribbon（与压缩同范式）；趋势 = 既有逐 turn TokenBar overlay churn 标记 + `/usage` 累计 churn 次数（不发明新指标，回应 critique #5 纯绝对数掩盖趋势）。
5. ✅ **cache-impact 触发路径（C）** — glob 集合（自推导）：`packages/kosong/src/providers/**`、`packages/kosong/src/{prompt-plan,usage}.ts`、`packages/agent-core/src/prompt-plan/**`、`packages/agent-core/src/agent/{cache-staking,injection,compaction}/**`、`packages/agent-core/src/agent/context/projector.ts`、`packages/agent-core/src/agent/tool/index.ts`。机制：CI step 检测到上述 glob 改动时要求 PR body 含 `cache-impact: <none|low|medium|high>`，空值/todo 失败。
6. ✅ **回归测试形态（C）** — Replay Provider（`ScriptedEchoChatProvider`/`AgentConfig.generate` 注入，零 API 成本）驱动 N=5 turn 固定语料；断言 global-scope 块哈希 + toolsHash 跨 5 turn 完全相同；加负向用例（测试专用 injector 把动态内容塞 `after_system`）断言守卫能检测到。
7. ✅ **命中率数值门禁（C）** — Approach A 决定**不设** CI 数值门禁（避免 mock 测假设风险）；数值验证交给真实探针 D。
8. ✅ **探针门控/频率/断言（D）** — 仅 DeepSeek；`DEEPSEEK_API_KEY` env-key opt-in（不进常规 CI）；人工发布前跑；断言冷/热两次调用的 `prompt_cache_hit_tokens` 差异 + `prompt_tokens ≈ hit+miss` 恒等式。
9. ✅ **测量哲学** — 自解为文档注记：在审计报告 + 本 PRD Technical Notes 显式承认「mock 守卫测的是我们对 provider 行为的假设，不是事实；真实行为靠 D 探针校准」（呼应 critique #5）。不构成功能需求。
10. ✅ **死配置清理（E）** — 纳入本 PRD 作小 PR（PR5）：不改请求逻辑（content-hash 跨轮稳定、可辩护；DeepSeek 忽略该字段无害），修正 AGENTS.md 「sessionId→prompt_cache_key」的误导性声称，把 content-hash 覆盖意图显式化。

## Requirements

- [R1] DeepSeek（及兼容端）的 `prompt_cache_hit_tokens`/`prompt_cache_miss_tokens` 被正确解析并映射到现有 `TokenUsage` 四字段模型，命中率在 CLI/vis 不再恒为 0。
- [R2] 生产代码产出 per-block 前缀指纹（至少覆盖桩1 system 块 + 桩2 tools 数组），并在 turn 间可比对。
- [R3] 静态前缀被打破时产出可归因的持久化事件（`context.cache_churn`），能定位到具体变化的 system 块（块名 + scope）或 tools；事件在 CLI `/status` 与 vis 可见。
- [R4] CI 含至少一个前缀稳定性回归测试，能在桩1/桩2 意外变化时失败。
- [R5] 改动缓存敏感路径的 PR 被机制化地要求标注 cache 影响（label 或表单字段，空值被拦）。
- [R6] 存在 env-key 门控的真实 provider 探针测试，验证多 turn 缓存命中行为。

## Acceptance Criteria

- [ ] [R1] 直连 DeepSeek 跑多 turn 会话，`/usage` 与 footer 的 cache 命中率非零且随轮次爬升；`prompt_tokens ≈ hit+miss` 自检通过。
- [ ] [R1] 新增解析有单元测试，覆盖 DeepSeek 顶层字段、OpenAI 嵌套字段、Anthropic 字段三套形态（防止回归）。
- [ ] [R2] `LlmConfigMetadata`（或等价位置）携带 per-block 哈希，集成测试断言同会话连续 turn 哈希不变。
- [ ] [R3] 人为扰动 system prompt（模拟新注入器跑位到 `after_system`）时，dispatch `context.cache_churn`，payload 正确携带变化块名 + scope；vis 渲染 ribbon；`/status` 显示「Last prefix change」。
- [ ] [R4] 故意把动态内容塞进前缀的改动，会让 CI 回归测试红。
- [ ] [R5] 改动 `prompt-plan.ts` 的 PR 未填 cache-impact 标注时被 CI 拦下（或有等价的机制化提醒）。
- [ ] [R6] 本地设置 `DEEPSEEK_API_KEY` 跑探针测试，能验证冷/热两次调用的命中字段差异。

## Definition of Done

- Tests added/updated（单元 + 集成；探针测试 opt-in 不进常规 CI）
- Lint / typecheck / CI green
- 行为变化的文档更新（审计报告 + 相关 ADR 的「未来防御规则」段落）
- 不引入对单一 vendor 的硬编码（保持 capability-driven）

## Out of Scope

- 缓存稳定性基础设施本身的重构（PromptPlan/CacheStaking 已 Done，本 PRD 只在其上加观测与门禁）。
- 读侧命中率展示的新增 UI（PRD-0007/0018 已 Done）——本 PRD 的破坏侧归因 UI 仅限「定位变化」，不重做读侧面板。
- MCP schema 磁盘缓存（缺口 G）、models.dev catalog 缓存（缺口 H）、schema canonicalize（缺口 F）——属 Tier 2，独立推进。
- 多进程/并行缓存竞争（critique #6）——通用问题，非本 PRD 范围。
- 经济前提脆弱性的产品级处理（缺口 K）——仅在文档显式承认边界，不构成本 PRD 的功能需求。

## Technical Approach

> 仅给出方向骨架，具体决策待 grill 收敛后填入 Decision (ADR-lite)。

整体分四层，自下而上：

1. **数据层（R1）**：在 `extractUsage`（`openai-common.ts`）增加 DeepSeek 顶层字段分支，映射 `hit→inputCacheRead`、`miss→inputOther`；`cacheHitRate()` 口径不变。
2. **指纹层（R2/R3）**：把测试脚手架里的 per-block SHA256 接入生产 `LlmConfigMetadata`，turn 间比对，变化即归因事件。复用 `deriveCacheKeyFromPromptPlan`（`prompt-cache-key.ts`）的「只取 global 块」语义或扩展之——具体粒度见 Open Question 2。
3. **门禁层（R4/R5）**：CI 加前缀稳定性回归（基于 FakeLLM replay 固定语料，断言连续 turn 桩哈希不变）+ cache-impact PR 标注机制（路径触发 + 空值拦截）。
4. **现实层（R6）**：opt-in 真实探针测试，env-key 门控，验证命中字段与恒等式。

## Research References

- [docs/cache-optimization-audit.md](../cache-optimization-audit.md) — 本 PRD 的事实基础：四路探索 + 读码验证的缺口分级与证据。
- DeepSeek Context Caching on Disk（`api-docs.deepseek.com/guides/kv_cache`）— 全自动、不支持 prompt_cache_key、顶层 hit/miss 字段、miss≈hit 50–120×。
- Anthropic Prompt Caching（`platform.claude.com/docs/.../prompt-caching`）— 4 断点、tools→system→messages、key 顺序敏感、命中 0.1×。
- OpenAI Prompt Caching（`platform.openai.com/docs/guides/prompt-caching`）— prompt_cache_key 为稳定路由提示、命中 0.5×。

## Feasible Approaches

> 针对最大的结构性决策（指纹粒度 + 门禁落点）列选项；其余 Open Questions 由 grill 逐项展开。

**Approach A: 最小可验证切片（Recommended）**

- How: R1 先独立落地（trivial 快胜）；B 只做「桩1+桩2 哈希 + churn 日志事件」（不覆盖历史锚点、不做 UI）；C 只做前缀稳定性回归测试 + cache-impact label 提醒（不设数值门禁）；D 只做 DeepSeek 单 provider 探针。
- Pros: 每层最小化、可独立合并、快速闭合「无法证明/无法被告知」的主缺口；不引入数值门禁的「测假设」风险。
- Cons: 破坏侧归因不含历史维度（压缩后的 churn 看不到）；数值命中率仍只在真实探针里验证。

**Approach B: 完整契约层**

- How: 在 A 基础上，B 增加历史锚点指纹 + CLI/vis 归因呈现 + 趋势信号；C 增加 release 级命中率数值门禁（如 ≥90%）；D 覆盖 Anthropic+OpenAI+DeepSeek 三家探针。
- Pros: 缺口一次性补齐，逼近 Reasonix 的发布契约成熟度；趋势可观测。
- Cons: 范围大、周期长；数值门禁有「mock 测假设」风险（critique #5），需谨慎设计语料。

**Approach C: 只做门禁与探针，跳过破坏侧归因**

- How: 跳过 B（破坏侧归因），只做 R1 + CI 前缀稳定性回归 + 真实探针。理由：如果回归测试能在前缀变化时失败，就不需要事后再归因。
- Pros: 最省力；把「证明」前移到「拦截」。
- Cons: 回归测试只能覆盖「已知语料」，无法解释生产中真实的命中率下滑（哪个注入器/哪次压缩打破的）；放弃了 PRD-0007 已经预留的 staking-debug-UI 演进路径。

## Decision (ADR-lite)

**Context**: PRD 列了三个方案——A（最小可验证切片）/ B（完整契约层）/ C（跳过破坏侧归因，用拦截替代）。需选一个以确定 B/C/D 的实现深度。这是依赖根，重塑下游多数子决策。

**Decision**: **Approach A（最小可验证切片）**（grill 2026-08-12 与用户确认）。

**Consequences**:

- **B**：只做**静态前缀**归因——桩1（PromptPlan 块）逐块指纹 + 桩2（tools 数组）哈希。**归因呈现升级为 user-visible**（grill 中与用户确认）：持久化 wire op `context.cache_churn`（payload `{ blockName, cacheScope, beforeHash, afterHash }`）+ CLI `/status` Cache 段「Last prefix change」行 + 发生当 turn notice + vis ribbon（与压缩 ribbon 同范式）+ 趋势（既有逐 turn TokenBar overlay churn 标记 + `/usage` 累计 churn 次数）。比对状态 in-memory 挂 Agent（上一 turn per-block 哈希），restore 时从 system prompt 重算。**历史维度归因（桩3 / 压缩后历史前缀变化）仍推迟**——压缩本就会、且应当改写历史前缀（CONTEXT.md 已明确压缩是预期事件），历史侧 churn 大量为"预期"，归因边际价值低于静态前缀侧。
- **C**：只做前缀稳定性回归断言（连续 turn 桩1/桩2 哈希不变）+ cache-impact PR 标注。**不设 CI 命中率数值门禁**——在没有真实探针沉淀出可信基线前，给 mock 数据设数值门禁是"测我们自己的假设"（critique #5），风险高于收益。
- **D**：只做 **DeepSeek 单 provider** 探针（byf 转向 user-provided key 后最普遍、且缺口 A 的直接受益方）。
- **升级路径**：数值门禁与历史归因留待真实探针跑出真实分布后，再评估是否升级到 Approach B。
- **已知风险**：用户在生产中遇到命中率下滑、且根因在历史侧（如某次压缩异常）时，A 的归因覆盖不到——靠 D 的真实探针与既有读侧命中率展示（PRD-0007）兜底。
- **落地偏差（实现时记录）**：B 段「发生当 turn 低存在感 notice」与「既有逐 turn TokenBar overlay churn 标记」**本轮未实现**——属展示细化，留待真实探针沉淀分布后随 Approach B 升级评估。已落地：`context.cache_churn` wire op + CLI `/status`「Last prefix change」行 + vis churn ribbon + `/usage` 累计 churn 次数。另：实现时发现「指纹生产已就绪」（`agent/index.ts` 早已产出 per-block 哈希），PR2 实际收窄为「消费侧比对 + 事件 + restore」。

## Implementation Plan (small PRs)

> 方向骨架，待 Decision 定稿。

- PR1（R1）: DeepSeek usage 解析 + 三套字段形态的单元测试（trivial，可最先合）。
- PR2（R2/R3）: per-block 指纹接入生产 `LlmConfigMetadata` + in-memory turn 间比对 + `context.cache_churn` wire op（dispatch + restore 重放）+ 单元/集成测试。
- PR2b（R3 UI）: CLI `/status` Cache 段「Last prefix change」+ 当 turn notice；vis churn ribbon（对齐压缩 ribbon）；`/usage` 累计 churn 次数；TokenBar overlay churn 标记。
- PR3（R4/R5）: CI 前缀稳定性回归测试（Replay Provider + N=5 turn 哈希不变断言 + 负向用例）+ cache-impact PR body 标注机制（glob 触发 + 空值拦截 CI step）。
- PR4（R6）: `DEEPSEEK_API_KEY` 门控真实探针测试（冷/热两次调用命中字段差异 + `prompt_tokens≈hit+miss` 恒等式），opt-in 不进常规 CI。
- PR5（G12）: 修正 AGENTS.md `sessionId→prompt_cache_key` 误导性声称，content-hash 覆盖意图显式化（小 PR，可先合）。

## Technical Notes

- 关键文件索引见 [审计报告附录](../cache-optimization-audit.md#5-附录关键代码索引)。
- 相关 ADR：ADR-0009（压缩+缓存基础设施）、ADR-0011（3+1 桩模型，本 PRD 破坏侧归因的直接基础）、ADR-0013（四块架构）。
- 注意 `docs/architecture-debt-roadmap.md:54-60` 的债务警告：重构 `deriveCacheKeyFromPromptPlan` 时必须保留 responses vs completions 的空 plan 行为差异，否则静默改变 OpenAI completions 缓存行为。
- 风险：critique #1（缓存税）——本 PRD 增加的门禁会进一步提高缓存敏感路径的改动摩擦。需在「防护价值」与「开发税」间权衡（Open Question 9）。

## Traceability

- **Created by**: `/think`（2026-08-12，基于 `docs/cache-optimization-audit.md` 审计）
- **Grilled by**: `/grill`（2026-08-12）— 选定 Approach A；指纹粒度 per-block；破坏侧归因升级 user-visible（持久化 `context.cache_churn` wire op + CLI `/status` + vis ribbon + 趋势 overlay）；CI cache-impact glob 门禁 + Replay Provider 前缀稳定性回归（不设数值门禁）；DeepSeek 单 provider 真实探针；G12 死配置清理纳入；4 个新术语入 CONTEXT.md（缓存桩 / 前缀指纹 / 破坏侧归因 / 真实探针）。无决策升级正式 ADR。
- **Sliced by**: `/story`（2026-08-12）→ Child Issues below
- **Sliced into**:
  - #269 — [PRD-0029] DeepSeek usage 解析 (AFK) — Done
  - #270 — [PRD-0029] 前缀指纹比对 + cache_churn 事件 (AFK) — Done
  - #271 — [PRD-0029] churn 归因 UI（CLI/vis） (AFK, blocked by #270) — Done
  - #272 — [PRD-0029] CI 前缀稳定性回归 + cache-impact PR 标注门禁 (AFK, blocked by #270) — Done
  - #273 — [PRD-0029] DeepSeek 真实探针测试 (AFK, blocked by #269) — Done
  - #274 — [PRD-0029] AGENTS.md 死配置清理 (AFK) — Done

## Issue

#268 — 缓存发布契约——破坏侧归因、CI 门禁与真实探针 (PRD-0029)
