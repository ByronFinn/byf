export * from './agent';
export * from './session';
export * from './rpc';
export * from './config';
export * from './session/export';
// wire 2.0 harness（PRD-0037）：存储地基 + WireSession + AgentHarness。
// 契约测试套件经 ./harness/storage-contract 子路径导出（依赖 bun:test）。
export * from './harness';
export { workspaceTitle } from './home/workspace-registry';
export * from './errors';
export { isAbortError } from './loop/errors';
export {
  flushDiagnosticLogs,
  getRootLogger,
  log,
  redact,
  resolveGlobalLogPath,
} from './logging/logger';
export { resolveLoggingConfig } from './logging/resolve-config';
export type { ResolveLoggingInput } from './logging/resolve-config';
export type {
  LogContext,
  LogEntry,
  LogLevel,
  LogPayload,
  Logger,
  LoggingConfig,
  RootLogger,
  SessionAttachInput,
  SessionLogHandle,
} from './logging/types';
export { USER_PROMPT_ORIGIN } from './agent/context';
export type {
  AgentContextData,
  ContextMessage,
  PromptOrigin,
  UserPromptOrigin,
} from './agent/context';
// Pure wire-fold logic + output-offload helpers: they reconstruct the
// conversation timeline the same way the live agent does, and are consumed by
// the in-repo Inspector projection (see PRD-0025 / wire-fold.ts). This package
// is registry-published, so these exports are part of the public surface —
// treat signature changes as breaking and route them through a changeset.
export {
  createWireFoldState,
  foldAppendMessage,
  foldApplyCompaction,
  foldLoopEvent,
  flushDeferred,
  resetWireFoldState,
  toolResultOutputForModel,
  buildPreview,
  shouldOffload,
  DEFAULT_OFFLOADING_CONFIG,
} from './agent/context';
export type { WireFoldState, OffloadingConfig, OffloadResult } from './agent/context';
// Goal lifecycle rendering helpers (PRD-0019). Pure functions shared with the
// CLI so live and replay produce identical output (PRD R14).
export {
  renderBlockedReason,
  renderCompletionSummary,
  renderStatusLine,
} from './tools/builtin/goal/outcome-prompts';
export type {
  BackgroundLifecycleEvent,
  BackgroundTaskInfo,
  BackgroundTaskKind,
  BackgroundTaskStatus,
} from './tools/background/manager';
export type { RuntimeConfig } from './runtime-types';
export type { TelemetryClient, TelemetryProperties } from './telemetry';
export type { BearerTokenProvider, OAuthTokenProviderResolver } from './providers/runtime-provider';
export { buildPromptPlan } from './prompt-plan';
export type { InputTokenBreakdown } from './utils/tokens';

// ─── Wire records (for in-monorepo consumers like apps/vis) ────────────────
export type {
  AgentRecord,
  AgentRecordEvents,
  AgentRecordOf,
  AgentRecordPersistence,
} from './agent/records';
export { AGENT_WIRE_PROTOCOL_VERSION } from './agent/records';
export type { AgentConfigUpdateData } from './agent/config';
export type { CompactionBeginData, CompactionResult } from './agent/compaction';
export type { PermissionApprovalResultRecord, PermissionMode } from './agent/permission';
export type { UsageRecordScope } from './agent/usage';
export type { ToolStoreUpdate } from './tools/store';
export { compressImageForModel } from './tools/support/image-compress';
export { ImageLimits } from './tools/support/image-limits';
export type { ImageConfig } from './config/schema';
export type {
  LoopRecordedEvent,
  LoopStepBeginEvent,
  LoopStepEndEvent,
  LoopContentPartEvent,
  LoopToolCallEvent,
  LoopToolResultEvent,
} from './loop';
export type {
  ExecutableToolResult,
  ExecutableToolSuccessResult,
  ExecutableToolErrorResult,
} from './loop/types';
