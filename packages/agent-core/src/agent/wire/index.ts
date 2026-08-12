/**
 * `wire` 域 —— 自研 reducer 框架骨架（PRD-0027 / ADR-0032）。
 *
 * 借鉴 kimi `agent-core-v2` 实际落地子集（Op / Model / toEvent / cross-reducer /
 * onDidRestore 五件套），不移植其代码、不绑定其 on-disk 格式。Phase 0 只建框架骨架
 * + 单测，不接入 Agent（零生产影响）。
 *
 * 文档语言：本目录的术语与 CONTEXT.md「Op / Model / reducer」对齐。
 */

export * from './errors';
export * from './types';
export * from './model';
export * from './op';
export * from './record';
export * from './wireService';

/**
 * 协议版本常量当前仍由 records 层持有（Phase 1 将把 migration 目录从
 * records/migration/ 搬到 wire/migration/，届时本 re-export 自然消失）。在此
 * re-export 使 wire 模块成为协议事实的单一入口。
 */
export { AGENT_WIRE_PROTOCOL_VERSION } from '#/agent/records/migration';
