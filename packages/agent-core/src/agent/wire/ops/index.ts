/**
 * `wire/ops` —— 各子系统的 Op 定义汇总（import 即注册到 OP_REGISTRY）。
 *
 * Phase 1：goal = 纯 reducer 范本（已落地）；其余 7 个子系统的 Op 定义随 Phase 1
 * 推进逐步加入（legacy adapter 形态）。Phase 2-6 把 legacy adapter 纯化为真 reducer。
 *
 * Agent 构造时 import 本 barrel，即把全部业务 Op 注册进静态 OP_REGISTRY。
 */

export * from './goal';
export * from './usage';
export * from './tools';
export * from './turn';
export * from './permission';
