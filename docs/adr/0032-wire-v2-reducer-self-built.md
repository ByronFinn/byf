# 0032 - wire v2 reducer 重构：自研框架而非移植

Date: 2026-08-11

## Status

Accepted

Supersedes ADR-0031（暂不迁移至 kimi agent-core-v2 的 wire 架构）。

## Context

ADR-0031（2026-07-13）曾否决全面迁移到 kimi `agent-core-v2` 的 wire 架构，核心理由是：① kimi v2 是移动靶（WIP）；② on-disk 格式需重新对齐（byf 1.1 vs kimi 1.5）；③ 重写成本数周-数月，收益不匹配。

ADR-0031 在 Consequences 里留了作废触发条件：「未来若 wire 子系统数量大幅增长、或双写漂移再次发生且纯函数/守护挡不住，需重新评估迁移。本 ADR 届时作废。」并留档了备选路径：「先做 `silent` 统一 dispatch/replay，再做 Op 即数据，最后做 DI scope 与派生模型。不要一次性大爆炸。」

经一次对 kimi v2 **实现**的精读（不只是对比表）+ byf 8 个 `RecordRestoreHandler` 的逐个迁移成本评估，得到三个新事实：

1. **kimi v2 实现是设计文档（`rw-model-design.md`）的务实子集**。设计文档描述的五原语（Fact/Command/View/Signal/Effect）+ 逻辑 seq + Session 流 + 相位机多数未落地；实际落地的是 Op/Model/toEvent + cross-reducer + onDidRestore + MAX_DRAIN。移植 kimi 代码会绑定一个仍在演进的子集实现。

2. **迁移成本被高估**。逐子系统精读后：goal 已经是声明式（直接赋值，≈改名），context 的核心 fold 已在 PRD-0025 抽成纯函数；8 个子系统里 0 个高难度，4 个低，2 个低-中，2 个中。地基已搭好一半。

3. **ADR-0031 的两大否决理由对「自研」路径不成立**。「移动靶」针对移植 kimi 代码，自研框架只采纳已验证的设计思想；「格式不对齐」针对采纳 kimi 1.5 落盘格式，自研框架的 Op type 直接复用 byf 现有 26 种 record 名，`opToWireRecord` 形状与现有 `logRecord` 逐字节一致，零数据迁移。

## Decision

**自研 wire reducer 框架**，借鉴 kimi v2 **实际落地子集**（Op/Model/toEvent/cross-reducer/onDidRestore 五件套），**不移植 kimi 代码、不绑定其 on-disk 格式**。

核心约束：

1. **Op type 复用 byf 现有 26 种 record 名**（`context.append_message`、`goal.create`、`turn.prompt`…）。`opToWireRecord` 产出的 JSONL 形状与现有 `logRecord` 一致。现有 `wire.jsonl`（含 v1.0 老会话）无需任何迁移即可被新 `WireService.restore()` 读取。`protocol_version` 仍 `1.1`。

2. **apply 是纯函数**（`(state, payload) => S`，无 handlers 参数、无 async）。offload 等副作用搬到 dispatch 后的 service 层 effect 或 `onDidRestore` hook。`Object.freeze` + `DeepReadonly` 编译期 + 运行时双重不可变保证。

3. **不引入 blob codec**。byf 的 offload 用现有 scratch 文件机制 + transient op（`persist:false`）解决。

4. **不追设计文档未落地的原语**。逻辑 seq、Session 流、`stream.subscribe` 统一订阅面、`readView` 冷读、`defineEffect` 注册制、`maxCauseDepth` 因果深度、相位机均为 kimi WIP，本轮不实现。`CycleError`/`MAX_DRAIN` 因 byf 无 op→op 级联场景，初版不引入。

5. **`background.*` 维持双轨特例**。进程状态（PID、文件句柄）无法 event-source，继续走 `<sessionDir>/tasks/*.json` 供状态重建，wire 仅作审计日志。

6. **一次性行为中性切换 + 逐子系统 apply 纯化**（遵循 ADR-0031 备选路径「不要大爆炸」精神）。Phase 0 建框架骨架（零生产影响）；Phase 1 一个 PR 完成「WireService 独占 `wire.jsonl` + 全部 26 种 record 注册为 Op」——其中 goal 的 apply 是纯 reducer，其余 7 个子系统暂为 legacy adapter（委托现有 `restoreRecord`，**行为逐字节保留**，靠 AC1 行为等价测试守卫）。这不是「大爆炸」——危险工作（apply 纯化）仍在 Phase 2-6 逐子系统渐进推进、每阶段独立 PR、可验证、可回滚。详见 PRD-0027 Technical Approach。

## Reasoning

选择自研而非移植，三条理由按权重排序：

1. **规避 ADR-0031 的两大否决理由**。移动靶针对移植，格式不对齐针对采纳 kimi 落盘格式——自研路径两者都不触发。这是对 ADR-0031 决策约束的尊重，而非推翻。

2. **获得 v2 的全部结构性收益**。纯 apply 消灭双写漂移的根因（apply+persist+toEvent 在 `execute` 单方法内顺序发生，调用方无法拆散）；cross-reducer 让派生状态自动 fold；transient op 消除「落盘但 no-op」的灰色地带；onDidRestore 提供明确的 restore 后副作用边界。这些是 byf 当前最痛的几个点的结构性解药。

3. **零数据迁移，风险可控**。Op type 复用现有 record 名是关键设计——现有 `wire.jsonl` 文件无需任何迁移，新旧路径可并存验证，最差情况回退一个 PR 不影响线上会话。移植路径则需写 byf 1.1→kimi 1.5 的跨树迁移 + 接受 record 词汇表差异（v2 多 12 种、v1 多 2 种），是独立的高风险工程。

## Consequences

### 正面

- 从结构上消灭 live/restore 双写漂移（ADR-0031 承认「仍存在」的痛点）。
- 消除 `restoring` 全局门控（7 处耦合点），副作用边界从「全局标志抑制」变为「结构上不存在」。
- `wire-fold.ts` 成为真纯函数（移除 effect port），vis 共用更安全。
- 为 cross-reducer、transient op、checkpoint/undo、manifest 打开能力门。
- 零数据迁移，新旧并存可渐进验证。

### 负面 / 需接受

- 多一份自研框架代码（`wire/` 目录），需自己维护正确性（通过移植 kimi 核心测试场景保证）。
- ContextMemory 的 offload 重构（Phase 5）是深水区，需保证 token 压力优化的 live 性能不退化。
- byf 与 kimi v2 的实现进一步分叉；若将来想趋同，需重新对齐。
- 不获得 kimi 设计文档里未落地原语的收益（但那些本就是 WIP）。

### 与 ADR-0031 的关系

本 ADR **不否定** ADR-0031 的决策——在当时的证据下，「暂不迁移 + 外科手术捕获确认收益」是正确的（PRD-0025 已收割了那些收益）。本 ADR 基于**新的证据**（v2 实现精读 + 逐子系统成本评估）激活 ADR-0031 留档的备选路径，并选择「自研」而非「移植」作为具体形态。

ADR-0031 的 Consequences 里关于「双写仍存在」「未来需重新评估」的预警，正是本 ADR 响应的触发条件。

## References

- PRD-0027：wire v2 reducer 重构（本决策的实施 PRD）
- ADR-0031：暂不迁移至 kimi agent-core-v2 的 wire 架构（被本 ADR supersede）
- ADR-0010：AgentRecords 恢复机制重构（上一代 wire restore 重构）
- PRD-0025：wire 投影纯函数抽取与 pi-tui 升级（其 Out of Scope 的「全面 v2 迁移」由本决策兑现）
- kimi-code `packages/agent-core-v2/src/wire/`：v2 实现（精读对象，非移植来源）
- kimi-code `packages/agent-core-v2/docs/rw-model-design.md`：v2 设计提案（了解其落地子集边界）
