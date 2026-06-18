import type {
  ApprovalRequest,
  ApprovalResponse,
  Event,
  QuestionRequest,
  QuestionResult,
  ToolCallRequest,
  ToolCallResponse,
} from '@byfriends/sdk';

import type { Transport } from './transport/transport';
import {
  METHOD_EVENT,
  METHOD_REQUEST_APPROVAL,
  METHOD_REQUEST_QUESTION,
  METHOD_TOOL_CALL,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './protocol/frames';

/**
 * Pending reverse-RPC request awaiting a response from the host.
 */
interface PendingRequest {
  readonly method: string;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

/**
 * Bridges the ByfHarness SDKAPI callbacks to the JSON-RPC transport.
 *
 * - emitEvent → notification (no id)
 * - requestApproval → reverse request (with id)
 * - requestQuestion → reverse request (with id)
 * - toolCall → reverse request (with id)
 */
export class SdkBridge {
  private nextId = 1;
  private readonly pending = new Map<number | string, PendingRequest>();

  constructor(private readonly transport: Transport) {}

  /** Handle an incoming response for a reverse-RPC request. */
  handleResponse(response: JsonRpcResponse): void {
    const pending = this.pending.get(response.id);
    if (pending === undefined) return; // Unknown id, ignore
    this.pending.delete(response.id);

    if (response.error !== undefined) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  /** Handle transport close — reject all pending reverse requests. */
  rejectAll(err?: Error): void {
    const rejection = err ?? new Error('transport: peer-terminated');
    for (const [, pending] of this.pending) {
      pending.reject(rejection);
    }
    this.pending.clear();
  }

  // ── SDKAPI callback implementations ───────────────────────────────

  emitEvent(event: Event): void {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method: METHOD_EVENT,
      params: event,
    };
    this.transport.send(JSON.stringify(notification));
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
    const id = this.nextId++;
    const jsonRpcRequest: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method: METHOD_REQUEST_APPROVAL,
      params: request,
    };
    this.transport.send(JSON.stringify(jsonRpcRequest));
    return new Promise<ApprovalResponse>((resolve, reject) => {
      this.pending.set(id, { method: METHOD_REQUEST_APPROVAL, resolve: resolve as (value: unknown) => void, reject });
    });
  }

  async requestQuestion(request: QuestionRequest): Promise<QuestionResult> {
    const id = this.nextId++;
    const jsonRpcRequest: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method: METHOD_REQUEST_QUESTION,
      params: request,
    };
    this.transport.send(JSON.stringify(jsonRpcRequest));
    return new Promise<QuestionResult>((resolve, reject) => {
      this.pending.set(id, { method: METHOD_REQUEST_QUESTION, resolve: resolve as (value: unknown) => void, reject });
    });
  }

  async toolCall(request: ToolCallRequest): Promise<ToolCallResponse> {
    const id = this.nextId++;
    const jsonRpcRequest: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method: METHOD_TOOL_CALL,
      params: request,
    };
    this.transport.send(JSON.stringify(jsonRpcRequest));
    return new Promise<ToolCallResponse>((resolve, reject) => {
      this.pending.set(id, { method: METHOD_TOOL_CALL, resolve: resolve as (value: unknown) => void, reject });
    });
  }
}