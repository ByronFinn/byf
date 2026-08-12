/**
 * `wire` 域 —— Model 定义原语（`ModelDef` / `defineModel`）、`DeepReadonly<T>`
 * （不可变性的编译期那一半），以及模块级注册表。
 *
 * 一个 `ModelDef` 是无状态描述符：命名一个 model、通过 `initial` 制造其初始状态、
 * 并通过 `defineOp` 声明其 Op。它自身不持有状态 —— 每个 WireService 实例的状态
 * 归 service 所有（运行时 `Object.freeze` 是不可变性的运行时那一半）。
 *
 * 与 kimi v2 的差异（PRD-0027 / ADR-0032 决议）：**不引入 blob codec**
 * （`ModelBlobCodec` / `PartsTransformer`）—— byf 的 offload 用 scratch 文件 +
 * transient op 解决，不走 blob 存储。
 *
 * 一个主 Model 可注册按「外来 Op type」索引的 cross-reducer：wire 引擎在 dispatch
 * 与 restore 时都跑它们，使派生状态无需额外落盘即可在 restore 时重建。
 *
 * `defineModel` 把每个已定义 Model 记入 `MODEL_REGISTRY`；连同 `OP_REGISTRY`、
 * `MODEL_CROSS_REDUCERS`，这些模块级表是静态内建通道（「import = register」）。
 * `DeepReadonly<T>` 递归映射状态类型为其深只读视图，供 `getModel` 返回值用：
 * 函数穿透、`Map`/`Set` 宽化为 `ReadonlyMap`/`ReadonlySet`、数组宽化为
 * `ReadonlyArray`、普通对象变为只读 mapped 类型、基本类型不变。它与 wire 引擎每次
 * `apply` 后施加的运行时 `Object.freeze` 配对。
 */

import { bindDefineOp, type DefineOpFn } from '#/agent/wire/op';
import type { ModelReducers } from '#/agent/wire/types';

export interface ModelCrossReducerEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly model: ModelDef<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly reducer: (state: any, payload: any) => any;
}

export interface ModelDef<S> {
  readonly name: string;
  readonly initial: () => S;
  readonly defineOp: DefineOpFn<S>;
}

/** cross-reducer 表：Op type → 归约条目列表。dispatch/restore 时都遍历。 */
export const MODEL_CROSS_REDUCERS = new Map<string, ModelCrossReducerEntry[]>();

/** 所有已定义 Model（去重由调用方保证；import = register）。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MODEL_REGISTRY: ModelDef<any>[] = [];

export function defineModel<S>(
  name: string,
  initial: () => S,
  opts?: {
    reducers?: ModelReducers<S>;
  },
): ModelDef<S> {
  const def: ModelDef<S> = {
    name,
    initial,
    defineOp: bindDefineOp(() => def),
  };
  if (opts?.reducers !== undefined) {
    // ModelReducers<S> 在没有 Op 注册（Phase 0）时退化为 `{}`，此处按宽松 record
    // 取用；真实调用方（Phase 1 后）仍享受 ModelReducers 的 key 校验。
    const reducers = opts.reducers as Record<
      string,
      ((state: S, payload: unknown) => S) | undefined
    >;
    for (const [opType, reducer] of Object.entries(reducers)) {
      if (reducer === undefined) continue;
      let list = MODEL_CROSS_REDUCERS.get(opType);
      if (list === undefined) {
        list = [];
        MODEL_CROSS_REDUCERS.set(opType, list);
      }
      list.push({ model: def, reducer });
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  MODEL_REGISTRY.push(def as ModelDef<any>);
  return def;
}

export type DeepReadonly<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => R
  : T extends ReadonlyMap<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends ReadonlySet<infer V>
      ? ReadonlySet<DeepReadonly<V>>
      : T extends readonly (infer E)[]
        ? ReadonlyArray<DeepReadonly<E>>
        : T extends object
          ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
          : T;
