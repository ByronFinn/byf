import { describe, expect, it, vi } from 'vitest';

import { parseFrame, serializeFrame } from '../src/transport/framed-stream';
import { MethodRouter } from '../src/protocol/methods';
import { SdkBridge } from '../src/sdk-bridge';
import { byfErrorToJsonRpc } from '../src/errors';
import {
  METHOD_EVENT,
  METHOD_REQUEST_APPROVAL,
  METHOD_REQUEST_QUESTION,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from '../src/protocol/frames';

// ── Framing tests ───────────────────────────────────────────────────

describe('NDJSON framing', () => {
  it('round-trips a simple object', () => {
    const obj = { jsonrpc: '2.0', id: 1, method: 'test' };
    const frame = serializeFrame(obj);
    expect(frame).toBe(JSON.stringify(obj));
    expect(frame).not.toContain('\n');

    const parsed = parseFrame(frame);
    expect(parsed).toEqual(obj);
  });

  it('throws on empty input', () => {
    expect(() => parseFrame('')).toThrow('Empty NDJSON frame');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseFrame('not json')).toThrow('Invalid NDJSON frame');
  });

  it('escapes newlines in strings', () => {
    const obj = { text: 'line1\nline2' };
    const frame = serializeFrame(obj);
    // JSON.stringify escapes \n as \\n, so the output has no bare newline
    expect(frame).not.toContain('\n');
    // But the parsed value should have it
    expect(parseFrame(frame)).toEqual(obj);
  });
});

// ── MethodRouter tests ──────────────────────────────────────────────

describe('MethodRouter', () => {
  it('dispatches a registered method', async () => {
    const router = new MethodRouter();
    router.register('test.method', async (params) => ({
      result: 'ok:' + JSON.stringify(params),
    }));

    const result = await router.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'test.method',
      params: { foo: 'bar' },
    });

    expect(result.result).toBe('ok:{"foo":"bar"}');
  });

  it('returns method-not-found for unregistered methods', async () => {
    const router = new MethodRouter();
    const result = await router.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'nonexistent',
    });

    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe(-32601);
  });

  it('never registers disabled plan methods', () => {
    const router = new MethodRouter();

    // Attempt to register plan methods (should be silently ignored)
    const handler = async () => ({ result: null });
    router.register('agent.getPlan', handler);
    router.register('agent.clearPlan', handler);
    router.register('agent.enterPlan', handler);
    router.register('agent.cancelPlan', handler);
    router.register('session.getPlan', handler);
    router.register('session.clearPlan', handler);
    router.register('session.enterPlan', handler);
    router.register('session.cancelPlan', handler);
    router.register('core.getPlan', handler);
    router.register('core.clearPlan', handler);
    router.register('core.enterPlan', handler);
    router.register('core.cancelPlan', handler);

    const registered = router.getRegisteredMethods();
    expect(registered).not.toContain('agent.getPlan');
    expect(registered).not.toContain('agent.clearPlan');
    expect(registered).not.toContain('agent.enterPlan');
    expect(registered).not.toContain('agent.cancelPlan');
    expect(registered).not.toContain('session.getPlan');
    expect(registered).not.toContain('session.clearPlan');
    expect(registered).not.toContain('session.enterPlan');
    expect(registered).not.toContain('session.cancelPlan');
    expect(registered).not.toContain('core.getPlan');
    expect(registered).not.toContain('core.clearPlan');
    expect(registered).not.toContain('core.enterPlan');
    expect(registered).not.toContain('core.cancelPlan');
  });
});

// ── SdkBridge tests ─────────────────────────────────────────────────

function createMockTransport() {
  const sent: string[] = [];
  return {
    sent,
    send: (frame: string) => { sent.push(frame); },
    onMessage: vi.fn(),
    close: vi.fn(),
  };
}

describe('SdkBridge', () => {
  it('sends event as notification', () => {
    const transport = createMockTransport();
    const bridge = new SdkBridge(transport as any);

    const event = { type: 'turn.started', turnId: 1, origin: 'user' };
    bridge.emitEvent(event as any);

    expect(transport.sent).toHaveLength(1);
    const parsed = JSON.parse(transport.sent[0]!) as JsonRpcNotification;
    expect(parsed.jsonrpc).toBe('2.0');
    expect(parsed.method).toBe(METHOD_EVENT);
    expect(parsed.params).toEqual(event);
  });

  it('sends approval as reverse request and resolves on response', async () => {
    const transport = createMockTransport();
    const bridge = new SdkBridge(transport as any);

    const approvalPromise = bridge.requestApproval({
      toolCallId: 'call_1',
      toolName: 'Read',
      action: 'Read file',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      display: { kind: 'file', path: '/test.txt' } as any,
    });

    expect(transport.sent).toHaveLength(1);
    const sentRequest = JSON.parse(transport.sent[0]!) as JsonRpcRequest;
    expect(sentRequest.method).toBe(METHOD_REQUEST_APPROVAL);
    expect(sentRequest.id).toBeDefined();

    // Simulate host response
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: sentRequest.id!,
      result: { decision: 'approved' },
    };
    bridge.handleResponse(response);

    const result = await approvalPromise;
    expect(result.decision).toBe('approved');
  });

  it('rejects all pending on transport close', async () => {
    const transport = createMockTransport();
    const bridge = new SdkBridge(transport as any);

    const approvalPromise = bridge.requestApproval({
      toolCallId: 'call_2',
      toolName: 'Bash',
      action: 'Run command',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      display: { kind: 'shell', command: 'ls' } as any,
    });

    bridge.rejectAll(new Error('transport: peer-terminated'));

    await expect(approvalPromise).rejects.toThrow('transport: peer-terminated');
  });
});

// ── Error mapping tests ─────────────────────────────────────────────

describe('Error mapping', () => {
  it('converts ByfErrorPayload to JSON-RPC error', () => {
    const payload = { code: 'config.invalid', message: 'Invalid config', details: 'missing key' };
    const error = byfErrorToJsonRpc(payload as any);
    expect(error.code).toBe(-32603);
    expect(error.message).toBe('Invalid config');
    expect(error.data).toEqual(payload);
  });
});