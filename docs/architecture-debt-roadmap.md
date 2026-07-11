# 架构债路线图

> **Created**: 2026-07-10
> **Source**: 基于 2026-07-10 `improve-architecture` 扫描报告，经代码事实校准后的复查结论。
> **Last scan**: 2026-07-11（档 1 落地后复查）
> **状态**: 活跃文档，随每轮架构复查更新。

本路线图是跨 PRD 的架构优化协调文档，不取代任何单项 PRD 的验收标准。它的作用是：

1. 记录扫描报告与代码事实之间的**偏差校准**，避免后续工作建立在错误前提上。
2. 给出按**优先级 + 风险**排序的执行路线，区分"立即做""顺势做""谨慎做""不做"。
3. 沉淀 `apps/cli/AGENTS.md` 中 **ByfTui 结构性约束**的设计依据。

---

## A. 扫描校准摘要

2026-07-10 的扫描报告整体质量高（正确识别了 ByfTui 持续回涨、BackgroundManager 多职责、provider 共享层薄等真问题），但其中 **6 处数据/结论与代码事实存在偏差**。任何基于原报告数字的工作都会被误导，路线图必须以校准后的事实为基准。

| #   | 扫描报告说法                             | 实测事实（`wc -l` / 代码核查）                                                              | 对后续工作的影响                             |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | `byf-tui.ts` 4380 行、H1 未完成          | **4178 行**；且 `apps/cli/AGENTS.md` 自身 baseline（~4380）也偏高                           | 治理基准需校准；趋势仍上升但比报告描述的平缓 |
| 2   | 建议抽出 `BtwController`                 | **btw 已 100% 抽出**为 `BtwController`（259 行），根文件仅 9 处协调调用                     | 该建议**已完成**，从路线图删除               |
| 3   | `restoreRecord ~209 行`                  | **实际 24 行**（报告把模块级 `mapLoopEvent` + error helper 错算进去了）                     | M1 拆分价值被高估，降级到"顺势做"            |
| 4   | BaseChatProvider 之后 adapter 仍各写各的 | **已有** `provider-common.ts`（139 行）+ `openai-common.ts`（292 行）两层共享纯函数         | H3 比报告暗示的成熟，只剩局部重复            |
| 5   | M6 rg-runner 有复用价值                  | grep 是**唯一**用 ripgrep 的 builtin tool（glob 走 `kaos.glob`）                            | M6 降级为"纯降单文件复杂度"，无复用收益      |
| 6   | AGENTS.md 缺行数预算                     | **已有成熟 Size Budget 章节**（`apps/cli/AGENTS.md:66-86`），含 net-zero 规则 + enforcement | 结构性约束已有雏形，需校准 + 强化而非新建    |

**复查结论（2026-07-10）**：0 阻塞项维持。3 个 High 中，H1（ByfTui）是真实且最活跃的债；H2（BackgroundManager）真实但风险高、需先补测试；H3（provider）大半已偿还，只剩局部。7 个 Medium 中多数已被处理或被高估。

**复查结论（2026-07-11）**：档 1 全部落地（PRD-0021 Done）。0 阻塞。持续 High：H1 ByfTui（**3819 行**，H1-a 后下降约 9%，结构性约束生效）、H2 BackgroundManager（1242 行，未动）。H3 仍是局部 `deriveCacheKeyFromPromptPlan` 双源。新增 Medium：文档卫生（PRD Status 漂移 + 路线图正文滞后）、M8 `tool-call.ts`、M9 `core-impl` 监控。M4 校准为"脚本仍用 `node` 调用打包 helper"，不是残留 SEA 管线。

---

## B. 优先级路线图

### 档 1 · 已完成（PRD-0021，2026-07-10/11）

| 项 | 交付 | 验证 |
| --- | --- | --- |
| M3 PRD 状态对齐 | 0016/0018/0019/0008 已对齐 | 标题与 Status 一致 |
| M5 ADR-0006 修订 | SSHKaos 标规划中；telemetry 层删除 | `docs/adr/0006` 与 CONTEXT 一致 |
| M2 vis DTO 单一来源 | `@byfriends/vis-shared` 包；`shared-types.ts` 已删 | web/server 同 import |
| H1-a slash 注册表化 | `commands/handlers/*` + 窄 `SlashCommandHost` + Map 分发 | `handleBuiltInSlashCommand` 无 switch；byf-tui **3819** 行 |

历史方案细节见 git 历史 / PRD-0021；正文不再展开已交付设计。

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

### 档 2 续 · 2026-07-11 新增观察（顺势 / 文档，不单独排期）

#### M8：`ToolCallComponent` 多职责

- **位置**：`apps/cli/src/tui/components/messages/tool-call.ts`（**1062 行**）
- **信号**：God-ish component——header/progress/subagent live view + Write/Edit/Bash/TodoList/AskUserQuestion 分支仍内联；已有 `tool-renderers/` registry，但 call-preview 与部分 result 仍堆在组件内。
- **约束**：`apps/cli/AGENTS.md` 已写"New tool-result display: prefer extending tool-renderers registry；do not stack branches inside ToolCallComponent"。
- **方案**：下次改某工具展示时，把该工具的 preview/result 分支沉到 `tool-renderers/`，不整文件大拆。
- **工作量**：低–中（单工具迁移）；高（一次性全拆，不推荐）。

#### M9：`ByfCore` / `core-impl.ts` 监控

- **位置**：`packages/agent-core/src/rpc/core-impl.ts`（**801 行**，4 周 14 次改动）
- **信号**：RPC 门面方法集中，高 churn，但多为薄转发，未到拆分阈值。
- **方案**：**只监控**。若单文件继续涨过 ~1000 行或出现非转发逻辑，再按域（session lifecycle / agent ops / config）分组。

#### M10：PRD / 治理文档卫生

- **问题**：
  - PRD-0002/0003 标题 `[DONE]` 但 `Status: Sliced`；PRD-0017 `Status: Grilled` 但 `byf vis` 已实现；PRD-0020 `Implemented` 与其它 Done 不一致。
  - 本路线图档 1 正文在 2026-07-11 复查前仍写"立即做"口吻（已在本节修正）。
- **方案**：批量 Status 对齐；不引入新 PRD。
- **工作量**：低。

### 待确认项（不纳入排期，记录在此）

- **M4（校准 2026-07-11）：native 脚本仍用 `node` 入口，非残留 SEA** — `scripts/compile/build.mjs` 是官方 `bun build --compile` 路径；`scripts/native/package.mjs` 只是 zip/checksum 打包 helper（`yazl`），**不是** Node SEA 管线（无 `sea-config`/`postject`）。`package.json` 里 `package:native` / `produce:native:manifest` 等仍写 `node scripts/native/...`。**可选清理**：把这些脚本 shebang/`package.json` 入口改为 `bun`，与 ADR-0028 一致。**需与发布负责人确认 CI 影响**。不纳入排期。
- **M7：agent-core 中的 host-local `node:fs`** — `tools/background/persist.ts`、`tools/support/rg-locator.ts` 等直接用 `node:fs`。ADR-0006 约定"可能远程的操作应走 Kaos"。**仅在实际排期 SSHKaos 时迁移**，现在只需在相关文件标注"按设计绑定 host"。

---

## C. 结构性约束条款（ByfTui 根文件治理）

本节是 `apps/cli/AGENTS.md` "ByfTui Size Budget" 章节的设计依据。用户选择**结构性约束**而非机械行数上限。

### 核心原则

ByfTui 是组合根，不是功能堆放场。约束的落点不是"文件不得超过 N 行"，而是：

> **新增 TUI 功能不得以新的 private method 形式落在 `byf-tui.ts`。必须走已抽出的 controller/registry 模式。例外仅限"允许留在根"的诚实清单。**

### 约束规则

一个 TUI 功能应当落在以下位置之一，而不是 `byf-tui.ts` 的新 private 方法：

| 功能类型                                        | 落点                                                                                  | 参考范例                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 有状态交互流（overlay、多步对话框、side query） | 独立 Controller/Manager，构造注入 `TUIState` + 窄 host 接口，**不持有 `ByfTui` 引用** | `BtwController`（259 行）、`DialogManager`（256 行） |
| 无 UI 状态依赖的纯逻辑                          | `actions/` 或 `utils/`                                                                | `actions/goal.ts`、`actions/transcript-renderer.ts`  |
| 事件处理                                        | `events/`（每个 concern 一个模块）                                                    | `events/turn-event-handler.ts`                       |
| slash 命令解析/文法                             | `commands/`                                                                           | `commands/registry.ts`、`commands/resolve.ts`        |

### 允许留在根的诚实清单

以下逻辑**有理由**留在 `byf-tui.ts`，抽出会制造寄生类（违反 ADR-0017 "无透传模块"）：

- `setupEditorHandlers`（143 行）—— Ctrl-C/Ctrl-D/Ctrl-S 状态机，读写 `pendingExit`/`cancelCurrentStream`，是编辑器组件与 ByfTui 生命周期的耦合面。
- 流式渲染 `*Callbacks()` 装配——行为适配器（绑定 ByfTui 方法 + 内联逻辑如 `notifyTurnComplete`），有真实封装价值。
- 会话生命周期（`start`/`init`/`stop`）、布局/`buildLayout`、输入分发、send/queue 逻辑。
- 3–5 行的简单 slash 命令（直接委托到已存在 controller 或一行转发）。

### Enforcement

- 当一个 slash command 的 handler 超过约 20 行或持有跨调用状态，**先**抽成独立模块，**再**注册。
- 触碰 `byf-tui.ts` 的 PR 应在描述中说明净行数影响。
- **slash handler 注册表化（H1-a）是本约束的第一个落地实例（PRD-0021 Done）。**

---

## D. 健康之处（不做）

以下边界已健康，明确列出以防"为修而修"：

1. **CLI → SDK 分层** — `apps/cli` 不直引 `@byfriends/agent-core`；SDK RPC 接缝稳固（ADR-0006）。
2. **TaskEntry 判别联合** — `kind: 'process' | 'promise'`，生产代码无 `as unknown as KaosProcess`（ADR-0014 / PRD-0008 H3）。
3. **goal 子系统** — `GoalMode` 纯状态机 + records + ephemeral 注入 + driver 边界，与 ADR-0022~0027 一致；`agent/goal/` 模块较深（`driveGoal` 外移是顺势 M1，非健康缺陷）。
4. **usage breakdown** — 在 `getUsage` 上估算，不塞进 `UsageRecorder`；边界清晰。
5. **Bun 工具链** — `engines` / `packageManager` / CI 一致（ADR-0028）；compile 路径为 `bun build --compile`。
6. **MCP SSE** — 工厂 + `client-sse.ts` 贴合既有传输模式。
7. **vis DTO** — `@byfriends/vis-shared` 单一来源（PRD-0021 M2）。
8. **slash 分发** — Map + command-module + 窄 host（PRD-0021 H1-a）。

---

## E. 执行顺序建议

| 顺序 | 项 | 类型 | 状态 |
| ---- | --- | --- | --- |
| — | 档 1（M3/M5/M2/H1-a） | PRD-0021 | **Done** |
| 可选 | M10 PRD Status 批量对齐 | 纯文档 | 低，可随时做 |
| 顺势 | H3 deriveCacheKey / M1 GoalDriver / M6 rg-runner / M8 tool-renderer 迁移 | 绑触碰 | 不单独排期 |
| 谨慎 | H2 BackgroundManager 拆 OutputStore | 需先补测试 | 绑 background 功能 |
| 待确认 | M4 node→bun 脚本入口 / M7 host-local fs | 外部确认 | 不排期 |

---

## 变更记录

| 日期       | 事件                                                                                                                                                                                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-10 | 初版。基于 `improve-architecture` 扫描报告，校准 6 处偏差，建立 4 档优先级路线 + 结构性约束条款。                                                                                                                                                                                                                                   |
| 2026-07-10 | Grilled。确定 /story 拆分范围（仅档 1）；档 1 执行序（文档优先→代码）；H1-a 方案定为分组 command-module + 统一 SlashCommandHost（窄 host + 委托）+ 两步迁移（基建先行）。代码核实：M2 vis shared 无 package.json 且 web tsconfig 无 paths；H3 `deriveCacheKeyFromPromptPlan` 空 plan 行为差异会改变缓存语义，抽 helper 须显式保留。 |
| 2026-07-10 | Sliced。档 1 拆成 4 个 issue（M3 已完成不拆）：#225（M5 ADR-0006）、#226（M2 vis DTO）、#227（H1-a PR1 基建）、#228（H1-a PR2 迁移，blocked-by #227）。归入 PRD-0021。                                                                                                                                                              |
| 2026-07-11 | `improve-architecture` 复查（档 1 全部落地后）。**0 阻塞**；持续 High：H1 ByfTui **3819** 行（4178→3819，约 −9%）、H2 BackgroundManager 1242 行未动。H3 `deriveCacheKeyFromPromptPlan` 双源仍在（空 plan 行为差异依旧）。**新增 Medium**：M8 `tool-call.ts` 1062 行、M9 `core-impl` 801 行监控、M10 PRD/路线图文档卫生。**M4 校准**：`native/package.mjs` 是 zip 打包 helper，非 SEA。ADR 抽样合规（0006 分层 / 0014 TaskEntry / 0017 DI / 0022 ephemeral / 0028 Bun）。同步：路线图档 1 标 Done；`apps/cli/AGENTS.md` baseline→3819、H1-a 改为已交付措辞。|
