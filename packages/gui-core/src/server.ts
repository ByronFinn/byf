import process from 'node:process';

import { ByfHarness } from '@byfriends/sdk';
import type { Event, Session } from '@byfriends/sdk';

import { StdioTransport } from './transport/stdio-transport';
import type { Transport } from './transport/transport';
import { parseFrame, serializeFrame } from './transport/framed-stream';
import { MethodRouter } from './protocol/methods';
import { SdkBridge } from './sdk-bridge';
import {
  type JsonRpcRequest,
  type JsonRpcResponse,
  METHOD_CORE_CLOSE_SESSION,
  METHOD_CORE_CREATE_SESSION,
  METHOD_CORE_GET_BYF_CONFIG,
  METHOD_CORE_LIST_MCP_SERVERS,
  METHOD_CORE_LIST_SESSIONS,
  METHOD_CORE_RECONNECT_MCP_SERVER,
  METHOD_CORE_RESUME_SESSION,
  METHOD_CORE_SET_BYF_CONFIG,
  METHOD_SESSION_CANCEL,
  METHOD_SESSION_COMPACT,
  METHOD_SESSION_PROMPT,
  METHOD_SESSION_SET_MODEL,
  METHOD_SESSION_SET_PERMISSION,
  METHOD_SESSION_SET_THINKING,
  METHOD_SESSION_STEER,
  METHOD_AGENT_ACTIVATE_SKILL,
  METHOD_AGENT_GET_BACKGROUND,
  METHOD_AGENT_GET_CONFIG,
  METHOD_AGENT_GET_CONTEXT,
  METHOD_AGENT_GET_PERMISSION,
  METHOD_AGENT_GET_TOOLS,
  METHOD_AGENT_GET_USAGE,
  METHOD_AGENT_LIST_SKILLS,
  METHOD_AGENT_STOP_BACKGROUND,
  METHOD_WORKSPACE_SUGGEST_FILES,
} from './protocol/frames';
import { JSONRPC_ERROR_PARSE, JSONRPC_ERROR_INVALID_REQUEST, toJsonRpcError } from './errors';
import { suggestFiles } from './workspace/suggest-files';

export interface GuiCoreServerOptions {
  readonly transport?: Transport;
  /**
   * Factory used to build the underlying {@link ByfHarness}. Production wires
   * the real harness; tests inject a fake to exercise the dispatcher without a
   * session store on disk.
   */
  readonly harnessFactory?: (options: HarnessStartOptions) => ByfHarness | Promise<ByfHarness>;
}

/** Inputs passed to {@link GuiCoreServerOptions.harnessFactory}. */
export interface HarnessStartOptions {
  readonly homeDir: string | undefined;
  readonly configPath: string | undefined;
  readonly uiMode: 'gui';
}

export class GuiCoreServer {
  private readonly transport: Transport;
  private readonly router = new MethodRouter();
  private readonly harnessFactory:
    | ((options: HarnessStartOptions) => ByfHarness | Promise<ByfHarness>)
    | undefined;
  private bridge!: SdkBridge;
  private harness!: ByfHarness;

  constructor(options: GuiCoreServerOptions = {}) {
    this.transport = options.transport ?? new StdioTransport();
    this.harnessFactory = options.harnessFactory;
    this.transport.onMessage((frame: string) => {
      this.dispatchFrame(frame);
    });
  }

  async start(): Promise<void> {
    const startOptions: HarnessStartOptions = {
      homeDir: process.env['BYF_HOME'] ?? undefined,
      configPath: process.env['BYF_CONFIG_PATH'] ?? undefined,
      uiMode: 'gui',
    };
    this.harness = this.harnessFactory
      ? await this.harnessFactory(startOptions)
      : new ByfHarness(startOptions);

    this.bridge = new SdkBridge(this.transport);

    this.registerMethods();

    process.on('exit', () => {
      this.bridge?.rejectAll(new Error('Server shutting down'));
    });
  }

  // ── Method registration ────────────────────────────────────────────

  private registerMethods(): void {
    this.registerCoreMethods();
    this.registerSessionMethods();
    this.registerAgentMethods();
  }

  private registerCoreMethods(): void {
    const h = this.harness;

    this.router.register(METHOD_CORE_LIST_SESSIONS, async (params) => {
      const result = await h.listSessions(params as any);
      return { result };
    });
    this.router.register(METHOD_CORE_CREATE_SESSION, async (params) => {
      const session = await h.createSession(params as any);
      this.attachBridge(session);
      return { result: this.sessionRef(session) };
    });
    this.router.register(METHOD_CORE_RESUME_SESSION, async (params) => {
      const session = await h.resumeSession(params as any);
      this.attachBridge(session);
      return { result: this.sessionRef(session) };
    });
    this.router.register(METHOD_CORE_CLOSE_SESSION, async (params) => {
      await h.closeSession((params as any).id);
      return { result: null };
    });
    this.router.register(METHOD_CORE_GET_BYF_CONFIG, async (params) => {
      const result = await h.getConfig((params as any) ?? {});
      return { result };
    });
    this.router.register(METHOD_CORE_SET_BYF_CONFIG, async (params) => {
      const result = await h.setConfig(params as any);
      return { result };
    });
    this.router.register(METHOD_CORE_LIST_MCP_SERVERS, async (params) => {
      const session = await this.requireSession(params);
      const result = await session.listMcpServers();
      return { result };
    });
    this.router.register(METHOD_CORE_RECONNECT_MCP_SERVER, async (params) => {
      const session = await this.requireSession(params);
      await session.reconnectMcpServer((params as any).name);
      return { result: null };
    });

    // Workspace utilities (GUI-specific, not through ByfHarness)
    this.router.register(METHOD_WORKSPACE_SUGGEST_FILES, async (params) => {
      const result = await suggestFiles(params as any);
      return { result };
    });
  }

  private registerSessionMethods(): void {
    this.router.register(METHOD_SESSION_PROMPT, async (params) => {
      const session = await this.requireSession(params);
      await session.prompt((params as any).input ?? (params as any).text);
      return { result: null };
    });
    this.router.register(METHOD_SESSION_STEER, async (params) => {
      const session = await this.requireSession(params);
      await session.steer((params as any).input ?? (params as any).text);
      return { result: null };
    });
    this.router.register(METHOD_SESSION_CANCEL, async (params) => {
      const session = await this.requireSession(params);
      await session.cancel();
      return { result: null };
    });
    this.router.register(METHOD_SESSION_SET_MODEL, async (params) => {
      const session = await this.requireSession(params);
      await session.setModel((params as any).model);
      return { result: null };
    });
    this.router.register(METHOD_SESSION_SET_THINKING, async (params) => {
      const session = await this.requireSession(params);
      await session.setThinking((params as any).level ?? (params as any).thinking);
      return { result: null };
    });
    this.router.register(METHOD_SESSION_SET_PERMISSION, async (params) => {
      const session = await this.requireSession(params);
      await session.setPermission((params as any).mode);
      return { result: null };
    });
    this.router.register(METHOD_SESSION_COMPACT, async (params) => {
      const session = await this.requireSession(params);
      await session.compact((params as any) ?? {});
      return { result: null };
    });
  }

  private registerAgentMethods(): void {
    // Session does not expose raw context/config/permission/tools getters;
    // getStatus() aggregates them into a single snapshot (model, thinking,
    // permission, context/usage). Map the agent.* queries onto that snapshot
    // so the host gets the fields it actually needs for the settings panel
    // and tool/usage display.
    this.router.register(METHOD_AGENT_GET_CONTEXT, async (params) => {
      const session = await this.requireSession(params);
      const status = await session.getStatus();
      return {
        result: {
          contextTokens: status.contextTokens,
          maxContextTokens: status.maxContextTokens,
          contextUsage: status.contextUsage,
        },
      };
    });
    this.router.register(METHOD_AGENT_GET_CONFIG, async (params) => {
      const session = await this.requireSession(params);
      const status = await session.getStatus();
      return { result: { model: status.model, thinkingLevel: status.thinkingLevel } };
    });
    this.router.register(METHOD_AGENT_GET_PERMISSION, async (params) => {
      const session = await this.requireSession(params);
      const status = await session.getStatus();
      return { result: { permission: status.permission } };
    });
    this.router.register(METHOD_AGENT_GET_USAGE, async (params) => {
      const session = await this.requireSession(params);
      const result = await session.getUsage();
      return { result };
    });
    this.router.register(METHOD_AGENT_GET_TOOLS, async (params) => {
      const session = await this.requireSession(params);
      const status = await session.getStatus();
      return { result: { model: status.model, usage: status.usage } };
    });
    this.router.register(METHOD_AGENT_LIST_SKILLS, async (params) => {
      const session = await this.requireSession(params);
      const result = await session.listSkills();
      return { result };
    });
    this.router.register(METHOD_AGENT_ACTIVATE_SKILL, async (params) => {
      const session = await this.requireSession(params);
      await session.activateSkill((params as any).name, (params as any).args);
      return { result: null };
    });
    this.router.register(METHOD_AGENT_GET_BACKGROUND, async (params) => {
      const session = await this.requireSession(params);
      const result = await session.listBackgroundTasks((params as any) ?? {});
      return { result };
    });
    this.router.register(METHOD_AGENT_STOP_BACKGROUND, async (params) => {
      const session = await this.requireSession(params);
      await session.stopBackgroundTask((params as any).taskId, (params as any) ?? {});
      return { result: null };
    });
  }

  // ── Bridge wiring ──────────────────────────────────────────────────

  /**
   * Route a session's engine callbacks through the JSON-RPC transport:
   * events become notifications, approval/question calls become reverse
   * requests the host must answer. Called once per session at create/resume.
   */
  private attachBridge(session: Session): void {
    session.onEvent((event: Event) => {
      this.bridge.emitEvent(event);
    });
    session.setApprovalHandler((request) => this.bridge.requestApproval(request));
    session.setQuestionHandler((request) => this.bridge.requestQuestion(request));
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private async requireSession(params: unknown): Promise<Session> {
    const id = (params as { sessionId?: string; id?: string } | null | undefined)?.sessionId
      ?? (params as { sessionId?: string; id?: string } | null | undefined)?.id;
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('sessionId is required');
    }
    const session = this.harness.getSession(id);
    if (session === undefined) {
      throw new Error(`Session not found: ${id}`);
    }
    return session;
  }

  private sessionRef(session: Session): { id: string; workDir: string } {
    return { id: session.id, workDir: session.workDir };
  }

  // ── Frame dispatch ─────────────────────────────────────────────────

  private dispatchFrame(raw: string): void {
    let msg: JsonRpcRequest | JsonRpcResponse;
    try {
      msg = parseFrame(raw) as JsonRpcRequest | JsonRpcResponse;
    } catch {
      this.sendError(null, JSONRPC_ERROR_PARSE);
      return;
    }

    if (typeof (msg as unknown as Record<string, unknown>)['jsonrpc'] !== 'string') {
      this.sendError(null, JSONRPC_ERROR_INVALID_REQUEST);
      return;
    }

    const m = msg as unknown as Record<string, unknown>;
    if (m['id'] !== undefined && typeof m['method'] === 'string') {
      void this.handleRequest(msg as unknown as JsonRpcRequest);
    } else if (m['id'] !== undefined && m['result'] !== undefined) {
      // Response — route to bridge (reverse-RPC reply from host)
      this.bridge.handleResponse(msg as JsonRpcResponse);
    } else {
      this.sendError(m['id'] as number | string | null ?? null, JSONRPC_ERROR_INVALID_REQUEST);
    }
  }

  private async handleRequest(request: JsonRpcRequest): Promise<void> {
    try {
      const result = await this.router.dispatch(request);
      this.sendResponse(request.id, result.result, result.error);
    } catch (error) {
      this.sendResponse(request.id, undefined, toJsonRpcError(error));
    }
  }

  private sendResponse(
    id: number | string,
    result: unknown,
    error?: { code: number; message: string; data?: unknown },
  ): void {
    const response: JsonRpcResponse = { jsonrpc: '2.0', id, result: result ?? null, error };
    this.transport.send(serializeFrame(response));
  }

  private sendError(id: number | string | null, error: { code: number; message: string }): void {
    const response = {
      jsonrpc: '2.0',
      id: id ?? -1,
      error,
    };
    this.transport.send(serializeFrame(response));
  }
}
