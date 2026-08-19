/**
 * `wire` 域 —— Op 定义原语（`Op`、`OpDescriptor`、`defineOp`、全局 `OP_REGISTRY`）
 * 与 `DuplicateOpError` 快速失败守卫。
 *
 * `defineOp` 在 import 时把描述符注册进 `OP_REGISTRY`，并返回「描述符 ∩ payload
 * factory」的融合体：一个被声明的 Op 既是可调用 factory（`goalCreate(payload)`），
 * 又可被检视（`goalCreate.apply`、`goalCreate.type`）。每个 Op 携带一个强制的纯
 * `apply`，可选 `toEvent`（从 payload + post-apply state 派生一个事件，在 live
 * `dispatch` 时派发，restore 时永不派发），可选 `persist:false`（transient op，只
 * 改内存不落盘）。强制的 `schema`（zod，声明在 `apply` 之前）是 payload 的唯一事实
 * 源：`P` 由它推断，故 Op 作者无需重述 payload 接口；restore 时用它 `safeParse`
 * 校验落盘数据（replay tolerance，失败跳过计数）；运行时路径（`dispatch`）不查它
 * —— dispatch 的 payload 由 Op factory 的类型推断保证。描述符的 payload 在
 * `Op.descriptor` 上被擦除为 `any`（与 `OP_REGISTRY` 对齐），使 `Op` 在 `P` 上保持
 * 协变：一批异构 Op（各自不同 payload 类型）仍可赋值给单个 `dispatch(...ops: Op[])`
 * rest 参数，而精确 payload 类型在 `Op.payload` 上为该 Op 的调用方保留。注册重复
 * `type` 抛 `DuplicateOpError`，保证全局 Op-type 名空间唯一。
 *
 * Scope-agnostic。
 */

import type { z } from 'zod';

import type { ConflictingOpType, OpPersistenceOptions, OpType } from '#/agent/wire/types';

import { DuplicateOpError } from './errors';
import type { ModelDef } from './model';

export interface OpDescriptor<K extends string, S, P> {
  readonly type: K;
  readonly model: ModelDef<S>;
  readonly schema: z.ZodType<P>;
  readonly apply: (state: S, payload: P) => S;
  readonly toEvent?: (payload: P, state: S) => unknown;
  readonly persist?: boolean;
}

export interface Op<K extends string = string, P = unknown> {
  readonly type: K;
  readonly payload: P;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly descriptor: OpDescriptor<any, any, any>;
}

/** 全局 Op-type → 描述符表。import 即注册；runtime 路径只读。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const OP_REGISTRY = new Map<string, OpDescriptor<any, any, any>>();

interface OpBehaviorOptions<S, P> {
  readonly schema: z.ZodType<P>;
  readonly apply: (state: S, payload: P) => S;
  readonly toEvent?: (payload: P, state: S) => unknown;
}

/** 强制 type 参数是字符串字面量类型，拒绝 `string` 变量。 */
type SingleStringLiteral<K extends string, Whole extends string = K> =
  {} extends Record<K, never>
    ? never
    : K extends unknown
      ? [Whole] extends [K]
        ? K
        : never
      : never;

/** 已注册 type 必须满足持久化约束（PersistedOpMap 对应 persist?:true，TransientOpMap 对应 persist:false）。 */
type RegisteredOpConstraint<K extends string> = K extends ConflictingOpType
  ? never
  : K extends OpType
    ? OpPersistenceOptions<K>
    : unknown;

type DefineOpOptions<K extends string, S, P> = OpBehaviorOptions<S, P> & {
  readonly persist?: boolean;
} & RegisteredOpConstraint<NoInfer<K>>;

/** `defineOp` 的返回：描述符 ∩ factory。import 它即完成注册。 */
type DefinedOp<K extends string, S, P> = OpDescriptor<K, S, P> & ((payload: P) => Op<K, P>);

export interface DefineOpFn<S> {
  <const K extends string, P>(
    type: K & SingleStringLiteral<K>,
    opts: DefineOpOptions<NoInfer<K>, S, P>,
  ): DefinedOp<K, S, P>;
}

/** 绑定到一个具体 Model 的 `defineOp`（由 `defineModel` 注入 getModel 闭包）。 */
export function bindDefineOp<S>(getModel: () => ModelDef<S>): DefineOpFn<S> {
  const bound = (type: string, opts: unknown): unknown =>
    defineOp(getModel(), type as never, opts as never);
  return bound as DefineOpFn<S>;
}

export function defineOp<const K extends string, S, P>(
  model: ModelDef<S>,
  type: K & SingleStringLiteral<K>,
  opts: DefineOpOptions<NoInfer<K>, S, P>,
): DefinedOp<K, S, P> {
  if (OP_REGISTRY.has(type)) {
    throw new DuplicateOpError(type);
  }
  const behavior: OpBehaviorOptions<S, P> & {
    readonly persist?: boolean;
  } = opts;
  const descriptor: OpDescriptor<K, S, P> = {
    type,
    model,
    schema: behavior.schema,
    apply: behavior.apply,
    toEvent: behavior.toEvent,
    persist: behavior.persist,
  };
  OP_REGISTRY.set(type, descriptor);
  const factory = (payload: P): Op<K, P> => ({ type, payload, descriptor });
  return Object.assign(factory, descriptor);
}
