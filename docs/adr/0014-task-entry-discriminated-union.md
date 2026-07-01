# ADR 0014: TaskEntry 判别联合

## 状态

已接受

## 背景

`BackgroundProcessManager`（`packages/agent-core/src/tools/background/manager.ts`）通过单一数据结构管理两种根本不同的后台任务：

1. **真正的进程任务**——用户启动的长时间运行 shell 命令（`npm run dev`、`pytest`）。这些是真实的 OS 进程，有 pid、stdin/stdout/stderr 流和基于信号的终止。
2. **Agent（基于 Promise）任务**——由主代理在后台启动的子代理。这些是纯 JS Promoutine：没有 pid、没有流，通过 abort 回调取消。

`ManagedProcess` 结构围绕真实进程形态设计——其 `proc: KaosProcess` 字段需要完整的进程接口（stdin/stdout/stderr/pid/wait/kill）。为了让 agent 任务适配，`registerAgentTask`（`manager.ts:808-818`）制造了一个假进程对象并将其强制转换通过类型系统：

```typescript
proc: {
  stdin: { write: () => false, end: () => {} } as never,
  stdout: { setEncoding: () => {}, on: () => {} } as never,
  pid: 0,
  wait: () => completion.then(() => 0),
  kill: async () => { opts.abort?.(); },
} as unknown as KaosProcess,  // 类型系统逃生口
```

这是 `packages/agent-core/src` 中唯一的 `as unknown` 强制转换。其后果：

- **静默失败风险**：`proc.stdout.on(...)` 和 `proc.pid` 对 agent 任务是死/零值。任何假设 `entry.proc` 为真实的代码在 agent 任务上都会表现异常，而 TypeScript 无法捕获。
- **虚假统一**：`ManagedProcess` 假装是一回事，但 agent 任务没有进程。名称本身（"ManagedProcess"）对于也持有 Promise 的结构具有误导性。
- **职责混淆**：管理器将两种执行模型（OS 进程 vs JS Promise）融合到一个映射、一个状态机、一组字段中。

`improve-architecture` 扫描（2026-06-17）将其标记为高优先级设计债（H3）。

## 决策

用**判别联合**（`TaskEntry`）替换 `ManagedProcess`，共享公共字段但分离两种任务形态。

```typescript
interface TaskCommon {
  taskId: string;
  command: string;
  description: string;
  status: 'running' | 'completed' | 'failed' | 'killed' | 'lost';
  startedAt: number;
  endedAt: number | null;
  exitCode: number | null;
  outputChunks: string[];        // 上移：两种任务都产生文本输出
  outputSizeBytes: number;       // 上移：两种都需要持久化/显示
  waiters: Array<...>;
  terminalFired: boolean;
  stopRequested: boolean;
  outputSessionDir: string | undefined;
  lifecyclePromise: Promise<void>;
  persistWriteQueue: Promise<void>;
  outputWriteQueue: Promise<void>;
  agentId?: string;              // agent 任务标识符
  subagentType?: string;
}

interface ProcessTaskEntry extends TaskCommon {
  kind: 'process';
  proc: KaosProcess;             // 仅对真实进程存在
  timeoutMs?: number;
}

interface PromiseTaskEntry extends TaskCommon {
  kind: 'promise';
  completion: Promise<{ result: string }>;
  abort: () => void;             // agent 任务的取消
  timeoutMs?: number;
}

type TaskEntry = ProcessTaskEntry | PromiseTaskEntry;
```

类型名 `ManagedProcess` 全局重命名为 `TaskEntry`（约 20 处引用点）。

### 为何将 `outputChunks`/`outputSizeBytes` 移至 `TaskCommon`

grill 期间已核实：`outputChunks` 已经是 `string[]`（`manager.ts:112`），而非 `Buffer[]`。真实进程的 stdout 块和 agent 结果字符串都已经是字符串。两种任务都需要输出持久化、`/tasks` 面板显示和环形缓冲区修剪。将这些字段上移零摩擦，统一了"任务输出文本"语义。

### 为何 reconcile 路径不受影响

grill 期间已核实：`reconcile`/`loadFromDisk`（`manager.ts:993-1029`）将持久化的任务加载到 `BackgroundTaskInfo`（只读快照）的 `ghosts` map 中，并将任何非终态的 ghost 标记为 `'lost'`。它**不**重建活跃的 `TaskEntry`——因为一个已死的进程或丢失的 Promise 都无法恢复。因此判别联合只影响活跃 entry 的构造和处理；reconcile/ghost 路径完全不知晓此变更。

## 考虑的替代方案

### A. 两个独立管理器 + 协调器外观

拆分为 `RealProcessManager` + `PromiseTaskManager`，由 `BackgroundCoordinator` 外观统一。

**被拒绝**：外部接口（`register`/`stop`/`list`/`onTerminal`/槽位预留）确实是通用的——统一它是正确的。拆分迫使持久化层（`persist.ts`）、恢复（`reconcile`）、回调订阅、任务 ID 分配和并发槽位计数要么重复，要么在外观层重新聚合。影响范围（调用方、持久化、恢复）远超收益，因为聚合是正确的设计。

### B. 将 `proc` 类型缩小为 `TaskHandle` 联合

保留单一 `ManagedProcess` 结构，但将 `proc: KaosProcess` 改为 `proc: KaosProcess | PromiseTaskHandle`，其中 `PromiseTaskHandle` 只有 `wait`/`kill`。

**被拒绝**：这处理了症状（强制转换）而没有分离关注点。`ManagedProcess` 仍然是一个持有两种任务类型的结构；"outputChunks 对 promise 任务无意义"的结构污染（现已通过将 `outputChunks` 移至 common 解决）将继续存在。每个 `entry.proc.X` 访问点仍然需要运行时分支。这是一个半吊子解决方案。

## 结果

- **正面：** 消除了 `packages/agent-core/src` 中唯一的 `as unknown` 强制转换。TypeScript 现在在访问 `entry.proc` 之前强制 `kind` 守卫，保证进程特定字段仅在真实进程上读取。
- **正面：** `ManagedProcess` → `TaskEntry` 重命名诚实反映了该结构可能持有进程或 Promise。
- **正面：** 添加未来的第三类任务（如 webhook 驱动的任务）是自然的联合变体扩展。
- **正面：** Reconcile 路径可证明不受影响——降低风险并消除了计划中的验证步骤。
- **负面：** 约 20 处引用点必须更新到新类型名。机械性的，但触及 `tools/background/` 中的多个文件。
- **负面：** 触及 `proc` 的 6 个方法（`stop`、`toInfo`、`settleProcessExit` 在 `manager.ts:673,700,702,1067,1125,1138`）现在携带 `kind` 分支——略微增加内部控制流。

## 关联

- PRD：`docs/prd/design-debt-cleanup-high-priority.md`（H3）
- 源码扫描：`improve-architecture` 报告（2026-06-17），发现项 H3
