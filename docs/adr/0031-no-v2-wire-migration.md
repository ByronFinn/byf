# 0031 - 暂不迁移至 kimi agent-core-v2 的 wire 架构

Date: 2026-07-13

## Status

Accepted

## Context

一次"对比 kimi-code `packages/agent-core-v2` 的 `wire`/`wireRecord` 与 byf `packages/agent-core`"的架构评审（见 PRD-0025）发现，kimi v2 的 wire 子系统是对 byf 现有 wire v1 的代际重设计，核心改进：

- **Op = callable + inspectable 融合体**——操作即数据，一个 Op 既是可调用 factory 又携带 `.type`/`.apply`/`.schema` 元信息。
- **`silent` 标志统一 dispatch/replay**——live 写与 resume 读共用同一份 apply（`dispatch(silent:false)` vs `replay(silent:true)`），消除 byf 当前"每个子系统两套方法靠人肉同步"的双写。
- **声明式派生模型**——声明"reduce 哪些 Op"，wire 引擎在 dispatch 和 replay 时自动 fold，替代 byf 的手写 accumulator + 内核/vis 各写一份投影。
- **blob offload 对称 codec**、**重入保护 + 级联上限**、**未知记录容错 + 计数报告**等。

评审结论：这些改进**真实且有价值**，但全面迁移的代价过高。

## Decision

**暂不**迁移到 kimi v2 的 wire 架构。改为捕获其中**已经在发生、可低成本拿到**的确认收益（PRD-0025）：

1. 抽取 wire 折叠纯函数，消除核心/vis 投影重复 + 纠正两个已发生的 vis 行为偏差。
2. 恢复 `restoreRecord` 的 exhaustive 守护 + 处理 live-only 调试 record 的归属文档化。
3. pi-tui 升级 0.74 → 0.80.6。

明确排除全面 v2 迁移（Op/silent/DI scope/blob codec 等架构性重写）。

## Reasoning

四条理由，按权重排序：

1. **移动靶**。kimi `agent-core-v2` 在 monorepo 里仍是 WIP（仍在持续 commit `gate image formats`、`serialize agent startup` 等修正）。byf 追一个未稳定的上游架构，迁移完成时它可能又变了。

2. **on-disk 格式需重新对齐**。byf 当前 wire 协议 `1.1`，kimi v2 已到 `1.4`，两者 record 形状、迁移链、metadata 信封都不同。迁移意味着重写已 shipped 的 records 层 + 重新设计跨版本兼容——这是独立的、高风险工程，与"借鉴设计思路"无关。

3. **重写成本 vs 收益不匹配**。全面重写已稳定运行的 8 个 `RecordRestoreHandler` 子系统、records 协调器、迁移框架，是数周-数月工程。而 PRD-0025 的外科手术（纯函数抽取 + exhaustive 守护 + pi-tui 升级）能在 3-4 天内捕获其中**确认发生**的痛点（vis 静默丢消息、双写漂移），且不动 on-disk 格式。

4. **byf 已做过一次 restore 重构（ADR-0010）**。那次重构已实现"写/读路径分布式对称"，遗留的是"统一 apply"。这是 v2 的 `silent` 机制要补的一步，但不是非做不可——PRD-0025 的纯函数抽取已能解决最痛的内核/vis 重复。

## Consequences

### 正面

- 3-4 天拿到确认收益，无架构性重写风险。
- on-disk wire 格式不变（`protocol_version` 仍 `1.1`），零迁移负担。
- byf 继续在稳定的 v1 records 层上加 feature，不受 v2 WIP 影响。

### 负面 / 需接受

- byf 的 live/restore 双写问题（每个子系统两套方法）**仍存在**。PRD-0025 只缓解其症状（exhaustive 守护防漏 case + 纯函数消除一类重复），不消除根因。
- 未来若 wire 子系统数量大幅增长、或双写漂移再次发生且纯函数/守护挡不住，需重新评估迁移。本 ADR 届时作废。
- byf 与 kimi v2 的架构差距会随时间扩大；若将来要趋同，迁移成本更高。

### 备选路径（留档）

若某天决定迁移，路径参考：先做 `silent` 统一 dispatch/replay（ADR-0010 的自然延续，风险最低），再做 Op 即数据，最后做 DI scope 与派生模型。不要一次性大爆炸。

## References

- PRD-0025：wire 投影纯函数抽取与 pi-tui 升级
- ADR-0010：AgentRecords 恢复机制重构（上一代 wire restore 重构）
- kimi-code `packages/agent-core-v2/docs/rw-model-design.md`：v2 设计提案
- kimi-code `packages/agent-core-v2/src/wire/`：v2 实现
