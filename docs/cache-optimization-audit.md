# 缓存优化审计报告

> **Created**: 2026-08-12
> **Source**: 以「DeepSeek-Reasonix 缓存策略分析」+ DeepSeek/Anthropic/OpenAI 官方缓存文档 + 第三方对 Reasonix 缓存机制的结构性批判为三个参照系，经对 byf 代码事实的四路深度探索（provider 层 / 本地与进程内缓存 / 压缩与可观测治理 / 官方最佳实践）交叉验证后产出。
> **状态**: 活跃文档。结论已用代码事实验证；缺口按价值×置信度÷成本分级，供后续逐项推进。修改缓存相关代码前应先读本文件。

本文件是跨 ADR 的缓存优化协调文档，不取代 ADR-0009 / ADR-0011 / ADR-0013 的决策记录，而是在它们之上补一层「现状审计 + 缺口分级」。它的作用是：

1. 给出 **byf 与 Reasonix 的坐标校正**，避免把针对 Reasonix 的批判盲目套用到 byf。
2. 记录 byf 缓存机制的**基本面优势**与**真实缺口**，每条均带 `file_path:line` 证据。
3. 按 **Tier 1/2/3** 排出可执行的优化路线，区分「立即做」「顺势做」「观察项」。

---

## 0. 方法与参照系

三个外部参照：

| 参照 | 提供什么 |
|---|---|
| Reasonix 正面分析 | 「缓存优先」架构的最佳实践清单（字节稳定前缀、分离投影/请求工具集、TTL 宁大勿小、会话级 PINNED、e2e 命中率守卫等） |
| 官方文档（DeepSeek / Anthropic / OpenAI）| 缓存机制事实：字段名、计费倍数、失效条件、`prompt_cache_key` 语义 |
| Reasonix 结构性批判（七类缺点） | 警示模式：缓存税、架构绑架、staleness、经济前提脆弱、可观测盲区、多进程盲区、无界增长 |

**重要前提**：byf 是 TypeScript monorepo，Reasonix 是 Go 单二进制。两者目标相似（provider 前缀稳定）但架构起点不同。下文先做坐标校正，避免照搬批判。

---

## 1. 坐标校正：byf 在哪里已经避开 Reasonix 的坑

盲目套用 Reasonix 的批判会误伤 byf。下表把七类缺点逐条对照 byf 实际情况：

| Reasonix 缺点 | byf 的情况 | 结论 |
|---|---|---|
| #4 硬编码 vendor 知识（host 检测、24h TTL 写死） | byf 是 **capability-driven**：provider 声明 `CacheStrategy`（`explicit-block`/`prompt-cache-key`/`prefix-match`/`none`）+ `CacheScope`（`global`/`project`/`session`/`none`），靠 `packages/kosong/src/providers/capability-registry.ts` 协商，无写死的 host→TTL 表 | ✅ byf 更干净 |
| #3 MCP schema "deferred one session" 实为永不刷新 | byf **不缓存 MCP schema 到磁盘**，每会话 `listTools()` 现拉（`packages/agent-core/src/mcp/connection-manager.ts:342-350`），用启动延迟换新鲜度 | ✅ byf 主动避开最臭名昭著的 staleness 陷阱 |
| #7 磁盘缓存无界增长 | `native-assets` 缓存自带 GC（`apps/cli/src/native/native-assets.ts:304-353`），版本号+内容哈希双键；OAuth/rg 亦有版本或哈希 | ✅ byf 治理更好 |
| #2 架构被缓存绑架 | `CacheScope` 分层允许 `session` 作用域块，比 Reasonix 全有全无灵活；但 `before_user` tail-riding 仍在（`packages/agent-core/src/agent/injection/timestamp.ts:6-9`） | 🟡 部分缓解 |
| #1 全局隐式不变量「缓存税」 | byf 把约束写进 ADR/CONTEXT/注释，但 **CI 无 cache-impact 门禁**（见缺口 C），纪律更非正式 | 🔴 byf 更弱 |
| #5 可观测盲区 | byf 只有读侧命中率，破坏侧归因是脚手架未落地（见缺口 B），且连 Reasonix 的 mock 守卫都没有（见缺口 C/D） | 🔴 byf 更弱 |
| #6 多进程/并行盲区 | 共享 provider 账户的 LRU 互相驱逐问题对两者都存在，低优先 | 🟡 通用问题 |

**一句话**：byf 在「避免 staleness、避免无界增长、vendor 中立」三方面比 Reasonix 更克制；但在「把缓存做成可验证的发布契约」上明显落后。**byf 的优化方向不是『学 Reasonix 加缓存』，而是『补可观测与治理短板，并修两个实测可证的缺口』。**

---

## 2. byf 缓存基本面：已做好的部分（不要在优化时回退）

优化前必须先记住这些**已经在正确轨道上**的设计，避免改进一处、回退一处：

- **vendor 中立的 `PromptPlan`**（`packages/kosong/src/prompt-plan.ts`）：Anthropic 走 `explicit-block`（proactive 注入 `cache_control: ephemeral`，3+1 桩模型 ADR-0011），OpenAI 走 `prompt-cache-key`，Gemini 走 `none`。
- **前缀稳定性纪律**：时间戳等动态内容刻意放在 `'before_user'` 位置（`packages/agent-core/src/agent/injection/timestamp.ts:6-9`、`packages/agent-core/src/agent/context/projector.ts:47-64`），不进可缓存前缀；系统提示按稳定章节头切四块（`packages/agent-core/src/prompt-plan/builder.ts:26-30`），缺失/乱序会触发去重告警。
- **确定性工具排序**：builtin→user→MCP（`packages/agent-core/src/agent/tool/index.ts:426-451`），保证 tools 数组前缀会话内稳定。
- **omitempty 纪律**：请求体可选字段 nil 整体省略（`packages/kosong/src/providers/openai-completions.ts:497-502`、anthropic.ts:870-922），根 AGENTS.md 已立为硬规则。
- **读侧命中率解析（OpenAI/Anthropic）**：`packages/kosong/src/usage.ts:57-71` `cacheHitRate()`，branded 类型防误用；CLI 状态栏 / `/usage` / 子 agent / vis 全面展示（`apps/cli/src/tui/components/messages/{status-panel,usage-panel}.ts`、`apps/vis/web/src/components/context/ContextTab.tsx:113-139`）。
- **POSIX 耐久写 + 权限卫生**：统一 `atomicWrite` / `writeFileAtomicDurable`（`packages/agent-core/src/utils/fs.ts`），凭据 `0o600`/目录 `0o700`，路径穿越守卫贯穿所有按 id 落盘路径。
- **会话级 PINNED 的正确取舍**：MCP schema 不落盘（避免 staleness），靠「下会话生效」无关——byf 直接每会话现拉，新鲜度更高。
- **压缩多通道管道**：masking→pruning→offload→LLM summary（`packages/agent-core/src/agent/compaction/full.ts:267-296`），85% 同步触发，压缩从不触碰系统提示/工具缓存桩（仅替换对话历史前缀）。

---

## 3. 缺口分级

### Tier 1 — 实测可证、高价值、应优先修

#### 🔴 缺口 A — DeepSeek（及多数兼容端）缓存命中统计完全丢失

**证据（已读码确认）**：
- `packages/kosong/src/providers/openai-common.ts:222-245` 的 `extractUsage` 只读两类字段：
  - 顶层 `cached_tokens`（注释 "Byf proprietary"，即 byf 自家网关格式）
  - `prompt_tokens_details.cached_tokens`（OpenAI 标准）
- 全仓 `rg "prompt_cache_hit|prompt_cache_miss"` 在生产代码**零命中**（唯一 `deepseek` 字样是 login 界面占位文案 `apps/cli/src/tui/flows/login-flow.ts:69`）。

**影响**：DeepSeek 官方端点用顶层 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`（非 OpenAI 标准）上报命中。byf 走 openai-completions 路径，这两个字段**完全不被解析** → 用户直连 DeepSeek 时，状态栏 / `/usage` / vis 的缓存命中率**永远显示 0%**。

**为什么最该先修**：
1. byf 正在转向 user-provided API key（AGENTS.md 明示），直连 DeepSeek 会越来越普遍。
2. 经济前提比 Reasonix 假设的还极端：DeepSeek V4 当前 miss ≈ hit 的 **50–120 倍**（非 Reasonix 写的 10 倍）。命中极值钱却看不见——好的缓存工程被一个解析漏斗抹成零。
3. 修复成本极低：`extractUsage` 加一个 `prompt_cache_hit_tokens` 分支，十几行。
4. 自检红利：DeepSeek 恒等式 `prompt_tokens = hit + miss`，解析后可做计费一致性校验。

**对照**：命中官方最佳实践第 8 条（分别解析三套字段）；命中批判 #5（可观测盲区）。

**建议方向**：在 `extractUsage` 增加 DeepSeek 字段分支；`usage.ts` 的 `cacheHitRate()` 口径不变（已抽象为 `inputCacheRead/(inputOther+inputCacheRead+inputCacheCreation)`，把 hit 映射到 `inputCacheRead`、miss 映射到 `inputOther` 即可）。

---

#### 🔴 缺口 B — `cacheBlockHashes` / 破坏侧归因是「脚手架未落地」

**证据**：`packages/agent-core/test/agent/cache-observability.test.ts:164-235` 与 `cache-observability-integration.test.ts` 里有完整的 per-block SHA256 指纹（`cacheBlockHashes`）、`providerCacheStrategy` 设计，注释 `// After implementation, LlmConfigMetadata should include: ...`。全仓 grep 确认这些标识符**只出现在测试里，生产 src 零命中**。

**影响**：byf 缓存可观测性**只有读侧事后命中率**，**没有破坏侧归因**——看不到「是谁打破了前缀、哪一块变了」。命中率掉了，不知道是 system prompt 改了、tools 顺序变了，还是某个注入器跑位。Reasonix 至少有 `PrefixHash` 冻结 + `CompareShape` churn 归因 + `CacheBreak` 事件，byf 这块是空的。

**建议方向**：把测试里的指纹逻辑接入 `LlmConfigMetadata` / `buildLlmConfigSignature`，在 turn 间比对桩1/桩2 块哈希，命中变化就记一条 churn / cache-break 事件；UI 侧把绝对数展示补上趋势信号（批判指出纯绝对数会掩盖下滑趋势）。

---

#### 🔴 缺口 C — CI 零缓存门禁

**证据**：`.github/workflows/ci.yml` 是单一 quality job（install/lint/typecheck/test/build），**没有**：前缀稳定性回归测试、cache-impact PR 标注规则、命中率下限守卫。`compaction.test.ts` 里的 `cacheHitRate` 全是 0（mock provider），只作 status 快照，不构成行为断言。

**影响**：byf 把「缓存稳定」写进了 ADR-0009/0011/0013 和 CONTEXT.md 术语表（文档层一流），但**没翻译成可执行的 CI 契约**。批判 #5「守卫测的是模拟」对 byf 更严重——byf 连模拟守卫都没有。任何新注入器不小心把动态内容塞进 `after_system`（`projector.ts:47-56` 已警告过），**没有任何自动化手段能拦住**，只能靠人眼读注释。

**建议方向**：
1. 加「同会话连续 N turn，桩1/桩2 块 SHA256 不变」回归测试。
2. 改动 `prompt-plan.ts` / `cache-staking/` / `projector.ts` / compaction 切分逻辑时，强制 PR 标 `cache-impact`（参考 Reasonix 的 `scripts/check-cache-impact.sh`）。

---

#### 🟠 缺口 D — 无真实 provider 探针测试

**证据**：所有 e2e 用 `FakeLLM`（`packages/agent-core/test/loop/streaming.e2e.test.ts:6-9` 明说），`it.live` / `RUN_LIVE` 零命中。`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` 只出现在生产代码的运行时回退，不在任何测试里作门禁。

**影响**：缓存契约对真实 provider 行为零覆盖。批判 #5「真实行为只靠不进 CI 的 live probe」——byf 连那个 probe 都没有。

**建议方向**：加 env-key 门控的 opt-in 探针（`// @ts-expect-error live` 或 build tag），验证多 turn 冷/热两次调用的缓存命中行为，发布前手跑。

---

### Tier 2 — 设计异味、中价值

| 缺口 | 证据 | 判断 |
|---|---|---|
| **E. `prompt_cache_key` 覆盖 sessionId** | `openai-completions.ts:528-534` 在 `createParams` spread 之后写 `prompt_cache_key`，`completionsCacheKey`（:134-136）**总返回值**（空 plan 回退空串哈希）→ 永远覆盖 generationKwargs 里 sessionId 映射来的 key | AGENTS.md 宣称的「sessionId→prompt_cache_key 提示」在 completions 路径**实际是死配置**。但内容哈希跨轮稳定、作路由 key 可辩护——所以不是缓存质量 bug，是**文档承诺与实现脱节的清理项**。注意 DeepSeek 不支持该字段，发了也白发。 |
| **F. tools schema 无 canonicalize** | `convertTool`（`openai-completions.ts:222-237`）只透传 `tool.parameters`；agent-core 做了确定性排序但 kosong 不做 schema key 排序 | Anthropic 明确警告 `tool_use` key 顺序随机化会失效。TS 对象 key 序列化通常稳定，但若某 MCP server 返回的 schema key 顺序跨会话不一致，会静默 churn。**主要影响 Anthropic vendor。** |
| **G. MCP schema 无磁盘缓存 → 启动延迟** | `connection-manager.ts:342-350` 每会话 `listTools()` 现拉 | 这是 byf **刻意避免 staleness 的取舍**（正确），但代价是多 MCP server 启动慢。可加 short-TTL（如 5min）+ stale-while-revalidate：命中缓存秒回、后台异步校验、下会话生效——既不重蹈 Reasonix「永不刷新」覆辙，又砍启动延迟。 |
| **H. models.dev catalog 无磁盘缓存** | `apps/cli/src/tui/utils/catalog-fetch.ts` 全文件无 writeFile，每次 `/login`/`/connect` 联网（8s 超时） | 近期 commit `b98ac3f /login catalog fetch timeout fix` 正是这块痛点信号。短 TTL 本地副本能改善弱网/离线。 |

---

### Tier 3 — 低优先 / 观察项

- **I. 无负缓存**：MCP server 故障期每次启动都重握手，无退避。当前可接受的简化。
- **J. update cache / OAuth store 无 schema 版本号**：靠 zod shape guard 兜底，够用；与 native-assets/rg 的版本号策略略不一致，非紧迫。
- **K. 经济前提的脆弱性（批判 #4）**：byf 用 capability 协商已大幅降低暴露，但若用户走「平价无缓存加价网关」，整套纪律买不到收益。这是**无法消除的边界条件**，建议在文档里显式承认而非默认成立（呼应批判收尾）。

---

## 4. 优先级矩阵

| 缺口 | 价值 | 置信度 | 成本 | 价值×置信÷成本 | 建议节奏 |
|---|---|---|---|---|---|
| **A. DeepSeek usage 解析** | 高 | 高（已读码证实） | 极低 | ★★★★★ | **立即做**，可走 /tdd |
| **C. CI 缓存门禁** | 高 | 高 | 中 | ★★★★ | 顺势做，需设计测试夹具 |
| **B. 破坏侧可观测落地** | 高 | 高（脚手架已存在） | 中高 | ★★★ | 谨慎做，设计量最大 |
| **D. 真实 provider 探针** | 中高 | 高 | 中 | ★★★ | 与 B/C 配套 |
| **H. catalog 短 TTL 缓存** | 中 | 高 | 低 | ★★★ | 顺势做 |
| **E. sessionId 死配置清理** | 中 | 高 | 低 | ★★ | 顺手清理 |
| **F. schema canonicalize** | 中 | 中 | 中 | ★★ | 主要 Anthropic 用户受益 |
| **G. MCP schema SWR 缓存** | 中 | 中 | 中高 | ★★ | 需权衡 staleness |
| I/J/K | 低 | — | — | ★ | 观察项 |

**推荐路径**：A（快胜，立竿见影）→ C（治理地基）→ B+D（把缓存做成可验证契约）→ 其余顺势。

---

## 5. 附录：关键代码索引

**Provider / 请求组装**
- `packages/kosong/src/prompt-plan.ts` — `CacheStrategy` / `CacheScope` 类型
- `packages/kosong/src/providers/capability-registry.ts` — per-provider 能力声明
- `packages/kosong/src/providers/openai-common.ts:222-245` — `extractUsage`（缺口 A 现场）
- `packages/kosong/src/providers/openai-completions.ts:124-136` — `completionsCacheKey` 总返回值
- `packages/kosong/src/providers/openai-completions.ts:528-534` — `prompt_cache_key` 注入（缺口 E 现场）
- `packages/kosong/src/providers/prompt-cache-key.ts:24-39` — SHA256(global 块) 派生
- `packages/kosong/src/providers/anthropic.ts:288,311-324,897-903` — `cache_control` 断点注入
- `packages/kosong/src/usage.ts:57-71` — `cacheHitRate()`

**前缀稳定性**
- `packages/agent-core/src/agent/injection/timestamp.ts:6-9` — 时间戳放 `before_user`
- `packages/agent-core/src/agent/context/projector.ts:47-64` — `after_system` 警告
- `packages/agent-core/src/agent/tool/index.ts:426-451` — 确定性工具排序
- `packages/agent-core/src/prompt-plan/builder.ts:26-30,186-223` — 稳定章节头 + 边界退化告警
- `packages/agent-core/src/agent/cache-staking/index.ts:29` — 浅拷贝不 mutate

**可观测 / 治理（缺口现场）**
- `packages/agent-core/test/agent/cache-observability.test.ts:164-235` — `cacheBlockHashes` 脚手架（缺口 B）
- `.github/workflows/ci.yml` — 单一 quality job，无 cache 门禁（缺口 C）
- `packages/agent-core/test/loop/streaming.e2e.test.ts:6-9` — FakeLLM（缺口 D）

**本地缓存**
- `packages/agent-core/src/utils/fs.ts` — 原子/耐久写原语
- `packages/agent-core/src/mcp/connection-manager.ts:342-350` — MCP schema 不落盘（缺口 G）
- `apps/cli/src/tui/utils/catalog-fetch.ts` — catalog 不落盘（缺口 H）
- `apps/cli/src/native/native-assets.ts:304-353` — native-assets GC（正面范例）
- `apps/cli/src/utils/git/git-ls-files.ts` — 全仓唯一 TTL+mtime 缓存

**相关 ADR**
- `docs/adr/0009-context-minimization-strategy.md` — 多通道压缩 + 缓存基础设施
- `docs/adr/0011-turn-boundary-cache-staking.md` — 3+1 桩模型（缓存架构主纲）
- `docs/adr/0013-*` — 四块架构分离全局/会话
- `docs/architecture-debt-roadmap.md:54-60` — `deriveCacheKeyFromPromptPlan` 重构债务警告
