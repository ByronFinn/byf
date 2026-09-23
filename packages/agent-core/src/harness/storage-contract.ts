/**
 * 契约测试套件子路径入口（`@byfriends/agent-core/harness/storage-contract`）。
 *
 * 独立于主 barrel：套件依赖 bun:test，仅供各后端的测试消费
 * （内存 / JSONL / packages/storage 三处 parity）。
 */
export {
  laneOpsFromLog,
  registerInMemoryContractSuite,
  runSessionStorageContractTests,
} from './storage/contract-tests';
export type { StorageContractSetup } from './storage/contract-tests';
