import type { ChatProvider, Tool } from '@byfriends/kosong';

import type { Agent } from '..';
import { makeErrorPayload } from '../../errors';
import type { ExecutableTool } from '../../loop';
import type { McpConnectionManager, McpServerEntry } from '../../mcp';
import { createMcpAuthTool } from '../../mcp/auth-tool';
import { mcpResultToExecutableOutput } from '../../mcp/output';
import { isMcpToolName, qualifyMcpToolName } from '../../mcp/tool-naming';
import type { MCPClient } from '../../mcp/types';
import { DEFAULT_AGENT_PROFILES } from '../../profile';
import { withProviderRequestAuth } from '../../providers/request-auth';
import { extendWorkspaceWithSkillRoots } from '../../skill';
import * as b from '../../tools/builtin';
import type { ToolStore, ToolStoreData, ToolStoreKey } from '../../tools/store';
import { globMatch } from '../permission/path-glob-match';
import { isAgentRecordOfPrefix } from '../records/types';
import {
  toolsModel,
  toolsRegisterUserTool,
  toolsSetActiveTools,
  toolsUnregisterUserTool,
  toolsUpdateStore,
} from '../wire/ops/tools';
import type {
  BuiltinTool,
  McpServerRegistrationResult,
  McpToolCollision,
  ToolInfo,
  UserToolRegistration,
} from './types';

export * from './types';

interface McpToolEntry {
  readonly tool: ExecutableTool;
  readonly serverName: string;
}

/**
 * PRD-0031 1c：启用的 MCP 工具数超过该阈值时触发渐进披露——全量 schema
 * 不再平铺进 prompt，改由 `McpTools` 元工具按需加载（公理 C：上下文有界）。
 */
export const MCP_DISCLOSURE_THRESHOLD = 20;

export class ToolManager {
  protected builtinTools: Map<string, BuiltinTool> = new Map();
  protected userTools: Map<string, ExecutableTool> = new Map();
  protected readonly mcpTools: Map<string, McpToolEntry> = new Map();
  /** server name → list of qualified tool names registered for that server. */
  protected readonly mcpToolsByServer: Map<string, string[]> = new Map();
  protected enabledTools: Set<string> = new Set();
  /** Glob patterns (e.g. `mcp__*`, `mcp__github__*`) gating which MCP tools the profile exposes. */
  private mcpAccessPatterns: string[] = [];
  protected readonly store: Partial<ToolStoreData> = {};
  private mcpToolStatusUnsubscribe: (() => void) | undefined;

  constructor(protected readonly agent: Agent) {
    this.attachMcpTools();
  }

  protected get toolStore(): ToolStore {
    return {
      get: (key) => this.store[key],
      set: (key, value) => {
        this.updateStore(key, value);
      },
    };
  }

  attachMcpTools(): void {
    const mcp = this.agent.mcp;
    if (mcp === undefined) return;
    if (this.mcpToolStatusUnsubscribe !== undefined) return;
    for (const entry of mcp.list()) {
      if (entry.status === 'connected') {
        this.registerConnectedMcpServer(mcp, entry);
      } else if (entry.status === 'needs-auth') {
        this.registerNeedsAuthMcpServer(mcp, entry);
      }
    }
    this.mcpToolStatusUnsubscribe = mcp.onStatusChange((entry) => {
      this.handleMcpServerStatusChange(mcp, entry);
    });
  }

  updateStore<K extends ToolStoreKey>(key: K, value: ToolStoreData[K]): void {
    this.agent.wire.dispatch(toolsUpdateStore({ key, value }));
    this.store[key] = value;
  }

  registerUserTool(input: UserToolRegistration): void {
    this.agent.wire.dispatch(toolsRegisterUserTool(input));
    this.userTools.set(input.name, this.buildUserTool(input));
    this.enabledTools.add(input.name);
  }

  /** 由注册信息构造可执行工具（不含 logRecord —— syncFromWire 复用）。 */
  private buildUserTool(input: UserToolRegistration): ExecutableTool {
    const { name, description, parameters } = input;
    return {
      name,
      description,
      parameters,
      resolveExecution: (args) => {
        return {
          execute: async (context) => {
            return this.agent.rpc.toolCall(
              {
                turnId: Number(context.turnId),
                toolCallId: context.toolCallId,
                args,
              },
              { signal: context.signal },
            );
          },
        };
      },
    };
  }

  unregisterUserTool(name: string): void {
    this.agent.wire.dispatch(toolsUnregisterUserTool({ name }));
    this.userTools.delete(name);
    this.enabledTools.delete(name);
  }

  registerMcpServer(
    serverName: string,
    client: MCPClient,
    tools: readonly Tool[],
    enabledTools?: ReadonlySet<string>,
  ): McpServerRegistrationResult {
    this.unregisterMcpServer(serverName);
    const qualifiedNames: string[] = [];
    const collisions: McpToolCollision[] = [];
    const seenInThisCall = new Map<string, string>();
    for (const tool of tools) {
      if (enabledTools !== undefined && !enabledTools.has(tool.name)) continue;
      const qualified = qualifyMcpToolName(serverName, tool.name);
      const firstInThisCall = seenInThisCall.get(qualified);
      if (firstInThisCall !== undefined) {
        collisions.push({
          qualified,
          toolName: tool.name,
          collidesWith: { kind: 'same_server', toolName: firstInThisCall },
        });
        continue;
      }
      const existingEntry = this.mcpTools.get(qualified);
      if (existingEntry !== undefined) {
        collisions.push({
          qualified,
          toolName: tool.name,
          collidesWith: { kind: 'other_server', serverName: existingEntry.serverName },
        });
        continue;
      }
      seenInThisCall.set(qualified, tool.name);
      const wrapped: ExecutableTool = {
        name: qualified,
        description: tool.description,
        parameters: tool.parameters,
        resolveExecution: (args) => {
          return {
            execute: async (context) => {
              // `args` has already been JSON-parsed and schema-validated by
              // the loop's preflight (`loop/tool-call.ts`), so the MCP
              // client gets a plain object directly.
              const result = await client.callTool(
                tool.name,
                (args ?? {}) as Record<string, unknown>,
                context.signal,
              );
              return mcpResultToExecutableOutput(result, qualified);
            },
          };
        },
      };
      this.mcpTools.set(qualified, { tool: wrapped, serverName });
      qualifiedNames.push(qualified);
    }
    this.mcpToolsByServer.set(serverName, qualifiedNames);
    return { registered: qualifiedNames, collisions };
  }

  unregisterMcpServer(serverName: string): boolean {
    const existing = this.mcpToolsByServer.get(serverName);
    if (existing === undefined) return false;
    for (const qualified of existing) {
      this.mcpTools.delete(qualified);
    }
    this.mcpToolsByServer.delete(serverName);
    return true;
  }

  private handleMcpServerStatusChange(mcp: McpConnectionManager, entry: McpServerEntry): void {
    if (entry.status === 'connected') {
      this.registerConnectedMcpServer(mcp, entry);
      return;
    }
    if (entry.status === 'needs-auth') {
      this.registerNeedsAuthMcpServer(mcp, entry);
      return;
    }
    if (entry.status === 'failed') {
      this.unregisterMcpServer(entry.name);
      this.agent.emitEvent({
        type: 'tool.list.updated',
        reason: 'mcp.failed',
        serverName: entry.name,
      });
      return;
    }
    if (entry.status === 'disabled' || entry.status === 'pending') {
      const removed = this.unregisterMcpServer(entry.name);
      if (removed) {
        this.agent.emitEvent({
          type: 'tool.list.updated',
          reason: 'mcp.disconnected',
          serverName: entry.name,
        });
      }
    }
  }

  private registerNeedsAuthMcpServer(mcp: McpConnectionManager, entry: McpServerEntry): void {
    // Replace whatever tools (real or synthetic) were registered before; a
    // server flipping to needs-auth means previous tokens were invalidated.
    this.unregisterMcpServer(entry.name);
    const oauthService = mcp.oauthService;
    const serverUrl = mcp.getHttpServerUrl(entry.name);
    if (oauthService === undefined || serverUrl === undefined) {
      // Misconfiguration: a server reached needs-auth without the manager
      // owning an OAuth service or being HTTP. Treat it as a no-op so the
      // existing failure error message keeps the user informed.
      return;
    }
    const tool = createMcpAuthTool({
      serverName: entry.name,
      serverUrl,
      oauthService,
      reconnect: async () => {
        await mcp.reconnect(entry.name);
      },
    });
    this.mcpTools.set(tool.name, { tool, serverName: entry.name });
    this.mcpToolsByServer.set(entry.name, [tool.name]);
    // The synthetic auth tool is now in the tool list; surface it the same way
    // a real toolset would show up so the model picks it up.
    this.agent.emitEvent({
      type: 'tool.list.updated',
      reason: 'mcp.connected',
      serverName: entry.name,
    });
  }

  private registerConnectedMcpServer(mcp: McpConnectionManager, entry: McpServerEntry): void {
    const resolved = mcp.resolved(entry.name);
    if (resolved === undefined) return;
    const result = this.registerMcpServer(
      entry.name,
      resolved.client,
      resolved.tools,
      resolved.enabledNames,
    );
    this.emitMcpToolCollisions(entry.name, result.collisions);
    this.agent.emitEvent({
      type: 'tool.list.updated',
      reason: 'mcp.connected',
      serverName: entry.name,
    });
  }

  private emitMcpToolCollisions(serverName: string, collisions: readonly McpToolCollision[]): void {
    if (collisions.length === 0) return;
    const summary = collisions
      .map((c) =>
        c.collidesWith.kind === 'same_server'
          ? `"${c.toolName}" -> ${c.qualified} (collides with "${c.collidesWith.toolName}" from the same server)`
          : `"${c.toolName}" -> ${c.qualified} (collides with server "${c.collidesWith.serverName}")`,
      )
      .join('; ');
    this.agent.emitEvent({
      type: 'error',
      ...makeErrorPayload(
        'mcp.tool_name_collision',
        `MCP server "${serverName}" registered ${collisions.length} tool name` +
          `${collisions.length === 1 ? '' : 's'} ` +
          `that collide with existing qualified names; the losing tools were dropped: ${summary}`,
        { details: { serverName, collisions: collisions as readonly unknown[] } },
      ),
    });
  }

  setActiveTools(names: readonly string[]): void {
    this.agent.wire.dispatch(toolsSetActiveTools({ names }));
    // MCP entries are glob patterns gated separately; the rest are exact
    // builtin/user tool names. The split keeps every caller on one string[].
    this.enabledTools = new Set(names.filter((name) => !isMcpToolName(name)));
    this.mcpAccessPatterns = names.filter((name) => isMcpToolName(name));
  }

  private isMcpToolEnabled(name: string): boolean {
    return this.mcpAccessPatterns.some((pattern) => globMatch(name, pattern));
  }

  *toolInfos(): Iterable<ToolInfo> {
    for (const tool of this.builtinTools.values()) {
      yield {
        name: tool.name,
        description: tool.description,
        active: this.enabledTools.has(tool.name),
        source: 'builtin',
      };
    }
    for (const tool of this.userTools.values()) {
      yield {
        name: tool.name,
        description: tool.description,
        active: this.enabledTools.has(tool.name),
        source: 'user',
      };
    }
    for (const entry of this.mcpTools.values()) {
      yield {
        name: entry.tool.name,
        description: entry.tool.description,
        active: this.isMcpToolEnabled(entry.tool.name),
        source: 'mcp',
      };
    }
  }

  data(): readonly ToolInfo[] {
    return Array.from(this.toolInfos());
  }

  storeData(): Readonly<Record<string, unknown>> {
    return { ...this.store };
  }

  initializeBuiltinTools(): void {
    const {
      runtime: { kaos, osEnv, urlFetcher, webSearcher },
      config: { cwd, additionalDirs, provider, modelCapabilities },
      background,
    } = this.agent;
    const videoUploader = this.createVideoUploader(provider);
    const workspace = extendWorkspaceWithSkillRoots(
      {
        workspaceDir: cwd,
        additionalDirs: [...additionalDirs],
      },
      this.agent.skills?.registry.getSkillRoots() ?? [],
    );
    const allowBackground =
      this.enabledTools.has('TaskList') &&
      this.enabledTools.has('TaskOutput') &&
      this.enabledTools.has('TaskStop');
    const readFileTracker = new b.ReadFileTracker(this.toolStore);
    this.builtinTools = new Map(
      [
        new b.ReadTool(kaos, workspace, readFileTracker),
        new b.WriteTool(kaos, workspace, readFileTracker),
        new b.EditTool(kaos, workspace, readFileTracker),
        new b.GrepTool(kaos, workspace),
        new b.GlobTool(kaos, workspace),
        new b.BashTool(kaos, cwd, osEnv, background, {
          allowBackground,
        }),
        (modelCapabilities.image_in || modelCapabilities.video_in) &&
          new b.ReadMediaFileTool(
            kaos,
            workspace,
            modelCapabilities,
            videoUploader,
            this.agent.backgroundSessionDir,
            this.agent.imageLimits,
          ),
        new b.AskUserQuestionTool(this.agent),
        new b.TodoListTool(this.toolStore),
        new b.TaskListTool(background),
        new b.TaskOutputTool(background),
        new b.TaskStopTool(background),
        this.agent.skills !== undefined &&
          this.agent.skills.registry.listInvocableSkills().length > 0 &&
          new b.SkillTool(this.agent),
        this.agent.subagentHost &&
          new b.AgentTool(
            this.agent.subagentHost,
            background,
            DEFAULT_AGENT_PROFILES['agent']?.subagents,
            {
              allowBackground,
              log: this.agent.log,
            },
          ),
        // PRD-0019 R7: goal tools only registered on the main agent. Sub and
        // independent agents never see them — neither in the schema nor in
        // loopTools — so they cannot start or steer an autonomous goal.
        this.agent.type === 'main' && new b.CreateGoalTool(this.agent),
        this.agent.type === 'main' && new b.GetGoalTool(this.agent),
        this.agent.type === 'main' && new b.SetGoalBudgetTool(this.agent),
        this.agent.type === 'main' && new b.UpdateGoalTool(this.agent),
        // Session-scoped cron tools (PRD-0023 R3); only when CronManager is attached.
        this.agent.cron && new b.CronCreateTool(this.agent.cron),
        this.agent.cron && new b.CronListTool(this.agent.cron),
        this.agent.cron && new b.CronDeleteTool(this.agent.cron),
        webSearcher && new b.WebSearchTool(webSearcher),
        urlFetcher && new b.FetchURLTool(urlFetcher),
        // PRD-0031 1c：MCP 渐进披露元工具（超阈值时由 loopTools 注入）
        new b.McpToolsTool(() => this.listEnabledMcpTools()),
        // PRD-0031 2b：普通 turn 的声明式完成契约（completion guard 接 background）
        new b.CompleteTaskTool(background),
      ]
        .filter((tool) => !!tool)
        .map((tool) => [tool.name, tool] as const),
    );
  }

  private createVideoUploader(provider: ChatProvider): b.VideoUploader | undefined {
    const uploadVideo = provider.uploadVideo?.bind(provider);
    if (uploadVideo === undefined) return undefined;

    const modelAlias = this.agent.config.modelAlias;
    const resolveAuth =
      modelAlias === undefined
        ? undefined
        : this.agent.providerManager?.createAuthResolverForModel(modelAlias, {
            log: this.agent.log,
          });
    return (input) => withProviderRequestAuth(resolveAuth, (auth) => uploadVideo(input, { auth }));
  }

  get loopTools(): readonly ExecutableTool[] {
    // 1. Builtin tools first: stable, never change during session (alphabetical).
    //    PRD-0019 R7: goal mutation tools (SetGoalBudget / UpdateGoal) are
    //    hidden when no goal is present — they have nothing to act on. The
    //    read/create tools (CreateGoal, GetGoal) stay visible so the model
    //    can discover the goal subsystem and create one.
    //    PRD-0031 1c: McpTools 元工具仅在渐进披露激活时进入列表。
    const hasGoal = this.agent.goal.getSnapshot() !== null;

    // 2. MCP tools: grouped by server, connection order preserved.
    //    PRD-0031 1c：MCP 工具数超过阈值时渐进披露——全量 schema 不进入
    //    prompt（公理 C），改由 McpTools 元工具按需加载；工具仍注册可执行。
    //    tools 前缀因此对 MCP churn 免疫（超阈值后一次成型）。
    const mcpNames = [...this.mcpTools.keys()].filter((name) => this.isMcpToolEnabled(name));
    const mcpDisclosureActive = mcpNames.length > MCP_DISCLOSURE_THRESHOLD;

    const builtinNames = [...this.builtinTools.keys()]
      .filter((name) => this.enabledTools.has(name))
      .filter((name) => hasGoal || !b.GOAL_MUTATION_TOOL_NAMES.has(name))
      .filter((name) => mcpDisclosureActive || name !== 'McpTools')
      .toSorted();

    // 3. User tools: alphabetically sorted
    const userNames = [...this.userTools.keys()]
      .filter((name) => this.enabledTools.has(name))
      .toSorted();

    return [
      ...builtinNames.map((name) => this.builtinTools.get(name)),
      ...userNames.map((name) => this.userTools.get(name)),
      ...(mcpDisclosureActive
        ? [this.builtinTools.get('McpTools')]
        : mcpNames.map((name) => this.mcpTools.get(name)?.tool)),
    ].filter((tool): tool is ExecutableTool => !!tool);
  }

  /** PRD-0031 1c：McpTools 元工具读取的启用 MCP 工具摘要快照。 */
  private listEnabledMcpTools(): readonly b.McpToolSummary[] {
    return [...this.mcpTools.values()]
      .filter((entry) => this.isMcpToolEnabled(entry.tool.name))
      .map((entry) => ({
        name: entry.tool.name,
        description: entry.tool.description,
        parameters: entry.tool.parameters,
      }));
  }

  restoreRecord(record: import('../records/types').AgentRecord): void {
    if (!isAgentRecordOfPrefix(record, 'tools')) return;
    // Test-only entry point (restore-handler unit tests). Production restore
    // uses the pure wire reducer (wire.restore → apply → syncFromWire).
    switch (record.type) {
      case 'tools.register_user_tool':
        this.registerUserTool(record);
        break;
      case 'tools.unregister_user_tool':
        this.unregisterUserTool(record.name);
        break;
      case 'tools.set_active_tools':
        this.setActiveTools(record.names);
        break;
      case 'tools.update_store':
        this.updateStore(record.key, record.value);
        break;
    }
  }

  /**
   * restore 后从 wire reducer model 同步持久化状态（PRD-0027 Phase 1 Facade）。
   * userTools 由注册信息重建可执行工具（resolveExecution 闭包）；enabledTools /
   * mcpAccessPatterns 由 set_active_tools 拆分结果重建；store 逐键拷贝。
   * 注意：MCP 工具不走 wire（由 attachMcpTools 在构造期接回），此处不动 mcpTools。
   */
  syncFromWire(): void {
    const model = this.agent.wire.getModel(toolsModel);
    this.userTools = new Map();
    for (const [name, registration] of model.userTools) {
      this.userTools.set(name, this.buildUserTool(registration));
    }
    this.enabledTools = new Set(model.enabledTools);
    this.mcpAccessPatterns = [...model.mcpAccessPatterns];
    const store = this.store as Record<string, unknown>;
    for (const key of Object.keys(store)) {
      delete store[key];
    }
    Object.assign(store, model.store);
  }
}
