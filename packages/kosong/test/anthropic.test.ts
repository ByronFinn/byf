import { ChatProviderError } from '#/errors';
import type { ContentPart, Message, StreamedMessagePart, ToolCall } from '#/message';
import { AnthropicChatProvider, resolveDefaultMaxTokens } from '#/providers/anthropic';
import type { ThinkingEffort } from '#/provider';
import type { Tool } from '#/tool';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function makeAnthropicResponse(model: string = 'k25') {
  return {
    id: 'msg_test_123',
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text: 'Hello' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function createProvider(
  model: string = 'k25',
  metadata?: Record<string, string>,
): AnthropicChatProvider {
  return new AnthropicChatProvider({
    model,
    apiKey: 'test-key',
    defaultMaxTokens: 1024,
    metadata,
    stream: false,
  });
}

function createStreamProvider(model: string = 'k25'): AnthropicChatProvider {
  return new AnthropicChatProvider({
    model,
    apiKey: 'test-key',
    defaultMaxTokens: 1024,
    stream: true,
  });
}

type AnthropicGenerationState = {
  max_tokens?: number | undefined;
  temperature?: number | undefined;
  top_k?: number | undefined;
  top_p?: number | undefined;
  thinking?:
    | { type: 'disabled' }
    | { type: 'adaptive'; display?: string | undefined }
    | undefined;
  output_config?: { effort: string } | undefined;
  betaFeatures?: string[] | undefined;
};

function getGenerationState(provider: AnthropicChatProvider): AnthropicGenerationState {
  return Reflect.get(provider, '_generationKwargs') as AnthropicGenerationState;
}

/** Capture the request body sent to Anthropic by mocking the client (non-stream mode). */
async function captureRequestBody(
  provider: AnthropicChatProvider,
  systemPrompt: string,
  tools: Tool[],
  history: Message[],
  options?: import('#/provider').GenerateOptions,
): Promise<Record<string, unknown>> {
  let capturedParams: Record<string, unknown> | undefined;
  let capturedOptions: Record<string, unknown> | undefined;

  (provider as any)._client.messages.create = vi
    .fn()
    .mockImplementation((params: unknown, opts?: unknown) => {
      capturedParams = params as Record<string, unknown>;
      capturedOptions = opts as Record<string, unknown> | undefined;
      return Promise.resolve(makeAnthropicResponse());
    });

  const stream = await provider.generate(systemPrompt, tools, history, options);
  for await (const part of stream) {
    void part;
  }

  if (capturedParams === undefined) {
    throw new Error('Expected provider.generate() to call messages.create');
  }

  const result = { ...capturedParams };
  if (capturedOptions !== undefined && capturedOptions['headers'] !== undefined) {
    result['_extra_headers'] = capturedOptions['headers'];
  }
  return result;
}

/** Create a mock stream that yields the given events as an async iterable. */
function mockStream(events: unknown[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
  };
}

/** Collect all parts from a StreamedMessage. */
async function collectParts(
  streamedMessage: AsyncIterable<StreamedMessagePart>,
): Promise<StreamedMessagePart[]> {
  const parts: StreamedMessagePart[] = [];
  for await (const part of streamedMessage) {
    parts.push(part);
  }
  return parts;
}

const ADD_TOOL: Tool = {
  name: 'add',
  description: 'Add two integers.',
  parameters: {
    type: 'object',
    properties: {
      a: { type: 'integer', description: 'First number' },
      b: { type: 'integer', description: 'Second number' },
    },
    required: ['a', 'b'],
  },
};

const MUL_TOOL: Tool = {
  name: 'multiply',
  description: 'Multiply two integers.',
  parameters: {
    type: 'object',
    properties: {
      a: { type: 'integer', description: 'First number' },
      b: { type: 'integer', description: 'Second number' },
    },
    required: ['a', 'b'],
  },
};

const B64_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAA' +
  'DUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
describe('AnthropicChatProvider', () => {
  describe('message conversion', () => {
    it('simple user message with system prompt', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello!' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, 'You are helpful.', [], history);

      expect(body['messages']).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello!' }],
        },
      ]);
      expect(body['system']).toEqual([
        { type: 'text', text: 'You are helpful.', cache_control: { type: 'ephemeral' } },
      ]);
    });

    it('multi-turn conversation', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'What is 2+2?' }], toolCalls: [] },
        { role: 'assistant', content: [{ type: 'text', text: '2+2 equals 4.' }], toolCalls: [] },
        { role: 'user', content: [{ type: 'text', text: 'And 3+3?' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      expect(body['messages']).toEqual([
        { role: 'user', content: [{ type: 'text', text: 'What is 2+2?' }] },
        { role: 'assistant', content: [{ type: 'text', text: '2+2 equals 4.' }] },
        {
          role: 'user',
          content: [{ type: 'text', text: 'And 3+3?' }],
        },
      ]);
      // No system when empty
      expect(body['system']).toBeUndefined();
    });

    it('multi-turn with system prompt', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'What is 2+2?' }], toolCalls: [] },
        { role: 'assistant', content: [{ type: 'text', text: '2+2 equals 4.' }], toolCalls: [] },
        { role: 'user', content: [{ type: 'text', text: 'And 3+3?' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, 'You are a math tutor.', [], history);

      expect(body['system']).toEqual([
        { type: 'text', text: 'You are a math tutor.', cache_control: { type: 'ephemeral' } },
      ]);
      expect(body['messages']).toEqual([
        { role: 'user', content: [{ type: 'text', text: 'What is 2+2?' }] },
        { role: 'assistant', content: [{ type: 'text', text: '2+2 equals 4.' }] },
        {
          role: 'user',
          content: [{ type: 'text', text: 'And 3+3?' }],
        },
      ]);
    });

    it('image url content (url source)', async () => {
      const provider = createProvider();
      const history: Message[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: "What's in this image?" },
            { type: 'image_url', imageUrl: { url: 'https://example.com/image.png' } },
          ] satisfies ContentPart[],
          toolCalls: [],
        },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      expect(body['messages']).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: "What's in this image?" },
            {
              type: 'image',
              source: { type: 'url', url: 'https://example.com/image.png' },
            },
          ],
        },
      ]);
    });

    it('tool definitions with cache_control on last tool', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Add 2 and 3' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [ADD_TOOL, MUL_TOOL], history);

      expect(body['tools']).toEqual([
        {
          name: 'add',
          description: 'Add two integers.',
          input_schema: {
            type: 'object',
            properties: {
              a: { type: 'integer', description: 'First number' },
              b: { type: 'integer', description: 'Second number' },
            },
            required: ['a', 'b'],
          },
        },
        {
          name: 'multiply',
          description: 'Multiply two integers.',
          input_schema: {
            type: 'object',
            properties: {
              a: { type: 'integer', description: 'First number' },
              b: { type: 'integer', description: 'Second number' },
            },
            required: ['a', 'b'],
          },
          cache_control: { type: 'ephemeral' },
        },
      ]);
    });

    it('tool call and tool result (Anthropic wire format)', async () => {
      const provider = createProvider();
      const toolCall: ToolCall = {
        type: 'function',
        id: 'call_abc123',
        name: 'add', arguments: '{"a": 2, "b": 3}',
      };
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Add 2 and 3' }], toolCalls: [] },
        {
          role: 'assistant',
          content: [{ type: 'text', text: "I'll add those numbers for you." }],
          toolCalls: [toolCall],
        },
        {
          role: 'tool',
          content: [{ type: 'text', text: '5' }],
          toolCallId: 'call_abc123',
          toolCalls: [],
        },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      // Snapshot of the expected wire format:
      // user message has NO cache_control, assistant has tool_use blocks,
      // final user message's tool_result carries cache_control (last block).
      expect(body['messages']).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Add 2 and 3' }],
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: "I'll add those numbers for you." },
            { type: 'tool_use', id: 'call_abc123', name: 'add', input: { a: 2, b: 3 } },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call_abc123',
              content: [{ type: 'text', text: '5' }],
            },
          ],
        },
      ]);
    });

    it('tool call with image result wraps image source inside tool_result', async () => {
      const provider = createProvider();
      const toolCall: ToolCall = {
        type: 'function',
        id: 'call_abc123',
        name: 'add', arguments: '{"a": 2, "b": 3}',
      };
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Add 2 and 3' }], toolCalls: [] },
        {
          role: 'assistant',
          content: [{ type: 'text', text: "I'll add those numbers for you." }],
          toolCalls: [toolCall],
        },
        {
          role: 'tool',
          content: [
            { type: 'text', text: '5' },
            { type: 'image_url', imageUrl: { url: 'https://example.com/image.png' } },
          ] satisfies ContentPart[],
          toolCallId: 'call_abc123',
          toolCalls: [],
        },
      ];
      const body = await captureRequestBody(provider, '', [], history);
      const messages = body['messages'] as unknown[];

      // Tool result block carries both text and image.
      expect(messages[2]).toEqual({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call_abc123',
            content: [
              { type: 'text', text: '5' },
              {
                type: 'image',
                source: { type: 'url', url: 'https://example.com/image.png' },
              },
            ],
          },
        ],
      });
    });

    it('parallel tool calls and tool results (request body capture)', async () => {
      const provider = createProvider();
      const tcAdd: ToolCall = {
        type: 'function',
        id: 'call_add',
        name: 'add', arguments: '{"a": 2, "b": 3}',
      };
      const tcMul: ToolCall = {
        type: 'function',
        id: 'call_mul',
        name: 'multiply', arguments: '{"a": 4, "b": 5}',
      };
      const history: Message[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Calculate 2+3 and 4*5' }],
          toolCalls: [],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: "I'll calculate both." }],
          toolCalls: [tcAdd, tcMul],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'text',
              text: '<system-reminder>This is a system reminder</system-reminder>',
            },
            { type: 'text', text: '5' },
          ],
          toolCallId: 'call_add',
          toolCalls: [],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'text',
              text: '<system-reminder>This is a system reminder</system-reminder>',
            },
            { type: 'text', text: '20' },
          ],
          toolCallId: 'call_mul',
          toolCalls: [],
        },
      ];
      const body = await captureRequestBody(provider, '', [ADD_TOOL, MUL_TOOL], history);

      // Per the Anthropic Messages API parallel-tool-use spec, all tool_result
      // blocks answering parallel tool_use calls MUST live in a single user
      // message — not split across consecutive user messages. Splitting hard-
      // fails strict Anthropic-compatible backends (HTTP 400) and silently
      // degrades parallel tool use on api.anthropic.com. This asserts:
      //  - exactly 3 messages in the expected order
      //  - both tool_result blocks are bundled in the trailing user message
      expect(body['messages']).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Calculate 2+3 and 4*5' }],
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: "I'll calculate both." },
            { type: 'tool_use', id: 'call_add', name: 'add', input: { a: 2, b: 3 } },
            { type: 'tool_use', id: 'call_mul', name: 'multiply', input: { a: 4, b: 5 } },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call_add',
              content: [
                {
                  type: 'text',
                  text: '<system-reminder>This is a system reminder</system-reminder>',
                },
                { type: 'text', text: '5' },
              ],
            },
            {
              type: 'tool_result',
              tool_use_id: 'call_mul',
              content: [
                {
                  type: 'text',
                  text: '<system-reminder>This is a system reminder</system-reminder>',
                },
                { type: 'text', text: '20' },
              ],
            },
          ],
        },
      ]);
    });

    // Independent assertion-style regression test for the Anthropic
    // parallel-tool-use spec. Documents the spec-required shape without
    // relying on snapshot equality — so if anyone regenerates the
    // snapshot above against buggy (split) output again, this test still
    // fails.
    it('parallel tool_results merged into single trailing user message', async () => {
      const provider = createProvider();
      const tcAdd: ToolCall = {
        type: 'function',
        id: 'call_add',
        name: 'add', arguments: '{"a": 2, "b": 3}',
      };
      const tcMul: ToolCall = {
        type: 'function',
        id: 'call_mul',
        name: 'multiply', arguments: '{"a": 4, "b": 5}',
      };
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Calculate 2+3 and 4*5' }], toolCalls: [] },
        {
          role: 'assistant',
          content: [{ type: 'text', text: "I'll calculate both." }],
          toolCalls: [tcAdd, tcMul],
        },
        {
          role: 'tool',
          content: [{ type: 'text', text: '5' }],
          toolCallId: 'call_add',
          toolCalls: [],
        },
        {
          role: 'tool',
          content: [{ type: 'text', text: '20' }],
          toolCallId: 'call_mul',
          toolCalls: [],
        },
      ];
      const body = await captureRequestBody(provider, '', [ADD_TOOL, MUL_TOOL], history);

      type MsgParam = { role: string; content: Array<{ type: string; tool_use_id?: string }> };
      const msgs = body['messages'] as MsgParam[];

      // 3 messages: initial user prompt, assistant with parallel tool_use,
      // and a single trailing user message carrying BOTH tool_result blocks.
      expect(msgs).toHaveLength(3);
      expect(msgs[0]!.role).toBe('user');
      expect(msgs[1]!.role).toBe('assistant');
      expect(msgs[2]!.role).toBe('user');

      const trailing = msgs[2]!.content;
      expect(trailing).toHaveLength(2);
      expect(trailing[0]!.type).toBe('tool_result');
      expect(trailing[0]!.tool_use_id).toBe('call_add');
      expect(trailing[1]!.type).toBe('tool_result');
      expect(trailing[1]!.tool_use_id).toBe('call_mul');
    });

    // Edge case: single (non-parallel) tool call should NOT trigger merge
    // semantics — the one tool_result sits alone in its own user message,
    // same as before. Guards against an over-eager merge that concatenates
    // across turns.
    it('single tool call: no merge triggered', async () => {
      const provider = createProvider();
      const tcAdd: ToolCall = {
        type: 'function',
        id: 'call_add',
        name: 'add', arguments: '{"a": 2, "b": 3}',
      };
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'What is 2+3?' }], toolCalls: [] },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Calculating.' }],
          toolCalls: [tcAdd],
        },
        {
          role: 'tool',
          content: [{ type: 'text', text: '5' }],
          toolCallId: 'call_add',
          toolCalls: [],
        },
      ];
      const body = await captureRequestBody(provider, '', [ADD_TOOL], history);

      type MsgParam = { role: string; content: Array<{ type: string; tool_use_id?: string }> };
      const msgs = body['messages'] as MsgParam[];

      expect(msgs).toHaveLength(3);
      expect(msgs[2]!.content).toHaveLength(1);
      expect(msgs[2]!.content[0]!.type).toBe('tool_result');
      expect(msgs[2]!.content[0]!.tool_use_id).toBe('call_add');
    });

    // Edge case: 3 parallel tool calls collapse into one user message with
    // 3 tool_result blocks (order preserved).
    it('three parallel tool_results merged in order', async () => {
      const provider = createProvider();
      const makeTc = (id: string, name: string): ToolCall => ({
        type: 'function',
        id,
        name, arguments: '{"a": 1, "b": 1}',
      });
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Do three things' }], toolCalls: [] },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Running.' }],
          toolCalls: [makeTc('c1', 'add'), makeTc('c2', 'multiply'), makeTc('c3', 'add')],
        },
        { role: 'tool', content: [{ type: 'text', text: '2' }], toolCallId: 'c1', toolCalls: [] },
        { role: 'tool', content: [{ type: 'text', text: '1' }], toolCallId: 'c2', toolCalls: [] },
        { role: 'tool', content: [{ type: 'text', text: '2' }], toolCallId: 'c3', toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [ADD_TOOL, MUL_TOOL], history);

      type MsgParam = { role: string; content: Array<{ type: string; tool_use_id?: string }> };
      const msgs = body['messages'] as MsgParam[];

      expect(msgs).toHaveLength(3);
      const trailing = msgs[2]!.content;
      expect(trailing).toHaveLength(3);
      expect(trailing.map((b) => b.tool_use_id)).toEqual(['c1', 'c2', 'c3']);
      expect(trailing.every((b) => b.type === 'tool_result')).toBe(true);
    });

    // Edge case: parallel tool results followed by a plain user text turn —
    // only the tool_result-only user messages merge; the text message stays
    // in its own message (proving the predicate is content-shape-aware, not
    // just role-based).
    it('text turn after parallel tool_results stays separate', async () => {
      const provider = createProvider();
      const tcAdd: ToolCall = {
        type: 'function',
        id: 'call_add',
        name: 'add', arguments: '{"a": 2, "b": 3}',
      };
      const tcMul: ToolCall = {
        type: 'function',
        id: 'call_mul',
        name: 'multiply', arguments: '{"a": 4, "b": 5}',
      };
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Do both' }], toolCalls: [] },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Running.' }],
          toolCalls: [tcAdd, tcMul],
        },
        {
          role: 'tool',
          content: [{ type: 'text', text: '5' }],
          toolCallId: 'call_add',
          toolCalls: [],
        },
        {
          role: 'tool',
          content: [{ type: 'text', text: '20' }],
          toolCallId: 'call_mul',
          toolCalls: [],
        },
        { role: 'user', content: [{ type: 'text', text: 'Now summarize' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [ADD_TOOL, MUL_TOOL], history);

      type MsgParam = {
        role: string;
        content: Array<{ type: string; tool_use_id?: string; text?: string }>;
      };
      const msgs = body['messages'] as MsgParam[];

      // 4 messages: user prompt, assistant tool_use, merged tool_result user, final text user.
      expect(msgs).toHaveLength(4);
      expect(msgs[2]!.content).toHaveLength(2);
      expect(msgs[2]!.content.every((b) => b.type === 'tool_result')).toBe(true);
      expect(msgs[3]!.role).toBe('user');
      expect(msgs[3]!.content).toHaveLength(1);
      expect(msgs[3]!.content[0]!.type).toBe('text');
      expect(msgs[3]!.content[0]!.text).toBe('Now summarize');
    });

    it('assistant with thinking (has encrypted -> ThinkingBlockParam)', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'What is 2+2?' }], toolCalls: [] },
        {
          role: 'assistant',
          content: [
            { type: 'think', think: 'Let me think...', encrypted: 'sig_abc123' },
            { type: 'text', text: 'The answer is 4.' },
          ],
          toolCalls: [],
        },
        { role: 'user', content: [{ type: 'text', text: 'Thanks!' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      // Snapshot of the expected wire format:
      // first user message has NO cache_control, assistant has thinking + text.
      expect(body['messages']).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'What is 2+2?' }],
        },
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'Let me think...', signature: 'sig_abc123' },
            { type: 'text', text: 'The answer is 4.' },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Thanks!' }],
        },
      ]);
    });

    it('thinking without signature is stripped', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] },
        {
          role: 'assistant',
          content: [
            { type: 'think', think: 'Thinking...' },
            { type: 'text', text: 'Hello!' },
          ],
          toolCalls: [],
        },
        { role: 'user', content: [{ type: 'text', text: 'Bye' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);
      const messages = body['messages'] as unknown[];

      // Assistant message should have thinking stripped (no encrypted)
      expect(messages[1]).toEqual({
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello!' }],
      });
    });

    it('base64 image', async () => {
      const provider = createProvider();
      const history: Message[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe:' },
            {
              type: 'image_url',
              imageUrl: { url: `data:image/png;base64,${B64_PNG}` },
            },
          ] satisfies ContentPart[],
          toolCalls: [],
        },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      expect(body['messages']).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe:' },
            {
              type: 'image',
              source: { type: 'base64', data: B64_PNG, media_type: 'image/png' },
            },
          ],
        },
      ]);
    });

    it('redacted thinking (empty think with encrypted)', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'What is 2+2?' }], toolCalls: [] },
        {
          role: 'assistant',
          content: [
            { type: 'think', think: '', encrypted: 'enc_redacted_sig_xyz' },
            { type: 'text', text: '4.' },
          ],
          toolCalls: [],
        },
        { role: 'user', content: [{ type: 'text', text: 'Thanks!' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);
      const messages = body['messages'] as unknown[];

      expect(messages[1]).toEqual({
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '', signature: 'enc_redacted_sig_xyz' },
          { type: 'text', text: '4.' },
        ],
      });
    });
  });

  describe('generation kwargs', () => {
    it('applies temperature, top_p, and max_tokens', async () => {
      const provider = createProvider().withGenerationKwargs({
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 2048,
      });
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      expect(body['temperature']).toBe(0.7);
      expect(body['top_p']).toBe(0.9);
      expect(body['max_tokens']).toBe(2048);
    });

    it('combines thinking and max_tokens in internal state', () => {
      const provider = createProvider()
        .withThinking('high')
        .withGenerationKwargs({ max_tokens: 512 });
      const state = getGenerationState(provider);

      expect(state).toMatchObject({
        max_tokens: 512,
        thinking: { type: 'adaptive', display: 'summarized' },
        output_config: { effort: 'high' },
      });
    });

    it('keeps the same internal state regardless of withThinking/withGenerationKwargs order', () => {
      const thinkingThenKwargs = getGenerationState(
        createProvider().withThinking('high').withGenerationKwargs({ max_tokens: 512 }),
      );
      const kwargsThenThinking = getGenerationState(
        createProvider().withGenerationKwargs({ max_tokens: 512 }).withThinking('high'),
      );

      expect(kwargsThenThinking).toEqual(thinkingThenKwargs);
    });

    it('shallow-merges repeated withGenerationKwargs calls and replaces duplicate keys', () => {
      const provider = createProvider()
        .withGenerationKwargs({ max_tokens: 256, temperature: 0.1 })
        .withGenerationKwargs({ max_tokens: 512 });

      expect(getGenerationState(provider)).toMatchObject({
        max_tokens: 512,
        temperature: 0.1,
      });
    });
  });

  describe('with thinking', () => {
    const thinkHistory: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'Think' }], toolCalls: [] },
    ];

    // --- Direct categorical effort mapping (no budget_tokens) ---

    it('each effort level maps to correct output_config.effort value', async () => {
      const provider = createProvider('claude-opus-4-7');
      const efforts: Array<[ThinkingEffort, string]> = [
        ['low', 'low'],
        ['medium', 'medium'],
        ['high', 'high'],
      ];
      for (const [effort, expected] of efforts) {
        const body = await captureRequestBody(provider.withThinking(effort), '', [], thinkHistory);
        expect(body['thinking']).toEqual({ type: 'adaptive', display: 'summarized' });
        expect(body['output_config']).toEqual({ effort: expected });
        // No budget_tokens anywhere in the request body
        expect(body['thinking']).not.toHaveProperty('budget_tokens');
      }
    });

    it('no budget_tokens field in any request body', async () => {
      const provider = createProvider('claude-opus-4-7').withThinking('high');
      const body = await captureRequestBody(provider, '', [], thinkHistory);

      expect(body['thinking']).not.toHaveProperty('budget_tokens');
      expect(JSON.stringify(body)).not.toContain('budget_tokens');
    });

    // --- xhigh effort ---

    it('xhigh maps to xhigh for Opus 4.7', async () => {
      const provider = createProvider('claude-opus-4-7').withThinking('xhigh');
      const body = await captureRequestBody(provider, '', [], thinkHistory);

      expect(body['thinking']).toEqual({ type: 'adaptive', display: 'summarized' });
      expect(body['output_config']).toEqual({ effort: 'xhigh' });
    });

    it('xhigh maps to xhigh for Opus 4.8', async () => {
      const provider = createProvider('claude-opus-4-8').withThinking('xhigh');
      const body = await captureRequestBody(provider, '', [], thinkHistory);

      expect(body['thinking']).toEqual({ type: 'adaptive', display: 'summarized' });
      expect(body['output_config']).toEqual({ effort: 'xhigh' });
    });

    it('xhigh clamped to high for non-Opus models with warn log', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const provider = createProvider('claude-sonnet-4-6').withThinking('xhigh');
      const body = await captureRequestBody(provider, '', [], thinkHistory);

      expect(body['thinking']).toEqual({ type: 'adaptive', display: 'summarized' });
      expect(body['output_config']).toEqual({ effort: 'high' });
      expect(warnSpy).toHaveBeenCalledWith(
        "effort 'xhigh' clamped to 'high' for model claude-sonnet-4-6",
      );
      warnSpy.mockRestore();
    });

    // --- max effort ---

    it('max maps to max for supported models', async () => {
      const provider = createProvider('claude-opus-4-7').withThinking('max');
      const body = await captureRequestBody(provider, '', [], thinkHistory);

      expect(body['thinking']).toEqual({ type: 'adaptive', display: 'summarized' });
      expect(body['output_config']).toEqual({ effort: 'max' });
    });

    it('max maps to max for Opus 4.6', async () => {
      const provider = createProvider('claude-opus-4-6').withThinking('max');
      const body = await captureRequestBody(provider, '', [], thinkHistory);

      expect(body['thinking']).toEqual({ type: 'adaptive', display: 'summarized' });
      expect(body['output_config']).toEqual({ effort: 'max' });
    });

    it('max clamped to high for unsupported models with warn log', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const provider = createProvider('claude-sonnet-4-5').withThinking('max');
      const body = await captureRequestBody(provider, '', [], thinkHistory);

      expect(body['thinking']).toEqual({ type: 'adaptive', display: 'summarized' });
      expect(body['output_config']).toEqual({ effort: 'high' });
      expect(warnSpy).toHaveBeenCalledWith(
        "effort 'max' clamped to 'high' for model claude-sonnet-4-5",
      );
      warnSpy.mockRestore();
    });

    // --- 'off' disables thinking ---

    it('off disables thinking entirely (no effort sent)', async () => {
      const provider = createProvider('claude-opus-4-7').withThinking('off');
      const body = await captureRequestBody(provider, '', [], thinkHistory);

      expect(body['thinking']).toEqual({ type: 'disabled' });
      expect(body['output_config']).toBeUndefined();
    });

    it('off clears stale output_config from prior thinking call', async () => {
      const provider = createProvider('claude-opus-4-7').withThinking('high').withThinking('off');
      const body = await captureRequestBody(provider, '', [], thinkHistory);

      expect(body['thinking']).toEqual({ type: 'disabled' });
      expect(body['output_config']).toBeUndefined();
    });

    // --- All models now use adaptive thinking (no budget_tokens) ---

    it.each([
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-opus-4-5',
      'claude-sonnet-4-5',
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-20240620',
      'claude-haiku-4-5-20251001',
      'claude-haiku-3-5',
      'k25',
    ])('%s: all models use adaptive thinking (no budget_tokens)', async (model) => {
      const provider = createProvider(model).withThinking('high');
      const body = await captureRequestBody(provider, '', [], thinkHistory);

      expect(body['thinking']).toEqual({ type: 'adaptive', display: 'summarized' });
      expect(body['output_config']).toEqual({ effort: 'high' });
      expect(body['thinking']).not.toHaveProperty('budget_tokens');
    });

    // --- Existing behavior preserved ---

    it('replaces the previous thinking config when called again', () => {
      const provider = createProvider().withThinking('high').withThinking('off');

      expect(getGenerationState(provider).thinking).toEqual({ type: 'disabled' });
    });

    it('adaptive thinking removes interleaved-thinking beta', async () => {
      const provider = createProvider('claude-opus-4-7').withThinking('high');
      const body = await captureRequestBody(provider, '', [], thinkHistory);

      expect(body['thinking']).toEqual({ type: 'adaptive', display: 'summarized' });
      const headers = body['_extra_headers'] as Record<string, string> | undefined;
      if (headers !== undefined && headers['anthropic-beta'] !== undefined) {
        expect(headers['anthropic-beta']).not.toContain('interleaved-thinking-2025-05-14');
      }
    });

    it('off removes interleaved-thinking beta', async () => {
      const provider = createProvider('claude-opus-4-7').withThinking('off');
      const body = await captureRequestBody(provider, '', [], thinkHistory);

      expect(body['thinking']).toEqual({ type: 'disabled' });
      expect(body['output_config']).toBeUndefined();
      const headers = body['_extra_headers'] as Record<string, string> | undefined;
      expect(headers?.['anthropic-beta']).toBeUndefined();
    });

    // --- Clamp effort matrix ---

    describe('clamp effort matrix', () => {
      it.each([
        // Opus 4.7: full range including xhigh and max
        ['claude-opus-4-7', 'low', 'low'],
        ['claude-opus-4-7', 'medium', 'medium'],
        ['claude-opus-4-7', 'high', 'high'],
        ['claude-opus-4-7', 'xhigh', 'xhigh'],
        ['claude-opus-4-7', 'max', 'max'],
        // Opus 4.7 dated variant
        ['claude-opus-4-7-20260301', 'xhigh', 'xhigh'],
        // Opus 4.6: max supported, xhigh clamps to high
        ['claude-opus-4-6', 'max', 'max'],
        ['claude-opus-4-6', 'xhigh', 'high'],
        ['claude-opus-4-6-20260205', 'max', 'max'],
        // Sonnet 4.6: max supported, xhigh clamps to high
        ['claude-sonnet-4-6', 'max', 'max'],
        ['claude-sonnet-4-6', 'xhigh', 'high'],
        // low/medium/high passthrough
        ['claude-opus-4-6', 'medium', 'medium'],
        // Future 4.8+: xhigh and max pass through (Opus 4.8 supports xhigh)
        ['claude-opus-4-8', 'xhigh', 'xhigh'],
        ['claude-opus-4-8', 'max', 'max'],
        ['claude-opus-5-0', 'max', 'max'],
        ['claude-opus-5-0', 'xhigh', 'high'],
      ] as const)(
        'clamp adaptive: %s + %s -> effort=%s',
        async (model, effort, expected) => {
          const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
          const provider = createProvider(model).withThinking(effort);
          const body = await captureRequestBody(provider, '', [], thinkHistory);

          expect(body['thinking']).toEqual({ type: 'adaptive', display: 'summarized' });
          expect(body['output_config']).toEqual({ effort: expected });
          expect(body['thinking']).not.toHaveProperty('budget_tokens');
          warnSpy.mockRestore();
        },
      );

      // All models now use adaptive + output_config (no more budget_tokens paths)
      it.each([
        ['claude-opus-4-5', 'max', 'high'],
        ['claude-opus-4-5', 'xhigh', 'high'],
        ['claude-opus-4-5', 'high', 'high'],
        ['claude-sonnet-4-20250514', 'max', 'high'],
        ['claude-sonnet-4-20250514', 'xhigh', 'high'],
        ['claude-sonnet-4-20250514', 'low', 'low'],
        ['claude-sonnet-4-5', 'xhigh', 'high'],
        ['claude-haiku-4-5', 'max', 'high'],
      ] as const)(
        'clamp legacy (now adaptive): %s + %s -> effort=%s',
        async (model, effort, expected) => {
          const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
          const provider = createProvider(model).withThinking(effort);
          const body = await captureRequestBody(provider, '', [], thinkHistory);

          expect(body['thinking']).toEqual({ type: 'adaptive', display: 'summarized' });
          expect(body['output_config']).toEqual({ effort: expected });
          expect(body['thinking']).not.toHaveProperty('budget_tokens');
          warnSpy.mockRestore();
        },
      );
    });

    // --- All models emit output_config with effort (no more gating) ---

    describe('all models emit output_config', () => {
      it.each([
        // Previously adaptive-capable
        'claude-opus-4-7',
        'claude-opus-4-6',
        'claude-sonnet-4-6',
        'claude-opus-5-0',
        // Previously legacy budget_tokens models now use adaptive
        'claude-opus-4-5',
        'claude-sonnet-4-20250514',
        'claude-sonnet-4-5',
        'claude-haiku-4-5',
        'claude-3-5-sonnet-20240620',
        // Non-Claude models also get adaptive + effort
        'gpt-4',
        'unknown-model',
      ])('%s: emits output_config with effort', async (model) => {
        const provider = createProvider(model).withThinking('high');
        const body = await captureRequestBody(provider, '', [], thinkHistory);

        expect(body['output_config']).toEqual({ effort: 'high' });
        expect(body['thinking']).not.toHaveProperty('budget_tokens');
      });
    });

    // --- Warn logging on clamping ---

    describe('warn logging on clamping', () => {
      it('warns when xhigh clamped to high for non-Opus-4.7/4.8', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const provider = createProvider('claude-sonnet-4-6').withThinking('xhigh');
        await captureRequestBody(provider, '', [], thinkHistory);

        expect(warnSpy).toHaveBeenCalledWith(
          "effort 'xhigh' clamped to 'high' for model claude-sonnet-4-6",
        );
        warnSpy.mockRestore();
      });

      it('warns when max clamped to high for non-adaptive models', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const provider = createProvider('claude-sonnet-4-5').withThinking('max');
        await captureRequestBody(provider, '', [], thinkHistory);

        expect(warnSpy).toHaveBeenCalledWith(
          "effort 'max' clamped to 'high' for model claude-sonnet-4-5",
        );
        warnSpy.mockRestore();
      });

      it('does not warn when effort passes through unchanged', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const provider = createProvider('claude-opus-4-7').withThinking('xhigh');
        await captureRequestBody(provider, '', [], thinkHistory);

        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
      });
    });

    // --- Wire format verification ---

    it('opus-4-7 high: adaptive thinking + output_config.effort', async () => {
      const provider = createProvider('claude-opus-4-7').withThinking('high');
      const body = await captureRequestBody(provider, '', [], thinkHistory);

      expect(body['thinking']).toEqual({ type: 'adaptive', display: 'summarized' });
      expect(body['output_config']).toEqual({ effort: 'high' });
    });

    it('opus-4-7 low passes through to output_config', async () => {
      const provider = createProvider('claude-opus-4-7').withThinking('low');
      const body = await captureRequestBody(provider, '', [], thinkHistory);

      expect(body['thinking']).toEqual({ type: 'adaptive', display: 'summarized' });
      expect(body['output_config']).toEqual({ effort: 'low' });
    });

    it('opus-4-7 medium passes through to output_config', async () => {
      const provider = createProvider('claude-opus-4-7').withThinking('medium');
      const body = await captureRequestBody(provider, '', [], thinkHistory);

      expect(body['thinking']).toEqual({ type: 'adaptive', display: 'summarized' });
      expect(body['output_config']).toEqual({ effort: 'medium' });
    });
  });

  describe('metadata', () => {
    it('forwards metadata to the request', async () => {
      const provider = createProvider('k25', {
        user_id: 'test-session-id',
      });
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      expect(body['metadata']).toEqual({ user_id: 'test-session-id' });
    });

    it('omits metadata when not provided', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      expect(body['metadata']).toBeUndefined();
    });
  });

  describe('thinkingEffort property', () => {
    it('returns null when no thinking configured', () => {
      const provider = createProvider();
      expect(provider.thinkingEffort).toBeNull();
    });

    it('opus-4-6 with thinking high -> "high" (adaptive)', () => {
      const provider = createProvider('claude-opus-4-6').withThinking('high');
      expect(provider.thinkingEffort).toBe('high');
    });

    it('opus-4-6 with thinking off -> "off"', () => {
      const provider = createProvider('claude-opus-4-6').withThinking('off');
      expect(provider.thinkingEffort).toBe('off');
    });

    it('opus-4-7 reports xhigh and max adaptive efforts', () => {
      const xhigh = createProvider('claude-opus-4-7').withThinking('xhigh');
      expect(xhigh.thinkingEffort).toBe('xhigh');

      const max = createProvider('claude-opus-4-7').withThinking('max');
      expect(max.thinkingEffort).toBe('max');
    });

    it('reports clamped adaptive effort', () => {
      const provider = createProvider('claude-sonnet-4-6').withThinking('xhigh');
      expect(provider.thinkingEffort).toBe('high');
    });

    it('all models report effort from output_config', () => {
      const low = createProvider().withThinking('low');
      expect(low.thinkingEffort).toBe('low');

      const med = createProvider().withThinking('medium');
      expect(med.thinkingEffort).toBe('medium');

      const high = createProvider().withThinking('high');
      expect(high.thinkingEffort).toBe('high');
    });
  });

  describe('provider properties', () => {
    it('has correct name and model', () => {
      const provider = createProvider();
      expect(provider.name).toBe('anthropic');
      expect(provider.modelName).toBe('k25');
    });

    it('withThinking returns a new instance', () => {
      const provider = createProvider();
      const newProvider = provider.withThinking('high');
      expect(newProvider).toBeInstanceOf(AnthropicChatProvider);
      expect(newProvider).not.toBe(provider);
    });
  });

  describe('non-stream response parsing', () => {
    it('yields text content from non-stream response', async () => {
      const provider = createProvider();
      (provider as any)._client.messages.create = vi.fn().mockResolvedValue({
        id: 'msg_123',
        content: [{ type: 'text', text: 'Hello world' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const stream = await provider.generate(
        '',
        [],
        [{ role: 'user', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] }],
      );

      const parts = [];
      for await (const part of stream) {
        parts.push(part);
      }

      expect(parts).toEqual([{ type: 'text', text: 'Hello world' }]);
      expect(stream.id).toBe('msg_123');
      expect(stream.usage).toEqual({
        inputOther: 10,
        output: 5,
        inputCacheRead: 0,
        inputCacheCreation: 0,
      });
    });

    it('yields thinking and tool_use from non-stream response', async () => {
      const provider = createProvider();
      (provider as any)._client.messages.create = vi.fn().mockResolvedValue({
        id: 'msg_456',
        content: [
          { type: 'thinking', thinking: 'Let me think...', signature: 'sig_abc' },
          { type: 'text', text: 'The answer is 4.' },
          { type: 'tool_use', id: 'tool_1', name: 'add', input: { a: 2, b: 3 } },
        ],
        usage: { input_tokens: 15, output_tokens: 10, cache_read_input_tokens: 5 },
      });

      const stream = await provider.generate(
        '',
        [],
        [{ role: 'user', content: [{ type: 'text', text: 'What is 2+3?' }], toolCalls: [] }],
      );

      const parts = [];
      for await (const part of stream) {
        parts.push(part);
      }

      expect(parts).toEqual([
        { type: 'think', think: 'Let me think...', encrypted: 'sig_abc' },
        { type: 'text', text: 'The answer is 4.' },
        {
          type: 'function',
          id: 'tool_1',
          name: 'add', arguments: '{"a":2,"b":3}',
        },
      ]);
      expect(stream.usage).toEqual({
        inputOther: 15,
        output: 10,
        inputCacheRead: 5,
        inputCacheCreation: 0,
      });
    });
  });

  describe('stream response parsing', () => {
    it('yields text delta from stream events', async () => {
      const provider = createStreamProvider();
      const stream = mockStream([
        {
          type: 'message_start',
          message: {
            id: 'msg_stream_001',
            usage: { input_tokens: 10, cache_read_input_tokens: 3, cache_creation_input_tokens: 2 },
          },
        },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } },
        { type: 'message_delta', delta: {}, usage: { output_tokens: 5 } },
        { type: 'message_stop' },
      ]);

      (provider as any)._client.messages.create = vi.fn().mockResolvedValue(stream) as never;

      const result = await provider.generate(
        '',
        [],
        [{ role: 'user', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] }],
      );

      const parts = await collectParts(result);

      expect(parts).toEqual([
        { type: 'text', text: '' },
        { type: 'text', text: 'Hello' },
        { type: 'text', text: ' world' },
      ]);
      expect(result.id).toBe('msg_stream_001');
      expect(result.usage).toEqual({
        inputOther: 10,
        output: 5,
        inputCacheRead: 3,
        inputCacheCreation: 2,
      });
    });

    it('yields thinking delta and signature from stream events', async () => {
      const provider = createStreamProvider();
      const stream = mockStream([
        {
          type: 'message_start',
          message: { id: 'msg_stream_002', usage: { input_tokens: 20 } },
        },
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'thinking', thinking: '' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'Let me think' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: ' about this' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'signature_delta', signature: 'sig_xyz' },
        },
        { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'text_delta', text: 'The answer is 4.' },
        },
        { type: 'message_delta', delta: {}, usage: { output_tokens: 15 } },
        { type: 'message_stop' },
      ]);

      (provider as any)._client.messages.create = vi.fn().mockResolvedValue(stream) as never;

      const result = await provider.generate(
        '',
        [],
        [{ role: 'user', content: [{ type: 'text', text: 'What is 2+2?' }], toolCalls: [] }],
      );

      const parts = await collectParts(result);

      expect(parts).toEqual([
        { type: 'think', think: '' },
        { type: 'think', think: 'Let me think' },
        { type: 'think', think: ' about this' },
        { type: 'think', think: '', encrypted: 'sig_xyz' },
        { type: 'text', text: '' },
        { type: 'text', text: 'The answer is 4.' },
      ]);
      expect(result.id).toBe('msg_stream_002');
      expect(result.usage).toEqual({
        inputOther: 20,
        output: 15,
        inputCacheRead: 0,
        inputCacheCreation: 0,
      });
    });

    it('yields tool_use start and argument deltas from stream events', async () => {
      const provider = createStreamProvider();
      const stream = mockStream([
        {
          type: 'message_start',
          message: { id: 'msg_stream_003', usage: { input_tokens: 15 } },
        },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: "I'll add those." },
        },
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 'toolu_abc', name: 'add' },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '{"a":' },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '2,"b":3}' },
        },
        { type: 'message_delta', delta: {}, usage: { output_tokens: 8 } },
        { type: 'message_stop' },
      ]);

      (provider as any)._client.messages.create = vi.fn().mockResolvedValue(stream) as never;

      const result = await provider.generate(
        '',
        [],
        [{ role: 'user', content: [{ type: 'text', text: 'Add 2 and 3' }], toolCalls: [] }],
      );

      const parts = await collectParts(result);

      expect(parts).toEqual([
        { type: 'text', text: '' },
        { type: 'text', text: "I'll add those." },
        {
          type: 'function',
          id: 'toolu_abc',
          name: 'add', arguments: '',
          _streamIndex: 1,
        },
        { type: 'tool_call_part', argumentsPart: '{"a":', index: 1 },
        { type: 'tool_call_part', argumentsPart: '2,"b":3}', index: 1 },
      ]);
      expect(result.id).toBe('msg_stream_003');
    });

    it('streaming: parallel tool_use blocks route input_json_delta by block index', async () => {
      const provider = createStreamProvider();
      const stream = mockStream([
        {
          type: 'message_start',
          message: { id: 'msg_parallel_001', usage: { input_tokens: 10 } },
        },
        // Two tool_use blocks opened in order at index 0 and 1.
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'toolu_a', name: 'tool_a', input: {} },
        },
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 'toolu_b', name: 'tool_b', input: {} },
        },
        // Interleaved input_json_delta chunks across the two blocks.
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"x":' },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '{"y":' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '1}' },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '2}' },
        },
        { type: 'content_block_stop', index: 0 },
        { type: 'content_block_stop', index: 1 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'tool_use' },
          usage: { output_tokens: 5 },
        },
        { type: 'message_stop' },
      ]);

      (provider as any)._client.messages.create = vi.fn().mockResolvedValue(stream) as never;

      const result = await provider.generate(
        '',
        [ADD_TOOL, MUL_TOOL],
        [{ role: 'user', content: [{ type: 'text', text: 'Run both tools' }], toolCalls: [] }],
      );

      // Raw stream parts carry block index on both ToolCall and ToolCallPart.
      // The Anthropic adapter absorbs `content_block_stop` for tool_use blocks
      // internally — generate.ts infers completion from merge boundaries.
      const parts = await collectParts(result);
      expect(parts).toEqual([
        {
          type: 'function',
          id: 'toolu_a',
          name: 'tool_a', arguments: '',
          _streamIndex: 0,
        },
        {
          type: 'function',
          id: 'toolu_b',
          name: 'tool_b', arguments: '',
          _streamIndex: 1,
        },
        { type: 'tool_call_part', argumentsPart: '{"x":', index: 0 },
        { type: 'tool_call_part', argumentsPart: '{"y":', index: 1 },
        { type: 'tool_call_part', argumentsPart: '1}', index: 0 },
        { type: 'tool_call_part', argumentsPart: '2}', index: 1 },
      ]);
    });

    it('streaming: generate() assembles parallel tool calls via index routing', async () => {
      // End-to-end: verify that generate() routes interleaved deltas to the
      // correct ToolCall using the block index, producing fully-assembled
      // arguments per tool.
      const { generate } = await import('#/generate');

      const provider = createStreamProvider();
      const stream = mockStream([
        {
          type: 'message_start',
          message: { id: 'msg_parallel_002', usage: { input_tokens: 10 } },
        },
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'toolu_a', name: 'tool_a', input: {} },
        },
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 'toolu_b', name: 'tool_b', input: {} },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"x":' },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '{"y":' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '1}' },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '2}' },
        },
        { type: 'content_block_stop', index: 0 },
        { type: 'content_block_stop', index: 1 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'tool_use' },
          usage: { output_tokens: 5 },
        },
        { type: 'message_stop' },
      ]);

      (provider as any)._client.messages.create = vi.fn().mockResolvedValue(stream) as never;

      const { message } = await generate(
        provider,
        '',
        [ADD_TOOL, MUL_TOOL],
        [{ role: 'user', content: [{ type: 'text', text: 'Run both' }], toolCalls: [] }],
      );

      expect(message.toolCalls.length).toBe(2);
      expect(message.toolCalls[0]!.id).toBe('toolu_a');
      expect(message.toolCalls[0]!.name).toBe('tool_a');
      expect(message.toolCalls[0]!.arguments).toBe('{"x":1}');
      expect(message.toolCalls[1]!.id).toBe('toolu_b');
      expect(message.toolCalls[1]!.name).toBe('tool_b');
      expect(message.toolCalls[1]!.arguments).toBe('{"y":2}');
      // _streamIndex should be stripped from stored tool calls.
      expect(
        (message.toolCalls[0] as ToolCall & { _streamIndex?: number })._streamIndex,
      ).toBeUndefined();
      expect(
        (message.toolCalls[1] as ToolCall & { _streamIndex?: number })._streamIndex,
      ).toBeUndefined();
    });

    it('converts stream errors to ChatProviderError', async () => {
      const provider = createStreamProvider();
      const errorStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'message_start',
            message: { id: 'msg_err', usage: { input_tokens: 5 } },
          };
          throw new Error('stream interrupted');
        },
      };

      (provider as any)._client.messages.create = vi.fn().mockResolvedValue(errorStream) as never;

      const result = await provider.generate(
        '',
        [],
        [{ role: 'user', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] }],
      );

      await expect(collectParts(result)).rejects.toThrow(ChatProviderError);
    });

    it('updates usage from message_delta with all fields', async () => {
      const provider = createStreamProvider();
      const stream = mockStream([
        {
          type: 'message_start',
          message: {
            id: 'msg_usage',
            usage: {
              input_tokens: 100,
              cache_read_input_tokens: 50,
              cache_creation_input_tokens: 20,
            },
          },
        },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } },
        {
          type: 'message_delta',
          delta: {},
          usage: {
            output_tokens: 42,
            cache_read_input_tokens: 55,
            cache_creation_input_tokens: 25,
            input_tokens: 105,
          },
        },
        { type: 'message_stop' },
      ]);

      (provider as any)._client.messages.create = vi.fn().mockResolvedValue(stream) as never;

      const result = await provider.generate(
        '',
        [],
        [{ role: 'user', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] }],
      );

      await collectParts(result);

      expect(result.usage).toEqual({
        inputOther: 105,
        output: 42,
        inputCacheRead: 55,
        inputCacheCreation: 25,
      });
    });

    it('redacted_thinking block yields encrypted think part', async () => {
      const provider = createStreamProvider();
      const stream = mockStream([
        {
          type: 'message_start',
          message: { id: 'msg_redacted', usage: { input_tokens: 10 } },
        },
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'redacted_thinking', data: 'enc_data_123' },
        },
        { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Done.' } },
        { type: 'message_delta', delta: {}, usage: { output_tokens: 3 } },
        { type: 'message_stop' },
      ]);

      (provider as any)._client.messages.create = vi.fn().mockResolvedValue(stream) as never;

      const result = await provider.generate(
        '',
        [],
        [{ role: 'user', content: [{ type: 'text', text: 'Think' }], toolCalls: [] }],
      );

      const parts = await collectParts(result);

      expect(parts).toEqual([
        { type: 'think', think: '', encrypted: 'enc_data_123' },
        { type: 'text', text: '' },
        { type: 'text', text: 'Done.' },
      ]);
    });
  });

  describe('stream option', () => {
    it('defaults to stream: true and calls messages.create with stream enabled', async () => {
      const provider = new AnthropicChatProvider({
        model: 'k25',
        apiKey: 'test-key',
        defaultMaxTokens: 1024,
      });

      const stream = mockStream([
        {
          type: 'message_start',
          message: { id: 'msg_default', usage: { input_tokens: 5 } },
        },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi' } },
        { type: 'message_stop' },
      ]);

      const createFn = vi.fn().mockResolvedValue(stream);
      (provider as any)._client.messages.create = createFn as never;

      const result = await provider.generate(
        '',
        [],
        [{ role: 'user', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] }],
      );
      await collectParts(result);

      expect(createFn).toHaveBeenCalledTimes(1);
      expect(createFn.mock.calls[0]?.[0]).toMatchObject({ stream: true });
    });

    it('stream: false calls messages.create', async () => {
      const provider = createProvider(); // stream: false
      const createFn = vi.fn().mockResolvedValue(makeAnthropicResponse());
      (provider as any)._client.messages.create = createFn as never;

      const result = await provider.generate(
        '',
        [],
        [{ role: 'user', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] }],
      );
      await collectParts(result);

      expect(createFn).toHaveBeenCalledTimes(1);
      // Verify stream: false is in the params
      const params = createFn.mock.calls[0]![0] as Record<string, unknown>;
      expect(params['stream']).toBe(false);
    });
  });

  describe('modelParameters getter', () => {
    it('returns model + generation kwargs', () => {
      const provider = new AnthropicChatProvider({
        model: 'k25',
        apiKey: 'test-key',
        defaultMaxTokens: 2048,
      }).withGenerationKwargs({ temperature: 0.5 });

      const params = provider.modelParameters;
      expect(params).toMatchObject({
        model: 'k25',
        temperature: 0.5,
      });
    });
  });

  describe('system prompt cache breakpoints', () => {
    it('splits system prompt into multiple text blocks on breakpoints', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'hi' }], toolCalls: [] },
      ];
      const systemPrompt = 'Static part\n__CACHE_BOUNDARY__\nDynamic part';
      const body = await captureRequestBody(provider, systemPrompt, [], history, {
        cacheBreakpoints: ['__CACHE_BOUNDARY__'],
      });

      expect(body['system']).toEqual([
        { type: 'text', text: 'Static part', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'Dynamic part', cache_control: { type: 'ephemeral' } },
      ]);
    });

    it('uses single block when no breakpoints provided', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'hi' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, 'You are helpful.', [], history);

      expect(body['system']).toEqual([
        { type: 'text', text: 'You are helpful.', cache_control: { type: 'ephemeral' } },
      ]);
    });

    it('ignores missing breakpoints and falls back to single block', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'hi' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, 'No markers here.', [], history, {
        cacheBreakpoints: ['__MISSING_MARKER__'],
      });

      expect(body['system']).toEqual([
        { type: 'text', text: 'No markers here.', cache_control: { type: 'ephemeral' } },
      ]);
    });

    it('supports multiple breakpoints', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'hi' }], toolCalls: [] },
      ];
      const systemPrompt = 'A\n__B1__\nB\n__B2__\nC';
      const body = await captureRequestBody(provider, systemPrompt, [], history, {
        cacheBreakpoints: ['__B1__', '__B2__'],
      });

      expect(body['system']).toEqual([
        { type: 'text', text: 'A', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'B', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'C', cache_control: { type: 'ephemeral' } },
      ]);
    });

    it('trims whitespace around split parts', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'hi' }], toolCalls: [] },
      ];
      const systemPrompt = '  Static  \n__B__\n  Dynamic  ';
      const body = await captureRequestBody(provider, systemPrompt, [], history, {
        cacheBreakpoints: ['__B__'],
      });

      expect(body['system']).toEqual([
        { type: 'text', text: 'Static', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'Dynamic', cache_control: { type: 'ephemeral' } },
      ]);
    });
  });

  describe('generate without system prompt', () => {
    it('omits the system array when systemPrompt is empty string', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'hi' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);
      expect(body['system']).toBeUndefined();
    });
  });
});

describe('resolveDefaultMaxTokens', () => {
  it('returns per-version Messages-API caps for known Claude 4 models', () => {
    expect(resolveDefaultMaxTokens('claude-opus-4-7')).toBe(128000);
    expect(resolveDefaultMaxTokens('claude-opus-4-6')).toBe(128000);
    expect(resolveDefaultMaxTokens('claude-opus-4-5-20251101')).toBe(64000);
    expect(resolveDefaultMaxTokens('claude-opus-4-1-20250805')).toBe(32000);
    expect(resolveDefaultMaxTokens('claude-opus-4-20250514')).toBe(32000);
    expect(resolveDefaultMaxTokens('claude-sonnet-4-6')).toBe(64000);
    expect(resolveDefaultMaxTokens('claude-sonnet-4-5-20250929')).toBe(64000);
    expect(resolveDefaultMaxTokens('claude-sonnet-4-20250514')).toBe(64000);
    expect(resolveDefaultMaxTokens('claude-haiku-4-5-20251001')).toBe(64000);
  });

  it('returns the right ceiling for Claude 3.5 / 3.7 (both naming orders)', () => {
    // version-first (legacy Anthropic id form)
    expect(resolveDefaultMaxTokens('claude-3-5-sonnet-20240620')).toBe(8192);
    expect(resolveDefaultMaxTokens('claude-3.5-sonnet')).toBe(8192);
    expect(resolveDefaultMaxTokens('claude-3-7-sonnet')).toBe(8192);
    expect(resolveDefaultMaxTokens('claude-3.7-sonnet')).toBe(8192);
    // family-first (used throughout this repo's tests)
    expect(resolveDefaultMaxTokens('claude-sonnet-3-7')).toBe(8192);
    expect(resolveDefaultMaxTokens('claude-sonnet-3-5')).toBe(8192);
    expect(resolveDefaultMaxTokens('claude-opus-3-5')).toBe(8192);
    expect(resolveDefaultMaxTokens('claude-haiku-3-5')).toBe(8192);
  });

  it('returns 4096 for original Claude 3', () => {
    expect(resolveDefaultMaxTokens('claude-3-opus-20240229')).toBe(4096);
    expect(resolveDefaultMaxTokens('claude-3-sonnet-20240229')).toBe(4096);
    expect(resolveDefaultMaxTokens('claude-3-haiku-20240307')).toBe(4096);
  });

  it('matches dotted version separators', () => {
    expect(resolveDefaultMaxTokens('claude-opus-4.7')).toBe(128000);
    expect(resolveDefaultMaxTokens('claude-opus-4.6')).toBe(128000);
    expect(resolveDefaultMaxTokens('claude-sonnet-4.6')).toBe(64000);
    expect(resolveDefaultMaxTokens('claude-haiku-4.5')).toBe(64000);
  });

  it('matches vendor-prefixed and suffixed third-party variants', () => {
    // Bedrock / Vertex / proxy prefixes
    expect(resolveDefaultMaxTokens('anthropic.claude-opus-4-7-v1:0')).toBe(128000);
    expect(resolveDefaultMaxTokens('aws/claude-opus-4-7')).toBe(128000);
    expect(resolveDefaultMaxTokens('vertex_ai/claude-opus-4-7')).toBe(128000);
    expect(resolveDefaultMaxTokens('bedrock/anthropic.claude-opus-4-6-v1:0')).toBe(128000);
    // OpenRouter / proxy-style prefixes the user has seen in the wild
    expect(resolveDefaultMaxTokens('openrouter/claude-opus-4-7')).toBe(128000);
    expect(resolveDefaultMaxTokens('online-claude-opus-4-7')).toBe(128000);
    // Build / variant suffixes
    expect(resolveDefaultMaxTokens('claude-opus-4-6-construct')).toBe(128000);
    expect(resolveDefaultMaxTokens('claude-sonnet-4-5-20250929')).toBe(64000);
    // Legacy id buried inside a vendor prefix
    expect(resolveDefaultMaxTokens('anthropic.claude-3-5-sonnet-20240620-v1:0')).toBe(8192);
  });

  it('falls back to family-only ceiling for unknown minor versions', () => {
    // Future opus-4-X release: minor not in table, falls back to opus-4 = 32000.
    // Better to under-quote and fail loudly than over-quote a model we can't verify.
    expect(resolveDefaultMaxTokens('claude-opus-4-10')).toBe(32000);
    expect(resolveDefaultMaxTokens('claude-sonnet-4-9')).toBe(64000);
    expect(resolveDefaultMaxTokens('claude-haiku-4-9')).toBe(64000);
  });

  it('matches case-insensitively', () => {
    expect(resolveDefaultMaxTokens('CLAUDE-OPUS-4-7')).toBe(128000);
    expect(resolveDefaultMaxTokens('Claude-Sonnet-4-6')).toBe(64000);
    expect(resolveDefaultMaxTokens('Anthropic.Claude-Opus-4-7-v1:0')).toBe(128000);
  });

  it('honors the override for unknown models', () => {
    expect(resolveDefaultMaxTokens('unknown-model', 12345)).toBe(12345);
    expect(resolveDefaultMaxTokens('unknown-preview-001', 16000)).toBe(16000);
  });

  it('honors a lower override on known models (intentional truncation)', () => {
    expect(resolveDefaultMaxTokens('claude-opus-4-7', 200)).toBe(200);
    expect(resolveDefaultMaxTokens('claude-sonnet-4-6', 1024)).toBe(1024);
    expect(resolveDefaultMaxTokens('claude-3-opus', 1000)).toBe(1000);
  });

  it('clamps an override above the documented ceiling for known models', () => {
    expect(resolveDefaultMaxTokens('claude-opus-4-7', 999999)).toBe(128000);
    expect(resolveDefaultMaxTokens('claude-sonnet-4-6', 200000)).toBe(64000);
    expect(resolveDefaultMaxTokens('claude-3-opus', 99999)).toBe(4096);
  });

  it('falls back to 32000 when both lookup and override miss', () => {
    expect(resolveDefaultMaxTokens('totally-unknown-model')).toBe(32000);
    expect(resolveDefaultMaxTokens('gpt-5')).toBe(32000);
  });

  it('does not apply Claude ceilings to non-Claude ids that contain an opus/sonnet/haiku token', () => {
    // No "claude" marker → fall through to the override / fallback rather
    // than quietly applying a Claude ceiling to a fine-tune or unrelated model.
    expect(resolveDefaultMaxTokens('vendor-opus-4-7-preview')).toBe(32000);
    expect(resolveDefaultMaxTokens('vendor-opus-4-7-preview', 8000)).toBe(8000);
  });
});

describe('AnthropicChatProvider constructor max_tokens', () => {
  async function maxTokensFor(
    model: string,
    opts: Partial<{ defaultMaxTokens: number }> = {},
  ): Promise<number> {
    const provider = new AnthropicChatProvider({
      model,
      apiKey: 'test-key',
      stream: false,
      ...opts,
    });
    const history: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'hi' }], toolCalls: [] },
    ];
    const body = await captureRequestBody(provider, '', [], history);
    return body['max_tokens'] as number;
  }

  it('uses per-version Messages-API caps for known Claude 4 models', async () => {
    expect(await maxTokensFor('claude-opus-4-7')).toBe(128000);
    expect(await maxTokensFor('claude-opus-4-6')).toBe(128000);
    expect(await maxTokensFor('claude-opus-4-5')).toBe(64000);
    expect(await maxTokensFor('claude-sonnet-4-6')).toBe(64000);
    expect(await maxTokensFor('claude-haiku-4-5-20251001')).toBe(64000);
  });

  it('uses 4096 for Claude 3', async () => {
    expect(await maxTokensFor('claude-3-opus-20240229')).toBe(4096);
  });

  it('honors defaultMaxTokens for unknown models', async () => {
    expect(await maxTokensFor('unknown-model', { defaultMaxTokens: 12345 })).toBe(12345);
  });

  it('lets defaultMaxTokens lower the budget for known models', async () => {
    expect(await maxTokensFor('claude-opus-4-7', { defaultMaxTokens: 200 })).toBe(200);
  });

  it('clamps defaultMaxTokens above the documented ceiling for known models', async () => {
    expect(await maxTokensFor('claude-opus-4-7', { defaultMaxTokens: 999999 })).toBe(128000);
  });
});
