# ADR 0008: 移除 Plan Mode

## 状态

已接受

## 背景

Plan mode 是从上游代码库继承的计划状态，代理在实现之前进入只读调查阶段，编写 plan artifact，并通过 `ExitPlanMode` 将其呈现给用户审批。

在全面的上下文最小化审查中，我们评估了 plan mode 是否提供足够价值来证明其复杂性成本：

- **Token 成本**：`EnterPlanMode`（~572t）+ `ExitPlanMode`（~853t）工具描述每次工具集消耗约 1,425 token。`PlanModeInjector` 向上下文中注入周期性的提醒（每次 300-800 字符）。
- **TUI 复杂度**：CLI/TUI 层有约 30+ 处引用（`/plan` 斜杠命令、Shift+Tab 快捷键、plan 卡片渲染、审批面板、footer badge）。
- **架构分布**：Plan mode 触及 agent-core（状态机、权限策略、注入系统）、node-sdk（RPC 透传）、CLI（TUI 状态）、vis（wire record 渲染）和 wire records（`plan_mode.*` 事件类型）。
- **使用情况**：计划行为可以通过代理使用现有的 `Read`/`Grep`/`Glob` 工具配合 `TodoList` 工具来组织其方法来实现，无需专用模式。

团队得出结论，plan mode 是一个过早的抽象：它强制了一个二元状态（规划 vs 执行），而代理应该流畅地交错探索和行动。用户总是可以通过自然语言要求代理"先做个计划"，这在不增加架构开销的情况下达到了相同的结果。

## 决策

完全移除 plan mode。包括：

- `EnterPlanMode` 和 `ExitPlanMode` 工具
- `agent-core` 中的 `PlanMode` 类
- 注入系统中的 `PlanModeInjector`
- `PlanModeGuardPermissionPolicy` 及相关权限策略
- Plan mode wire record 类型（`plan_mode.enter` / `cancel` / `exit`）
- TUI 组件：`PlanBoxComponent`、`/plan` 命令、Shift+Tab 快捷键、footer badge、plan 卡片渲染
- vis plan mode 投影和问题检测
- CLI `--plan` 标志及相关选项处理
- SDK `planMode` 透传

现有会话中包含 `plan_mode.*` 事件的 wire record 在重放时必须优雅处理——重放系统将跳过这些记录而不是崩溃。

## 结果

- **正面：** 移除约 73 个代码文件，显著降低维护负担和 TUI 复杂度。
- **正面：** 节省约 1,425 token 的工具定义开销以及持续的注入成本。
- **正面：** 简化了用户的代理思维模型——无需学习特殊模式。
- **负面：** 破坏性变更。引用 `planMode` 或 CLI `--plan` 的现有用户配置将失败。这需要主要版本升级。
- **负面：** 积极使用 `/plan` 进行结构化规划的用户将需要使用自然语言提示替代。
- **负面：** 带有 `plan_mode.*` 事件的旧会话 wire record 需要重放兼容性处理。
