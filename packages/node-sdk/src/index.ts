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
// Goal lifecycle rendering helpers (PRD-0019). Pure functions shared with
// hosts so live and replay produce identical output.
export {
  renderBlockedReason,
  renderCompletionSummary,
  renderStatusLine,
} from '@byfriends/agent-core';
export { MAX_GOAL_OBJECTIVE_LENGTH } from '@byfriends/agent-core';
export { compressImageForModel, ImageLimits } from '@byfriends/agent-core';
export type { LogContext, LogLevel, LogPayload, Logger } from '@byfriends/agent-core';
export type { SessionMetadataPatch } from '@byfriends/agent-core';

// Inspector DTO（PRD-0035 R-A1/R-B7）——从 core re-export，web-shared / web-server
// 经 SDK 消费，避免直引 agent-core 源码。
export type {
  AgentInfo,
  AgentNode,
  AgentRecord,
  AgentTreeResponse,
  ConfigSnapshot,
  ContentPart,
  ContextMessage,
  ContextProjection,
  InspectorSessionSummary,
  LoopRecordedEvent,
  Message,
  PermissionMode,
  ProjectedMessage,
  PromptOrigin,
  SessionDetail,
  SessionHealth,
  TokenUsage,
  ToolCall,
  UsageTotals,
  WireEntry,
  WireResponse,
} from '@byfriends/agent-core/session/inspector';
// ConfigDocument（PRD-0035 R-A3，ADR-0038）——core 根已导出。
export type {
  ConfigDiagnostic,
  ConfigValidationResult,
  ConfigDocumentResult,
  ConfigWriteResult,
} from '@byfriends/agent-core';
export {
  MASKED_SECRET_PLACEHOLDER,
  maskConfigSecrets,
  restoreMaskedSecrets,
} from '@byfriends/agent-core';
// MCP config store(PRD-0036 / ADR-0039)——core 根已导出。
export type {
  McpConfigListing,
  McpConfigScope,
  McpRawDocument,
  McpScopeState,
  McpServerConfig,
  McpServerEntry,
} from '@byfriends/agent-core';
export { workspaceTitle } from '@byfriends/agent-core';

export * from '#/events';
export type * from '#/types';

// Provider config — re-exported from @byfriends/oauth so consumers don't
// need a direct dependency on the oauth package.
export { applyProviderConfig, fetchModels, fetchModelsByType } from '@byfriends/oauth';
export type { ModelInfo } from '@byfriends/oauth';
