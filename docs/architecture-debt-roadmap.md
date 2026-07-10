# 架构债路线图

> **Created**: 2026-07-10
> **Source**: 基于 2026-07-10 `improve-architecture` 扫描报告，经代码事实校准后的复查结论。
> **状态**: 活跃文档，随每轮架构复查更新。

本路线图是跨 PRD 的架构优化协调文档，不取代任何单项 PRD 的验收标准。它的作用是：

1. 记录扫描报告与代码事实之间的**偏差校准**，避免后续工作建立在错误前提上。
2. 给出按**优先级 + 风险**排序的执行路线，区分"立即做""顺势做""谨慎做""不做"。
3. 沉淀 `apps/cli/AGENTS.md` 中 **ByfTui 结构性约束**的设计依据。

---

## A. 扫描校准摘要

2026-07-10 的扫描报告整体质量高（正确识别了 ByfTui 持续回涨、BackgroundManager 多职责、provider 共享层薄等真问题），但其中 **6 处数据/结论与代码事实存在偏差**。任何基于原报告数字的工作都会被误导，路线图必须以校准后的事实为基准。

| # | 扫描报告说法 | 实测事实（`wc -l` / 代码核查） | 对后续工作的影响 |
|---|---|---|---|
| 1 | `byf-tui.ts` 4380 行、H1 未完成 | **4178 行**；且 `apps/cli/AGENTS.md` 自身 baseline（~4380）也偏高 | 治理基准需校准；趋势仍上升但比报告描述的平缓 |
| 2 | 建议抽出 `BtwController` | **btw 已 100% 抽出**为 `BtwController`（259 行），根文件仅 9 处协调调用 | 该建议**已完成**，从路线图删除 |
| 3 | `restoreRecord ~209 行` | **实际 24 行**（报告把模块级 `mapLoopEvent` + error helper 错算进去了） | M1 拆分价值被高估，降级到"顺势做" |
| 4 | BaseChatProvider 之后 adapter 仍各写各的 | **已有** `provider-common.ts`（139 行）+ `openai-common.ts`（292 行）两层共享纯函数 | H3 比报告暗示的成熟，只剩局部重复 |
| 5 | M6 rg-runner 有复用价值 | grep 是**唯一**用 ripgrep 的 builtin tool（glob 走 `kaos.glob`） | M6 降级为"纯降单文件复杂度"，无复用收益 |
| 6 | AGENTS.md 缺行数预算 | **已有成熟 Size Budget 章节**（`apps/cli/AGENTS.md:66-86`），含 net-zero 规则 + enforcement | 结构性约束已有雏形，需校准 + 强化而非新建 |

**复查结论**：0 阻塞项维持。3 个 High 中，H1（ByfTui）是真实且最活跃的债；H2（BackgroundManager）真实但风险高、需先补测试；H3（provider）大半已偿还，只剩局部。7 个 Medium 中多数已被处理或被高估。

---

## B. 优先级路线图

### 档 1 · 立即做（低风险、高收益、可独立交付）

这些项要么是纯文档，要么是边界清晰的小重构，不依赖任何排期窗口。

#### H1-a：slash handler 注册表化（command-module 方案）

- **位置**：`apps/cli/src/tui/byf-tui.ts:1405-1503`（`handleBuiltInSlashCommand`，27-case switch）
- **真实缺口**：`commands/registry.ts`（241 行）已定义 25 条命令的**元数据**（`name`/`aliases`/`description`/`priority`/`availability`），但**没有 handler 引用**。27 个 case 的 handler 仍以私有方法散落在根文件（`handleEditorCommand:3785`、`handleThemeCommand:3795`、`handleModelCommand:3809`、`handleForkCommand:3853`、`handleYoloCommand:3945`、`handleGoalCommand:3984` 等）。
- **已定方案（grill 2026-07-10）**：**分组 command-module + 统一 SlashCommandHost 接口（窄 host + 委托）**。
  - 定义 `SlashCommandHost` 接口——只暴露真正被 ≥2 个 handler 用到的方法（约 8–10 个：`showStatus`/`showError`/`requestRender`/`createNewSession`/`sendNormalUserInput`/`cancelCurrentStream` 等），加上所有 controller/dialogManager 访问器。单次使用的特殊能力（如 fork 内部逻辑）留在 ByfTui 或对应 `actions/`，handler 只调一行委托。不把 ByfTui 整个塞进接口。
  - 按组（dialog / session / auth / goal / editor / theme 等）抽 command-module，每个接收 host，**不持有 ByfTui 引用**（符合 ADR-0017 DI 模式，参考 `BtwController`/`DialogManager`）。
- **迁移策略（grill 2026-07-10）**：**两步——基建先行**。
  - **PR1（基建）**：`SlashCommandHost` 接口 + 注册机制 + `handleBuiltInSlashCommand` 改为 Map 分发（此时 handler 仍是 ByfTui 方法，临时注册）。
  - **PR2（迁移）**：按组逐个把 handler 迁到 `commands/handlers/<group>.ts`，验证模式可行。
- **工作量**：PR1 中；PR2 中–高（27 个 handler 按组迁移）。
- **风险**：PR1 低（机械替换）；PR2 中（依赖注入边界需谨慎）。
- **验证**：`byf-tui-message-flow.test.ts` 端到端覆盖；TS 穷尽检查保证每个 `BuiltinSlashCommandName` 都有 handler。

#### M2：vis DTO 单一来源

- **位置**：`apps/vis/shared/types.ts` 与 `apps/vis/web/src/shared-types.ts`（各 133 行，近乎完整副本）
- **漂移实测**：web 用 `PermissionMode`（类型引用），shared 用内联字符串联合 `'manual' | 'yolo' | 'auto'`——结构相同但表达不同。web 顶部注释声称"vis-server imports from apps/vis/shared/types.ts"，实际它自己也是独立副本。
- **代码约束（grill 2026-07-10 核实）**：`apps/vis/shared/` **没有 `package.json`**（不是独立包，只是一组共享源文件）。web 的 tsconfig `include` 只有 `src` 且**未配 `paths`**。web 已有 `types.ts` 再导出层，但它从本地副本 `shared-types.ts` 导入，注释承认是为了"避免拉 vis-server 源码进 web tsconfig"。
- **方案选择**：两个可行路径——
  - **A（推荐）**：web 删除本地副本 `shared-types.ts`，`types.ts` 改为用 `import type` 直接从 `../../../shared/types` 再导出——与 vis-server 现有做法一致。`shared/types.ts` 是**纯类型模块**（14 个 type/interface 导出，0 运行时导出），`import type` 编译后擦除，不受 web tsconfig `include: ["src"]` 限制，也不把 vis-server 运行时拉进 web（这正是当初复制副本的顾虑，现已验证不成立）。web tsconfig 与 server 一样 `extends` 根 tsconfig 即可获得一致的模块解析。
  - **B**：为 `apps/vis/shared/` 加 `package.json` 做成薄 workspace 包（`@byfriends/vis-shared`），web 与 server 都依赖它。隔离更彻底但引入新包开销。
- **工作量**：低（方案 A 仅删副本 + 改 import 路径）；中（方案 B 需加包 + 改两处依赖）。

#### M5：ADR-0006 文档修订

- **问题**：ADR-0006:30 把 `SSHKaos` 写成已有 adapter、ADR-0006:32 把 `packages/telemetry` 写成一层。实际只有 `LocalKaos`，无 telemetry 包。
- **方案**：`SSHKaos` 标"规划中（未实现）"；`packages/telemetry` 标"已移除"或删除该行。
- **工作量**：低（纯文档）。

#### M3：PRD 状态对齐

- **问题**：PRD-0016/0018/0019 仍标 `Sliced` 但功能已在树内；PRD-0008 标题 `[DONE]` 但 Status 字段是 `Approved`，且 H1 行数目标未达成（见 PRD-0008 "实现后验收记录"）。
- **方案**：0016/0018/0019 标 `Done` 或 `Done（残留债）`；PRD-0008 Status 改为 `Done（H1 行数缺口已记录）`。
- **工作量**：低（纯文档）。

---

### 档 2 · 顺势做（绑到下次触碰该模块时，不单独排期）

这些项有价值，但单独排期的性价比低。绑到下次因别的原因改动同一模块时顺手做。

#### H3：provider helper 局部抽取

- **前提**：`provider-common.ts`（139 行）+ `openai-common.ts`（292 行）已抽走了大部分共享逻辑。H4（PRD-0008）达成的是"不再复制样板"，不是"adapter 变小"。
- **只抽这一项**：`deriveCacheKeyFromPromptPlan` 在 `openai-responses.ts:76` 和 `openai-completions.ts:132` **几乎逐行相同**（SHA256 of global-scope blocks），约 15 行 × 2。
- **关键差异（grill 2026-07-10 核实）**：不是简单的"空 plan 返回值不同"——两处在空 plan 下的**缓存行为实际不同**。两个调用处都用 `if (cacheKey)` 守卫：responses 空 plan → `undefined`（守卫不通过，**不发** `prompt_cache_key`）；completions 空 plan → 空 SHA256 字符串 `e3b0c44...`（守卫通过，**会发** dummy key）。**抽 helper 时必须显式保留这个行为差异**（如 `deriveCacheKey(plan, { emptyPlanBehavior: 'undefined' | 'empty-hash' })`），否则会静默改变 OpenAI completions 的缓存行为。
- **明确不抽**：
  - StreamedMessage 流循环骨架——4 家全有但事件 switch 协议特定，只能抽"壳"不能抽"肉"，收益有限。
  - `convertXxxError` 的 SDK-class 解包——anthropic 与 openai 结构同构但 SDK 继承链不同（OpenAI v6 的 `APIConnectionTimeoutError extends APIConnectionError`），泛型工厂的复杂度可能抵消收益。
- **触发时机**：下次改某个 adapter 时顺手。

#### M1：GoalDriver 外移

- **位置**：`packages/agent-core/src/agent/turn/index.ts`（1055 行）
- **真实情况**：`restoreRecord` **仅 24 行**（不是报告说的 209 行——报告把模块级 `mapLoopEvent` 101 行 + error helper ~130 行错算进去了）。真正值得外移的是 `driveGoal`（80 行）+ `settleFirstUserTurnCompletion` + `addCurrentTurnTokenUsage`。
- **方案**：外移到 `agent/goal/driver.ts`，构造注入 `{ prompt, waitForCurrentTurn, usage, goal, addCurrentTurnTokenUsage }`，TurnFlow 在 `turnWorker` 末尾调 `driver.maybeDrive()`。`goalDriverActive` 重入守卫标志随之外移。
- **风险**：低——**测试保护最好**（`goal/driver.test.ts` 521 行 / 11 个 it，全覆盖 driveGoal 边界行为）。
- **触发时机**：下次碰 turn/goal 修 bug 时顺手。**不为 restoreRecord 单独动**。

#### M6：GrepTool 拆 rg-runner

- **位置**：`packages/agent-core/src/tools/builtin/file/grep.ts`（954 行）
- **方案**：`runRipgrepOnce`（129 行）+ EAGAIN 重试 + `readStreamWithCap` + kill/timeout（合计 ~165 行）拆到 `rg-runner.ts`，与 `rg-locator.ts` 并列。`ParsedGrepLine` 类型是唯一耦合点。
- **诚实定位**：**仅降低单文件复杂度，无复用收益**——grep 是唯一使用 ripgrep 的 builtin tool（`glob.ts` 走 `kaos.glob`）。抽取动机是"单文件 954 行的可读性"，不是"多消费者复用"。
- **触发时机**：下次改 grep 时顺手。

---

### 档 3 · 谨慎做（需排期 + 先补测试）

#### H2：BackgroundProcessManager 拆分

- **位置**：`packages/agent-core/src/tools/background/manager.ts`（1242 行，38 方法）
- **真实职责**：确认 7 项职责全部混在一个类——进程注册、agent/promise 任务、输出缓冲/磁盘、stop/wait、reconcile、持久化、生命周期订阅。`TaskCommon` 接口每条 entry 同时携带 `outputChunks`（缓冲）、`outputWriteQueue`（磁盘）、`persistWriteQueue`（持久化）、`waiters`（订阅）、`lifecyclePromise`（生命周期），是典型的状态混合体。
- **为什么谨慎**：
  1. **`finalizeTerminal`（manager.ts:1184-1207）是状态机汇合点**——stop / settleProcessExit / registerAgentTask 三条路径都调它，内部顺序写死：设 status → `persistLive` → `fireTerminalCallbacks` → `resolveWaiters`。拆分时必须保持这个顺序。
  2. **内部私有方法无单元测试保护**——现有测试（`background-manager.test.ts` 618 行等）几乎全走子类 `BackgroundManager` 黑盒，没有直接测 `appendOutput` ring buffer 丢弃语义、`persistLive` 队列、`finalizeTerminal` 幂等。
  3. **去重契约跨类**——`entry.terminalFired` 幂等标志在 `fireTerminalCallbacks` 检查，但 reconcile 的 lost ghost 走 `fireTerminalSubscribers` 跳过该守卫，去重依赖 `NotificationManager.dedupe_key`（注释 manager.ts:326-331）。
- **执行方式**：
  1. **先拆 OutputStore**——边界最清晰：`appendOutput` + 8 个 `getOutput*`/`readOutput` 方法 + `MAX_OUTPUT_BYTES` + `outputWriteQueue`。`getOutputSnapshot` 内联了"优先磁盘回退内存"决策，需保留在协调层或一并外移。
  2. **拆前必须先补 OutputStore 边界行为测试**（ring buffer 丢弃、磁盘回退时机、abort 语义）。
  3. 后续再拆 `TaskEntryRegistry`（注册 + slot 管理），但 `register`/`registerAgentTask` 直接调 `appendOutput` + `persistLive` + `fireLifecycle`，需注入依赖。
  4. **不拆 `finalizeTerminal`**——它是状态机汇合点，拆了反而更难理解。
- **排期**：建议与下一次 background 功能同排期，不单独立项。

---

### 档 4 · 已偿还 / 不单列

- **btw 抽出** → 已完成（`BtwController` 259 行，是 ADR-0017 DI 模式的参考范例）。
- **AGENTS.md Size Budget** → 已存在（`apps/cli/AGENTS.md:66-86`），仅需校准基准 + 强化约束（见本路线图交付）。
- **DialogManager / TurnEventHandler / flows / actions** → ADR-0017 已落地的产物，不在本路线图范围。

---

### 待确认项（不纳入排期，记录在此）

- **M4：Bun compile 后残留 Node SEA 脚本** — `apps/cli/scripts/native/package.mjs` 用 `node` 执行（SEA 路径），而官方路径是 `scripts/compile/build.mjs` 用 `bun`（ADR-0028）。`package.json` 里两个管线并存（`build:native:compile` 用 bun，`package:native` 用 node）。**需与发布负责人确认 CI/发布影响后再删 SEA 路径**；共用的打包 helper 届时挪到 `compile/` 或 `release/`。不纳入本路线图排期。
- **M7：agent-core 中的 host-local `node:fs`** — `tools/background/persist.ts`、`tools/support/rg-locator.ts` 直接用 `node:fs`。ADR-0006 约定"可能远程的操作应走 Kaos"。**仅在实际排期 SSHKaos 时迁移**，现在只需在相关文件标注"按设计绑定 host"。

---

## C. 结构性约束条款（ByfTui 根文件治理）

本节是 `apps/cli/AGENTS.md` "ByfTui Size Budget" 章节的设计依据。用户选择**结构性约束**而非机械行数上限。

### 核心原则

ByfTui 是组合根，不是功能堆放场。约束的落点不是"文件不得超过 N 行"，而是：

> **新增 TUI 功能不得以新的 private method 形式落在 `byf-tui.ts`。必须走已抽出的 controller/registry 模式。例外仅限"允许留在根"的诚实清单。**

### 约束规则

一个 TUI 功能应当落在以下位置之一，而不是 `byf-tui.ts` 的新 private 方法：

| 功能类型 | 落点 | 参考范例 |
|---|---|---|
| 有状态交互流（overlay、多步对话框、side query） | 独立 Controller/Manager，构造注入 `TUIState` + 窄 host 接口，**不持有 `ByfTui` 引用** | `BtwController`（259 行）、`DialogManager`（256 行） |
| 无 UI 状态依赖的纯逻辑 | `actions/` 或 `utils/` | `actions/goal.ts`、`actions/transcript-renderer.ts` |
| 事件处理 | `events/`（每个 concern 一个模块） | `events/turn-event-handler.ts` |
| slash 命令解析/文法 | `commands/` | `commands/registry.ts`、`commands/resolve.ts` |

### 允许留在根的诚实清单

以下逻辑**有理由**留在 `byf-tui.ts`，抽出会制造寄生类（违反 ADR-0017 "无透传模块"）：

- `setupEditorHandlers`（143 行）—— Ctrl-C/Ctrl-D/Ctrl-S 状态机，读写 `pendingExit`/`cancelCurrentStream`，是编辑器组件与 ByfTui 生命周期的耦合面。
- 流式渲染 `*Callbacks()` 装配——行为适配器（绑定 ByfTui 方法 + 内联逻辑如 `notifyTurnComplete`），有真实封装价值。
- 会话生命周期（`start`/`init`/`stop`）、布局/`buildLayout`、输入分发、send/queue 逻辑。
- 3–5 行的简单 slash 命令（直接委托到已存在 controller 或一行转发）。

### Enforcement

- 当一个 slash command 的 handler 超过约 20 行或持有跨调用状态，**先**抽成独立模块，**再**注册。
- 触碰 `byf-tui.ts` 的 PR 应在描述中说明净行数影响。
- **slash handler 注册表化（H1-a）是本约束的第一个落地实例。**

---

## D. 健康之处（不做）

以下边界已健康，明确列出以防"为修而修"：

1. **CLI → SDK 分层** — `apps/cli` 不直引 `@byfriends/agent-core`；SDK RPC 接缝稳固（ADR-0006）。
2. **TaskEntry 判别联合** — `kind: 'process' | 'promise'`，生产代码无 `as unknown as KaosProcess`（ADR-0014 / PRD-0008 H3）。
3. **goal 子系统** — `GoalMode` 纯状态机 + records + ephemeral 注入 + driver 边界，与 ADR-0022~0027 一致；`agent/goal/` 模块较深。
4. **usage breakdown** — 在 `getUsage` 上估算，不塞进 `UsageRecorder`；边界清晰。
5. **Bun 工具链** — `engines` / `packageManager` / CI 一致（ADR-0028）。
6. **MCP SSE** — 工厂 + `client-sse.ts` 贴合既有传输模式。

---

## E. 执行顺序建议

档 1（grill 2026-07-10 确认）：**文档优先 → 代码**，各项独立 PR，无阻塞依赖。

| 顺序 | 项 | 类型 | 工作量 |
|---|---|---|---|
| 1 | M3 PRD 状态对齐 | 纯文档 | 低 |
| 2 | M5 ADR-0006 修订 | 纯文档 | 低 |
| 3 | M2 vis DTO 单一来源 | 小重构 | 低–中 |
| 4a | H1-a PR1：SlashCommandHost 接口 + 注册机制 + Map 分发（handler 暂留 ByfTui） | 结构性重构 | 中 |
| 4b | H1-a PR2：按组迁移 handler 到 `commands/handlers/<group>.ts` | 结构性重构 | 中–高 |
| — | H3 / M1 / M6 | 顺势做 | 绑下次触碰（不在本批 /story 范围） |
| — | H2 BackgroundManager | 谨慎做 | 需排期 + 先补测试（不在本批 /story 范围）|

档 1 的 4 项可各自独立 PR，互不依赖。档 2 的项不单独排期。档 3 的 H2 需与下一次 background 功能同排期。

---

## 变更记录

| 日期 | 事件 |
|---|---|
| 2026-07-10 | 初版。基于 `improve-architecture` 扫描报告，校准 6 处偏差，建立 4 档优先级路线 + 结构性约束条款。 |
| 2026-07-10 | Grilled。确定 /story 拆分范围（仅档 1）；档 1 执行序（文档优先→代码）；H1-a 方案定为分组 command-module + 统一 SlashCommandHost（窄 host + 委托）+ 两步迁移（基建先行）。代码核实：M2 vis shared 无 package.json 且 web tsconfig 无 paths；H3 `deriveCacheKeyFromPromptPlan` 空 plan 行为差异会改变缓存语义，抽 helper 须显式保留。 |
| 2026-07-10 | Sliced。档 1 拆成 4 个 issue（M3 已完成不拆）：#225（M5 ADR-0006）、#226（M2 vis DTO）、#227（H1-a PR1 基建）、#228（H1-a PR2 迁移，blocked-by #227）。归入 PRD-0021。 |
