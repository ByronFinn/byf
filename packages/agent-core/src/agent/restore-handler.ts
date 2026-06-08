import type { AgentRecord } from './records/types';

/**
 * 记录恢复处理器接口。
 *
 * 实现此接口的子系统负责恢复特定类型的 AgentRecord。
 *
 * ## 契约
 *
 * 恢复操作必须遵循以下契约：
 *
 * - **同步操作**：恢复必须是同步的，不返回 Promise。
 *   恢复是重建内存状态的过程，不应涉及 I/O、网络或其他异步操作。
 *
 * - **无副作用**：恢复时不产生任何外部副作用：
 *   - 不调用 `records.logRecord()`
 *   - 不调用 `agent.emitEvent()`
 *   - 不调用 LLM
 *   - 不执行工具
 *   - 不写入文件系统（除了恢复所需的内存操作）
 *
 * - **非幂等性**：恢复操作不需要保证幂等性。
 *   实现时假设每条记录只会被恢复一次。
 *
 * - **状态恢复**：恢复操作的目的是将子系统的内存状态
 *   恢复到记录日志时的状态。
 *
 * ## 使用
 *
 * 子系统实现此接口后，通过 `AgentRecords.registerHandlers()`
 * 注册，然后在恢复时被调用。
 */
export interface RecordRestoreHandler {
  /**
   * 恢复一条记录到子系统状态。
   *
   * @param record - 要恢复的记录（已通过迁移处理）
   *
   * @remarks
   *
   * 此方法在 `AgentRecords.replay()` 过程中被调用。
   * 实现时应根据 `record.type` 分发到相应的恢复逻辑。
   *
   * 示例：
   *
   * ```typescript
   * class ContextMemory implements RecordRestoreHandler {
   *   restoreRecord(record: AgentRecord): void {
   *     switch (record.type) {
   *       case 'context.append_message':
   *         this.appendMessage(record.message);
   *         break;
   *       // ...
   *     }
   *   }
   * }
   * ```
   */
  restoreRecord(record: AgentRecord): void;
}
