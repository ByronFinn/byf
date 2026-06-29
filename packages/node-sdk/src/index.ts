export { ByfHarness } from '#/byf-harness';
export { Session } from '#/session';
export { ByfAuthFacade } from '#/auth';

export {
  applyCatalogProvider,
  catalogBaseUrl,
  catalogIdMatchesModelId,
  catalogModelToAlias,
  catalogProviderModels,
  CatalogFetchError,
  DEFAULT_CATALOG_URL,
  enrichWithCatalog,
  fetchCatalog,
  findCatalogModel,
  inferWireType,
  loadBuiltInCatalog,
} from '#/catalog';
export type {
  ApplyCatalogProviderOptions,
  Catalog,
  CatalogModel,
  CatalogProviderEntry,
  EnrichedModelAlias,
} from '#/catalog';

export {
  ErrorCodes,
  ByfError,
  isAbortError,
  type ByfErrorCode,
  type ByfErrorInfo,
  type ByfErrorOptions,
  type ByfErrorPayload,
  BYF_ERROR_INFO,
  fromByfErrorPayload,
  isByfError,
  toByfErrorPayload,
} from '@byfriends/agent-core';
export {
  loginProviderRegistry,
  getLoginProviderOptions,
  type LoginProviderType,
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

// Provider config — re-exported from @byfriends/oauth so consumers don't
// need a direct dependency on the oauth package.
export { applyProviderConfig, fetchModels, fetchModelsByType } from '@byfriends/oauth';
export type { ModelInfo } from '@byfriends/oauth';
