/**
 * Compile-time type tests for the BaseChatProvider / BaseStreamedMessage
 * skeletons (#132, ADR 0015).
 *
 * These exist primarily to fail compilation if the abstract contract drifts:
 * a minimal concrete subclass must satisfy every abstract member, and the
 * inherited boilerplate must be reachable. The runtime assertions are a
 * secondary guard that the inherited behavior actually works.
 *
 * Convention follows `type-safety.test.ts`: the file must compile, and a few
 * runtime checks assert behavior of the inherited boilerplate.
 */

import { describe, expect, it } from 'vitest';

import { UNKNOWN_CAPABILITY } from '#/capability';
import type { ModelCapability } from '#/capability';
import type { Message, StreamedMessagePart } from '#/message';
import type { ChatProvider, GenerateOptions, StreamedMessage, ThinkingEffort } from '#/provider';
import { BaseChatProvider, type ResolvedAuth } from '#/providers/base-chat-provider';
import { BaseStreamedMessage } from '#/providers/base-streamed-message';
import type { Tool } from '#/tool';

// --- BaseChatProvider: a minimal concrete subclass must compile ---

interface FakeKwargs {
  temperature?: number;
  [key: string]: unknown;
}

class FakeProvider extends BaseChatProvider<FakeKwargs> implements ChatProvider {
  readonly name = 'fake';

  constructor() {
    super('fake-model', { temperature: 0.5 }, 'key', 'https://example', { X: '1' });
  }

  get thinkingEffort(): ThinkingEffort | null {
    return null;
  }

  getCapability(_model?: string): ModelCapability {
    return UNKNOWN_CAPABILITY;
  }

  async generate(
    _systemPrompt: string,
    _tools: Tool[],
    _history: Message[],
    _options?: GenerateOptions,
  ): Promise<StreamedMessage> {
    throw new Error('not implemented in fake');
  }

  withThinking(_effort: ThinkingEffort): ChatProvider {
    return this;
  }

  protected createRawClient(
    _auth: ResolvedAuth,
    _defaultHeaders: Record<string, string> | undefined,
  ): unknown {
    return {};
  }
}

// --- BaseStreamedMessage: a minimal concrete subclass must compile ---

class FakeStreamedMessage extends BaseStreamedMessage {
  private readonly parts: StreamedMessagePart[];

  constructor(parts: StreamedMessagePart[]) {
    super();
    this.parts = parts;
  }

  protected _buildIter(): AsyncIterable<StreamedMessagePart> {
    const parts = this.parts;
    return (async function* () {
      for (const p of parts) yield p;
    })();
  }
}

describe('BaseChatProvider skeleton (#132)', () => {
  it('exposes the inherited modelName accessor', () => {
    const p = new FakeProvider();
    expect(p.modelName).toBe('fake-model');
  });

  it('exposes the inherited modelParameters accessor (model + kwargs merged)', () => {
    const p = new FakeProvider();
    expect(p.modelParameters).toEqual({ model: 'fake-model', temperature: 0.5 });
  });

  it('withGenerationKwargs returns a clone with merged kwargs, not mutating the original', () => {
    const p = new FakeProvider();
    const next = p.withGenerationKwargs({ temperature: 0.9 });
    expect(next).not.toBe(p);
    expect(p.modelParameters).toEqual({ model: 'fake-model', temperature: 0.5 });
    expect(next.modelParameters).toEqual({ model: 'fake-model', temperature: 0.9 });
  });

  it('_clone produces a deep-copied _generationKwargs (mutating clone does not affect original)', () => {
    const p = new FakeProvider();
    const clone = p.withGenerationKwargs({ temperature: 0.2 });
    // Mutate the clone's kwargs via another merge; original must be untouched.
    clone.withGenerationKwargs({ foo: 'bar' });
    expect(p.modelParameters).toEqual({ model: 'fake-model', temperature: 0.5 });
  });
});

describe('BaseStreamedMessage skeleton (#132)', () => {
  it('defaults all fields to null and forwards iteration', async () => {
    const parts: StreamedMessagePart[] = [{ type: 'text', text: 'hi' }];
    const msg = new FakeStreamedMessage(parts);
    expect(msg.id).toBeNull();
    expect(msg.usage).toBeNull();
    expect(msg.finishReason).toBeNull();
    expect(msg.rawFinishReason).toBeNull();

    const collected: StreamedMessagePart[] = [];
    for await (const part of msg) collected.push(part);
    expect(collected).toEqual(parts);
  });
});
