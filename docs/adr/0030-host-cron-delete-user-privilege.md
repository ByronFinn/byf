# 0030 - Host 侧删除会话 Cron 不走工具权限

Date: 2026-07-13

## Status

Accepted

## Context

会话内 Cron（PRD-0023）通过模型工具 `CronCreate` / `CronList` / `CronDelete` 管理；默认 permission 为 `ask`，防止模型擅自改调度表。

PRD-0024 增加人机 slash `/cron delete <id>`。若删除走同一 `CronDelete` 工具路径，用户撤销自己 session 内的定时任务仍可能弹 permission，与「人机控制面」直觉冲突，也削弱对误建 cron / headless hold 的自救能力。

对照：`/goal cancel` 经 Session/RPC 直达 goal 状态机，不经工具 permission。

## Decision

1. 新增 **host/RPC** API（如 `deleteCronTask({ id })`）调用 `CronManager.removeTasks` + `emitDeleted`。
2. 该路径 **不** 经过 BuiltinTool 执行，**不** 应用 `CronDelete` 的 permission 规则。
3. 模型侧 `CronDelete` 保持默认 `ask` 不变。
4. 用户文档须说明：用户 slash/host 可直删；模型删除仍受 permission 约束。

## Consequences

### Positive

* 用户随时可撤销 session cron（含 streaming 中），不依赖模型或 yolo。
* 与 `/goal` 的用户特权生命周期控制一致。
* 工具安全策略不被「用户自救」稀释。

### Negative

* 双路径语义（host vs tool）需文档与代码分层维持，避免日后误把 host 删塞回 tool permission。
* 任意能调用 Session RPC 的 host 都能删 cron（与 cancelGoal 同级信任假设）。

## Alternatives Considered

* **合成 CronDelete tool call** — 复用工具，但用户操作仍可能 ask；否决。
* **可配置是否绕过** — 灵活但 MVP 过重；需要时再开。
* **降低 CronDelete 默认 permission 为 allow** — 削弱对模型的约束；否决。

## References

* PRD-0024 `docs/prd/PRD-0024-session-cron-slash-command.md`
* PRD-0023 会话内 Cron
* `packages/agent-core/src/tools/policies/default-permissions.ts`（CronDelete: ask）
* Goal 用户路径：`cancelGoal` Session/RPC（PRD-0019）
