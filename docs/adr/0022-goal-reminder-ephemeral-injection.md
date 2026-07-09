# 0022 - Goal Reminder 走 Ephemeral Injection

日期：2026-07-03

## 状态

已接受

## 背景

PRD-0019 为 byf 引入 goal 模式。参照系 Kimi Code 的 `GoalInjector` 在 turn 边界把 goal reminder 作为**持久化 message** 追加到 context（`appendSystemReminder`），每轮追加一条，进 wire records。byf 直接照搬此机制会与 byf 独有的两层注入体系冲突。

byf 有两套注入机制（`packages/agent-core/src/agent/injection/` 与 `context/projector.ts`）：

1. **持久化 injection**（`DynamicInjector.inject()` → `appendSystemReminder(..., {kind:'injection', variant})`）：进 wire records，**会被 cache staking 算进缓存 prefix**。
2. **ephemeral injection**（`getEphemeral()` → projector 渲染）：不进 wire，每 step 在请求时重新生成。projector 按 position 分流：`after_system`（拼在历史之前，**进缓存 prefix**）与 `before_user`（拼在历史之后，**不破坏缓存 prefix**）。

projector 源码注释（`context/projector.ts:46-62`）明确标注：`after_system` 会移动所有历史索引、与 cache staking 冲突，"Prefer `before_user` for all new injectors"。

若 goal reminder 走持久化追加：

- 每个 continuation turn 追加一条 → goal 跑 20 轮就给 wire.jsonl 留 20 条 reminder，永久膨胀 replay 体积。
- 追加的 message 进缓存 prefix → 与 byf 的 prompt-plan cache staking（ADR-0011）冲突，破坏前缀稳定性。
- replay 时这些 reminder 全部重放，但 resume 后 goal 已被 `normalizeAfterReplay` 降级为 paused，active reminder 语义反而是错的。

## 决策

Goal reminder 走 **ephemeral injection 的 `before_user` 位置**，通过实现 `DynamicInjector.getEphemeral()` 注入。具体：

- `GoalInjector extends DynamicInjector`，实现 `getEphemeral()` 而非 `getInjection()`，`injectionVariant` 不使用。
- 注入内容随 goal status 分三档：`active`（完整 reminder + budget 指引）、`blocked`（轻提示 + objective）、`paused`（守卫提示）。无 goal 时返回空数组。
- 每 step 在请求时由 projector 重新渲染，落在历史之后、用户输入之前，**不进 wire records、不进缓存 prefix**。
- 与 `PermissionModeInjector`、`TimestampInjector` 并列加入 `InjectionManager.injectors`。

## 结果

### 正面

- 完全遵守 projector 注释 "Prefer `before_user` for all new injectors"，不破坏 ADR-0011 的 cache staking。
- wire.jsonl 不膨胀：goal reminder 从不持久化，replay 体积与 goal 轮数无关。
- resume 后 goal 是 paused，`getEphemeral()` 自然生成 paused 档提示，语义正确——无需像持久化方案那样在 replay 时清理过期 reminder。
- 实现更简单：复用现有 per-step `inject()` 调用链（`turn/index.ts:401` 的 `beforeStep`），无需协调 turn 边界时机。

### 负面

- reminder 不进 wire，因此 wire.jsonl 不再是"模型看到的全部上下文"的完整快照——vis 调试时看不到 reminder。缓解：reminder 内容由 goal snapshot 决定，vis 可从 `goal.updated` 事件重建。
- 每 step 重新生成 reminder 有微小开销（字符串拼接），可忽略。

## 考虑的替代方案

- **持久化追加（Kimi 方式）**：被拒绝，原因见背景——wire 膨胀 + cache prefix 冲突 + replay 语义错位。
- **ephemeral `after_system` 位置**：被拒绝，projector 注释明确警告会移动历史索引、与 cache staking 冲突。

## 参考

- PRD-0019（Autonomous Goal Mode）
- ADR-0011（Turn Boundary Cache Staking）
- Kimi Code `agent/injection/goal.ts`（参照系，采用不同机制）
