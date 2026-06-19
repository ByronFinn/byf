import { describe, expect, it, vi } from 'vitest';

import { GuiCoreServer } from '../src/server';
import type { HarnessStartOptions } from '../src/server';
import type { Transport } from '../src/transport/transport';
import {
  METHOD_EVENT,
  METHOD_REQUEST_APPROVAL,
  METHOD_SESSION_PROMPT,
  METHOD_AGENT_ACTIVATE_SKILL,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from '../src/protocol/frames';

/**
 * Integration coverage for the gui-core dispatcher. The unit tests in
 * gui-core.test.ts exercise SdkBridge and MethodRouter in isolation; these
 * tests prove the three integration guarantees that slipped through before:
 *
 *   1. A host→core request gets a response frame back on the transport
 *      (AC3 — the readiness probe round-trip).
 *   2. An engine emitEvent surfaces on the transport as an `event`
 *      notification (AC4 — the bridge is actually wired).
 *   3. An engine requestApproval surfaces as a reverse request and resolves
 *      when the host replies (AC4 — reverse RPC end-to-end).
 *   4. All the session/agent methods the Swift UI calls are registered
 *      (no more method-not-found for session.prompt / agent.activateSkill).
 *
 * A loopback transport wires the server's send() output back into a buffer
 * the test reads — same shape as the Swift host reading stdout. A fake
 * harness avoids needing a session store on disk while still driving the
 * real attachBridge() path (onEvent/setApprovalHandler/setQuestionHandler).
 */

// ── Test doubles ────────────────────────────────────────────────────

/** Records emitted approval/question handlers so tests can fire them. */
interface FakeSession {
  readonly id: string;
  readonly workDir: string;
  onEvent: (listener: (event: unknown) => void) => () => void;
  setApprovalHandler: (handler: ((r: unknown) => Promise<unknown>) | undefined) => void;
  setQuestionHandler: (handler: ((r: unknown) => Promise<unknown>) | undefined) => void;
}

function buildFakeHarness() {
  const sessions = new Map<string, FakeSession>();
  const listeners: ((event: unknown) => void)[] = [];
  let approvalHandler: ((r: unknown) => Promise<unknown>) | undefined;
  let questionHandler: ((r: unknown) => Promise<unknown>) | undefined;

  const createSession = (id: string): FakeSession => {
    const session: FakeSession = {
      id,
      workDir: `/tmp/${id}`,
      onEvent: (listener) => {
        listeners.push(listener);
        return () => {};
      },
      setApprovalHandler: (h) => {
        approvalHandler = h;
      },
      setQuestionHandler: (h) => {
        questionHandler = h;
      },
    };
    sessions.set(id, session);
    return session;
  };

  return {
    sessions,
    createSession,
    // Triggers — let a test simulate the engine emitting / reverse-requesting.
    fireEvent(event: unknown): void {
      for (const l of listeners) l(event);
    },
    async fireApproval(request: unknown): Promise<unknown> {
      if (!approvalHandler) throw new Error('no approval handler registered');
      return approvalHandler(request);
    },
    async fireQuestion(request: unknown): Promise<unknown> {
      if (!questionHandler) throw new Error('no question handler registered');
      return questionHandler(request);
    },
  };
}

/** Loopback transport: sent frames land in `sent`; `deliver` feeds inbound. */
function createLoopbackTransport(): Transport & {
  sent: string[];
  deliver(frame: string): void;
} {
  const sent: string[] = [];
  let inbound: ((frame: string) => void) | null = null;
  return {
    sent,
    onMessage(handler) {
      inbound = handler;
    },
    send(frame) {
      sent.push(frame);
    },
    close() {},
    deliver(frame) {
      inbound?.(frame);
    },
  };
}

function parseOutgoing<T = JsonRpcResponse | JsonRpcNotification>(transport: { sent: string[] }, index = 0): T {
  return JSON.parse(transport.sent[index]!) as T;
}

async function withServer(
  fn: (server: GuiCoreServer, transport: ReturnType<typeof createLoopbackTransport>, fake: ReturnType<typeof buildFakeHarness>) => Promise<void>,
): Promise<void> {
  const fake = buildFakeHarness();
  const transport = createLoopbackTransport();
  const server = new GuiCoreServer({
    transport,
    harnessFactory: (() => ({
      // Minimal harness stub satisfying what registerMethods() touches.
      listSessions: async () => [],
      createSession: async () => fake.createSession('sess-1'),
      resumeSession: async () => fake.createSession('sess-2'),
      closeSession: async () => {},
      getConfig: async () => ({}),
      setConfig: async () => ({}),
      getSession: (id: string) => fake.sessions.get(id) as any,
    })) as any,
  });
  await server.start();
  await fn(server, transport, fake);
}

// ── Tests ───────────────────────────────────────────────────────────

describe('GuiCoreServer integration', () => {
  it('round-trips a core.listSessions request → response (AC3 readiness probe)', async () => {
    await withServer(async (_server, transport) => {
      transport.deliver(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'core.listSessions', params: {} }));

      // Let the async handler flush.
      await vi.waitFor(() => expect(transport.sent).toHaveLength(1));
      const response = parseOutgoing<JsonRpcResponse>(transport);
      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.error).toBeUndefined();
      expect(Array.isArray(response.result)).toBe(true);
    });
  });

  it('routes an engine emitEvent to an `event` notification (AC4 bridge wiring)', async () => {
    await withServer(async (_server, transport, fake) => {
      // createSession attaches the bridge (onEvent → bridge.emitEvent).
      transport.deliver(
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'core.createSession', params: {} }),
      );
      await vi.waitFor(() => expect(transport.sent).toHaveLength(1));

      // Engine emits an event through the session listener the bridge subscribed.
      const event = { type: 'assistant.delta', sessionId: 'sess-1', delta: 'hello' };
      fake.fireEvent(event);

      await vi.waitFor(() => expect(transport.sent).toHaveLength(2));
      const notification = parseOutgoing<JsonRpcNotification>(transport, 1);
      expect(notification.jsonrpc).toBe('2.0');
      expect(notification.method).toBe(METHOD_EVENT);
      expect(notification.params).toEqual(event);
    });
  });

  it('surfaces requestApproval as a reverse request and resolves on host reply (AC4 reverse RPC)', async () => {
    await withServer(async (_server, transport, fake) => {
      transport.deliver(
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'core.createSession', params: {} }),
      );
      await vi.waitFor(() => expect(transport.sent).toHaveLength(1));

      // Engine fires an approval through the handler the bridge subscribed.
      const approvalPromise = fake.fireApproval({
        toolCallId: 'call_1',
        toolName: 'Read',
        action: 'Read file',
        display: { kind: 'file', path: '/a.txt' },
      });

      // The reverse request must land on the transport.
      await vi.waitFor(() => expect(transport.sent).toHaveLength(2));
      const reverse = parseOutgoing<JsonRpcRequest>(transport, 1);
      expect(reverse.method).toBe(METHOD_REQUEST_APPROVAL);
      expect(reverse.id).toBeDefined();

      // Host replies with the matching id.
      transport.deliver(
        JSON.stringify({ jsonrpc: '2.0', id: reverse.id, result: { decision: 'approved' } }),
      );

      const result = (await approvalPromise) as { decision: string };
      expect(result.decision).toBe('approved');
    });
  });

  it('registers the session.* / agent.* methods the Swift UI calls', async () => {
    await withServer(async (server, transport, _fake) => {
      for (const method of [METHOD_SESSION_PROMPT, METHOD_AGENT_ACTIVATE_SKILL]) {
        transport.sent.length = 0;
        transport.deliver(
          JSON.stringify({ jsonrpc: '2.0', id: 7, method, params: { sessionId: 'sess-1', text: 'hi', name: 'x' } }),
        );
        await vi.waitFor(() => expect(transport.sent).toHaveLength(1));
        const response = parseOutgoing<JsonRpcResponse>(transport);
        // Not method-not-found (-32601). A downstream SDK error from the fake
        // is acceptable here — we only assert the dispatcher recognized it.
        expect(response.error?.code).not.toBe(-32601);
      }
      // sanity: unregistered method still 404s
      transport.sent.length = 0;
      transport.deliver(JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'nope.nope', params: {} }));
      await vi.waitFor(() => expect(transport.sent).toHaveLength(1));
      expect(parseOutgoing<JsonRpcResponse>(transport).error?.code).toBe(-32601);
      void server;
    });
  });

  it('returns method-not-found for plan methods (ADR 0008 guard survives registration)', async () => {
    await withServer(async (_server, transport) => {
      transport.deliver(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'session.getPlan', params: {} }));
      await vi.waitFor(() => expect(transport.sent).toHaveLength(1));
      expect(parseOutgoing<JsonRpcResponse>(transport).error?.code).toBe(-32601);
    });
  });
});
