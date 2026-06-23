import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport, SseError } from '@modelcontextprotocol/sdk/client/sse.js';

import type { McpServerSseConfig } from '#/config/schema';

import {
  buildMcpHttpHeaders,
  buildRequestOptions,
  BYF_MCP_CLIENT_NAME,
  BYF_MCP_CLIENT_VERSION,
  toMcpToolDefinition,
  toMcpToolResult,
  type UnexpectedCloseListener,
  type UnexpectedCloseReason,
} from './client-shared';
import type { MCPClient, MCPToolDefinition, MCPToolResult } from './types';

export interface SseMcpClientOptions {
  readonly clientName?: string;
  readonly clientVersion?: string;
  readonly toolCallTimeoutMs?: number;
  readonly envLookup?: (name: string) => string | undefined;
  readonly fetch?: typeof fetch;
  /**
   * OAuth client provider attached to the transport. Set only when the server
   * has no static token configuration; the SDK uses this to handle 401s with
   * RFC 9728 / RFC 8414 / DCR discovery and PKCE. The connection manager wires
   * this in and surfaces `UnauthorizedError` as a `needs-auth` status.
   */
  readonly oauthProvider?: OAuthClientProvider;
}

/**
 * Wraps the SDK SSE transport as a kosong {@link MCPClient}.
 * Structurally mirrors {@link HttpMcpClient}: constructor builds SDK transport
 * + Client, `connect()` installs hooks before handshake, `onUnexpectedClose()`
 * with buffered replay, ready/closed latches.
 *
 * Static bearer tokens are looked up from `process.env[bearerTokenEnvVar]`.
 */
export class SseMcpClient implements MCPClient {
  private readonly client: Client;
  private readonly transport: SSEClientTransport;
  private readonly toolCallTimeoutMs?: number;
  private started = false;
  private closed = false;
  private ready = false;
  private hooksInstalled = false;
  private unexpectedCloseListener: UnexpectedCloseListener | undefined;
  private lastTransportError: Error | undefined;
  private pendingUnexpectedClose: UnexpectedCloseReason | undefined;
  private unexpectedCloseFired = false;

  constructor(config: McpServerSseConfig, options: SseMcpClientOptions = {}) {
    const envLookup = options.envLookup ?? ((name) => process.env[name]);
    const headers = buildMcpHttpHeaders(config, envLookup);

    this.transport = new SSEClientTransport(new URL(config.url), {
      requestInit: headers !== undefined ? { headers } : undefined,
      fetch: options.fetch,
      authProvider: options.oauthProvider,
    });
    this.client = new Client({
      name: options.clientName ?? BYF_MCP_CLIENT_NAME,
      version: options.clientVersion ?? BYF_MCP_CLIENT_VERSION,
    });
    this.toolCallTimeoutMs = options.toolCallTimeoutMs;
  }

  async connect(): Promise<void> {
    if (this.closed) {
      throw new Error('MCP SSE client is closed');
    }
    if (this.started) return;
    this.started = true;
    // Install hooks BEFORE the SDK handshake.
    this.installTransportHooks();
    try {
      await this.client.connect(this.transport);
    } catch (error) {
      await this.closeStartedClient();
      throw error;
    }
    if (this.closed) {
      await this.closeStartedClient();
      throw new Error('MCP SSE client was closed during startup');
    }
    this.ready = true;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.closeStartedClient();
  }

  /**
   * Register a listener for unsolicited transport drops. If the transport
   * already signalled a terminal failure, the buffered reason is replayed
   * synchronously.
   */
  onUnexpectedClose(listener: UnexpectedCloseListener): void {
    this.unexpectedCloseListener = listener;
    const pending = this.pendingUnexpectedClose;
    if (pending !== undefined) {
      this.pendingUnexpectedClose = undefined;
      listener(pending);
    }
  }

  async listTools(): Promise<MCPToolDefinition[]> {
    const result = await this.client.listTools();
    return result.tools.map(toMcpToolDefinition);
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<MCPToolResult> {
    const requestOptions = buildRequestOptions(this.toolCallTimeoutMs, signal);
    const result = await this.client.callTool({ name, arguments: args }, undefined, requestOptions);
    return toMcpToolResult(result);
  }

  private async closeStartedClient(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    await this.client.close();
  }

  private installTransportHooks(): void {
    if (this.hooksInstalled) return;
    this.hooksInstalled = true;
    // Mirror HttpMcpClient: the SDK Client sets up transport.onclose/onerror
    // during its own handshake, so we install listeners on the Client object.
    this.client.onclose = () => {
      if (this.closed) return;
      // Handshake-phase close surfaces via `client.connect()` throwing.
      if (!this.ready) return;
      this.fireUnexpectedClose({ error: this.lastTransportError });
    };
    // SSE's underlying eventsource library reconnects indefinitely on
    // transient errors. Only terminal errors (SseError code 204, Unauthorized)
    // should fire unexpected close.
    this.client.onerror = (error) => {
      this.lastTransportError = error;
      if (this.closed) return;
      if (!this.ready) return;
      if (isTerminalSseError(error)) {
        this.fireUnexpectedClose({ error });
      }
    };
  }

  private fireUnexpectedClose(reason: UnexpectedCloseReason): void {
    if (this.unexpectedCloseFired) return;
    this.unexpectedCloseFired = true;
    const listener = this.unexpectedCloseListener;
    if (listener !== undefined) {
      listener(reason);
    } else {
      this.pendingUnexpectedClose = reason;
    }
  }
}

/**
 * Returns true when an error reported by the SSE transport indicates the
 * connection is dead and will not auto-recover.
 *
 * SSE's underlying `eventsource` library reconnects indefinitely on
 * transient errors, so most errors are non-terminal. Only two signals
 * mean "give up":
 *
 * - `SseError` with `code === 204` — the server sent an HTTP 204 No Content
 *   response as a deliberate close signal.
 * - `/unauthorized/i` in the error message — auth failure; the server will
 *   keep rejecting reconnection attempts.
 *
 * SDK classes `SseError` and `UnauthorizedError` never set `this.name`
 * (it always reads as `'Error'`), so `error.name` checks do NOT work.
 * `instanceof` and message-sniff are required.
 */
export function isTerminalSseError(error: Error): boolean {
  if (error instanceof SseError && error.code === 204) return true;
  if (/unauthorized/i.test(error.message)) return true;
  return false;
}
