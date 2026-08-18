import { join } from 'node:path';

import { ErrorCodes, ByfError } from '#/errors';

import { mergeConfigPatch, readConfigFile, writeConfigFile, type ByfConfig } from '../config';
import * as configDocument from '../config/document';
import type { ConfigValidationResult } from '../config/document';
import { WorkspaceRegistry } from '../home/workspace-registry';
import { probeMcpConnection } from '../mcp';
import * as mcpConfigStore from '../mcp/config-store';
import { ProviderManager } from '../providers/provider-manager';
import * as inspector from '../session/inspector';
import type {
  AgentTreeResponse,
  ContextProjection,
  InspectorSessionSummary,
  SessionDetail,
  WireResponse,
} from '../session/inspector';
import { normalizeWorkDir, SessionStore } from '../session/store';
import * as skillStore from '../skill/store';
import type {
  AddWorkspacePayload,
  ConfigDocumentResult,
  ConfigWriteResult,
  CreateSkillResult,
  CreateWorkspaceSkillPayload,
  EmptyPayload,
  ListMcpServerConfigsPayload,
  ListWorkspaceSkillsPayload,
  McpConfigListing,
  McpConnectionTestResult,
  McpRawDocument,
  McpScopeState,
  ReadAgentWirePayload,
  ReadContextProjectionPayload,
  ReadMcpRawPayload,
  RemoveByfModelPayload,
  RemoveByfProviderPayload,
  RemoveMcpServerConfigPayload,
  RemoveWorkspacePayload,
  RemoveWorkspaceSkillPayload,
  ResolveModelCapabilitiesPayload,
  ResolvedModelCapabilities,
  SetByfConfigPayload,
  TestMcpConnectionPayload,
  UpsertMcpServerConfigPayload,
  ValidateConfigTextPayload,
  WorkspaceSkillListing,
  WriteConfigTextPayload,
  WriteMcpRawPayload,
} from './core-api';

export interface HostRPCDeps {
  readonly homeDir: string;
  readonly configPath: string;
  readonly userHomeDir: string;
  readonly providerManager: ProviderManager;
  readonly sessionStore: SessionStore;
}

/**
 * 主机级 RPC 域：与活动 Session 无关的「引擎外壳」管理操作（全局配置、
 * 配置文档、工作区注册表、MCP 配置存储、工作区技能、只读检查器投影）。
 *
 * 这些方法共享 `homeDir` / `configPath` / `providerManager` 等依赖,但都不
 * 触碰 `ByfCore.sessions` 活动会话。从 `core-impl.ts` 抽出以减少组合根的
 * 体积(见 M9),`ByfCore` 仅保留一行委托。
 */
export interface HostRPC {
  getByfConfig(payload?: EmptyPayload): Promise<ByfConfig>;
  setByfConfig(payload: SetByfConfigPayload): Promise<ByfConfig>;
  removeByfProvider(payload: RemoveByfProviderPayload): Promise<ByfConfig>;
  removeByfModel(payload: RemoveByfModelPayload): Promise<ByfConfig>;
  resolveModelCapabilities(
    payload: ResolveModelCapabilitiesPayload,
  ): Promise<ResolvedModelCapabilities>;
  getConfigDocument(payload?: EmptyPayload): Promise<ConfigDocumentResult>;
  validateConfigText(payload: ValidateConfigTextPayload): Promise<ConfigValidationResult>;
  writeConfigText(payload: WriteConfigTextPayload): Promise<ConfigWriteResult>;
  listWorkspaces(payload?: EmptyPayload): Promise<string[]>;
  hiddenWorkspaces(payload?: EmptyPayload): Promise<string[]>;
  addWorkspace(payload: AddWorkspacePayload): Promise<string[]>;
  removeWorkspace(payload: RemoveWorkspacePayload): Promise<boolean>;
  listMcpServerConfigs(payload: ListMcpServerConfigsPayload): Promise<McpConfigListing>;
  readMcpConfigRaw(payload: ReadMcpRawPayload): Promise<McpRawDocument>;
  upsertMcpServerConfig(payload: UpsertMcpServerConfigPayload): Promise<McpScopeState>;
  removeMcpServerConfig(payload: RemoveMcpServerConfigPayload): Promise<McpScopeState>;
  writeMcpConfigRaw(payload: WriteMcpRawPayload): Promise<McpRawDocument>;
  testMcpConnection(payload: TestMcpConnectionPayload): Promise<McpConnectionTestResult>;
  listWorkspaceSkills(payload: ListWorkspaceSkillsPayload): Promise<WorkspaceSkillListing>;
  createWorkspaceSkill(payload: CreateWorkspaceSkillPayload): Promise<CreateSkillResult>;
  removeWorkspaceSkill(payload: RemoveWorkspaceSkillPayload): Promise<void>;
  listInspectableSessions(payload?: EmptyPayload): Promise<readonly InspectorSessionSummary[]>;
  readSessionInspection(payload: { readonly sessionId: string }): Promise<SessionDetail | null>;
  readAgentWire(payload: ReadAgentWirePayload): Promise<WireResponse>;
  readContextProjection(payload: ReadContextProjectionPayload): Promise<ContextProjection>;
  readAgentTree(payload: { readonly sessionId: string }): Promise<AgentTreeResponse>;
}

export function createHostRPC(deps: HostRPCDeps): HostRPC {
  const { homeDir, configPath, userHomeDir, providerManager, sessionStore } = deps;

  // ── Config(全局 provider / model / capabilities)──────────────────────────

  async function getByfConfig(_payload: EmptyPayload): Promise<ByfConfig> {
    return readConfigFile(configPath);
  }

  async function setByfConfig(input: SetByfConfigPayload): Promise<ByfConfig> {
    const config = mergeConfigPatch(readConfigFile(configPath), input);
    await writeConfigFile(configPath, config);
    const updated = readConfigFile(configPath);
    providerManager.updateConfig(updated);
    return updated;
  }

  async function removeByfProvider(input: RemoveByfProviderPayload): Promise<ByfConfig> {
    const config = readConfigFile(configPath);
    delete config.providers[input.providerId];

    let removedDefault = false;
    const existingModels = config.models ?? {};
    for (const [key, model] of Object.entries(existingModels)) {
      if (
        typeof model === 'object' &&
        model !== null &&
        !Array.isArray(model) &&
        model['provider'] === input.providerId
      ) {
        delete existingModels[key];
        if (config.defaultModel === key) removedDefault = true;
      }
    }
    config.models = existingModels;

    if (removedDefault) {
      config.defaultModel = undefined;
    }

    if (config.defaultProvider === input.providerId) {
      config.defaultProvider = undefined;
    }

    await writeConfigFile(configPath, config);
    const updated = readConfigFile(configPath);
    providerManager.updateConfig(updated);
    return updated;
  }

  /** PRD-0034 R-D3:删除模型别名(deepMerge 无法删键,镜像 removeByfProvider)。 */
  async function removeByfModel(input: RemoveByfModelPayload): Promise<ByfConfig> {
    const config = readConfigFile(configPath);
    const existingModels = config.models ?? {};
    if (!(input.modelId in existingModels)) {
      throw new ByfError(ErrorCodes.MODEL_CONFIG_INVALID, `Unknown model alias: ${input.modelId}`);
    }
    delete existingModels[input.modelId];
    config.models = existingModels;
    if (config.defaultModel === input.modelId) {
      config.defaultModel = undefined;
    }
    await writeConfigFile(configPath, config);
    const updated = readConfigFile(configPath);
    providerManager.updateConfig(updated);
    return updated;
  }

  /**
   * 按模型别名解析合并能力(别名 capabilities ∪ provider 注册表),供 Web
   * 模型编辑器预填勾选。validateCredentials=false:只看能力面,不要求凭据。
   */
  async function resolveModelCapabilities(
    input: ResolveModelCapabilitiesPayload,
  ): Promise<ResolvedModelCapabilities> {
    providerManager.updateConfig(readConfigFile(configPath));
    const resolved = providerManager.resolveProviderConfigForModel(input.model);
    if (resolved === undefined) {
      throw new ByfError(ErrorCodes.MODEL_CONFIG_INVALID, `Unknown model alias: ${input.model}`);
    }
    const caps = resolved.modelCapabilities;
    return {
      image_in: caps.image_in,
      video_in: caps.video_in,
      audio_in: caps.audio_in,
      tool_use: caps.tool_use,
      thinking: caps.thinking,
      thinking_effort: caps.thinking_effort,
      thinking_xhigh: caps.thinking_xhigh,
      thinking_max: caps.thinking_max,
    };
  }

  // ── ConfigDocument(PRD-0035 R-A3/A4、ADR-0038)──────────────────────────

  async function getConfigDocument(_payload: EmptyPayload): Promise<ConfigDocumentResult> {
    const doc = await configDocument.readConfigDocument(configPath);
    return { path: doc.path, text: doc.text, revision: doc.revision, parsed: doc.parsed };
  }

  async function validateConfigText(
    input: ValidateConfigTextPayload,
  ): Promise<ConfigValidationResult> {
    return configDocument.validateConfigText(input.text, configPath);
  }

  async function writeConfigText(input: WriteConfigTextPayload): Promise<ConfigWriteResult> {
    return configDocument.writeConfigDocument(configPath, input.text, input.expectedRevision);
  }

  // ── WorkspaceRegistry(PRD-0035 R-A6 / ADR-0037 D3)──────────────────────

  async function listWorkspaces(_payload: EmptyPayload): Promise<string[]> {
    return workspaceRegistry().list();
  }

  async function hiddenWorkspaces(_payload: EmptyPayload): Promise<string[]> {
    return workspaceRegistry().hidden();
  }

  async function addWorkspace(input: AddWorkspacePayload): Promise<string[]> {
    return workspaceRegistry().add(input.workDir);
  }

  async function removeWorkspace(input: RemoveWorkspacePayload): Promise<boolean> {
    return workspaceRegistry().remove(input.workDir);
  }

  function workspaceRegistry(): WorkspaceRegistry {
    return new WorkspaceRegistry(homeDir);
  }

  // ── MCP config store(PRD-0036 / ADR-0039)────────────────────────────────

  async function listMcpServerConfigs(
    input: ListMcpServerConfigsPayload,
  ): Promise<McpConfigListing> {
    const workDir = requiredWorkDir('listMcpServerConfigs', input.workDir);
    return mcpConfigStore.listMcpConfigs({ cwd: workDir, homeDir });
  }

  async function readMcpConfigRaw(input: ReadMcpRawPayload): Promise<McpRawDocument> {
    const workDir = requiredWorkDir('readMcpConfigRaw', input.workDir);
    mcpConfigStore.assertMcpConfigScope(input.scope);
    return mcpConfigStore.readMcpRaw({
      cwd: workDir,
      homeDir,
      scope: input.scope,
    });
  }

  async function upsertMcpServerConfig(
    input: UpsertMcpServerConfigPayload,
  ): Promise<McpScopeState> {
    const workDir = requiredWorkDir('upsertMcpServerConfig', input.workDir);
    mcpConfigStore.assertMcpConfigScope(input.scope);
    return mcpConfigStore.upsertMcpServer({
      cwd: workDir,
      homeDir,
      scope: input.scope,
      name: input.name,
      config: input.config,
    });
  }

  async function removeMcpServerConfig(
    input: RemoveMcpServerConfigPayload,
  ): Promise<McpScopeState> {
    const workDir = requiredWorkDir('removeMcpServerConfig', input.workDir);
    mcpConfigStore.assertMcpConfigScope(input.scope);
    return mcpConfigStore.removeMcpServer({
      cwd: workDir,
      homeDir,
      scope: input.scope,
      name: input.name,
    });
  }

  async function writeMcpConfigRaw(input: WriteMcpRawPayload): Promise<McpRawDocument> {
    const workDir = requiredWorkDir('writeMcpConfigRaw', input.workDir);
    mcpConfigStore.assertMcpConfigScope(input.scope);
    return mcpConfigStore.writeMcpRaw({
      cwd: workDir,
      homeDir,
      scope: input.scope,
      text: input.text,
    });
  }

  async function testMcpConnection(
    input: TestMcpConnectionPayload,
  ): Promise<McpConnectionTestResult> {
    const workDir = requiredWorkDir('testMcpConnection', input.workDir);
    mcpConfigStore.assertMcpConfigScope(input.scope);
    const config = await mcpConfigStore.resolveServerConfigForProbe({
      cwd: workDir,
      homeDir,
      scope: input.scope,
      name: input.name,
      config: input.config,
    });
    return probeMcpConnection(config);
  }

  // ── Workspace skills(PRD-0036)────────────────────────────────────────────

  async function listWorkspaceSkills(
    input: ListWorkspaceSkillsPayload,
  ): Promise<WorkspaceSkillListing> {
    const workDir = requiredWorkDir('listWorkspaceSkills', input.workDir);
    const config = readConfigFile(configPath);
    providerManager.updateConfig(config);
    return skillStore.listWorkspaceSkills({
      workDir,
      userHomeDir,
      extraDirs: config.extraSkillDirs,
      mergeAllAvailableSkills: config.mergeAllAvailableSkills,
    });
  }

  async function createWorkspaceSkill(
    input: CreateWorkspaceSkillPayload,
  ): Promise<CreateSkillResult> {
    const workDir = requiredWorkDir('createWorkspaceSkill', input.workDir);
    return skillStore.createSkill({
      workDir,
      userHomeDir,
      scope: input.scope,
      name: input.name,
      description: input.description,
    });
  }

  async function removeWorkspaceSkill(input: RemoveWorkspaceSkillPayload): Promise<void> {
    const workDir = requiredWorkDir('removeWorkspaceSkill', input.workDir);
    return skillStore.removeSkill({
      workDir,
      userHomeDir,
      skillPath: input.skillPath,
    });
  }

  // ── Inspector(PRD-0035 R-A2)────────────────────────────────────────────
  // 只读投影走 `session/inspector`(core 内部单一实现,web/TUI/headless 经
  // SDK 复用;web-server 不直接 import core,见 ADR 0006/0037)。

  async function listInspectableSessions(
    _payload: EmptyPayload,
  ): Promise<readonly InspectorSessionSummary[]> {
    return inspector.listInspectableSessions(homeDir);
  }

  async function readSessionInspection(input: {
    readonly sessionId: string;
  }): Promise<SessionDetail | null> {
    return inspector.readSessionDetail(homeDir, input.sessionId);
  }

  async function readAgentWire(input: ReadAgentWirePayload): Promise<WireResponse> {
    const sessionDir = await sessionStore.assertDirectory(input.sessionId);
    if (!inspector.isSafeAgentId(input.agentId)) {
      throw new ByfError(ErrorCodes.AGENT_NOT_FOUND, `Agent "${input.agentId}" not found`);
    }
    const wirePath = join(sessionDir, 'agents', input.agentId, 'wire.jsonl');
    let result: Awaited<ReturnType<typeof inspector.readAgentWire>>;
    try {
      result = await inspector.readAgentWire(wirePath);
    } catch (error) {
      throw new ByfError(
        ErrorCodes.RECORDS_READ_FAILED,
        `Cannot read wire for agent "${input.agentId}" in session "${input.sessionId}"`,
        { cause: error },
      );
    }
    return {
      sessionId: input.sessionId,
      agentId: input.agentId,
      protocolVersion: result.metadata.protocolVersion,
      metadata: result.metadata,
      records: result.records,
      warnings: result.warnings,
    };
  }

  async function readContextProjection(
    input: ReadContextProjectionPayload,
  ): Promise<ContextProjection> {
    const wire = await readAgentWire(input);
    return inspector.projectContext(wire.records);
  }

  async function readAgentTree(input: { readonly sessionId: string }): Promise<AgentTreeResponse> {
    const detail = await inspector.readSessionDetail(homeDir, input.sessionId);
    if (detail === null) {
      throw new ByfError(
        ErrorCodes.SESSION_NOT_FOUND,
        `Session "${input.sessionId}" was not found`,
      );
    }
    return { sessionId: input.sessionId, tree: inspector.buildAgentTree(detail.agents) };
  }

  return {
    getByfConfig,
    setByfConfig,
    removeByfProvider,
    removeByfModel,
    resolveModelCapabilities,
    getConfigDocument,
    validateConfigText,
    writeConfigText,
    listWorkspaces,
    hiddenWorkspaces,
    addWorkspace,
    removeWorkspace,
    listMcpServerConfigs,
    readMcpConfigRaw,
    upsertMcpServerConfig,
    removeMcpServerConfig,
    writeMcpConfigRaw,
    testMcpConnection,
    listWorkspaceSkills,
    createWorkspaceSkill,
    removeWorkspaceSkill,
    listInspectableSessions,
    readSessionInspection,
    readAgentWire,
    readContextProjection,
    readAgentTree,
  };
}

function requiredWorkDir(operation: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ByfError(ErrorCodes.REQUEST_WORK_DIR_REQUIRED, `${operation} requires workDir`);
  }
  return normalizeWorkDir(value);
}
