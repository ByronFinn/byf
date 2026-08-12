# wire v2 reducer 重构：命令式事件日志 → 声明式 event-sourcing

> **Status**: Draft | **PRD**: PRD-0027 | **Created**: 2026-08-11 | **Last updated**: 2026-08-11
>
> 父 Issue #260。作废 ADR-0031，新增 ADR-0032。

## Goal

把 byf 的 wire 子系统从「命令式事件日志 + 命令式 restore（靠 `restoring` 全局门控抑制副作用）」重构为「声明式 event-sourcing（Op / Model / 纯函数 `apply` + `dispatch`/`restore` 双路径 + `onDidRestore` 钩子）」，从结构上消灭 live/restore 双写漂移，并为 cross-reducer、transient record、checkpoint/undo、manifest 打开能力门。

**方案选择：自研 reducer 框架**，借鉴 kimi `agent-core-v2` **实际落地子集**（Op/Model/toEvent/cross-reducer/onDidRestore 五件套），**不移植其代码、不绑定其 on-disk 格式**。这样同时规避 ADR-0031 的两大否决理由（移动靶、格式不对齐），并获得 v2 的全部结构性收益。

## What I already know

### 架构现状（命令式事件日志，接近 kimi v1）

| 维度 | 现状 | 证据 |
| --- | --- | --- |
| 记录类型定义 | 手工 `AgentRecordEvents` interface 映射 → mapped type 生成 `AgentRecord` 联合（26 种业务 record + metadata） | `agent/records/types.ts:13-98` |
| 载荷校验 | 无 schema，纯 TS 类型，运行时零校验，`JSON.parse(line) as AgentRecord` | `records/persistence.ts:194` |
| 状态模型 | 无 Model/reducer 抽象，状态散在 8 个子系统类的私有字段里，可变、无 freeze | `context/index.ts:47-53`、`usage/index.ts:16-17` 等 |
| 写入 API | 命令式 `logRecord({...})`，散落在每个子系统变更方法里，共 ~31 处 | `context/index.ts:304-310`、`goal/index.ts:110-115` 等 |
| 恢复机制 | 前缀→handler 路由表 + 每个子系统各自的 `restoreRecord` switch；多数靠「调正常方法 + `restoring` 标志抑制副作用」 | `records/index.ts:68-104`；各子系统 restoreRecord |
| 恢复时 | **重放副作用调用**（除 context 已抽纯 fold） | `config/index.ts:155`、`permission/index.ts:356,361` 等 |
| 事件派生 | 无 `toEvent`，record（落盘）与 event（UI）是两条独立路径，手动各发一次 | `goal/index.ts:372-373` |
| persist 策略 | 无 transient 标志，全部落盘 | `context.output_offloaded`/`pruning`「落盘但 restore no-op」灰色地带 |
| undo / checkpoint | 不支持运行时 undo；fork 是文件级截断 | `session/store/session-store.ts:396-452` |
| manifest | 无 wire-manifest，类型表手工维护 | — |
| 协议版本 | `1.1`，迁移链仅 1.0→1.1 | `records/migration/index.ts:4,17` |

### 已落地的局部 v2 式改造（地基已搭一半）

1. **`wire-fold.ts` 纯 fold 抽离**（PRD-0025 落地）：context 的 fold 逻辑已是纯函数（`foldAppendMessage`/`foldLoopEvent`/`foldApplyCompaction`），内核与 vis 共用。**但不是真纯函数**——`foldLoopEvent(state, event, handlers)` 的 `handlers.offloadToolOutput` 在 fold 内部 `await`（`wire-fold.ts:219-225`）。
2. **`isAgentRecordOfPrefix` 穷尽 switch**（PRD-0025 R4）：8 个子系统的 `restoreRecord` 已恢复 exhaustive 守护。
3. **goal 子系统已经是声明式**（`goal/index.ts:291-314` 直接赋值，是 8 个里唯一真正符合 restore 契约的）。

### ADR-0031 的否决理由，现在的复核

| ADR-0031 理由 | 现在还成立？ | 复核结论 |
| --- | --- | --- |
| ① kimi v2 是移动靶（WIP） | ✅ 仍成立 | 精读源码确认 v2 是 `rw-model-design.md` 的**子集**，本身还在演进。自研框架只采纳已验证落地子集，规避此问题 |
| ② on-disk 格式不对齐（byf 1.1 vs kimi 1.5） | ⚠️ 对「移植」成立，对「自研」不成立 | 自研框架的 Op type 直接复用现有 26 种 record 名，`opToWireRecord` 产出的 JSONL 形状与现有 `logRecord` 完全一致，**零数据迁移** |
| ③ 重写成本数周-数月 | ❌ 过时 | 逐子系统精读后：0 个高难度，goal+context 地基已搭好，总估时 7-12 工作日 |
| ④ byf 已做过 ADR-0010 restore 重构 | 仍成立，但其遗留（双写漂移）正是本次要解决 | ADR-0010 的「写/读对称」已实现，遗留的「统一 apply」正是 v2 的核心价值 |

### kimi v2 实现精读关键结论

1. **v2 实现是设计文档的务实子集**：`rw-model-design.md` 描述的五原语（Fact/Command/View/Signal/Effect）+ 逻辑 seq + Session 流 + 相位机**多数未落地**。实际是 Op/Model/toEvent + cross-reducer + onDidRestore + MAX_DRAIN。
2. **apply 是纯函数，无隐藏副作用出口**：签名 `(state, payload) => S`，无 handlers 参数、无 async；`Object.freeze` 双重保证（编译期 DeepReadonly + 运行时 freeze）。offload 副作用在 wire service 层的 blob codec，不在 apply 内。
3. **effect 处理三件套**：`toEvent`（声明式 op 派生）+ service 直发（命令式编排）+ `onDidRestore`（restore 后一次性）。apply 始终纯。
4. **dispatch 一致性结构性优势**：apply+persist+toEvent 在 `execute` 单方法内顺序发生，调用方无法拆散；persist 顺序由 promise 链保证 = dispatch 顺序。
5. **replay tolerance**：未知 op schema parse 失败时跳过并计数（`reportSkippedRecord`），journal 仍可读——这是为「vocabulary 贡献者撤回」设计的容错。

### 迁移成本评估（逐子系统，来自精读）

| 子系统 | 难度 | 持久状态 | 关键发现 |
| --- | --- | --- | --- |
| **goal** | 极低 | snapshot + completeReason + wallClockResumedAt | 已是声明式（直接赋值），迁移≈改名。`normalizeAfterReplay` 改 `onDidRestore` hook。**参考范本** |
| usage | 低 | byModel + currentTurn | 2 字段 reducer；restore 时 scope 强制为 `'session'` 语义保留 |
| tools | 低 | userTools + enabledTools + store | 4 case 各改 map/set；MCP 工具不走 wire 不进 reducer |
| turn | 低 | turnId 计数器 | telemetry Map 是运行态不进 reducer；`finishResume` 改 `onDidRestore` hook |
| permission | 低-中 | modeOverride + sessionApprovedActions + rules | reducer 清晰；`parent`/`policies` 构造注入不进 reducer |
| config | 低-中 | 6 标量字段 | **坑点**：`initializeBuiltinTools()` 副作用外提为 `onDidRestore` hook |
| full_compaction | 中 | compactionCountInTurn + _compactedHistory | **唯一在业务方法内检查 `restoring` 的子系统**（`full.ts:181`）；worker 启动/context 读取/telemetry 全外移 |
| context | 中 | _history + tokenCount 等 | 核心 fold 已是纯函数；需移除 `offloadToolOutput` port + 修 `append_loop_event` 异步契约违规（`context/index.ts:402`）+ 拆 `onMessage`/`onStepEnd` port 里的副作用 |
| background | 特例 | （不进 reducer） | 进程状态无法 event-source，维持双轨（`<sessionDir>/tasks/*.json` 供状态重建） |

**`restoring` 全局门控的 7 处耦合点**（迁移要消除）：`records/index.ts:38,60`、`agent/index.ts:597,602`、`compaction/full.ts:181`、`context/index.ts:344`、`replay/index.ts:10`。

## Assumptions

| 假设 | 决议 |
| --- | --- |
| on-disk wire 格式不变 | ✅ 是。Op type 复用现有 26 种 record 名，`opToWireRecord` 形状与 `logRecord` 一致，`protocol_version` 仍 `1.1`，迁移链原样保留（仅目录从 `records/migration/` 搬到 `wire/migration/`） |
| 自研框架 vs 移植 kimi 代码 | ✅ 自研。规避移动靶 + 格式不对齐两大否决理由；Op type 复用现有词汇表实现零数据迁移 |
| 不引入 blob codec | ✅ 是。byf 的 offload 用现有 scratch 文件机制 + transient op（`persist:false`）解决，不引入 blob 文件存储 |
| 不追设计文档未落地原语 | ✅ 是。逻辑 seq、Session 流、`stream.subscribe` 统一订阅面、`readView` 冷读、`defineEffect` 注册制、`maxCauseDepth` 因果深度、相位机均为 kimi WIP，本轮不实现 |
| `background.*` 不改造 | ✅ 是。进程状态（PID、文件句柄）无法 event-source，维持双轨特例（wire 审计 + tasks/*.json 状态重建） |
| apply 强制纯函数 | ✅ 是。`(state, payload) => S`，无 handlers 参数、无 async；Object.freeze 编译期 + 运行时双重保证；新增「apply 改 frozen state 抛错」单测 |
| schema 校验时机 | dispatch 时不校验（payload 由 Op 工厂类型推断保证）；restore 时校验（`safeParse`，失败跳过并计数 = replay tolerance） |

## Requirements

### R1 — 自研 wire reducer 框架骨架

新增 `packages/agent-core/src/agent/wire/`：

- **`model.ts`**：`ModelDef<S>`（name + initial + defineOp 绑定）、`defineModel`、模块级 `MODEL_REGISTRY`（Map）、`MODEL_CROSS_REDUCERS`（数组）、`DeepReadonly<T>` 递归映射类型。不引入 `blobs`（无 blob codec）。
- **`op.ts`**：`OpDescriptor<K,S,P>`（type + model + schema + apply + toEvent? + persist?）、`defineOp`（返回 `DefinedOp = OpDescriptor ∩ ((payload) => Op)`，即 import = register）、模块级 `OP_REGISTRY`（Map，重复 type 抛错）、`Op`（descriptor + payload）。
- **`wireService.ts`**：`WireService` 类，持有 model 实例（state + freeze）、journal persistence。核心方法：
  - `dispatch(...ops)`：同步，`execute({ops, silent:false})`，含重入排队（可选，初版无级联保护）。
  - `restore()`：读 journal → 迁移 → 逐条 `replayRecord`（`silent:true`）→ rehydrate（无 blob，此步空）→ 跑 `onDidRestore` hooks。
  - `seal()` / `flush()` / `getModel(model)`（返回 `DeepReadonly<S>`，惰性初始化）。
  - `execute(group)` 核心引擎：`inst.state = Object.freeze(apply(...))`；`!silent` 时 persist + toEvent；cross-reducer 总是运行。
- **`record.ts`**：`opToWireRecord`（对象 payload 展开，标量包 `payload`，补 `time`）/ `wireRecordToPayload`（逆操作）/ metadata 信封。形状与现有 `logRecord` 产出**逐字节一致**。
- **`types.ts`**：`PersistedOpMap` / `TransientOpMap` declaration merging 容器；`OpType` / `OpPayload<K>` 推导。
- 现有 `AgentRecords` / `RecordRestoreHandler` **本轮不动**，新旧并存至 Phase 6。

### R2 — 迁移 8 个子系统为 Op 定义

按难度从易到难（每阶段独立可验证、可回滚）：

| Phase | 子系统 | 关键工作 |
| --- | --- | --- |
| 1 | goal | PoC：`restoreRecord` → `apply`；`normalizeAfterReplay` → `onDidRestore` hook。**验证整个框架正确性** |
| 2 | usage / tools / turn | 简单状态 reducer；`finishResume` → `onDidRestore`；usage 的 `scope='session'` 语义保留 |
| 3 | permission / config | reducer 清晰；`config.initializeBuiltinTools()` 外提为 `onDidRestore` hook |
| 4 | full_compaction | reducer 只管 count + history 文本；worker 启动 / `agent.context.history` 读取 / telemetry 全移到 service 层 |
| 5 | context | 移除 `wire-fold.ts` 的 `offloadToolOutput` port；修 `append_loop_event` 异步契约违规；拆 `onMessage`/`onStepEnd` port 里的 background/replayBuilder/token 副作用到 service 层。`wire-fold.ts` 保留为 context Model 的 apply 实现，vis 仍共用 |

每个 Op 定义包含：`schema`（zod）、`apply`（纯函数）、可选 `toEvent`、可选 `persist:false`。

### R3 — 解决 ContextMemory 的异步 offload（深水区）

- `context.append_message` 的 apply **同步**算出 `_history`（不 offload）。
- offload 作为 **dispatch 后的 service 层 effect**：dispatch 返回后，service 检查 token 压力，若需 offload 则写 scratch 文件 + dispatch 一条 `context.output_offloaded`（**transient op，`persist:false`**，只改内存标记不落盘）。
- restore 时：apply 同步重建完整 `_history`，不 offload；下一轮 `beforeStep` 重做压缩（与 byf 现有 live-only 语义一致，CONTEXT.md 已记录）。
- `wire-fold.ts` 的 `handlers.offloadToolOutput` port 移除，fold 成为真纯函数。vis 侧 `projectContext` 同步简化。

### R4 — 统一 record/event 双轨与清理

- 可派生的事件改用 `toEvent`（op 定义里声明）。
- service 编排产生的事件保留 `eventBus.publish` 直发（如 compaction 完成后的 `compaction.completed`）。
- 删除 `restoring` 全局门控（7 处耦合点）。
- 删除 `RecordRestoreHandler` 接口和 `routeToHandler` switch。
- `logRecord(` 调用点全部替换为 `dispatch(op)`（~31 处）。
- `ReplayBuilder` 评估：大部分字段可从 `getModel()` 最终状态直接读；`approval_result` 历史可能仍需单独收集（精简但未必删除）。

### R5 — 可选结构性收益（独立 PR，按需）

- **transient op**：把 `context.output_offloaded`/`context.pruning` 改为 `persist:false`，真正不再落盘（R3 落地后自然实现）。
- **cross-reducer**：预留能力（byf 暂无 interruptionReminder 类需求，但框架支持）。
- **checkpointed model**：为运行时 undo 提供框架基础（现有 fork 是文件级截断）。
- **manifest 生成**：`gen-wire-manifest.mts` 生成 `wire-manifest.d.ts`，强制 schema 新鲜度（移植 kimi 的 manifest 测试模式）。

## Acceptance Criteria

1. **行为等价**：任意一份现有 `wire.jsonl`，经新 `WireService.restore()` 重建的 8 个子系统状态，与旧 `AgentRecords.restore()` 路径逐字段等价（property test 覆盖各子系统核心字段）。
2. **双写消灭**：grep `logRecord(` 在 `agent-core/src` 下从 ~31 处降到 0；grep `restoring` 从 7 处降到 0-1 处（仅 ReplayBuilder 可能保留）。
3. **纯函数保证**：所有 `apply` 函数无 `await`、无 `this`、无外部调用；新增「apply 改 frozen incoming state 抛错」单测全绿。
4. **dispatch 一致性**：移植 kimi `wireService.test.ts` 核心场景（纯 apply、freeze 语义、silent replay 无 event 无 persist、cross-reducer 总是运行、persist 顺序 = dispatch 顺序）。
5. **replay tolerance**：未知 op / schema parse 失败时跳过并计数，journal 仍可读（移植 kimi 对应测试）。
6. **on-disk 兼容**：现有 `wire.jsonl`（含 v1.0 老会话）无需迁移即可被新框架读取；`AGENT_WIRE_PROTOCOL_VERSION` 仍 `1.1`。
7. **新增能力可用**：至少 1 个 transient op 落地（`context.output_offloaded` 改 transient，R3 自然实现），证明框架能力。
8. **ADR 更新**：ADR-0031 状态改 Superseded by ADR-0032；新增 ADR-0032 记录「自研 reducer 框架而非移植」的决策与理由。

## Definition of Done

- 上述 AC 全部满足。
- 全量 `bun test` + `apps/cli` 组件/流程测试 + e2e 绿。
- 生成 changeset（`gen-changesets` skill）：涉及 `@byfriends/agent-core`，按 skill 规则定 bump 级别（**预期 minor**：内部架构重构，on-disk 格式不变，API 面向后兼容；若评估为 breaking 需停下来与用户确认是否 major）。
- PR 标题遵循 Conventional Commit；PR 描述说明评审来源、自研 vs 移植的取舍、与 ADR-0031 的关系。
- 更新 CONTEXT.md「Wire Records」「wire 折叠」条目，新增「Op / Model / reducer」术语。

## Out of Scope

- ❌ 改动 on-disk 格式或协议版本号（保持 1.1，零数据迁移）。
- ❌ 移植 kimi-code 的 blob codec / `OutputStore` 重构。
- ❌ 引入 kimi v2 设计文档未落地的原语：逻辑 seq、Session 逻辑流、`stream.subscribe` 统一订阅面、`readView` 冷读、`defineEffect` 注册制、`maxCauseDepth` 因果深度、相位机。
- ❌ `background.*` 改造（进程状态无法 event-source，维持双轨特例）。
- ❌ vis 侧 reader 层重写（vis 通过 `wire-fold.ts`/context Model apply 共用 fold，本轮不动 vis reader）。
- ❌ `WireModelContribution`（Feature 运行时贡献词汇）—— byf 无此需求。

## Technical Approach

### 自研框架与 kimi v2 的关键差异

| 维度 | kimi v2（移植路径，不采纳） | byf 自研（采纳） |
| --- | --- | --- |
| on-disk 格式 | 绑定 kimi 1.5，需写 byf 1.1→kimi 1.5 跨树迁移 | 复用 byf 1.1，Op type = 现有 record 名，零迁移 |
| blob codec | `ModelBlobCodec` dehydrate/rehydrate | 不引入；offload 用 scratch + transient op |
| `WireModelContribution` | Feature 运行时贡献词汇 + 撤回容错 | 不引入；`OP_REGISTRY` 仅静态注册 |
| `CycleError`/`MAX_DRAIN` | dispatch 级联保护（100 上限） | 初版不引入（byf 无 op→op 级联场景）；后续按需 |
| 移动靶风险 | 绑定 kimi WIP | 自研，不随上游演进 |

### execute 引擎核心逻辑（参照 kimi `wireService.ts:275-299`，简化）

```
execute(group: {ops, silent}):
  for op in group.ops:
    inst = ensureModel(op.descriptor.model)
    inst.state = Object.freeze(op.descriptor.apply(inst.state, op.payload))
    if not group.silent:
      if op.descriptor.persist !== false:
        appendToJournal(opToWireRecord(op), op.descriptor.model)
      event = op.descriptor.toEvent?.(op.payload, inst.state)
      if event !== undefined: eventBus.publish(event)
    crossReducers = MODEL_CROSS_REDUCERS.get(op.type) ?? []
    for entry in crossReducers:
      if entry.model === op.descriptor.model: continue
      crossInst = ensureModel(entry.model)
      crossInst.state = Object.freeze(entry.reducer(crossInst.state, op.payload))
```

关键不变量：
- apply 拿到的 `inst.state` 已 freeze（测试守卫「apply 改 frozen state 抛错」）。
- cross-reducer 在 `silent` 分支外，**总是运行**——让依赖其他域 op 的派生状态在 restore 时也能正确重建。
- toEvent 拿 post-apply state，保证事件反映最新状态。

### 分阶段实施（small PRs）

| PR | Phase | 内容 | 可回滚性 |
| --- | --- | --- | --- |
| PR-1 | Phase 0 | 框架骨架 + 单测（移植 kimi 核心场景） | 独立，零影响 |
| PR-2 | Phase 1 | goal 迁移（PoC） | 验证框架假设，最多回退一个 PR |
| PR-3 | Phase 2 | usage / tools / turn 迁移 | 机械性工作 |
| PR-4 | Phase 3 | permission / config 迁移 | 注意 `initializeBuiltinTools` 外提 |
| PR-5 | Phase 4 | full_compaction 迁移 | 注意 worker 启动外移 |
| PR-6 | Phase 5 | context 迁移（深水区） | 最多工作量，独立 PR |
| PR-7 | Phase 6 | 清理 `restoring`/`RecordRestoreHandler`/`logRecord` + 统一 toEvent | 全量回归 |
| PR-8+ | Phase 7 | transient op / manifest / checkpoint（可选，按需） | 独立 |

## Domain Terms

- **Op**：操作即数据。一个 Op 既是可调用 factory（`createGoal({goalId,...})`）又携带 `.type`/`.apply`/`.schema` 元信息。通过 `defineOp` 注册。
- **Model**：声明式状态容器。`ModelDef<S>` 描述 name + initial + 可 reduce 的 Op 集合。状态实例归 `WireService` 所有，`DeepReadonly` + `Object.freeze` 保证不可变。
- **apply（纯归约）**：`(state, payload) => S`，无副作用、无 async、无 handlers 参数。状态变更的唯一途径。
- **dispatch**：声明式写入入口。`dispatch(...ops)` 在单方法内顺序完成 apply + persist + toEvent，一致性由结构保证。
- **restore（静默重放）**：读 journal → 逐条 `execute({silent:true})` → 跑 `onDidRestore` hooks。silent 时无 persist、无 toEvent，但 cross-reducer 总是运行。
- **toEvent**：Op 的可选 live 事件派生。`toEvent(payload, state)` 在 dispatch 时用 post-apply state 派发 IEventBus 事实；restore 时不派发。
- **onDidRestore hook**：restore 完成后的一次性副作用钩子（如 `normalizeAfterReplay`、`initializeBuiltinTools`）。
- **transient op**：`persist:false` 的 Op，只改内存不落盘（如 `context.output_offloaded`）。
- **cross-reducer**：Model 声明对其他域 Op 的归约。一个 Op dispatch 时触发多个 Model 的 fold，无需持久化额外记录。

## Open Questions

（待 `/grill` 挑战后填充。预计重点挑战项：① context offload 重构的性能回归风险；② ReplayBuilder 的精简边界；③ changeset bump 级别确认；④ Phase 5 的 PR 切分粒度。）

## Traceability

- **Parent Issue**: #260
- **Supersedes**: ADR-0031（暂不迁移至 kimi agent-core-v2 的 wire 架构）→ 新增 ADR-0032
- **Related**: PRD-0025（wire 投影纯函数抽取，已完成，其 Out of Scope 的「全面 v2 迁移」由本 PRD 兑现）、ADR-0010（上一代 restore 重构）、ADR-0006（vis→wire-record 依赖边界）、ADR-0020（fork 截断锚点）
- **Research basis**: kimi-code `packages/agent-core-v2/src/wire/` 实现精读（wire.ts/op.ts/model.ts/wireService.ts/record.ts）+ byf 8 个 RecordRestoreHandler 逐个迁移成本评估
- **Domain terms added**: CONTEXT.md 将新增「Op / Model / reducer」条目，更新「Wire Records」「wire 折叠」对齐新术语
