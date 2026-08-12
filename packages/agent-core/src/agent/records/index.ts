import { OP_REGISTRY, type WireService, wireRecordToPayload, type WireRecord } from '../wire';
import type { AgentRecord } from './types';

export * from './types';
export { AGENT_WIRE_PROTOCOL_VERSION } from './migration';
export { FileSystemAgentRecordPersistence, InMemoryAgentRecordPersistence } from './persistence';
export type { FileSystemAgentRecordPersistenceOptions } from './persistence';

/**
 * AgentRecords —— WireService 的薄门面（PRD-0027 Phase 1 Facade）。
 *
 * WireService 独占 `wire.jsonl`（持久化 + restore）。本类保留旧公共表面
 * （`logRecord` / `restoring` / `replay` / `flush` / `registerHandlers`），使 31 个
 * `agent.records.logRecord(...)` 调用点和 5 个 `restoring` 消费点零改动：
 *
 * - `logRecord(record)`：type ∈ OP_REGISTRY（8 个纯 reducer 子系统）→ `wire.dispatch(op)`
 *   （apply 更新 model + 持久化）；type ∉ OP_REGISTRY（context.* / metadata）→
 *   `wire.persistRaw(record)`（仅持久化，不跑 apply）。metadata 信封行为由 wire 端
 *   `appendToJournal` 保留（逐字节兼容 AC6）。
 * - `restoring`：由 `wire.phase === 'restoring'` 支撑（replay 期间 true，onDidRestore
 *   前切 'ready'），语义与旧 `_restoring` 一致。
 * - `replay()`：委托 `wire.restore()`（单一 restore 路径）。
 * - `registerHandlers`：Phase 1 起 restore 改由 OP_REGISTRY + legacyRoute 路由，本表
 *   不再被消费，保留仅为过渡兼容；Phase 7 删除。
 */
export class AgentRecords {
  private handlers: Record<string, import('../restore-handler').RecordRestoreHandler> = {};

  constructor(private readonly wire: WireService) {}

  get restoring() {
    return this.wire.phase === 'restoring';
  }

  registerHandlers(
    handlers: Record<string, import('../restore-handler').RecordRestoreHandler>,
  ): void {
    // Phase 1：restore 已改由 WireService 路由（OP_REGISTRY 纯 reducer + legacyRoute
    // context），本注册表不再被消费。保留仅为过渡兼容，Phase 7 删除。
    this.handlers = { ...handlers };
  }

  logRecord(record: AgentRecord): void {
    if (this.restoring) return;
    const descriptor = OP_REGISTRY.get(record.type);
    if (descriptor !== undefined) {
      // 纯 reducer 子系统：dispatch（apply 更新 model + 持久化 + metadata 信封）。
      this.wire.dispatch({
        type: record.type,
        payload: wireRecordToPayload(record as WireRecord),
        descriptor,
      });
    } else {
      // context.* / metadata：raw 持久化（无 apply）。
      this.wire.persistRaw(record as WireRecord);
    }
  }

  async replay(): Promise<{ warning?: string }> {
    return this.wire.restore();
  }

  async flush(): Promise<void> {
    await this.wire.flush();
  }
}
