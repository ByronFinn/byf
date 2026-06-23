export * from './client';
export * from './core-api';
// `core-impl.ts` defines the `ByfCore` engine concrete class plus the
// `createByfCore` factory. We intentionally do NOT `export *` from it: the
// concrete class must stay out of the package public surface so the SDK layer
// programs against the `CoreAPI` contract (ADR 0006 — isolation seam). Only
// the factory and its narrow handle type are re-exported.
export { createByfCore, type ByfCoreOptions, type CoreEngineHandle } from './core-impl';
export * from './resumed';
export * from './sdk-api';
export * from './events';
export * from './types';
// `PromisableMethods` is a structural contract type needed by SDK callers to
// type the core handle they receive from `createByfCore`. Re-export it here so
// consumers don't have to depend on the internal utils path.
export type { PromisableMethods, Promisify, Promisable } from '../utils/types';
