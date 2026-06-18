# ADR 0014: TaskEntry Discriminated Union

## Status

Accepted

## Context

`BackgroundProcessManager` (`packages/agent-core/src/tools/background/manager.ts`) manages two fundamentally different kinds of background tasks through a single data structure:

1. **Real process tasks** — user-launched long-running shell commands (`npm run dev`, `pytest`). These are real OS processes with a pid, stdin/stdout/stderr streams, and signal-based termination.
2. **Agent (Promise-based) tasks** — sub-agents launched in the background by the main agent. These are pure JS Promoutines: no pid, no streams, cancelled via an abort callback.

The `ManagedProcess` structure was designed around the real-process shape — its `proc: KaosProcess` field requires the full process interface (stdin/stdout/stderr/pid/wait/kill). To make agent tasks fit, `registerAgentTask` (`manager.ts:808-818`) fabricates a fake process object and casts it past the type system:

```typescript
proc: {
  stdin: { write: () => false, end: () => {} } as never,
  stdout: { setEncoding: () => {}, on: () => {} } as never,
  pid: 0,
  wait: () => completion.then(() => 0),
  kill: async () => { opts.abort?.(); },
} as unknown as KaosProcess,  // type-system escape hatch
```

This is the only `as unknown` cast in `packages/agent-core/src`. Its consequences:

- **Silent failure risk**: `proc.stdout.on(...)` and `proc.pid` are dead/zero for agent tasks. Any code that assumes `entry.proc` is real will misbehave on agent tasks, and TypeScript cannot catch it.
- **False unity**: `ManagedProcess` pretends to be one thing, but agent tasks have no process. The name itself ("ManagedProcess") is misleading for a structure that also holds Promises.
- **Confused responsibilities**: the manager fuses two execution models (OS process vs JS Promise) into one map, one status machine, and one set of fields.

The `improve-architecture` scan (2026-06-17) flagged this as a High-priority design debt (H3).

## Decision

Replace `ManagedProcess` with a **discriminated union** (`TaskEntry`) that shares common fields but separates the two task shapes.

```typescript
interface TaskCommon {
  taskId: string;
  command: string;
  description: string;
  status: 'running' | 'completed' | 'failed' | 'killed' | 'lost';
  startedAt: number;
  endedAt: number | null;
  exitCode: number | null;
  outputChunks: string[];        // moved up: both kinds produce text output
  outputSizeBytes: number;       // moved up: both need persistence/display
  waiters: Array<...>;
  terminalFired: boolean;
  stopRequested: boolean;
  outputSessionDir: string | undefined;
  lifecyclePromise: Promise<void>;
  persistWriteQueue: Promise<void>;
  outputWriteQueue: Promise<void>;
  agentId?: string;              // agent-task identifier
  subagentType?: string;
}

interface ProcessTaskEntry extends TaskCommon {
  kind: 'process';
  proc: KaosProcess;             // only present for real processes
  timeoutMs?: number;
}

interface PromiseTaskEntry extends TaskCommon {
  kind: 'promise';
  completion: Promise<{ result: string }>;
  abort: () => void;             // cancellation for agent tasks
  timeoutMs?: number;
}

type TaskEntry = ProcessTaskEntry | PromiseTaskEntry;
```

The type name `ManagedProcess` is renamed to `TaskEntry` throughout (~20 reference sites).

### Why `outputChunks`/`outputSizeBytes` moved to `TaskCommon`

Verified during grill: `outputChunks` is already `string[]` (`manager.ts:112`), not `Buffer[]`. Both real-process stdout chunks and agent result strings are already stored as strings. Both kinds need output persistence, `/tasks` panel display, and ring-buffer trimming. Moving these fields up is friction-free and unifies the "task output text" semantics.

### Why the reconcile path is untouched

Verified during grill: `reconcile`/`loadFromDisk` (`manager.ts:993-1029`) loads persisted tasks into a `ghosts` map of `BackgroundTaskInfo` (read-only snapshots), and marks any non-terminal ghost as `'lost'`. It does **not** reconstruct an active `TaskEntry` — because neither a dead process nor a lost Promise can be resumed. The discriminated union therefore only affects active-entry construction and handling; the reconcile/ghost path is completely unaware of the change.

## Alternatives Considered

### A. Two independent managers + a coordinator facade

Split into `RealProcessManager` + `PromiseTaskManager`, unified by a `BackgroundCoordinator` facade.

**Rejected**: the external interface (`register`/`stop`/`list`/`onTerminal`/slot reservation) is genuinely common — unifying it is correct. Splitting forces the persistence layer (`persist.ts`), restore (`reconcile`), callback subscriptions, task-id allocation, and concurrency-slot accounting to be either duplicated or re-aggregated at the facade. The blast radius (callers, persistence, restore) far exceeds the benefit, since the aggregation is the right design.

### B. Narrow the `proc` type to a `TaskHandle` union

Keep a single `ManagedProcess` structure, but change `proc: KaosProcess` to `proc: KaosProcess | PromiseTaskHandle` where `PromiseTaskHandle` only has `wait`/`kill`.

**Rejected**: this treats the symptom (the cast) without separating the concerns. `ManagedProcess` would still be one structure holding two task kinds; the "outputChunks is meaningless for promise tasks" structural pollution (now resolved by moving `outputChunks` to common) would have persisted. Every `entry.proc.X` access site would still need runtime branching. It is half a solution.

## Consequences

- **Positive**: Eliminates the only `as unknown` cast in `packages/agent-core/src`. TypeScript now forces a `kind` guard before any access to `entry.proc`, guaranteeing process-specific fields are only read on real processes.
- **Positive**: The `ManagedProcess` → `TaskEntry` rename honestly reflects that the structure may hold either a process or a Promise.
- **Positive**: Adding a future third task kind (e.g. a webhook-driven task) is a natural union variant extension.
- **Positive**: Reconcile path is provably unaffected — reduces risk and eliminated a planned verification slice.
- **Negative**: ~20 reference sites must be updated to the new type name. Mechanical but touches several files within `tools/background/`.
- **Negative**: The 6 methods that touch `proc` (`stop`, `toInfo`, `settleProcessExit` at `manager.ts:673,700,702,1067,1125,1138`) now carry `kind` branches — slightly more internal control flow.

## Related

- PRD: `docs/prd/design-debt-cleanup-high-priority.md` (H3)
- Source scan: `improve-architecture` report (2026-06-17), finding H3
