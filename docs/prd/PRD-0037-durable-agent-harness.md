# Durable Agent Harness（pi v2 架构采纳）

> **Status**: Sliced | **PRD**: PRD-0037 | **Created**: 2026-08-23 | **Last updated**: 2026-08-23（story 完成）

## Goal

采纳 pi v2《Durable AgentHarness design》的核心架构思想，把 byf 的执行模型从"内存中跑循环、journal 顺便落盘、崩溃后恢复为 idle"升级为"被接受的操作即持久操作，崩溃后恢复为 suspended 并可续跑，任何操作不存在部分结果"。本 PRD 记录现状与 v2 设计的逐项冲突裁决、分期实施计划，以及需要推翻/修订的既有 ADR。

## What I already know

### 已对齐（保留资产）

* wire v2 reducer（ADR-0032）已实现"状态 = 记录的归约"：live 写与 restore 读共用同一 `apply`（`packages/agent-core/src/agent/wire/wireService.ts:339-362`）。
* append-only JSONL + 末行截断容错 + 未知 record 跳过（`packages/agent-core/src/agent/records/persistence.ts:186-204`）。
* 事件被动、有序、restore 静默、不重放（`packages/agent-core/src/agent/index.ts:853-856`）。
* 工具交换打开时消息延迟冲刷（`wire-fold.ts:104-115` deferredMessages/pendingToolResultIds 闸门）≈ v2 deferred writes。
* 缓存经济学已一等公民：3+1 缓存桩（ADR-0011）、ephemeral 尾部注入、cache churn 归因（PRD-0029）。
* `tool.call` 先落 journal 再执行 ≈ v2 `tool_started` 意图（半对齐）。
* 压缩 append-only（`context.apply_compaction` + fold 替换前缀，`wire-fold.ts:192-216`）。

### 硬冲突（待裁决，编号 B1-B9）

* **B1 中断 turn 的恢复语义**：v2 = 恢复 suspended 可续跑 + abort reconcile（合成工具结果 + closing assistant message）；byf = `finishResume()` 清空 activeTurn 恢复 idle（`turn/index.ts:209-214`），悬空 `tool.call` 永远悬空，重试计数是 live-only 事件不持久（`loop/events.ts:119-125`）。
* **B2 对话与执行不分离**：byf 每 agent 一份 wire.jsonl 混装 26 种 record（对话内容 + 执行事实）；v2 要求 tree（对话）与 records（执行）分家，"删掉 records 仍是完整对话"。与 ADR-0031/0032 字节兼容决策相反。
* **B3 无对话树**：byf 线性 `ContextMessage[]`，无 parentId、无 lane、无 navigateTree；回退 = fork 目录复制 + 截断（ADR-0020）；并行 = 多 Agent 而非 lane。
* **B4 steer abort 语义相反**：byf `cancel()` 不清 steerBuffer（`turn/index.ts:156-163`），残留冲入下一 turn；v2 = steer/followUp 随 abort 死亡并归还 payload，nextRun 存活。byf 无 followUp/nextRun 队列。
* **B5 持久化时机**：byf 批量异步 flush，事件在 fsync 前发出；v2 契约 = resolve 即 durable。
* **B6 跨进程单写者无强制**：CLI TUI 与 `byf web` 可同时打开同一 session 双写 wire.jsonl，无互斥（现存隐患）。
* **B7 fork 语义**：byf 目录复制 + 随机 UUID + 活跃 turn 禁止；v2 = entries-only 复制 + 确定性子会话 id `f(parentSessionId, toolCallId)` + 运行中可 fork。
* **B8 turnId 不稳定**：内存计数、restore 重建（ADR-0020 已认定）；v2 = 持久 runId。
* **B9 AGENTS.md Agent 独立性约束**：v2 操作面在 harness/lane、Agent 退为 step primitives；byf 硬约束 Agent 可独立构造（`agent/index.ts:129-150` 现状符合）。两者可共存但需重新划定边界。

### 缺失能力（gap，C1-C10）

C1 deferred provider 请求（kosong 无 `deferred` stopReason / `fetchDeferred`，`kosong/src/provider.ts:35-41`）；C2 watch() 快照+缓冲订阅（web resume POST 与 SSE 之间有丢事件窗口、帧无 cursor）；C3 results-not-exceptions API；C4 v2 hook 目录（before_run 持久化 / transform_context / before_request / before_payload / after_response + 重放矩阵）；C5 工具 replay 安全标记；C6 followUp/nextRun 队列；C7 SQLite 后端 + leases + parity 套件（全仓无 sqlite）；C8 telemetry span 树（现 noop）；C9 全局事实 append-only（现 state.json 原地改写）；C10 导航 + branch summary（依赖 B3）。

### 顺带暴露的现存 bug（D 类）

D1 双进程双写（=B6）；D2 web busy 跟踪只认 main agent（`session-manager.ts:556-569`）；D3 resume 快照→SSE 订阅窗口丢事件（`ChatPage.tsx:90-93`）；D4 steerBuffer 跨 cancel 存活（=B4）。

## Assumptions (temporary)

* 旧 wire 1.1 会话的数据价值低（个人工具、可接受只读打开或一次性转换）——**已验证**：D2/Q6 裁决放弃兼容并隐藏列表项。
* byf 的消费者（CLI TUI、web、headless）都经由 SDK 层，操作面迁移的影响面可控——**已验证**：调研确认 TUI/web/headless 全部经 ByfHarness→Session，无旁路直调 agent-core。
* pi v2 文档（harness-v2.md）作为蓝本，具体 API 命名可按 byf 领域语言调整——**维持**（作为实施原则）。

## Open Questions

* Q1（已裁决 2026-08-23）：**全量采纳、分期实施**。终态完整对齐 v2：entries 树、tree/records 分离、lanes、导航、durability。wire 协议直接按 2.0 新格式设计（含 seq），不在 1.1 上演化。推翻 ADR-0031/0032/0020。
* Q2（已裁决 2026-08-23）：**放弃旧会话**。旧 wire 1.1 会话不保证可打开，不做读转换与惰性重写（比 pi v2 的"打开恢复 idle"政策更激进，删除全部兼容路径）。旧会话的 Inspector 只读访问如未来需要，另行立项。
* Q3（已裁决 2026-08-23）：**外围全量纳入**：kosong deferred 请求、SQLite 后端、telemetry span 树均在本期范围（分期后置）。
* Q4（已裁决 2026-08-23）：**Agent 类改造为 AgentHarness，独立性条款随迁**。Agent 类（`agent/index.ts:170`）演化为 v2 §8 的 AgentHarness（承载 lane 操作面、唯一 records 写者、恢复归约）；loop/ 退为 step primitives；TurnFlow 职责并入 harness 过程；现重型 Session 容器（agents 注册表/RPC/subagent-host）解体，存储职责归于新轻量 Session。AGENTS.md 独立性条款改写为对 AgentHarness 的约束：构造不得强制重型会话容器，Session 为可注入存储对象（内存后端即可独立运行），实例不得持有 sessionId、不依赖会话生命周期/元数据/父子关系逻辑。（经 grill Q5 修正为"并行新建"，见 ADR-0041）

### Grill 轮裁决（2026-08-23）

* Q5（切换策略，ADR-0041）：**并行新建 + 实验开关**。新 AgentHarness 全部新建代码（`src/harness/`），旧 Agent 冻结只修阻断性 bug；config `engine = "v2"`（或 CLI 等价物）允许提前 dogfood；默认引擎 Phase 4 一次性切换并删除旧路径。修正原"Phase 1 原地改造"措辞。
* Q6（旧会话列表）：**隐藏**。session_index 增加格式版本字段，旧 1.1 会话从会话列表 UI 隐藏；磁盘文件不删；误打开报清晰错误。
* Q7（goal 归宿）：**custom entries + followUp**。goal 状态（create/update/clear）→ lane 路径上的 custom entries（点查询还原）；goal 续跑 → `before_run_end` hook 返回 followUp 继续 run（50 轮/预算上限保留为 driver 逻辑）；ADR-0023"fork 清空 goal"自动满足（fork 点之前的 goal entry 不被复制）。Goal/Goal Mode 域语义（状态机、三权分立）不变。
* Q8（SQLite 包位置）：**新包 `packages/storage`**。SessionStorage 契约定义在 agent-core（类型导出），storage 包依赖契约并实现 SQLite 后端（bun:sqlite 依赖隔离于该包），node-sdk 装配；agent-core 不反向依赖 storage。对齐 ADR-0006 单向分层。
* Q9（AGENTS.md 目标措辞）：**已批准，PR4.4 切换完成时落地**（现条款对旧 Agent 在切换前继续有效）。目标措辞：AgentHarness 可独立构造；Session 为可注入存储对象，内存后端即可运行；sessionId 仅 request-config hint 且实例不持有；harness 是唯一 records 写者；loop 层保持 host-free，被 harness 作为 step primitives 消费。

### Grill 轮自决项（代码事实可推导，记录备查）

* /btw 侧问：维持现状旁路机制（一次性只读快照查询，非持久工作，不占用 lane），入 Out of Scope。
* 会话锁文件：pid + 心跳，心跳超时（60s）自动接管；Phase 3 SQLite leases 接管该职责。
* shell hooks（13 事件）↔ v2 hook 目录映射：PreToolUse→before_tool、PostToolUse/PostToolUseFailure→after_tool、UserPromptSubmit→before_run、Stop/StopFailure→before_run_end、PreCompact→before_compaction、PostCompact→compaction 结束事件、SessionStart/SessionEnd→harness create/close、SubagentStart/SubagentStop→子代理 fork 工具的 before/after_tool、Notification→事件。
* 观察掩码/裁剪/输出卸载（现 transient ops）→ `transform_context` hook（per-request ephemeral，"塑形 provider 所见、永不改会话所存"，与 persist:false 语义同构）。
* usage 记账与缓存归因 → `after_response` hook + telemetry spans（usage 不再是独立 record 类型）。
* 权限模式（permission.set_mode）→ lane 路径 custom entry（点查询还原）；PermissionModeInjector 的 ephemeral 注入机制保留。审批（reverse-rpc）实现为被 await 的 before_tool 拦截器。
* 会话内 Cron：注入目标固定为 main lane（保持现状语义）。
* Headless drain（ADR-0029）：协议不变；进程被杀时操作 suspended，下次打开提示 resume。
* media-degraded/stripped 投影（413 恢复）→ transform_context/before_request 层的一次性请求投影。
* wire 协议版本号定为 `2.0`；崩溃测试方法论 = 对每条 trace 的 journal 逐行截断 + restore 断言的确定性属性测试；parity 契约测试套件由 agent-core 导出，packages/storage 消费。

## Requirements

* **R1 会话模型**：entries 树（message / model_change / thinking_level_change / active_tools_change / compaction / branch_summary / custom 七类，parentId 链）+ records 执行日志分离 + lanes + global facts（append-only，latest-wins）+ 单调 seq 贯穿四部分。不变量："删掉全部 records 剩下的仍是完整合法对话"；records 永不进模型上下文。
* **R2 Durable runs**：被接受的 prompt 即持久操作（operation_started 先于任何效果，含预分配 id）；崩溃后 restore 归约出 lane 状态（idle / suspended / aborting / deferred）；`resume()` 续跑开放操作（与 live 同码）；abort reconcile（合成 interrupted 工具结果 + closing assistant message + steer/followUp 死亡并归还 payload）；task_attempt 持久重试计数（crash-restart 循环不可重置）；恢复过程自身可重入（appendIfMissing 幂等）。
* **R3 队列**：steer / followUp / nextRun 三队列；接受即持久（queue_enqueued 带完整 payload），消费点才写树；abort 时 steer/followUp 死亡、nextRun 与 deferred writes 存活（修正现 B4 行为）。
* **R4 append-only 上下文**：跨请求上下文只在尾部增长（KV 缓存不变量）；mid-step 写入走 deferred writes 到 checkpoint 应用；现有 3+1 缓存桩体系（ADR-0011）迁入 harness 并按 lane 维度生效。
* **R5 操作面**：AgentLane API（prompt/skill/compact/navigateTree/resume/abort + 队列 + 配置视图 + waitForIdle），全 async、results-not-exceptions（判别联合，永不 throw）；lane 句柄为按名绑定的无状态门面。
* **R6 订阅**：watch() 快照+缓冲订阅（原子捕获快照并开始缓冲，start() 冲刷转直播，无序列号无注册竞态）；watchSession() 会话级观察者；重连=新快照。
* **R7 三通道**：events（被动/有序/提交后/不可重放）+ hooks（拦截；输出喂持久状态者先落盘；重放矩阵=hook 只在其工作重跑处重跑）+ telemetry（span 树，pi.harness.* 命名，默认载荷零内容）。现有 13 个 shell hooks 与 LoopHooks 映射到 v2 目录。
* **R8 存储**：SessionStorage 契约（存储对操作/队列/恢复零知识；契约类型定义在 agent-core 并导出契约测试套件）+ 内存参考实现（agent-core）+ JSONL 后端（一行=原子单元、torn-tail 截断）+ SQLite 后端（**新包 `packages/storage`**，bun:sqlite；branch_entries/branch_tips 缓存与 tip 唯一性；leases）+ 三后端 parity 测试套件。
* **R9 deferred provider 请求**：kosong 增加 stopReason `deferred` + DeferredHandle + fetchDeferred/cancelDeferred（可选方法=能力信号）；harness Park 信号、挂起≡崩溃（存储不可区分）、兑换幂等无副作用。
* **R10 单写者**：会话级单写者强制——Phase 1 锁文件（pid + 心跳，心跳超时 60s 自动接管），Phase 3 SQLite leases 接管；跨进程双开被拒（修 D1）。
* **R11 fork 与子代理**：fork 只复制 entries（无 records/队列，天生 idle）+ label/name 按 v2 §16 规则；子会话 id 确定性派生 `f(parentSessionId, toolCallId)`（safe replay 重挂接不产双胞胎）；子代理采用 fork 隔离模型（对齐现状"独立上下文"语义），lane 共享历史模型留给未来消费场景。fork 点之前的 goal custom entries 不被复制——"fork 清空 goal"（ADR-0023）自动满足。
* **R12 AgentHarness 独立性**：AGENTS.md 条款改写（Q9 已批准目标措辞，PR4.4 落地）；内存 Session 后端下可完全独立构造运行。
* **R13 放弃旧会话**：wire 1.1 无兼容路径（见 Q2 裁决）；session_index 增加格式版本字段，旧会话从列表 UI 隐藏、磁盘保留、误打开报清晰错误。
* **R14 顺带修复**：D2（web busy 只认 main）与 D3（resume 快照→SSE 丢事件窗口）随 Phase 4 消费者迁移修复；D4（steerBuffer 跨 cancel 存活）随 R3 消失。
* **R15 引擎切换（ADR-0041）**：并行新建 + 实验开关（`engine = "v2"`）+ Phase 4 一次性切换删除；旧 Agent 冻结只修阻断性 bug。
* **R16 goal 映射**：goal 状态 → lane 路径 custom entries；goal 续跑 → before_run_end 返回 followUp；goal 域语义（状态机、三权分立、预算）不变。

## Acceptance Criteria

* [ ] AC1 崩溃矩阵：v2 §6 全部 trace（run/重试/steering/deferred write/abort/工具执行 X1-X5/自动压缩/导航/deferred 请求）的任意相邻两行间崩溃，恢复后语义正确——操作要么未发生要么被完成，无部分结果可观察。
* [ ] AC2 恢复归约：任意 journal 在任意位点截断后 restore，每 lane 状态判定正确（idle / suspended+原因 / aborting / deferred handle / pending 队列与写 / 悬空工具批分类）。
* [ ] AC3 重试计数跨崩溃持久：崩溃-重启循环不能重置 task_attempt 计数；耗尽时落错误 assistant 消息 + operation_finished failed。
* [ ] AC4 恢复可重入：恢复过程中再次崩溃，重跑恢复安全（预分配 id 已存在即跳过）。
* [ ] AC5 悬空工具调用：restore 后按 replay 安全性分类获得合成 interrupted 结果或安全重放，不再永久悬空。
* [ ] AC6 双 lane 并行：同会话两 lane 并行操作互不干扰、分叉正确、各自模型/工具配置独立、单写者保持。
* [ ] AC7 watch 无丢无重：快照→start() 冲刷→直播，每事件恰一次有序；重连取新快照（含进行中 streaming 进度）。
* [ ] AC8 deferred 闭环：挂起→（跨进程/长时间）→resume() 兑换 handle，不重复计费语义；terminal 答案（过期/未知/已消费）按失败处理。
* [ ] AC9 parity：内存 / JSONL / SQLite 三后端同一测试套件全绿。
* [ ] AC10 单写者：第二个进程打开同会话被明确拒绝（锁文件 / lease）。
* [ ] AC11 results-not-exceptions：操作与队列方法无 throw 路径（rejection 即 bug）。
* [ ] AC12 文档落档：AGENTS.md 条款修订；新 ADR（推翻 0031/0032/0020 的格式决策、Agent→Harness 决策）合入；CONTEXT.md 域语言更新。

## Definition of Done

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes（AGENTS.md、受影响 ADR、CONTEXT.md）
* Rollout/rollback considered if risky（旧会话兼容路径）

## Out of Scope

* 旧 wire 1.1 会话的任何兼容/迁移路径（已裁决放弃，ADR-0040）。
* per-lane hooks/events 注册（v2 open question 1；维持 harness-global + payload 带 lane）。
* web 多线程 lane UI（lane API 先行，UI 消费场景后续立项）。
* 多写者 / 复制 / 分布式会话（与 v2 non-goal 同步排除）。
* background 任务双轨制（tasks/*.json + 审计）统一入 records——保留现状双轨，另行评估。
* fork scope:"tree" 的 lane 复制细则（v2 open question 3，随实现定）。
* /btw 侧问改造（维持现状只读旁路机制，不占用 lane）。

## Technical Approach

**架构终态**（对齐 v2 §8-§14）：

* `AgentHarness`（由 Agent 类改造）：create() 打开会话并恢复全部 lane；lane()/createLane()/deleteLane()/lanes()；实现 main lane 的 AgentLane 面；唯一 records 写者；hooks/events/watch/close。runProcedure/driverLoop/stepTask/reconcileToolBatch/abortPath 等过程即行为规范（v2 §14），live 与 resume 同码。
* `Session`（新轻量）：implements SessionTree（绑定 main）+ view(lane) 写绑定 + lane 指针 CRUD + records 读写 + getLog。存储后端注入（内存/JSONL/SQLite）。
* `loop/` 现有分层（run-turn/turn-step/tool-call/tool-scheduler）保持 host-free 契约，成为 step primitives；TurnFlow 的 steer 缓冲/goal 续跑/续跑判定并入 driverLoop 与 checkpoint。
* 磁盘布局：`sessions/<id>/wire.jsonl` 会话级单文件（kind: header/entry/record/lane/fact 行，lane 为信封字段，seq=行位）替代 `agents/<id>/wire.jsonl`；state.json 的 title/pinned/archived 等迁为 facts append-only；session_index 保留。
* 持久化分级：接受边界记录（operation_started / queue_enqueued / write_deferred / abort_requested）fsync-before-resolve；其余条目批量 flush（性能分级，契约上全部"resolve 即 durable"）。
* kosong：StopReason 增 `deferred`；ProviderStreams 增可选 fetchDeferred/cancelDeferred。
* 子代理：SessionSubagentHost 迁到 fork 模型 + 确定性子会话 id；权限链继承语义保留。
* 崩溃容错保留：torn-tail 截断、未知 record 跳过计数的既有经验移植到 2.0 读取器。
* **wire 协议版本号 `2.0`**；metadata 信封保留（version: 2.0）。
* **既有子系统 → v2 概念映射**（grill 自决，见 Open Questions 自决项）：shell hooks 13 事件、观察掩码/裁剪/输出卸载（→transform_context ephemeral）、usage 记账（→after_response + telemetry）、权限模式（→路径 custom entry + ephemeral injector 保留）、审批（→被 await 的 before_tool 拦截器，reverse-rpc 机制保留）、Cron（→注入 main lane）、media 413 恢复（→请求侧一次性投影）、goal（→custom entries + before_run_end followUp，R16）、headless drain（协议不变）。
* **测试方法论**：崩溃矩阵 = 对每条 v2 §6 trace 的 journal 逐行截断 + restore 断言的确定性属性测试；parity 契约测试套件由 agent-core 导出（内存参考实现首先全绿），packages/storage 与 JSONL 后端消费同一套件。
* **AGENTS.md 目标措辞**（Q9 批准，PR4.4 落地）：AgentHarness must be usable on its own——构造不得强制会话存储；Session 为可注入存储对象，内存后端即可运行；sessionId 仅 request-config hint 且实例不持有；harness 是唯一 records 写者；loop 层保持 host-free，被 harness 作为 step primitives 消费。

## Research References

（暂无 /research 记录；蓝本为用户提供的 pi v2 harness 设计文档全文，见 Technical Notes）

## Feasible Approaches

**Approach A: 全量采纳、五期实施**（选定）

* How it works: Phase 0 存储地基 → Phase 1 durability 核心（main lane）→ Phase 2 lanes/导航/fork/完整操作面 → Phase 3 外围（deferred/SQLite/telemetry）→ Phase 4 消费者迁移与旧路径删除。每期独立可交付、可停损。
* Pros: 终态完整；避免中间态弃工（1.1 上做临时记录层会在建树时重写两次）；每期有明确验收（崩溃矩阵/parity/e2e）。
* Cons: 周期长；Phase 0-2 期间新旧代码并存，消费者在 Phase 4 才切换。

**Approach B: durability 核心 + 树延后**（未选）

* Pros: 见效快。
* Cons: 若后续建树，Phase 1 的临时记录层被重写；lanes/导航/确定性子 id 全部延后——与"真正想要 v2"的目标不符。

**Approach C: 1.1 字节兼容渐进演化**（未选）

* Pros: 无重写风险。
* Cons: 线性 journal 无法承载树与 records 分离，字节兼容不可行；与 ADR-0032 绑死。

## Decision (ADR-lite)

* **D1 范围=全量分期**：用户明确 v2 改进为真实诉求；中间态弃工成本高于直接 greenfield。
* **D2 greenfield、放弃旧会话**（ADR-0040）：旧 1.1 数据价值低（个人工具）；删除全部兼容路径换取设计自由度（比 pi v2 政策更激进，ADR 已明示后果：升级后旧会话不可用、列表隐藏）。
* **D3 外围全纳入**：kosong deferred、SQLite（bun:sqlite，新包 packages/storage）、telemetry span 树分期后置但属本期。
* **D4 Agent→AgentHarness、AGENTS.md 条款随迁**（经 ADR-0041 修订）：**并行新建非原地改造**；Session 降为可注入存储对象；独立性约束精神保留（内存后端独立运行）；旧 Agent 冻结至 Phase 4 删除。
* **D5 子代理=fork+确定性 id**：对齐现状隔离语义与 v2 §16 策略（lane 共享历史、fork 隔离）。
* **D6 切换=并行新建+实验开关+一次性切换**（ADR-0041）：config `engine = "v2"` 允许 dogfood；默认引擎 Phase 4 切换删除。
* **D7 goal=custom entries + followUp**：域语义不变，存储与续跑机制映射 v2 原生概念。
* **D8 SQLite=新包 packages/storage**：契约在 agent-core，实现依赖契约，node-sdk 装配（ADR-0006 对齐）。
* **D9 旧会话列表隐藏**：session_index 版本字段过滤，磁盘保留，误打开报错。

## Implementation Plan (small PRs)

* **Phase 0 — 存储地基与 2.0 格式**
  * PR0.1 新 `SessionStorage` 契约（agent-core）+ 内存参考实现 + entries/records/lane/fact 类型全集 + seq + 契约测试套件导出
  * PR0.2 JSONL 后端（header/entry/record/lane/fact 行、torn-tail 截断）+ parity 套件
  * PR0.3 新 Session（SessionTree 视图、branch 查询语义、fork/create repo 原语、facts）
  * PR0.4 session_index 版本字段 + 旧会话隐藏（D9）；ADR-0040/0041 引用收尾（已提前落档）
* **Phase 1 — durability 核心（main lane，并行新建）**
  * PR1.1 **新建** `src/harness/agent-harness.ts`（不动旧 Agent 类）：create/restore 归约（LaneState）、runProcedure 骨架、loop/ 接线为 step primitives、实验开关 `engine = "v2"`
  * PR1.2 意图先行记录全集 + 预分配 id + appendIfMissing + 持久化分级 fsync
  * PR1.3 abort reconcile + 三队列 + checkpoint + deferred writes（修正 steer abort 语义，D4 消失）
  * PR1.4 崩溃矩阵测试（journal 逐行截断属性测试）+ 会话锁文件（pid+心跳+60s 接管，修 D1）
* **Phase 2 — lanes、导航、fork、hooks/events/watch**
  * PR2.1 AgentLane 完整 API + lane CRUD + per-lane 配置视图 + results-not-exceptions
  * PR2.2 navigateTree + branch summary + label + fork 重写（entries-only + 确定性子 id + 子代理迁移）+ goal custom entries 映射（R16）
  * PR2.3 v2 hooks 目录 + 重放矩阵 + shell hooks 映射层
  * PR2.4 v2 events 目录 + watch()/watchSession() 缓冲订阅
* **Phase 3 — 外围**
  * PR3.1 kosong deferred + harness Park/兑换闭环 + 跨进程挂起恢复测试
  * PR3.2 新包 `packages/storage` SQLite 后端（bun:sqlite、branch cache、leases 接管锁文件职责）入 parity
  * PR3.3 telemetry span 树（pi.harness.*、默认脱敏）
* **Phase 4 — 默认切换、消费者迁移与旧路径删除**
  * PR4.1 CLI TUI（suspended 启动 UX、新事件目录；默认引擎切换）
  * PR4.2 web server/client 迁 watch 模式（修 D2/D3）
  * PR4.3 headless/Inspector/vis 新格式投影
  * PR4.4 删除 wire 1.1 路径 + 旧 Agent/Session 容器 + AGENTS.md 条款替换（Q9 措辞）+ CONTEXT.md 收尾

## Technical Notes

* 蓝本：pi v2《Durable AgentHarness design》（用户提供全文，21 节）。核心思想：持久化第一轴（意图先行 + 预分配 id）、状态=记录归约、tree/records 分离、lane 单写者并行、append-only 上下文（KV 缓存经济学）、挂起≡崩溃、events/hooks/telemetry 三通道。
* 相关既有决策：ADR-0032（wire v2 reducer，字节兼容）、ADR-0031（暂不迁移 kimi v2 wire）、ADR-0020（fork 截断锚点，turnId 不稳定）、ADR-0011（缓存桩）、ADR-0034（web SSE+POST）、ADR-0037（web×vis 合并）。
* 现状调研三报告（Session/存储、Agent 循环、harness/事件/web）结论已录入本文档 What I already know。

## Traceability

- **Created by**: `/think` (2026-08-23)
- **Grilled by**: `/grill` (completed 2026-08-23) — 9 项用户裁决（切换策略/旧会话列表/goal 归宿/SQLite 包/AGENTS.md 措辞 + think 轮 5 项）+ 7 项自决映射（侧问/锁文件/hooks 映射/掩码卸载/usage/权限/cron/headless/media/版本号/测试方法论）；修正 D4 为并行新建（ADR-0041）；创建 ADR-0040、ADR-0041；CONTEXT.md 增补目标态术语并标注受冲击词条
- **Sliced by**: `/story` (2026-08-23) → Child Issues below
- **New terms**（供 /grill 精化并录入 CONTEXT.md）: AgentHarness、AgentLane、lane/leaf、entries 树、records（lane 操作日志）、provisioned id（预分配 id）、意图先行（intent-before-effect）、restore 归约（reduction）、suspended/resume、abort reconcile、checkpoint、deferred write、steer/followUp/nextRun 三队列、branch summary、fork（entries-only）、确定性子会话 id、watch() 快照+缓冲订阅、results-not-exceptions、parity 套件、deferred handle / Park、append-only 上下文不变量

- **Sliced into**:
  - #319 — [PRD-0037] wire 2.0 类型全集 + SessionStorage 契约 + 内存参考实现 (AFK)
  - #320 — [PRD-0037] JSONL 2.0 后端 + torn-tail 截断 + parity (AFK, blocked by #319)
  - #321 — [PRD-0037] 新 Session：SessionTree 视图 + branch 查询 + facts + fork 原语 (AFK, blocked by #319)
  - #322 — [PRD-0037] session_index 格式版本字段 + 旧会话列表隐藏 (AFK, blocked by #321)
  - #323 — [PRD-0037] AgentHarness 骨架：create + restore 归约 + runProcedure (AFK, blocked by #321)
  - #324 — [PRD-0037] 意图先行记录全集 + 预分配 id + fsync 分级 (AFK, blocked by #323)
  - #325 — [PRD-0037] checkpoint + 三队列 + abort reconcile (AFK, blocked by #324)
  - #326 — [PRD-0037] 崩溃矩阵属性测试 + 会话锁文件单写者 (AFK, blocked by #325)
  - #327 — [PRD-0037] 实验开关 engine=v2 (AFK, blocked by #323)
  - #328 — [PRD-0037] AgentLane 完整 API + lane CRUD + per-lane 配置 (AFK, blocked by #325)
  - #329 — [PRD-0037] navigateTree + branch summary + 手动/自动压缩操作 (AFK, blocked by #328)
  - #330 — [PRD-0037] fork 重写 + 确定性子会话 id + 子代理迁移 (AFK, blocked by #328)
  - #331 — [PRD-0037] goal 映射：custom entries + before_run_end followUp (AFK, blocked by #325)
  - #332 — [PRD-0037] v2 hooks 目录 + 重放矩阵 + 持久化输出 (AFK, blocked by #325)
  - #333 — [PRD-0037] shell hooks 13 事件映射桥接 (AFK, blocked by #332)
  - #334 — [PRD-0037] v2 events 目录 + watch()/watchSession() 缓冲订阅 (AFK, blocked by #323)
  - #335 — [PRD-0037] kosong deferred：StopReason + DeferredHandle + fetchDeferred (AFK，无阻塞，可先行)
  - #336 — [PRD-0037] harness Park 挂起/兑换闭环 (AFK, blocked by #325, #335)
  - #337 — [PRD-0037] packages/storage SQLite 后端 + branch cache + leases (AFK, blocked by #319, #326)
  - #338 — [PRD-0037] telemetry span 树 + 默认脱敏 (AFK, blocked by #323)
  - #339 — [PRD-0037] CLI TUI 迁 v2 引擎 + suspended 启动 UX + 默认切换 (HITL, blocked by #326, #327, #331, #333, #334)
  - #340 — [PRD-0037] web 迁 watch 快照+事件模型 + DTO 重定义 (HITL, blocked by #328, #334)
  - #341 — [PRD-0037] headless 适配 + Inspector/检视 2.0 投影 (AFK, blocked by #339)
  - #342 — [PRD-0037] 契约收尾：删除 wire 1.1 + 旧引擎 + AGENTS.md/CONTEXT.md 定稿 (AFK, blocked by #339, #340, #341)

## Issue

#318（父 Issue）
