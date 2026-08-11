# 引擎性能剖析与 GC 根因定位(换语言决策依据)

> **Status**: Done | **PRD**: PRD-0026 | **Created**: 2026-08-11 | **Last updated**: 2026-08-11

## Goal

用户观察:**Bun(官方运行时)长会话交互运行中,单核 CPU 经常被打到 100%**,怀疑与 GC 有关,考虑切换其他语言。本 PRD 先用可重复的 profiling 把"GC 打满"拆解为可归因的热点函数与 GC 时间占比,建立「切不切语言、切多少」的**数据决策标准**,并产出第一轮定点优化清单。**本 PRD 只产出证据与决策,不实施语言重写**——重写是决策输出之一,不是本 PRD 的施工内容。

## What I already know

| 事实 | 来源 |
| --- | --- |
| 用户观察:Bun(官方路径)、长会话交互运行中单核 CPU 100%,未 profile 过 | 用户确认(2026-08-11) |
| 仓库刚完成 Node→Bun 迁移(ADR-0028 / PRD-0020),CLI 分发为 `bun build --compile` 单二进制 | `docs/adr/0028-full-bun-toolchain.md` |
| **GC 是放大器而非根因**:长会话每 step 都有整份历史投影深拷贝(2 倍消息量临时对象)+ 多次 O(n) token 估算 + SHA256 指纹 + 数万事件对象流 | 热点清单(见 Technical Notes) |
| wire 是 JSONL 事件溯源 WAL(27 种 record、协议 1.1),写路径微任务批量 + 每批 fsync;resume 全量 replay;vis 整文件读入双份对象 | 探索报告(wire 设计还原) |
| Bun 1.3.14(本机,与仓库基线一致)官方 profile 工具齐备:`--cpu-prof`(+`--cpu-prof-md` markdown 输出专为 LLM 分析设计、`--cpu-prof-interval` 采样间隔默认 1000μs)、`--heap-prof`(+`--heap-prof-md`)、`--smol`、`--expose-gc` | 本机 `bun --help`(权威来源,2026-08-11 核实) |
| CLI 运行时存在**两份 agent-core**(bundle 在 dist/main.mjs + 经 vis-server 从 node_modules 解析),双类副本、双模块级单例 | `apps/vis/server` 依赖分析 |
| `Agent` 类可独立使用(构造不强制 Session),适合做进程内负载脚本 | AGENTS.md 硬规则 + `agent/index.ts` |
| 热点函数分布于:投影(projector.ts/cache-staking)、records 序列化(persistence.ts)、token 估算(utils/tokens.ts)、SHA256 指纹(agent/index.ts)、流式事件(turn-step.ts/generate.ts)、TUI 渲染 | 探索报告(GC/CPU 热点清单) |

## Assumptions (resolved — grill 2026-08-11)

| 假设 | 验证结论 |
| --- | --- |
| 脚本化负载可代表交互长会话的引擎热路径 | ✅ 代码核验:turn 状态机不依赖 Session/TUI(`turn/index.ts:224-343` 只依赖 records/context/telemetry/compaction/usage 等);TUI 渲染已排除出范围 |
| GC 时间占比可量化且能归因 | ✅ 方法定稿:三管齐下(`--expose-gc` 插桩计时 + `BUN_JSC_useConcurrentGC=0` 对照 + profile GC 帧),工具全部本机验证 |
| 回放 provider 足以驱动引擎热路径,真实 API 仅校准 | ✅ 注入缝隙核实(代码复核 2026-08-11 二轮):`AgentConfig.generate`(`agent/index.ts:119`,类型 `typeof generate`,即 kosong `GenerateFn`)+ `AgentConfig.providerManager`;kosong 的 `generate`(`kosong/src/generate.ts:94`)签名是 `(provider, systemPrompt, tools, history, callbacks?, options?) => Promise<GenerateResult>`,**流式经 `callbacks.onMessagePart` 回调推送**(非 async iterable),mock 既可经回调灌入大量 part 压测事件风暴,又返回组装好的 `GenerateResult`。注:先前写的 `test/agent/harness/agent.ts:196-211` + `scripted-generate.ts` 路径**不存在**(代码核实)——真实可复用先例是 `packages/kosong/test/fixtures/echo-provider.ts` 的 `ScriptedEchoChatProvider`(provider 层 DSL)与 `AgentConfig.generate` 注入(函数层),负载脚本用后者更轻 |
| `--smol` 仅作对照,不是解决方向 | ✅ 确认;另加 `BUN_JSC_*` GC 探针(collectContinuously / gcMaxHeapSize) |

## Open Questions

* 场景范围已定(2026-08-11):主场景 + resume 大会话 + 多 subagent 并行;goal 续跑/headless 不单列(被主场景覆盖);vis 不加。
* 方案已定(2026-08-11):A 纯测量。无剩余开放问题。

## Requirements

### R1 — 可重复的 profile 负载

- 一个进程内负载脚本(建议 `scripts/perf/load.ts`):直接构造 `Agent`(走 node-sdk 或 agent-core,不经过 CLI TUI),注入 mock ChatProvider,驱动多 turn 长会话:混合工具调用、大工具输出(接近但不触发 offload 阈值)、多 step 每 turn。
- **三种负载模式**(用户 2026-08-11 确认):
  - 模式 A:交互长会话(主场景)——多 turn、每 turn 多 step 多工具、大输出。
  - 模式 B:resume 大会话——先跑长会话产出 wire,再以 resume 全量 replay 测恢复峰值。
  - 模式 C:多 subagent 并行——驱动多个子 agent 并行(上限 5),放大并发分配与内存峰值。
- 参数化规模:turn 数、每 turn 工具数、输出大小、subagent 数,可复现"长会话"的压力形态。
- **默认基线**(用户 2026-08-11 确认):50 turn、每 turn 3-5 step 含工具调用、历史 ~100-200K token、wire 10-30MB;**另加一档 2x 压力**。规模参数化可调。
- 可选校准:同脚本可用真实 provider(环境变量)跑一次,验证 mock 与真实的比例关系。

### R2 — CPU profile 采谱

- `bun --cpu-prof --cpu-prof-md --cpu-prof-interval=1000 scripts/perf/load.ts` 产出 markdown 报告(LLM 可读),统计 top 自采样函数与其归属模块。
- 把热点函数映射回已知热点清单,给出**百分比归属表**(投影 / records / tokens / 指纹 / 事件 / 其他)。

### R3 — GC 量化

- **三管齐下**(方法已定稿,工具全部本机验证 2026-08-11):
  - 插桩计时:负载脚本内 `--expose-gc` + 定时 `gc()` 包 `performance.now()` 计时,累计 GC wall time → GC 时间占比。
  - 并发 GC 对照:`BUN_JSC_useConcurrentGC=0` 关并发 GC 跑一组——GC 上主线程,与默认组总 CPU 时间之差估算 GC 主线程贡献。
  - 分配行为探针:`BUN_JSC_collectContinuously=1`、`BUN_JSC_gcMaxHeapSize=<N>` 验证可用(WebKit OptionsList.h,`BUN_JSC_` 前缀透传,非稳定 API 仅调试用)。
- 输出:**GC 时间占总时间百分比** + 暂停次数/单次时长 + 堆增长曲线(长会话内存增长斜率)。

### R4 — 对比实验

- `--smol` on/off 两组对照,确认 GC 频率×单次时长的权衡关系,验证"GC 是放大器"假设。

### R5 — 决策标准(数据驱动)

- **决策门初始阈值已定稿**(用户 2026-08-11 确认草案;报告阶段以实测数据校准):
  - GC 时间占比 **>25%** 且热点集中(前 5 函数 >50% 采样)→ **混合 native 候选**(换语言有数据依据);
  - GC 时间占比 **<15%** → **定点优化路径**(GC 只是放大器,不值得换语言);
  - 中间带 15-25% → 按热点消除可行性逐项判定;
  - **总闸**:任意热点为「引擎固有模式且无法在 TS 层消除」(如事件风暴的跨层对象拷贝、整份历史投影)→ 即使 GC <15% 也升格评估混合 native。
- 决策输出物:推荐路径 + 依据 + 工作量/风险估计。

### R6 — 第一轮定点优化清单

- 若决策为优化路径:产出优化项清单(每项:位置、问题、预期收益、工作量、风险),供后续 PRD 执行。

## Acceptance Criteria

- [x] R1 负载脚本存在、可重复运行,**三种模式(A 交互长会话 / B resume 大会话 / C 多 subagent 并行)均可跑**,文档说明运行方法与规模参数 — `scripts/perf/load.ts` + `README.md`(#256)
- [x] R2 CPU profile 报告:top 函数 + 热点归属百分比表(每种模式各一份或汇总) — `docs/perf/mode-{a,b,c}.md` + `REPORT-0026.md` §2(#257)
- [x] R3 GC 时间占比、暂停统计、堆增长曲线已量化 — `REPORT-0026.md` §3(默认 6.0% / 关并发 GC 5.6% / --smol 5.9%)(#258)
- [x] R4 `--smol` 对照实验完成并记录结论 — `REPORT-0026.md` §3(三组无显著差异,GC 非放大器)(#258)
- [x] R5 决策标准定稿(阈值明确),并给出推荐路径与依据 — `REPORT-0026.md` §1(GC ~6% < 15% → 定点优化,不切语言)(#259)
- [x] R6 优化清单产出(若决策为优化路径) — `REPORT-0026.md` §5(3 项,首项预期消除 ~80% CPU)(#259)
- [x] 运行方法沉淀为 `scripts/perf/README.md`(或等价文档),后续任何人可复跑(#256)

## Definition of Done

- 上述 AC 全部满足;profile 数据与报告入库(建议 `docs/perf/` 或挂在 PR 上)。
- 若有代码变更(负载脚本、优化项),跑全量测试 + 生成 changeset(`gen-changesets` skill)。
- PR 标题遵循 Conventional Commit;PR 描述填 `.github/pull_request_template.md`。

## Out of Scope

- **语言重写实施**(Rust/Go/Zig 全量重写或混合 native)——本 PRD 只产出决策依据;实施由后续 PRD 承接。
- TUI 渲染性能(pi-tui 每帧布局/重绘)——先测引擎;若 profile 显示 TUI 占比高,单独排期。
- goal 自主续跑/headless 长跑——本质是更多连续 turn,被模式 A 覆盖,不单列。
- vis 打开 wire 视图——调试工具、不影响运行时 CPU,不测;其整文件读取优化(wire-reader 双份对象/全量响应已知问题)记录但不改。
- wire v2 迁移(ADR-0031 已否决)。
- JSC GC 调优作为主路径(`--smol` 仅作对照实验)。

## Technical Approach

1. **负载形态**:进程内脚本直接驱动 `Agent` + 注入 mock 生成器(不是实现 ChatProvider)。**代码已核验(2026-08-11 二轮)**:`AgentConfig.generate`(`agent/index.ts:119`,类型 `typeof generate`)+ `AgentConfig.providerManager`(带 dummy `ByfConfig`)双注入即可绕过真实 HTTP/鉴权。注:kosong `generate`(`kosong/src/generate.ts:94`)签名是 `(provider, systemPrompt, tools, history, callbacks?, options?) => Promise<GenerateResult>`,**流式经 `callbacks.onMessagePart` 回调推送**(非 async iterable);mock 通过回调灌入大量 `StreamedMessagePart`(压测事件风暴),并返回组装好的 `GenerateResult`(`{id, message, usage, finishReason, ...}`)。先前写的 `test/agent/harness/` 路径**不存在**(代码核实),真实可复用先例是 `packages/kosong/test/fixtures/echo-provider.ts` 的 `ScriptedEchoChatProvider`(provider 层 DSL)与 `AgentConfig.generate` 注入(函数层),负载脚本用后者更轻。
2. **注入细节(代码核验结论)**:
   - 最小 Agent:`new Agent({ runtime: {kaos, osEnv}, rpc: stubRpc, generate: scriptedGenerate, providerManager: new ProviderManager({ config: dummyByfConfig }), persistence })` + `agent.config.update({ modelAlias, cwd, systemPrompt })`,然后循环 `agent.rpcMethods.prompt(payload)`(`agent/index.ts:454`)/ `await agent.turn.waitForCurrentTurn()`(`turn/index.ts:181`)。
   - **dummy provider 必须带非空 `apiKey`**(如 `'test-key'`)——凭证校验在 `resolveRuntimeProvider`(`runtime-provider.ts:100-110`,不是 `createAuthResolverForModel`),触发时机是模型解析(如 `config.update({modelAlias})` 调 `tryResolvedProviderConfig` → `providerManager.resolveProviderConfigForModel`),不是 Agent 构造时;亦可设 `validateCredentials:false` 绕过。
   - 模式 A/C 用 `InMemoryAgentRecordPersistence`(`persistence.ts:16-44`,纯内存);**模式 B(resume)必须用 `FileSystemAgentRecordPersistence` + 临时 homedir**(`persistence.ts:46-184`,`drainBatch` 先 `mkdir -p` 再 `open('a')`,wire.jsonl 惰性创建),先跑长会话产出 wire,再 `agent.resume()` 测 replay。注:`resume()`(`agent/index.ts:434`)做的是**记录回放重建状态**(`records.replay()` 路由到各子系统 `restoreRecord`),**不重新执行 turn**——因此模式 B 测的是「记录 parse + 8 子系统 restore」的开销,正合「resume 恢复峰值」目标。
3. **采谱命令**:`bun --cpu-prof --cpu-prof-md --cpu-prof-interval=1000 scripts/perf/load.ts`;堆:`bun --heap-prof --heap-prof-md`;GC 实验:`--expose-gc` + 脚本内定时 `gc()` 采样。
4. **归属分析**:CPU markdown 报告按函数→模块映射到已知热点清单(projector/cache-staking、persistence、tokens、fingerprint、turn-step/generate、wire-fold),输出百分比表。
5. **决策门(草案,报告阶段校准)**:GC 占比、热点集中度(前 N 函数占比)、消除可行性三要素综合;最终阈值以实测数据定稿。
6. **产出**:报告 + 决策记录(ADR-lite)+ 优化清单;不施工。
7. **负载脚本落位**(grill 定 2026-08-11):`scripts/perf/load.ts` 独立薄副本——参考 `packages/kosong/test/fixtures/echo-provider.ts`(provider 层 DSL)与 `AgentConfig.generate` 函数层注入的模式,**不 import 测试内部设施**(测试代码非稳定 API);mock 生成器(`GenerateFn` 经 `callbacks.onMessagePart` 推送 part + 返回 `GenerateResult`)随脚本自带。
8. **ADR 判定**(grill 定 2026-08-11):方案 A 纯测量不建 ADR(流程选择,非难逆转技术决策);决策门阈值数据定稿后若升格为项目性能政策,再补 ADR。

## Feasible Approaches

**Approach A: 纯测量 PRD(推荐)**

- How it works: 只做 R1-R6 的测量与决策产出,不碰生产代码(除负载脚本本身)。
- Pros: 范围最小、风险最低、数据说话;优化或重写由决策输出驱动,各成后续 PRD。
- Cons: 需要多一个后续 PRD 才见到收益。

**Approach B: 测量 + 第一批定点优化同 PRD**

- How it works: profile 出结果后,同 PRD 内实施已验证的第一批优化(如去深拷贝、token 估算缓存)。
- Pros: 单 PRD 直接产出性能收益。
- Cons: 范围膨胀;优化优先级在数据出来前无法定,实施边界模糊。

**Approach C: 测量 + 并行启动混合 native 架构设计**

- How it works: profile 同时并行设计 Rust/Go native 模块边界。
- Pros: 缩短混合方案落地周期。
- Cons: 若数据不支持换语言,设计白做;违背"数据先行"原则。

## Decision (ADR-lite)

**Context**: 用户观察到 Bun 长会话单核 CPU 100%,考虑切换语言;但未 profile 过,GC 是放大器还是根因未知,换语言是数月级工程,不能凭直觉启动。
**Decision**: 采用 **Approach A(纯测量 PRD)**——本 PRD 只做可重复的 profile(三模式:交互长会话 / resume 大会话 / 多 subagent 并行)+ GC 量化 + `--smol` 对照 + 决策标准,不碰生产代码(除负载脚本)。优化或重写由决策输出驱动,各成后续 PRD。
**Consequences**: 风险最低、范围最清晰;代价是性能收益需要多一个后续 PRD 才落地。若决策指向混合 native 或全量重写,本 PRD 的热点归属表与 GC 占比即为其立项依据;若指向定点优化,优化清单直接作为下一个 PRD 的 R 项。

## Implementation Plan (small PRs)

* PR1: 负载脚手架——`scripts/perf/load.ts` + mock ChatProvider + 规模参数 + README
* PR2: 采谱与 GC 量化——CPU/heap profile 运行、`--smol` 对照、数据归因
* PR3: 报告与决策——热点归属表、GC 占比、决策标准定稿、优化清单、(按决策)第一批优化

## Technical Notes

### 已知 GC/CPU 热点清单(两个独立探索收敛,按严重度排序)

1. **上下文投影深拷贝**(`packages/agent-core/src/agent/context/projector.ts` + `agent/cache-staking/index.ts`):每 step 对每条历史消息 cloneMessage + cache-staking map 一层,200K token 历史每步 2 倍消息量临时对象——最典型的分配热点。
2. **WAL 序列化 + replay 全量解析**(`agent/records/persistence.ts`):大 tool.result/append_message 记录(数十~数百 KB)在内存、stringify 输出、parse 结果三处驻留;resume 全量 replay。
3. **每步多次 O(n) token 估算**(`utils/tokens.ts`,逐 char 循环):每 step 对整份上下文扫多次(compaction 从尾向前全量估、usage 分项、pruning)。
4. **每 step SHA256 指纹**(`agent/index.ts` fingerprint + `prompt-plan/builder.ts`):系统提示 + 每缓存块 + 全量工具定义 JSON.stringify 后哈希,纯 CPU。
5. **LLM 流式事件风暴**(`loop/turn-step.ts` createChatStreamingCallbacks + `kosong/src/generate.ts` deepCopyPart):数万 token 输出产生数万事件对象,穿 agent-core→sdk→TUI 三层。
6. 工具参数 ajv 校验每 tool.call(`tools/args-validator.ts`);大工具输出常驻 `_history`;vis 整文件双份对象(`vis/server/src/lib/wire-reader.ts:41-119`);TUI 每帧渲染(`apps/cli/src/tui/byf-tui.ts`)。

### wire 管线特征(换语言评估相关)

- 写:31 个 live 写点,微任务批量 + 每批 `fh.sync()`;流式 delta 事件(live-only)不落盘。
- 读:resume 流式逐行 parse + 8 子系统 restore;vis 整文件读入、raw+data 双份驻留、全量响应。
- 演进:ADR-0031 否决 v2 wire;live/restore 双写遗留债仍在。

### Bun profiling 工具(本机 bun 1.3.14 核实,权威来源)

- `--cpu-prof` / `--cpu-prof-md`(markdown,专为 LLM 分析设计)/ `--cpu-prof-interval`(默认 1000μs)/ `--cpu-prof-dir` / `--cpu-prof-name`
- `--heap-prof`(.heapsnapshot)/ `--heap-prof-md` / `--heap-prof-dir` / `--heap-prof-name`
- `--smol`(用更少内存、更频繁 GC)、`--expose-gc`(暴露 `gc()`)
- **`BUN_JSC_<选项名>` 透传 JSC GC 选项**(本机 2026-08-11 验证):`BUN_JSC_useConcurrentGC=0`(关并发 GC)、`BUN_JSC_collectContinuously=1`(连续收集)、`BUN_JSC_gcMaxHeapSize=<N>`(堆上限)均生效;选项全集见 WebKit `OptionsList.h`,非稳定 API、仅调试用

### 规模基线(探索报告估计)

- 10-step、每 step 2 工具的 turn ≈ 35-60 条 wire 记录;50 turn 会话 ≈ 2000-3000 条/main agent;整条 wire 常见几 MB~几十 MB。

## Traceability

- **Created by**: `/think` (2026-08-11)
- **Sliced by**: `/story` → Child Issues below (2026-08-11)
- **Implemented by**: `/goal` → grill → story → implement → review (2026-08-11)
- **Report**: `docs/perf/REPORT-0026.md`(决策门判定:GC ~6% < 15% → 定点优化,不切语言;首项优化预期消除 ~80% CPU)
- **Sliced into**:
  - #256 — [PRD-0026] 负载脚手架 — 三模式可复跑的进程内负载脚本 (AFK) — **Done**
  - #257 — [PRD-0026] CPU 采谱与热点归属 — profile 报告 + 归属百分比表 (AFK, blocked by #256) — **Done**
  - #258 — [PRD-0026] GC 量化与对照实验 — GC 占比 + 暂停统计 + 堆曲线 + --smol 对照 (AFK, blocked by #256) — **Done**
  - #259 — [PRD-0026] 报告与决策 — 决策门定稿 + 推荐路径 + 优化清单 (HITL, blocked by #257, #258) — **Done**
- **Grilled by**: `/grill` (completed 2026-08-11 一轮 + 2026-08-11 二轮代码复核) — 一轮 6 项待决全部解决:基线定稿(默认基线 + 2x 压力)、GC 量化方法三管齐下(BUN_JSC_* 探针本机验证)、术语精炼(回放 Provider 进 CONTEXT.md)、决策门阈值定稿(>25%/<15%/中间带/总闸)、不建 ADR、脚本落位独立薄副本。**二轮代码复核修正 3 处事实错误**:(1) `test/agent/harness/` 路径不存在,真实先例是 `packages/kosong/test/fixtures/echo-provider.ts` + `AgentConfig.generate` 注入;(2) `generate` 注入点返回 `Promise<GenerateResult>`、流式经 `callbacks.onMessagePart` 回调推送(非 async iterable);(3) 凭证校验在 `resolveRuntimeProvider`(`runtime-provider.ts:100-110`)、模型解析时触发(非构造时、非 `createAuthResolverForModel`)。
- **New terms**: 回放 Provider 已进 CONTEXT.md(2026-08-11)

## Domain Terms (draft — for /grill to refine)

| Term | Working Definition | Status |
| --- | --- | --- |
| 回放 Provider (Replay Provider) | 在 `AgentConfig.generate` 注入点回放预录/脚本化 part 流的生成器（经 `callbacks.onMessagePart` 推送 part、返回组装好的 `GenerateResult`），零成本可重复，区别于真实 `ChatProvider`（后者仍由 `createProvider` 构造，只替换 generate） | **已进 CONTEXT.md**（2026-08-11） |
| GC 放大器 (GC amplifier) | GC 把分配密集的应用层热点（投影深拷贝、事件风暴、token 估算）放大为「单核 CPU 100%」的现象；GC 本身不是根因，消除分配热点才是治本 | PRD 内部术语，不进产品术语表 |
| 决策门 (decision gate) | 由 GC 时间占比 × 热点集中度 × 消除可行性三要素构成的路径选择标准（定点优化 / 混合 native / 全量重写），阈值以实测数据校准定稿 | PRD 内部术语，不进产品术语表 |

## Issue

#255(父 Issue,2026-08-11 创建)
