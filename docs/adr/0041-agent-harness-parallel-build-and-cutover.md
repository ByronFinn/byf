# 0041 - AgentHarness 并行新建与实验开关切换（旧 Agent 冻结至切换）

Date: 2026-08-23

## 状态

有效（2026-08-23，PRD-0037 grill 轮裁决）。修订 PRD-0037 决策 D4 的"Agent 类原地改造为 AgentHarness"措辞——原地改造与"消费者 Phase 4 迁移"矛盾，不可执行。

## 背景

PRD-0037 D4 决定 Agent 类演化为 v2 的 AgentHarness（lane 操作面、唯一 records 写者、恢复归约），消费者（CLI TUI、web、headless）在 Phase 4 迁移。但全部消费者经 RPC 调用现 Agent 类——Phase 1 若原地改造，产品立即损坏；若等 Phase 4 才动 Agent 类，Phase 1-3 的 durability 又无处实现。grill 拷打确认这是分期计划的结构性漏洞。

## 决策

1. **并行新建**：`AgentHarness` 全部为新代码（`packages/agent-core/src/harness/`），与旧 Agent 类并存；loop 层（`src/loop`，host-free 契约不变）被新 harness 复用为 step primitives。旧 Agent 类**冻结**——只修阻断性 bug，不加功能。
2. **实验开关**：提供引擎选择开关（config `engine = "v2"` 或 CLI 等价物），允许在 Phase 1-3 期间提前 dogfood 新引擎（新引擎创建的会话即 2.0 格式）；默认引擎保持旧路径。
3. **Phase 4 一次性切换**：默认引擎切到 v2，消费者迁移完成（watch 模型、suspended UX）后删除旧 Agent 类与 wire 1.1 全部代码路径。
4. **AGENTS.md 条款随切换落地**：现条款对 Agent 类的独立性约束在切换前继续有效；PR4.4 按已批准的目标措辞替换（AgentHarness 可独立构造；Session 为可注入存储对象，内存后端即可独立运行；harness 是唯一 records 写者；loop 层保持 host-free）。

## 理由

1. **原地改造不可行**：RPC/TUI/web 全部直调 Agent 面上方法，改造即断产品。
2. **无开关太保守**：Phase 1-3 新引擎只在测试里跑，真实体验（TUI 交互、崩溃恢复手感）到 Phase 4 才第一次暴露，风险后置。
3. **早切默认太激进**：中期新旧引擎同时服务不同客户端，双倍维护面且用户面对"两个 byf"。
4. 并行新建 + 开关是唯一同时满足"产品不断、提前验证、单点切换"的策略。

## 结果

### 正面

- 产品全程可用，旧引擎行为零变化；
- 实验开关让 durability 在真实使用中提前成熟；
- 单点切换 + 删除，无长期双引擎负担。

### 负面 / 需接受

- Phase 1-4 期间两套引擎并存，agent-core 体积与维护面翻倍（已知、有界：旧路径冻结）；
- 实验开关引入组合测试面（v2 引擎 × 三消费者），需在 CI 中显式覆盖 v2 路径；
- 用户用 v2 开关创建的 2.0 会话无法被旧引擎打开（单向，与 ADR-0040 的格式裁决一致）。

## 参考

- PRD-0037：决策 D4（经本 ADR 修订）、Phase 1/4 实施计划
- ADR-0040：wire 协议 2.0 greenfield 与放弃旧会话
