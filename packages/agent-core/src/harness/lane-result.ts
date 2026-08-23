/**
 * results-not-exceptions 结果类型（PRD-0037 R5 / #328，AC11）。
 *
 * AgentLane 操作与队列方法全部返回判别联合，永不 throw；rejection 即 bug。
 * 错误码覆盖 PRD 拒绝码表：busy / not-found / 状态不符 / 无效输入 / 已关闭。
 */

export type LaneErrorCode =
  | 'LANE_BUSY' // 操作进行中，拒绝第二操作
  | 'LANE_NOT_FOUND'
  | 'LANE_MAIN_UNDELETABLE'
  | 'NOT_IDLE' // 需要 idle 才能执行（prompt/配置写入）
  | 'NOT_RUNNING' // 需要运行中才能执行（steer）
  | 'NOT_SUSPENDED' // 需要 suspended/aborting 才能执行（resume）
  | 'OP_EXHAUSTED' // 重试耗尽
  | 'NO_LLM'
  | 'INVALID_INPUT'
  | 'HARNESS_CLOSED'
  | 'INTERNAL'; // 不该出现的路径（rejection 即 bug 的显式化）

export interface LaneError {
  readonly ok: false;
  readonly code: LaneErrorCode;
  readonly message: string;
}

export interface LaneOk<T> {
  readonly ok: true;
  readonly value: T;
}

export type LaneResult<T> = LaneOk<T> | LaneError;

export function ok<T>(value: T): LaneOk<T> {
  return { ok: true, value };
}

export function err(code: LaneErrorCode, message: string): LaneError {
  return { ok: false, code, message };
}

/** 把同步抛出转换为错误结果（操作面的兜底转换；异步 rejection 仍视为 bug）。 */
export function captureLaneError(fn: () => LaneResult<unknown>): LaneResult<unknown> {
  try {
    return fn();
  } catch (error) {
    return err('INTERNAL', error instanceof Error ? error.message : String(error));
  }
}
