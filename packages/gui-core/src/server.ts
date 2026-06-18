import process from 'node:process';

import { ByfHarness } from '@byfriends/sdk';
import type { Event } from '@byfriends/sdk';

import { StdioTransport } from './transport/stdio-transport';
import type { Transport } from './transport/transport';
import { parseFrame, serializeFrame } from './transport/framed-stream';
import { MethodRouter } from './protocol/methods';
import { SdkBridge } from './sdk-bridge';
import {
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './protocol/frames';
import { JSONRPC_ERROR_PARSE, JSONRPC_ERROR_INVALID_REQUEST, toJsonRpcError } from './errors';

export interface GuiCoreServerOptions {
  readonly transport?: Transport;
}

export class GuiCoreServer {
  private readonly transport: Transport;
  private readonly router = new MethodRouter();
  private bridge!: SdkBridge;
  private harness: ByfHarness | null = null;

  constructor(options: GuiCoreServerOptions = {}) {
    this.transport = options.transport ?? new StdioTransport();
    this.transport.onMessage((frame: string) => {
      this.dispatchFrame(frame);
    });
  }

  async start(): Promise<void> {
    this.harness = new ByfHarness({
      homeDir: process.env['BYF_HOME'] || undefined,
      configPath: process.env['BYF_CONFIG_PATH'] || undefined,
      uiMode: 'gui',
    });

    this.bridge = new SdkBridge(this.transport);

    this.registerCoreMethods();

    process.on('exit', () => {
      this.bridge?.rejectAll(new Error('Server shutting down'));
    });
  }

  private registerCoreMethods(): void {
    const h = this.harness!;

    this.router.register('core.listSessions', async (params) => {
      const result = await h.listSessions(params as any);
      return { result };
    });
    this.router.register('core.createSession', async (params) => {
      const result = await h.createSession(params as any);
      return { result: { id: result.id, workDir: result.workDir } };
    });
    this.router.register('core.resumeSession', async (params) => {
      const result = await h.resumeSession(params as any);
      return { result: { id: result.id, workDir: result.workDir } };
    });
    this.router.register('core.closeSession', async (params) => {
      await h.closeSession(params as any);
      return { result: null };
    });
  }

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
      // Request
      void this.handleRequest(msg as unknown as JsonRpcRequest);
    } else if (m['id'] !== undefined && m['result'] !== undefined) {
      // Response — route to bridge
      this.bridge.handleResponse(msg as JsonRpcResponse);
    } else {
      this.sendError(m['id'] as number | string | null ?? null, JSONRPC_ERROR_INVALID_REQUEST);
    }
  }

  private async handleRequest(request: JsonRpcRequest): Promise<void> {
    try {
      const result = await this.router.dispatch(request);
      this.sendResponse(request.id, result.result, result.error);
    } catch (err) {
      this.sendResponse(request.id, undefined, toJsonRpcError(err));
    }
  }

  private sendResponse(
    id: number | string,
    result?: unknown,
    error?: { code: number; message: string; data?: unknown },
  ): void {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      result: result ?? null,
      ...(error !== undefined ? { error } : {}),
    } as JsonRpcResponse;
    this.transport.send(serializeFrame(response));
  }

  private sendError(
    id: number | string | null,
    error: { code: number; message: string },
  ): void {
    const response = {
      jsonrpc: '2.0',
      id: id ?? -1,
      error,
    };
    this.transport.send(serializeFrame(response));
  }
}