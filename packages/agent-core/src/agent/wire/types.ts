/**
 * `wire` 域 —— 可增强的 Op 注册表及其编译期词汇推导。
 *
 * 各子系统通过 module augmentation 把已定义的 Op 贡献进 `PersistedOpMap`（落盘）
 * 或 `TransientOpMap`（只改内存，`persist:false`）。选中的 map 决定 live dispatch
 * 是否写盘，而 `OpPayload` 从 Op 自身的 factory 类型反推 payload —— payload 从 Op
 * 定义流向注册表，永不反向，故 Op 编写不产生注册表环依赖。落盘侧输入保持开放
 * （`WireRecord` 是宽松的 `{ type: string; ... }`），使 replay 能容忍历史与未来
 * record type（AC5 replay tolerance）。Scope-agnostic。
 *
 * 本文件刻意不导入任何业务子系统类型，保持框架骨架零生产耦合（Phase 0）。
 */

export interface PersistedOpMap {}

export interface TransientOpMap {}

type StringKey<T> = Extract<keyof T, string>;

type PersistedOpKey = StringKey<PersistedOpMap>;
type TransientOpKey = StringKey<TransientOpMap>;

/** 同时出现在两个 map 里的 type —— 编译期即报错（堵死歧义）。 */
export type ConflictingOpType = Extract<PersistedOpKey, TransientOpKey>;
export type PersistedOpType = Exclude<PersistedOpKey, ConflictingOpType>;
export type TransientOpType = Exclude<TransientOpKey, ConflictingOpType>;
// 两个 map 在 Phase 0 尚无 augmentation → 两侧皆为 never，oxlint 会报「冗余 never」；
// Phase 1 注册业务 Op 后自然消失。
// oxlint-disable-next-line typescript-eslint/no-redundant-type-constituents: maps populated in Phase 1
export type OpType = PersistedOpType | TransientOpType;

export type PayloadOf<T> = T extends (payload: infer P) => unknown ? P : never;

export type OpPayload<K extends OpType> = K extends PersistedOpType
  ? PayloadOf<PersistedOpMap[K]>
  : K extends TransientOpType
    ? PayloadOf<TransientOpMap[K]>
    : never;

/**
 * 一个 Model 声明对其他域 Op 的归约（cross-reducer）。key 是 Op type，value 是
 * 归约函数。wire 引擎在 dispatch 与 restore 时都会跑这些 cross-reducer（即便
 * silent），使派生状态在 restore 时也能正确重建。
 */
export type ModelReducers<S> = {
  [K in OpType]?: (state: S, payload: OpPayload<K>) => S;
};

/**
 * 持久化选项约束：PersistedOpMap 里的 type 只能 `persist?: true`（默认落盘）；
 * TransientOpMap 里的 type 必须 `persist: false`（只改内存）。用于 `defineOp`
 * 的编译期校验。
 */
export type OpPersistenceOptions<K extends OpType> = K extends PersistedOpType
  ? { readonly persist?: true }
  : { readonly persist: false };
