export { ByfHarness } from '#/byf-harness';
export { Session } from '#/session';
export { ByfAuthFacade } from '#/auth';

export {
  applyCatalogProvider,
  catalogBaseUrl,
  catalogModelToAlias,
  catalogProviderModels,
  CatalogFetchError,
  DEFAULT_CATALOG_URL,
  fetchCatalog,
  inferWireType,
  loadBuiltInCatalog,
} from '#/catalog';
export type {
  ApplyCatalogProviderOptions,
  Catalog,
  CatalogModel,
  CatalogProviderEntry,
} from '#/catalog';

export {
  ErrorCodes,
  ByfError,
  type ByfErrorCode,
  type ByfErrorInfo,
  type ByfErrorOptions,
  type ByfErrorPayload,
  BYF_ERROR_INFO,
  fromByfErrorPayload,
  isByfError,
  toByfErrorPayload,
} from '@byfriends/agent-core';

// Diagnostic logging — public surface only.
// RootLogger / getRootLogger / LoggingConfig stay inside agent-core.
export {
  flushDiagnosticLogs,
  log,
  redact,
  resolveGlobalLogPath,
  resolveByfHome,
} from '@byfriends/agent-core';
export type { LogContext, LogLevel, LogPayload, Logger } from '@byfriends/agent-core';

export * from '#/events';
export type * from '#/types';
