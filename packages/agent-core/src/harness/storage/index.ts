/**
 * wire 2.0 存储地基（PRD-0037 #319）。
 *
 * 注意：契约测试套件（依赖 bun:test）不进本 barrel 与主 index，
 * 经 `@byfriends/agent-core/harness/storage-contract` 子路径导出。
 */
export * from './types';
export type { RecordFilter, SessionStorage } from './storage';
export { InMemorySessionStorage, Wire2StorageError } from './memory';
export { JsonlSessionStorage } from './jsonl';
export type { JsonlStorageOptions } from './jsonl';
