/**
 * `wire` 域 —— 错误码与 `WireError` 基类、`DuplicateOpError` 守卫。
 *
 * 自研 reducer 框架（PRD-0027 / ADR-0032）的错误层。`DuplicateOpError` 与
 * restore 期「未知 / 损坏 record 跳过并计数」（replay tolerance，AC5）共用
 * `WireError` 基类。与 byf 的 `ByfError` 体系正交：wire 框架自包含，Phase 0
 * 不接入 byf 的错误注册表；后续按需再对齐。
 */

export const WireErrorCodes = {
  /** 同一 Op type 被 `defineOp` 重复注册（构建期 bug）。 */
  WIRE_DUPLICATE_OP: 'wire.duplicate_op',
  /** restore 时遇到未知 type 或 schema 校验失败的 record，已跳过。 */
  WIRE_UNKNOWN_RECORD: 'wire.unknown_record',
  /** restore 期间状态机相位违规（例如 restore 期间误 dispatch）。 */
  WIRE_PHASE_VIOLATION: 'wire.phase_violation',
} as const;

export type WireErrorCode = (typeof WireErrorCodes)[keyof typeof WireErrorCodes];

export class WireError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'WireError';
  }
}

/** `defineOp` 注册了已存在的 type 时抛出，保证全局 Op-type 名空间唯一。 */
export class DuplicateOpError extends WireError {
  constructor(type: string) {
    super(WireErrorCodes.WIRE_DUPLICATE_OP, `Duplicate Op type registered: '${type}'`, { type });
    this.name = 'DuplicateOpError';
  }
}
