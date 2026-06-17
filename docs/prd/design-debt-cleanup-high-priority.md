# PRD: 设计债清理 — 三个 High 项

**Status**: Approved
**Created**: 2026-06-17
**Source**: `improve-architecture` 扫描报告（11 个发现中的 H1/H3/H4）

## Child Issues

* #132 — `refactor(kosong): add BaseChatProvider + BaseStreamedMessage + provider-common normalization` (AFK)
* #133 — `refactor(agent-core): TaskEntry discriminated union, eliminate as-unknown-as-KaosProcess` (AFK)
* #134 — `refactor(cli): remove byf-tui event forwarding shims, route directly to handlers` (AFK)
* #135 — `fix(cli): use canonical formatTokenCount in footer` (AFK)
* #136 — `docs: fix CONTEXT.md stale PlanMode reference` (AFK)
* #137 — `refactor(kosong): migrate openai-completions + anthropic to BaseChatProvider` (AFK, blocked by #132)
* #138 — `refactor(kosong): migrate openai-responses + google-genai to BaseChatProvider` (AFK, blocked by #137)
* #139 — `refactor(cli): extract DialogManager for picker/show* methods` (AFK, blocked by #134)

## 问题陈述

### 背景

`improve-architecture` 周期扫描发现了 11 个设计债信号（0 阻塞 / 4 高 / 7 中）。本 PRD 覆盖其中三个 High 项，它们分属三个不同的层，各自独立可交付：

| ID | 层 | 位置 | 核心问题 |
|---|---|---|---|
| H1 | `apps/cli`（TUI） | `tui/byf-tui.ts` | 4154 行上帝对象，14 职责，38 次/4 周改动热点 |
| H3 | `packages/agent-core` | `tools/background/manager.ts` | 1210 行上帝对象，两套执行模型用 `as unknown as KaosProcess` 硬接 |
| H4 | `packages/kosong` | `providers/*.ts` | 4 个 provider 适配器，14 处重复，共享层只服务 2/4 |

H2/M3/M6/M7 等低工作量项**不走本 PRD**，直接在实现阶段顺手修掉。

### 为什么是这三项

- **H1** 是全仓最高频改动文件，每次 UI 功能都碰撞在这里，合并冲突和 blame 噪声最严重。
- **H3** 含 `as unknown as KaosProcess` 类型逃逸 —— 代码里唯一的"骗过类型系统"的点，任何依赖进程字段的代码在 agent 任务上静默失败且 TS 查不出。
- **H4** 是 ADR 0011"新增 provider 只需新 adapter"目标的实际阻碍：每加一个 provider 就复制粘贴 14 处样板。

## 目标

三个项各自独立，不构成单一交付。每个项的"完成"定义见各自的验收标准。

### H1：`byf-tui.ts` 瘦身（诚实版，分两阶段）

- **第一阶段（零风险）**：删除 ~26 个私有转发壳（`handleTurnBegin` → `turnEventHandler.handleTurnBegin` 等），`handleEvent` switch 直接调用已抽取的 handler 类。两个长 switch（`handleEvent` + `handleBuiltInSlashCommand` 合计 54 case）改为注册表查找。
- **第二阶段（渐进抽取）**：抽取 `DialogManager`（10+ 个纯转发 picker），评估其他可外移的 handler。
- **诚实目标**：从 4154 行降到 ~2800 行。**不追求 1500 行** —— `setupEditorHandlers`（Ctrl-C 状态机）、流式渲染 hook 等带状态的逻辑会留在 `ByfTui` 内，强行抽出会制造寄生类。

### H3：`BackgroundProcessManager` 判别联合

- 把 `ManagedProcess` 拆成两个变体：`ProcessTaskEntry`（真进程，持有 `proc: KaosProcess`）和 `PromiseTaskEntry`（agent/promise 任务，持有 `completion` + `abort`），共享 `TaskCommon` 公共字段，用 `kind` 字段区分。
- **消除 `as unknown as KaosProcess`**：agent 任务根本不出现 `proc` 字段，类型系统强制 `entry.proc` 只在 `kind === 'process'` 时可访问。
- **对外接口不变**：`register`、`registerAgentTask`、`stop`、`list`、`onTerminal`、持久化/恢复签名保持不变（调用方 `agent.ts:242` 无感）。

### H4：kosong provider 抽象基类

- 引入 `abstract class BaseChatProvider implements ChatProvider`，把与 SDK 无关的样板上移：`_clone()`、`withGenerationKwargs`、accessor（`modelName`/`modelParameters`/`getCapability`）、`StreamedMessage` 骨架、`_createClient` 样板（`createRawClient()` 留给子类）。
- 把结构相同、字段名不同的归一化逻辑做成**模板方法或配置表**：`normalizeFinishReason`、`_extractUsage`（`input - cached` 公式）、`convertError`（含 `NETWORK_RE`/`TIMEOUT_RE`）。
- **保留在子类**：`generate()`、消息映射（`convertMessage`）、流式解析 —— 这些是协议特化，不该共享。
- **不碰** `createProvider` factory 和 `ProviderConfig` 联合类型。

## 非目标 (Out of Scope)

- H2（footer `formatTokenCount` 重复）、M3（`formatBytes` 等）、M6（`tryAttach` 孪生）、M7（CONTEXT.md PlanMode）—— 低工作量，实现阶段顺手修，不立项。
- M1（`Agent.rpcMethods` 内联分发表）、M2（`TurnFlow` 混 telemetry）、M5（`ByfCore` 门面长肉）—— Medium 项，本 PRD 不覆盖，后续扫描再评估。
- H1 第二阶段不抽 `setupEditorHandlers`（Ctrl-C 状态机带状态，抽出会变寄生类）。
- H3 不拆成两个独立管理器（方案 B，改动面过大，持久化/恢复/调用方都要适配两套）。
- H4 不统一消息映射/流式解析（协议特化，强行共享会泄漏）。
- 不改任何对外公开 API（SDK、CLI 命令、provider 配置格式）。
- 不改 wire records 磁盘格式（H3 的 `PersistedTask` 是独立类型，改 entry 内部结构不碰它）。

## 技术方案

### H1：`byf-tui.ts` 瘦身

#### 第一阶段：删转发壳 + 注册表化（零风险）

**现状**（`byf-tui.ts:2152`）：
```typescript
private handleTurnBegin(event: TurnStartedEvent): void {
  this.turnEventHandler.handleTurnBegin(event);  // 纯转发
}
// ... 还有 25 个同构的转发壳
```

`handleEvent` switch 内联调用这些壳（`byf-tui.ts:2059`）：
```typescript
switch (event.type) {
  case 'turn.started': this.handleTurnBegin(event); break;  // 经由转发壳
  // ... 54 个 case（两 switch 合计）
}
```

**变更**：
1. 删除 ~26 个私有转发壳，`handleEvent` switch 直接调用 `this.turnEventHandler.handleTurnBegin(event)` / `this.sessionMetaHandler.handleStatusUpdate(event)` / `this.subagentEventHandler.routeSubagentEvent(event)`。
2. `handleEvent` 改为事件类型 → handler 方法的注册表查找（或保留 switch 但 case 体直接转发，二者择优，实现时定）。**关键约束**：`routeSubagentEvent`（`:2049`）在 switch 之前短路返回，这个时序要保留。
3. `handleBuiltInSlashCommand`（84 行 switch）已有 `commands/registry.ts`，让 switch 体直接调对应方法（已经是这样），但移除其中重复的转发层。

**已核实的约束**：
- 转发壳只被 `handleEvent` switch 内联调用，**无外部引用**（`rg` 确认），删除零风险。
- 三个 handler 类已存在：`events/turn-event-handler.ts`、`events/session-meta-handler.ts`、`events/subagent-event-handler.ts`。

#### 第二阶段：抽 DialogManager + 评估外移

**抽取 `DialogManager`**（纯转发 picker，~150 行）：
- `showSessionPicker`、`showModelPicker`、`showThemePicker`、`showPermissionPicker`、`showSettingsSelector`、`showHelpPanel` 等 10+ 方法，每个都是 `mountEditorReplacement(new XxxSelector(...))` 的变体。
- `DialogManager` 持有 `TUIState` 引用和 `FullscreenHost` 实现，构造时注入。
- `ByfTui` 保留 `private dialogManager` 字段，picker 调用转发给它。

**不抽取的**（诚实清单，double review 结论）：
- `setupEditorHandlers`（131 行）—— Ctrl-C 退出确认状态机，读写 `pendingExit`、调 `cancelCurrentStream`/`cancelCurrentCompaction`。抽出会变寄生类。
- 流式渲染 hook（`onStreamingTextStart/Update/End`、`onToolCallStart/End` 等）—— 紧耦合 `state.appState` 和 live pane 状态。
- MCP 状态 UI、background-task badge —— 紧耦合事件流和 footer 状态。

### H3：`BackgroundProcessManager` 判别联合

**现状**（`manager.ts:808-818`，agent 任务伪造进程）：
```typescript
proc: {
  stdin: { write: () => false, end: () => {} } as never,
  stdout: { setEncoding: () => {}, on: () => {} } as never,
  pid: 0,
  wait: () => completion.then(() => 0),
  kill: async () => { opts.abort?.(); },
} as unknown as KaosProcess,  // ← 类型逃逸
```

**变更后**：
```typescript
// 公共字段（两类任务共享）
interface TaskCommon {
  taskId: string;
  command: string;
  description: string;
  status: 'running' | 'completed' | 'failed' | 'killed';
  startedAt: number;
  endedAt: number | null;
  exitCode: number | null;
  waiters: Array<...>;
  terminalFired: boolean;
  stopRequested: boolean;
  outputSessionDir: string | undefined;
  lifecyclePromise: Promise<void>;
  persistWriteQueue: Promise<void>;
  outputWriteQueue: Promise<void>;
  // agent 任务标识（沿用现状）
  agentId?: string;
  subagentType?: string;
}

// 真进程任务
interface ProcessTaskEntry extends TaskCommon {
  kind: 'process';
  proc: KaosProcess;
  timeoutMs?: number;
}

// agent / promise 任务
interface PromiseTaskEntry extends TaskCommon {
  kind: 'promise';
  completion: Promise<{ result: string }>;
  abort: () => void;
  timeoutMs?: number;
}

type TaskEntry = ProcessTaskEntry | PromiseTaskEntry;
```

**关于 `outputChunks`**：现状 `outputChunks: string[]`（`manager.ts:112`，已核实），两类任务都已用 string 存储（进程 stdout chunk 和 agent 结果字符串都是 string），**无类型摩擦**。因此 `outputChunks`/`outputSizeBytes` 直接上移到 `TaskCommon` —— 两类任务的输出展示需求一致（持久化、`/tasks` 面板、ring buffer 裁剪）。

**关键改动点**（只在这几处触碰 `proc`，已 `rg` 核实共 6 处）：
1. `register()` —— 构造 `ProcessTaskEntry`（`kind: 'process'`），保持现有 proc 接线。
2. `registerAgentTask()` —— 构造 `PromiseTaskEntry`（`kind: 'promise'`），**不再创建假 `proc`**。deadline race 逻辑（`manager.ts:840-899`）保持不变，只是从 `entry.proc` 换成 `entry.completion`/`entry.abort`。
3. `stop()`（`:673,700,702`）—— 按 `kind` 分支：process 走 SIGTERM→SIGKILL（`entry.proc.kill`），promise 走 `entry.abort()`。
4. `toInfo`/`settleProcessExit`（`:1067,1125,1138`）—— 按 `kind` 组装 `TaskInfo`，`entry.proc.pid` 只在 `kind === 'process'` 时读取；promise 任务的 pid 返回 `null`。
5. `appendOutput`/`flushOutput`/`getOutput`/`readOutput` —— 操作 `TaskCommon.outputChunks`，两类任务共用，无需分支。

**类型重命名**：`ManagedProcess` 类型重命名为 `TaskEntry`（决策 1）。约 20 处引用批量更新（`appendOutput(entry: ManagedProcess, ...)` 等）。诚实反映"它可能是进程也可能是 promise"。

**持久化 + reconcile 路径完全不动**：`persist.ts` 用独立的 `PersistedTask` 类型。**关键事实（grill 核实）**：`reconcile`/`loadFromDisk` 把磁盘任务加载进 `ghosts` map（`BackgroundTaskInfo` 只读快照），running 的标记为 `lost`（`manager.ts:1010-1029`）—— **它根本不重建活动 `TaskEntry`**，因为进程和 promise 都无法从磁盘恢复。因此判别联合**不影响 reconcile 路径**，无需"从前缀判 kind 重建 entry"的逻辑。

### H4：kosong provider 抽象基类

**现状**：4 个 provider 都 `implements ChatProvider`（接口，无基类），`_clone`/`_createClient`/accessor/`StreamedMessage` 骨架各拷贝 4 份。`openai-common.ts` 只服务 2/4 adapter（OpenAI 家族）。

**变更后**：

```typescript
// providers/base-chat-provider.ts (新增)
export abstract class BaseChatProvider implements ChatProvider {
  protected constructor(
    protected readonly _model: string,
    protected _generationKwargs: GenerationKwargs = {},
    protected readonly _apiKey?: string,
    protected readonly _baseUrl?: string,
    protected readonly _defaultHeaders?: Record<string, string>,
    protected _client?: unknown,           // 各 SDK 的 client 类型由子类约束
    protected readonly _clientFactory?: () => unknown,
  ) {}

  // —— 上移的样板 ——
  get modelName(): string { return this._model; }
  get modelParameters(): Record<string, unknown> {
    return { model: this._model, ...this._generationKwargs };
  }
  getCapability(model?: string): ProviderCapability {
    return lookupCapability(this.capabilityKey, model ?? this._model);
  }
  abstract get capabilityKey(): ProviderCapabilityKey;

  withGenerationKwargs(kwargs: GenerationKwargs): this {
    const clone = this._clone();
    clone._generationKwargs = { ...clone._generationKwargs, ...kwargs };
    return clone;
  }

  protected _clone(): this {
    const clone = Object.assign(
      Object.create(Object.getPrototypeOf(this) as object) as this, this,
    );
    clone._generationKwargs = { ...this._generationKwargs };
    return clone;
  }

  protected _createClient(auth: ProviderRequestAuth | undefined): unknown {
    return resolveAuthBackedClient(
      { cachedClient: this._client, clientFactory: this._clientFactory },
      auth,
      (a) => {
        const defaultHeaders = mergeRequestHeaders(this._defaultHeaders, a?.headers);
        return this.createRawClient(a, defaultHeaders);  // 子类实现
      },
    );
  }

  protected abstract createRawClient(
    auth: ResolvedAuth,
    defaultHeaders: Record<string, string> | undefined,
  ): unknown;

  // —— 子类必须实现 ——
  abstract generate(...): StreamedMessage;
  abstract get thinkingEffort(): ThinkingEffort | undefined;
}
```

**`StreamedMessage` 骨架上移**（`providers/streamed-message.ts` 新增）：
```typescript
export abstract class BaseStreamedMessage implements StreamedMessage {
  protected _id: string | undefined;
  protected _usage: TokenUsage | undefined;
  protected _finishReason: FinishReason | undefined;
  protected _rawFinishReason: string | undefined;
  protected _iter: AsyncIterable<StreamedMessagePart>;

  constructor(iter: AsyncIterable<StreamedMessagePart>) {
    this._iter = iter;
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<StreamedMessagePart> {
    yield* this._iter;
  }
  get id() { return this._id; }
  get usage() { return this._usage; }
  get finishReason() { return this._finishReason; }
  get rawFinishReason() { return this._rawFinishReason; }
}
```

**归一化逻辑做成配置驱动**（新建 `provider-common.ts`，决策 2）：
```typescript
// finish reason：结构相同，case 标签不同
function makeFinishReasonNormalizer(
  mapping: Record<string, FinishReason>,
): (raw: string | null) => { finishReason: FinishReason; rawFinishReason: string | undefined } {
  return (raw) => {
    if (!raw) return { finishReason: 'unknown', rawFinishReason: undefined };
    return { finishReason: mapping[raw] ?? 'unknown', rawFinishReason: raw };
  };
}

// usage：input - cached 公式，字段名不同
function extractCacheUsage(
  total: number,
  cached: number,
  output: number,
): TokenUsage {
  return { inputOther: Math.max(0, total - cached), output, inputCacheRead: cached, inputCacheCreation: 0 };
}

// error：共享 NETWORK_RE/TIMEOUT_RE + 分类梯子
// convertOpenAIError 已在 openai-common.ts，提炼成通用 convertProviderError
```

**关于 google-genai 的 regex（grill 修正）**：google 版（`google-genai.ts:637`）不是纯重复——它比 openai-common 版多了 `| fetch failed` 分支，并在 `:655` 额外处理 `error instanceof TypeError && msg.includes('fetch')`（google SDK 用 fetch，TypeError 是它的网络错误形态）。归一化时**必须保留 google 的额外 fetch 处理**，不能简单删除。做法：`convertProviderError` 接受一个可选的 provider 特化钩子（如 `extraNetworkMatchers?: RegExp[]`），google 传入 `[/^fetch failed$/i]` + TypeError 检查。

**各 provider 改造**：
- `anthropic.ts`：`extends BaseChatProvider`，`createRawClient` 返回 `new Anthropic({...})`，保留自己的 `generate`/`convertMessage`/流式解析/cache_control 注入。`StreamedMessage` 继承 `BaseStreamedMessage`。
- `openai-completions.ts` / `openai-responses.ts`：`extends BaseChatProvider`，`createRawClient` 返回 `new OpenAI({...})`。`deriveCacheKeyFromPromptPlan` 可上移到基类或保留在 `provider-common.ts`（两者择一）。
- `google-genai.ts`：`extends BaseChatProvider`，改用共享的 `convertProviderError`（传入 fetch 特化钩子），保留 vertex 分支（`_createClient` 里 `if (this._vertexai)` 那段逻辑进 `createRawClient`）。

**不改动**：
- `provider.ts` 的 `ChatProvider` 接口（`BaseChatProvider implements` 它，接口不变）。
- `providers/index.ts` 的 `createProvider` factory（`new XxxChatProvider(config)` 无感）。
- `ProviderConfig` 联合类型。
- 各 provider 的 `generate()`、消息映射、流式解析逻辑。

## 验收标准

### H1

#### 功能正确性
1. **转发壳删除**：`byf-tui.ts` 中不再有形如 `private handleXxx(event) { this.xxxHandler.handleXxx(event); }` 的单行转发方法（`handleEvent` switch 直接调 handler 类）
2. **事件路由时序**：`routeSubagentEvent` 仍在 switch 之前短路返回（`byf-tui.ts:2049` 的时序保留）
3. **slash command 分发**：`handleBuiltInSlashCommand` 行为不变，所有内置命令（exit/help/version/new/sessions/tasks 等）仍正常工作
4. **DialogManager 抽取**（第二阶段）：10+ 个 picker 方法通过 `dialogManager` 调用，`ByfTui` 不再直接 `new XxxSelector`

#### 不回归
5. **所有现有 TUI 行为不变**：输入、streaming、approval、compaction、subagent chip、footer、所有 picker
6. **`byf-tui.ts` 行数下降**：第一阶段后 < 4050 行（删 ~100 行转发壳）；第二阶段后 < 3000 行（抽 DialogManager 等）
7. **`byf-tui-message-flow.test.ts` 等现有测试全部通过**（这是 byf-tui 的端到端覆盖）

### H3

#### 功能正确性
8. **类型安全**：`manager.ts` 中不再出现 `as unknown as KaosProcess`（`rg` 确认零匹配）
9. **判别联合**：`TaskEntry` 是 `ProcessTaskEntry | PromiseTaskEntry`，访问 `entry.proc` 前必须有 `entry.kind === 'process'` 守卫（TS 编译强制）
10. **对外接口不变**：`register`、`registerAgentTask`、`stop`、`list`、`onTerminal`、`getTask`、`waitForTerminal` 等方法签名不变；调用方 `agent.ts:242` 无需修改
11. **持久化兼容**：`PersistedTask` 磁盘格式不变；旧 session 恢复正常（reconcile 不重建活动 entry，已 grill 核实）

#### 不回归
12. **进程任务行为不变**：SIGTERM→5s→SIGKILL、stdout/stderr 采集、ring buffer、disk offload 全部正常
13. **agent 任务行为不变**：deadline race、abort 回调、`RunCancelled` → killed 映射、结果 appendOutput 全部正常
14. **现有 background 测试全部通过**

### H4

#### 功能正确性
15. **基类引入**：`BaseChatProvider` 和 `BaseStreamedMessage` 存在，4 个 provider 均 `extends BaseChatProvider`
16. **样板消除**：`_clone`、`withGenerationKwargs`、accessor（`modelName`/`modelParameters`/`getCapability`）、`StreamedMessage` 骨架在基类中只有一份实现
17. **归一化集中**：`normalizeFinishReason`、`extractCacheUsage`、`convertProviderError`（含 `NETWORK_RE`/`TIMEOUT_RE`）在共享模块中只有一份；`google-genai.ts:637-638` 的重复 regex 删除
18. **子类只保留特化**：`generate()`、消息映射、流式解析、cache_control/prompt_cache_key 注入留在各 provider

#### 不回归
19. **`createProvider` factory 不变**：`new XxxChatProvider(config)` 调用方式无感
20. **四个 provider 的请求/响应行为完全不变**：消息格式、流式事件、usage 解析、error 归类、cache 行为
21. **kosong 现有测试全部通过**（含各 provider 的单元测试）
22. **cache 可观测性数据不受影响**：`inputCacheRead`/`inputCacheCreation` 解析结果与改造前一致（`cache-observability-cli.md` PRD 依赖的 4 字段模型不变）

### 通用
23. **每个项独立可交付**：H1/H3/H4 互不依赖，可分别 PR
24. **伴随低工作量修复**（非阻塞，实现时顺手）：H2（footer `formatTokenCount` 用 canonical 版）、M7（CONTEXT.md PlanMode → FullCompaction）

## 边界情况

### H3
- **agent 任务也要展示输出**：agent 的结果字符串（`completion.then(r => r.result)`）目前通过 `appendOutput` 写入。**决策（已核实类型）**：`outputChunks: string[]`（`manager.ts:112`），两类任务都已用 string，`outputChunks`/`outputSizeBytes` 上移到 `TaskCommon`，无类型摩擦。
- **恢复路径不受影响（grill 核实）**：`reconcile`/`loadFromDisk` 把磁盘任务加载进 `ghosts` map（`BackgroundTaskInfo` 只读快照），running 的标记为 `lost`——**它不重建活动 `TaskEntry`**，因为进程和 promise 都无法从磁盘恢复。判别联合只影响活动 entry 的构造和处理，reconcile/ghost 路径完全无感。
- **`stop()` 对 promise 任务的语义**：调 `entry.abort()`，状态机走 `stopRequested` → `killed`（沿用现状 `manager.ts:879-881`）。

### H4
- **`_clone` 的 `_files` 清理**：`openai-completions.ts:666` 的 `clone._files = undefined` 是该 provider 特有，基类 `_clone` 不含；子类 override `_clone` 后追加，或在基类提供 `protected _resetCloneState(clone: this): void` 钩子。
- **Anthropic 的 `_usage` 初始化差异**：现状 anthropic 的 `StreamedMessage._usage` 用非空默认对象，其他三家用 `undefined`。基类统一为 `undefined`，anthropic 子类在构造时覆盖。
- **`thinkingEffort` 的 provider 差异**：每个 provider 的 getter 实现不同（映射逻辑不同），保留为 abstract。

### H1
- **switch 改注册表的 `routeSubagentEvent` 短路**：`byf-tui.ts:2049` 在进入 switch 前先 `if (this.routeSubagentEvent(event)) return;`，改注册表后这个短路必须保留（subagent 事件不进通用分发）。
- **`handleEvent` 的 case 数量大（两 switch 合计 54）**：注册表化是机械替换，但要保证每个 case 的 handler 接收的 event 类型正确（TS 穷尽检查）。

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| H1 第一阶段删转发壳破坏事件路由 | 事件处理静默失败 | `byf-tui-message-flow.test.ts` 端到端覆盖；逐个 case 删除并跑测试 |
| H1 第二阶段停在半途比 C 还糟 | 中间态更难读 | 第二阶段单独 PR，明确 DialogManager 为最小可交付；若评估后不值得做，停在第一阶段（已是净改善） |
| H3 判别联合遗漏某个触碰 `proc` 的方法 | 运行时访问 undefined | TS 编译器强制 `kind` 守卫；`rg "entry\.proc\|\.proc\."` 全量审计 |
| H3 `outputChunks` 上移到 TaskCommon 后两类任务语义混淆 | ~~进程输出（Buffer 流）vs agent 输出（结果字符串）混在一起~~ **grill 核实**：现状已是 `string[]`，两类任务无类型摩擦，语义统一为"任务输出文本" |
| H4 基类 `_clone` 的 `Object.create(proto)` 在子类有额外字段时漏拷 | 子类状态丢失 | 各子类覆盖 `_clone` 追加特有字段清理（如 `_files`）；新增 `test` 验证 clone 深拷 |
| H4 归一化配置驱动后 case 标签映射表写错 | finish reason 错判 | 各 provider 现有测试覆盖；保留 `rawFinishReason` 便于排查 |
| 三个项同时进行导致 review 负担 | PR 过大 | 强制三个独立 PR，互不依赖 |

## 关键决策记录

架构级决策（H3/H4）已升级为正式 ADR，此处只留摘要 + 链接。其余决策保留完整论证。

| 决策 | 结论 | 理由 / 链接 |
|---|---|---|
| H3 拆分方式 | **判别联合** | → `docs/adr/0014-task-entry-discriminated-union.md`。对外接口统一、对内区分，消除 `as unknown as KaosProcess`，TS 强制 kind 守卫 |
| H3 类型重命名 | `ManagedProcess` → `TaskEntry` | 诚实反映"它可能是进程也可能是 promise"，~20 处引用批量更新（grill 决策 1） |
| H3 outputChunks 位置 | 上移到 `TaskCommon` | 现状已是 `string[]`（grill 核实），两类任务无类型摩擦 |
| H3 reconcile 路径 | **不动** | grill 核实：reconcile 不重建活动 entry（进程/promise 都无法恢复），判别联合只影响活动 entry 构造 |
| H4 共享方式 | **抽象基类 BaseChatProvider** | → `docs/adr/0015-base-chat-provider.md`。样板（_clone/accessor/StreamedMessage 骨架）与 SDK 无关适合上移；归一化逻辑配置驱动 |
| H4 归一化代码位置 | 新建 `provider-common.ts` | 跨 provider 归一化与 `openai-common.ts`（OpenAI 家族 wire-format）职责分离（grill 决策 2） |
| H4 迁移顺序 | openai-completions + anthropic 先（tracer bullet） | 确立骨架 + 验证跨协议可用，再批量迁 responses/google（grill 决策 6） |
| H4 google fetch 处理 | 保留为特化钩子 | google 的 `fetch failed`/TypeError 处理不是纯重复，`convertProviderError` 接受 `extraNetworkMatchers` 钩子（grill 修正） |
| H4 保留 generate/消息映射在子类 | 不共享 | 协议特化，强行共享会泄漏抽象 |
| H1 ByfTui 处理方式 | **瘦身组合根（诚实版）** | UI 根对象作为聚合点合理，问题是混入非 UI 职责。完全拆解会因状态共享（pendingExit/cancelInFlight 跨职责）制造新耦合。诚实目标 ~2800 行 |
| H1 不抽 setupEditorHandlers | 保留在 ByfTui | Ctrl-C 状态机读写 ByfTui 的 pendingExit/cancelCurrentStream，抽出会变寄生类，违反深模块原则 |
| H1 DialogManager 状态共享 | 注入 `FullscreenHost` 接口 + `TUIState` + `getSession()` 回调 | 只依赖接口，符合现有 `DialogHost` 模式（grill 决策 3） |
| ADR 范围 | H3+H4 各立 ADR，H1 记 PRD | H3/H4 满足三条件（难逆转/无背景会困惑/真实权衡），H1 偏渐进重构（grill 决策 4） |
| PRD vs ADR 边界 | PRD 留摘要 + ADR 链接 | 避免两处长文维护漂移（grill 决策 5） |
| 三项独立 PR | 是 | 互不依赖，分属不同层，独立可交付 |
| 低工作量项不走 PRD | 顺手修 | H2/M3/M6/M7 各 1-3 文件，无需 PRD 规划 |

## 实现计划

三个项各自独立。H4 迁移顺序已按 grill 决策 6 调整（tracer bullet 先行）。

| 阶段 | 任务 | 依赖 |
|---|---|---|
| **H4-1** | 新增 `BaseChatProvider` + `BaseStreamedMessage` + `provider-common.ts`（归一化） | 无 |
| **H4-2** | openai-completions（确立骨架）+ anthropic（跨协议验证）extends 基类 | H4-1 |
| **H4-3** | openai-responses + google-genai extends 基类；google 传入 fetch 特化钩子 | H4-2 |
| **H3-1** | 定义 `TaskEntry` 判别联合 + `TaskCommon`；`ManagedProcess` → `TaskEntry` 重命名 | 无 |
| **H3-2** | `manager.ts` 内部存储改 `Map<string, TaskEntry>`；改造 `register`/`registerAgentTask`/`stop`/`toInfo`/`settleProcessExit`（6 处 proc 触碰点按 kind 分支） | H3-1 |
| **H3-3** | 全量测试（reconcile 路径无需专门验证，已确认不受影响） | H3-2 |
| **H1-1** | 删除 ~26 个转发壳，`handleEvent` switch 直接调 handler | 无 |
| **H1-2** | 抽取 `DialogManager`（注入 FullscreenHost + TUIState + getSession），picker 方法外移 | H1-1 |
| **顺手** | H2 footer formatTokenCount、M7 CONTEXT.md PlanMode | 任意阶段 |

建议 H4 先做（纯加法 + 删重复，风险最低），H3 次之（一个文件内部改造），H1 最后（涉及最多调用点）。

## Domain Terms

本 PRD 未引入新的领域术语。复用 CONTEXT.md 中的既有术语：BackgroundProcessManager、TaskEntry（新，但属于实现术语非领域术语）、BaseChatProvider（同前）。

## Traceability

- **Created by**: `/think` (2026-06-17) — 基于 `improve-architecture` 扫描报告的 H1/H3/H4 三项设计债
- **Grilled by**: `/grill` (2026-06-17) — 修正 3 处代码矛盾（google regex 非纯重复 / outputChunks 实为 string[] / case 数 54 非 76）、推翻 reconcile 重建 entry 的错误假设（消除 H3-2 slice）、敲定 6 个开放决策（类型重命名/共享文件位置/DialogManager 状态共享/ADR 范围/PRD-ADR 边界/H4 迁移顺序）、升级 H3+H4 为正式 ADR
- **Sliced by**: `/story` (2026-06-17) → Child Issues above（8 片：H4 三片 #132/#137/#138、H3 一片 #133、H1 两片 #134/#139、收尾两片 #135/#136）

## Expansion Considerations

### Future Evolution

- **H1 之后**：若 `ByfTui` 仍超 2500 行，评估 M1（`Agent.rpcMethods` 模式）—— 把 `handleEvent` 改成完全的事件总线订阅（handler 自注册），彻底去掉中心 switch。
- **H3 之后**：`BackgroundProcessManager` 若再增第三类任务（如 webhook 任务），判别联合自然扩展加一个变体即可。
- **H4 之后**：新增 provider（如 Mistral、Cohere）只需 extends `BaseChatProvider` + 实现 `generate`/`createRawClient`，样板自动获得。这是 ADR 0011 "新增 provider 只需新 adapter" 目标的真正达成。

### 与既有 PRD 的关系

- **`cache-observability-cli.md`**：H4 的 usage 归一化集中后，该 PRD 依赖的 `inputCacheRead`/`inputCacheCreation` 四字段模型有更可靠的单一来源。
- **`ephemeral-injection-cache-optimization.md`** / **ADR 0011**：H4 让 cache hint 的 provider 适配更一致（归一化逻辑集中）。
- **`approval-fullscreen-viewer.md`**：已 Done，H1 的 DialogManager 抽取不影响它（FileViewerComponent 已独立）。
