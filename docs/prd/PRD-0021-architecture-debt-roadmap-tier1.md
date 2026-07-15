# 架构债路线图 — 档 1 执行

**Status**: Done
**Created**: 2026-07-10
**Last updated**: 2026-07-10
**Source**: `docs/architecture-debt-roadmap.md` 档 1（立即做），经 grill 校准 + 决策冻结后的执行 PRD。

## 问题陈述

2026-07-10 的 `improve-architecture` 扫描报告经代码事实校准后（6 处偏差见路线图 A 节），确认 0 阻塞、3 High、7 Medium。本 PRD 覆盖档 1（立即做）的 3 项——它们低风险、高收益、可独立交付，不依赖任何排期窗口。档 2（顺势做）/ 档 3（谨慎做）/ 待确认项不在本 PRD 范围。

> **注**：原档 1 含 4 项，其中 M3（PRD 状态对齐）已在路线图创建时同步完成，不进本 PRD。

## 目标

按路线图档 1 的 grill 冻结方案，交付 3 项独立可验证的架构改进：

| 项   | 核心问题                                        | 方案                                             |
| ---- | ----------------------------------------------- | ------------------------------------------------ |
| M5   | ADR-0006 文档漂移（SSHKaos/telemetry 幽灵组件） | 纯文档修订                                       |
| M2   | vis DTO 双源维护且已漂移                        | 方案 B：删副本 + 私有包 `@byfriends/vis-shared`  |
| H1-a | ByfTui 的 27-case slash switch 未注册表化       | 分组 command-module + SlashCommandHost，两步迁移 |

## 验收标准

### M5

1. ADR-0006 不再把 `SSHKaos` 描述为已有 adapter，标为"规划中（未实现）"
2. ADR-0006 不再把 `packages/telemetry` 描述为一层，标为"已移除"或删除
3. 修订与 CONTEXT.md（Kaos 术语表已正确描述"仅 LocalKaos，SSHKaos 规划中"）一致

### M2

4. `apps/vis/web/src/shared-types.ts`（本地副本）删除
5. web 与 server 均从 `@byfriends/vis-shared`（`apps/vis/shared`）单一来源获取类型
6. web 构建与类型检查通过（`shared/types.ts` 是纯类型模块，`import type` 编译后擦除）
7. 两个 DTO 源不再漂移（PermissionMode 等类型单一来源）

### H1-a PR1（基建）

8. 定义 `SlashCommandHost` 接口——窄 host，只暴露被 ≥2 个 handler 用到的方法（约 8–10 个）+ controller/dialogManager 访问器；不持有 ByfTui 引用
9. 建立 slash handler 注册机制（`commands/handlers/` 目录 + 注册表）
10. `handleBuiltInSlashCommand` 改为 Map/注册表分发，不再是大 switch
11. 此阶段 handler 仍是 ByfTui 方法（临时注册），行为零变化
12. 所有现有 slash 命令行为不变；`byf-tui-message-flow.test.ts` 通过

### H1-a PR2（迁移）

13. 按组（dialog/session/auth/goal/editor/theme 等）把 handler 迁到 `commands/handlers/<group>.ts`
14. 每个 command-module 接收 `SlashCommandHost`，不持有 ByfTui 引用（符合 ADR-0017 DI 模式）
15. 已抽出的模块（`actions/goal.ts`、`flows/login-flow.ts`、`flows/connect-flow.ts`）由 command-module 直接调用，不再是 ByfTui 私有方法薄包装
16. TS 穷尽检查保证每个 `BuiltinSlashCommandName` 都有注册的 handler

## 非目标

- 档 2（H3 provider helper / M1 GoalDriver / M6 rg-runner）——顺势做，不在本 PRD
- 档 3（H2 BackgroundManager 拆分）——需排期 + 先补测试，不在本 PRD
- 待确认项（M4 SEA 脚本 / M7 host-local node:fs）——需外部确认或排期
- 不改任何对外公开 API（SDK、CLI 命令、provider 配置格式）

## 技术约束（grill 冻结）

- **H1-a 方案**：分组 command-module + 统一 SlashCommandHost（窄 host + 委托），非 Map 查找表。理由：用户选择最彻底的解耦，新命令通过注册而非加 switch case 加入。
- **M2 方案 B**：`apps/vis/shared` 提升为私有 workspace 包 `@byfriends/vis-shared`。`types.ts` 是纯类型模块（14 type/interface，0 运行时导出）。方案 A（相对路径 `import type`）在 Bun 的 node_modules 布局下，`shared/` 无法解析其对 `@byfriends/*` 的依赖，故采用独立包。
- **H1-a 迁移策略**：两步——PR1 基建先行（接口 + 注册机制 + Map 分发，handler 暂留），PR2 按组迁移。降低首 PR 风险。

## Child Issues

- #225 — [PRD-0021] ADR-0006 文档漂移修订 — SSHKaos 标规划中、telemetry 标已移除 (AFK) — Done
- #226 — [PRD-0021] vis DTO 单一来源 — 建 @byfriends/vis-shared 独立包 (AFK) — Done
- #227 — [PRD-0021] slash handler 注册基建 — SlashCommandHost 接口 + 注册表分发 (AFK) — Done
- #228 — [PRD-0021] slash handler 按组迁移 — handler 迁到 command-module (AFK, blocked by #227) — Done

## Traceability

- **Created by**: `/story` (2026-07-10) — 基于 `docs/architecture-debt-roadmap.md` 档 1，经 grill 决策冻结
- **Source**: `docs/architecture-debt-roadmap.md`（含 6 处校准 + grill 结论）
- **Sliced by**: `/story` → Child Issues above（4 issues：#225–#228）
- **Reviewed by**: `/review` (2026-07-10) — 初审 Request Changes（H1-a PR2 未完成）；实施 A 后补完分组迁移 + 窄 host + 直接调用 goal/login/connect；复审三视角 **Approve**
- **Arch reviewed by**: `/improve-architecture` (2026-07-11) — 档 1 全部落地确认（M5/M2/H1-a）；byf-tui 3819 行；残留在档 2/档 3 + 文档卫生 Medium
