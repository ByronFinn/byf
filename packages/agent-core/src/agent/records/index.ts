export * from './types';
export { AGENT_WIRE_PROTOCOL_VERSION } from './migration';
export { FileSystemAgentRecordPersistence, InMemoryAgentRecordPersistence } from './persistence';
export type { FileSystemAgentRecordPersistenceOptions } from './persistence';

/**
 * `records` 域在 PRD-0027 Phase 6 收敛为纯 re-export 模块：
 *
 * - record 类型（`AgentRecord` 等）与迁移（`AGENT_WIRE_PROTOCOL_VERSION`）——
 *   由 `WireService` / 各子系统 Op 消费。
 * - 持久化后端（FileSystem / InMemory）—— 由 `WireService` 持有。
 *
 * `AgentRecords` facade（logRecord / restoring / replay / registerHandlers）已在
 * Phase 6 删除：业务写路径统一为 `wire.dispatch(opFactory(payload))` /
 * `wire.persistRaw(record)`，restore 统一为 `wire.restore()`，`restoring` 相位直接
 * 读 `wire.phase`（仅 ReplayBuilder 保留一处，PRD AC2 允许 0-1 处）。
 */
