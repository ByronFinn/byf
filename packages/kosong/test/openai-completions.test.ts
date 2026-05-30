import { generate } from '#/generate';
import { UNKNOWN_CAPABILITY } from '#/capability';
import type { ContentPart, Message, StreamedMessagePart, ToolCall } from '#/message';
import { OpenAICompletionsChatProvider, extractUsageFromChunk } from '#/providers/openai-completions';
import { extractUsage } from '#/providers/openai-common';
import type { Tool } from '#/tool';
import { describe, it, expect, vi } from 'vitest';

function makeChatCompletionResponse(model: string = 'test-model') {
  return {
    id: 'chatcmpl-test123',
    object: 'chat.completion',
    created: 1234567890,
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'Hello' },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

function createProvider(
  options?: Partial<{
    stream: boolean;
    reasoningKey: string;
    model: string;
    toolMessageConversion: 'extract_text';
  }>,
): OpenAICompletionsChatProvider {
  return new OpenAICompletionsChatProvider({
    model: options?.model ?? 'test-model',
    apiKey: 'test-key',
    baseUrl: 'https://api.example.test/v1',
    stream: options?.stream ?? false,
    reasoningKey: options?.reasoningKey,
    toolMessageConversion: options?.toolMessageConversion,
  });
}

async function captureRequestBody(
  provider: OpenAICompletionsChatProvider,
  systemPrompt: string,
  tools: Tool[],
  history: Message[],
): Promise<Record<string, unknown>> {
  let capturedBody: Record<string, unknown> | undefined;

  (provider as any)._client.chat.completions.create = vi
    .fn()
    .mockImplementation((params: unknown) => {
      capturedBody = params as Record<string, unknown>;
      return Promise.resolve(makeChatCompletionResponse());
    });

  const stream = await provider.generate(systemPrompt, tools, history);
  for await (const part of stream) {
    void part;
  }

  if (capturedBody === undefined) {
    throw new Error('Expected provider.generate() to call chat.completions.create');
  }
  return capturedBody;
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

const BUILTIN_TOOL: Tool = {
  name: '$web_search',
  description: 'Search the web',
  parameters: { type: 'object', properties: {} },
};

describe('OpenAICompletionsChatProvider', () => {
  describe('provider identity', () => {
    it('has name openai-completions and exposes modelName', () => {
      const provider = createProvider();
      expect(provider.name).toBe('openai-completions');
      expect(provider.modelName).toBe('test-model');
    });

    it('default base URL is empty string when not configured', () => {
      const provider = new OpenAICompletionsChatProvider({
        model: 'test',
        apiKey: 'key',
      });
      expect(provider.modelParameters['baseUrl']).toBe('');
    });
  });

  describe('message conversion', () => {
    it('simple user message with system prompt', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello!' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, 'You are helpful.', [], history);

      expect(body['messages']).toEqual([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello!' },
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
        { role: 'user', content: 'What is 2+2?' },
        { role: 'assistant', content: '2+2 equals 4.' },
        { role: 'user', content: 'And 3+3?' },
      ]);
    });

    it('image url content', async () => {
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
            { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
          ],
        },
      ]);
    });

    it('tool definitions', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Add 2 and 3' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [ADD_TOOL, MUL_TOOL], history);

      expect(body['tools']).toEqual([
        {
          type: 'function',
          function: {
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
          },
        },
        {
          type: 'function',
          function: {
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
          },
        },
      ]);
    });

    it('builtin tool ($web_search) serialized as builtin_function', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Search' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [BUILTIN_TOOL], history);

      expect(body['tools']).toEqual([
        {
          type: 'builtin_function',
          function: { name: '$web_search' },
        },
      ]);
    });

    it('tool call and tool result', async () => {
      const provider = createProvider();
      const toolCall: ToolCall = {
        type: 'function',
        id: 'call_abc123',
        name: 'add',
        arguments: '{"a": 2, "b": 3}',
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

      expect(body['messages']).toEqual([
        { role: 'user', content: 'Add 2 and 3' },
        {
          role: 'assistant',
          content: "I'll add those numbers for you.",
          tool_calls: [
            {
              type: 'function',
              id: 'call_abc123',
              function: { name: 'add', arguments: '{"a": 2, "b": 3}' },
            },
          ],
        },
        { role: 'tool', content: '5', tool_call_id: 'call_abc123' },
      ]);
    });

    it('tool call extras are preserved in serialization', async () => {
      const provider = createProvider();
      const toolCall: ToolCall = {
        type: 'function',
        id: 'call_abc123',
        name: 'add',
        arguments: '{"a": 2, "b": 3}',
        extras: { custom_field: 'custom_value' },
      };
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Add' }], toolCalls: [] },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
          toolCalls: [toolCall],
        },
      ];
      const body = await captureRequestBody(provider, '', [], history);
      const assistantMsg = (body['messages'] as Record<string, unknown>[])[1]!;
      const serializedToolCall = (assistantMsg['tool_calls'] as Record<string, unknown>[])[0]!;

      expect(serializedToolCall['extras']).toEqual({ custom_field: 'custom_value' });
    });
  });

  describe('tool message multimodal protection', () => {
    it('forces extract_text when tool result contains image_url', async () => {
      const provider = createProvider();
      const toolCall: ToolCall = {
        type: 'function',
        id: 'call_img',
        name: 'add',
        arguments: '{}',
      };
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Add' }], toolCalls: [] },
        { role: 'assistant', content: [{ type: 'text', text: 'ok' }], toolCalls: [toolCall] },
        {
          role: 'tool',
          content: [
            { type: 'text', text: '5' },
            { type: 'image_url', imageUrl: { url: 'https://example.com/img.png' } },
          ] satisfies ContentPart[],
          toolCallId: 'call_img',
          toolCalls: [],
        },
      ];
      const body = await captureRequestBody(provider, '', [], history);
      const toolMsg = (body['messages'] as Record<string, unknown>[])[2]!;

      expect(typeof toolMsg['content']).toBe('string');
      expect(toolMsg['content']).toContain('5');
      expect(Array.isArray(toolMsg['content'])).toBe(false);
    });

    it('forces extract_text when tool result contains audio_url', async () => {
      const provider = createProvider();
      const toolCall: ToolCall = {
        type: 'function',
        id: 'call_audio',
        name: 'fetch_audio',
        arguments: '{}',
      };
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Play' }], toolCalls: [] },
        { role: 'assistant', content: [{ type: 'text', text: 'ok' }], toolCalls: [toolCall] },
        {
          role: 'tool',
          content: [
            { type: 'text', text: 'audio result' },
            { type: 'audio_url', audioUrl: { url: 'https://example.com/a.mp3' } },
          ] satisfies ContentPart[],
          toolCallId: 'call_audio',
          toolCalls: [],
        },
      ];
      const body = await captureRequestBody(provider, '', [], history);
      const toolMsg = (body['messages'] as Record<string, unknown>[])[2]!;

      expect(typeof toolMsg['content']).toBe('string');
    });

    it('forces extract_text when tool result contains video_url', async () => {
      const provider = createProvider();
      const toolCall: ToolCall = {
        type: 'function',
        id: 'call_video',
        name: 'fetch_video',
        arguments: '{}',
      };
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Show' }], toolCalls: [] },
        { role: 'assistant', content: [{ type: 'text', text: 'ok' }], toolCalls: [toolCall] },
        {
          role: 'tool',
          content: [
            { type: 'text', text: 'video result' },
            { type: 'video_url', videoUrl: { url: 'https://example.com/v.mp4' } },
          ] satisfies ContentPart[],
          toolCallId: 'call_video',
          toolCalls: [],
        },
      ];
      const body = await captureRequestBody(provider, '', [], history);
      const toolMsg = (body['messages'] as Record<string, unknown>[])[2]!;

      expect(typeof toolMsg['content']).toBe('string');
    });

    it('flattens tool message content to string when toolMessageConversion is extract_text', async () => {
      const provider = createProvider({ toolMessageConversion: 'extract_text' });
      const toolCall: ToolCall = {
        type: 'function',
        id: 'call_abc',
        name: 'add',
        arguments: '{}',
      };
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Add' }], toolCalls: [] },
        { role: 'assistant', content: [{ type: 'text', text: 'ok' }], toolCalls: [toolCall] },
        {
          role: 'tool',
          content: [
            { type: 'text', text: 'part-1' },
            { type: 'text', text: 'part-2' },
          ],
          toolCallId: 'call_abc',
          toolCalls: [],
        },
      ];
      const body = await captureRequestBody(provider, '', [], history);
      const toolMsg = (body['messages'] as Record<string, unknown>[])[2]!;

      expect(typeof toolMsg['content']).toBe('string');
      expect(toolMsg['content']).toBe('part-1part-2');
    });

    it('keeps default text-only tool message as plain string', async () => {
      const provider = createProvider();
      const toolCall: ToolCall = {
        type: 'function',
        id: 'call_text',
        name: 'add',
        arguments: '{}',
      };
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Add' }], toolCalls: [] },
        { role: 'assistant', content: [{ type: 'text', text: 'ok' }], toolCalls: [toolCall] },
        {
          role: 'tool',
          content: [{ type: 'text', text: '3' }],
          toolCallId: 'call_text',
          toolCalls: [],
        },
      ];
      const body = await captureRequestBody(provider, '', [], history);
      const toolMsg = (body['messages'] as Record<string, unknown>[])[2]!;

      expect(toolMsg['content']).toBe('3');
    });
  });

  describe('assistant tool call content omission', () => {
    const toolCall: ToolCall = {
      type: 'function',
      id: 'call_xyz',
      name: 'add',
      arguments: '{}',
    };

    it('omits content when assistant tool call content is empty', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Add' }], toolCalls: [] },
        { role: 'assistant', content: [], toolCalls: [toolCall] },
      ];
      const body = await captureRequestBody(provider, '', [], history);
      const assistantMessage = (body['messages'] as Record<string, unknown>[])[1];

      expect(assistantMessage).toEqual({
        role: 'assistant',
        tool_calls: [
          { type: 'function', id: 'call_xyz', function: { name: 'add', arguments: '{}' } },
        ],
      });
    });

    it('omits content when assistant tool call content is whitespace-only', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Add' }], toolCalls: [] },
        {
          role: 'assistant',
          content: [{ type: 'text', text: '   \n  ' }],
          toolCalls: [toolCall],
        },
      ];
      const body = await captureRequestBody(provider, '', [], history);
      const assistantMessage = (body['messages'] as Record<string, unknown>[])[1];

      expect(assistantMessage).toEqual({
        role: 'assistant',
        tool_calls: [
          { type: 'function', id: 'call_xyz', function: { name: 'add', arguments: '{}' } },
        ],
      });
    });

    it('keeps real assistant content alongside tool calls', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Add' }], toolCalls: [] },
        {
          role: 'assistant',
          content: [{ type: 'text', text: "I'll add those." }],
          toolCalls: [toolCall],
        },
      ];
      const body = await captureRequestBody(provider, '', [], history);
      const assistantMessage = (body['messages'] as Record<string, unknown>[])[1];

      expect(assistantMessage).toEqual({
        role: 'assistant',
        content: "I'll add those.",
        tool_calls: [
          { type: 'function', id: 'call_xyz', function: { name: 'add', arguments: '{}' } },
        ],
      });
    });
  });

  describe('reasoning content', () => {
    it('serializes ThinkPart to reasoning_content by default', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'What is 2+2?' }], toolCalls: [] },
        {
          role: 'assistant',
          content: [
            { type: 'think', think: 'Let me think...' },
            { type: 'text', text: '4.' },
          ],
          toolCalls: [],
        },
        { role: 'user', content: [{ type: 'text', text: 'Thanks!' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      expect(body['messages']).toEqual([
        { role: 'user', content: 'What is 2+2?' },
        { role: 'assistant', content: '4.', reasoning_content: 'Let me think...' },
        { role: 'user', content: 'Thanks!' },
      ]);
    });

    it('uses configured reasoningKey for outbound serialization', async () => {
      const provider = createProvider({ reasoningKey: 'reasoning_details' });
      const history: Message[] = [
        {
          role: 'assistant',
          content: [
            { type: 'think', think: 'thinking' },
            { type: 'text', text: 'reply' },
          ],
          toolCalls: [],
        },
      ];
      const body = await captureRequestBody(provider, '', [], history);
      const messages = body['messages'] as Record<string, unknown>[];

      expect(messages[0]).toEqual({
        role: 'assistant',
        content: 'reply',
        reasoning_details: 'thinking',
      });
      expect(messages[0]).not.toHaveProperty('reasoning_content');
    });

    it('treats blank reasoningKey as unset', async () => {
      const provider = createProvider({ reasoningKey: '' });
      const history: Message[] = [
        {
          role: 'assistant',
          content: [
            { type: 'think', think: 'thinking' },
            { type: 'text', text: 'answer' },
          ],
          toolCalls: [],
        },
      ];
      const body = await captureRequestBody(provider, '', [], history);
      const messages = body['messages'] as Record<string, unknown>[];

      expect(messages[0]).toEqual({
        role: 'assistant',
        content: 'answer',
        reasoning_content: 'thinking',
      });
    });
  });

  describe('multi-key reasoning extraction (inbound)', () => {
    it('reads reasoning_content from non-stream response', async () => {
      const provider = createProvider();
      (provider as any)._client.chat.completions.create = vi.fn().mockResolvedValue({
        id: 'chatcmpl-1',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'answer',
              reasoning_content: 'thinking via reasoning_content',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const stream = await provider.generate('', [], [
        { role: 'user', content: [{ type: 'text', text: 'q' }], toolCalls: [] },
      ]);
      const parts: StreamedMessagePart[] = [];
      for await (const part of stream) parts.push(part);

      expect(parts).toEqual([
        { type: 'think', think: 'thinking via reasoning_content' },
        { type: 'text', text: 'answer' },
      ]);
    });

    it('reads reasoning_details when reasoning_content is absent', async () => {
      const provider = createProvider();
      (provider as any)._client.chat.completions.create = vi.fn().mockResolvedValue({
        id: 'chatcmpl-2',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'answer',
              reasoning_details: 'thinking via reasoning_details',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const stream = await provider.generate('', [], [
        { role: 'user', content: [{ type: 'text', text: 'q' }], toolCalls: [] },
      ]);
      const parts: StreamedMessagePart[] = [];
      for await (const part of stream) parts.push(part);

      expect(parts).toEqual([
        { type: 'think', think: 'thinking via reasoning_details' },
        { type: 'text', text: 'answer' },
      ]);
    });

    it('reads reasoning when only that field is present', async () => {
      const provider = createProvider();
      (provider as any)._client.chat.completions.create = vi.fn().mockResolvedValue({
        id: 'chatcmpl-3',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'answer',
              reasoning: 'thinking via reasoning',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const stream = await provider.generate('', [], [
        { role: 'user', content: [{ type: 'text', text: 'q' }], toolCalls: [] },
      ]);
      const parts: StreamedMessagePart[] = [];
      for await (const part of stream) parts.push(part);

      expect(parts).toEqual([
        { type: 'think', think: 'thinking via reasoning' },
        { type: 'text', text: 'answer' },
      ]);
    });

    it('prioritizes reasoning_content over reasoning_details', async () => {
      const provider = createProvider();
      (provider as any)._client.chat.completions.create = vi.fn().mockResolvedValue({
        id: 'chatcmpl-4',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'answer',
              reasoning_content: 'primary',
              reasoning_details: 'secondary',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const stream = await provider.generate('', [], [
        { role: 'user', content: [{ type: 'text', text: 'q' }], toolCalls: [] },
      ]);
      const parts: StreamedMessagePart[] = [];
      for await (const part of stream) parts.push(part);

      expect(parts[0]).toEqual({ type: 'think', think: 'primary' });
    });

    it('explicit reasoningKey limits scan to that single field', async () => {
      const provider = createProvider({ reasoningKey: 'reasoning_details' });
      (provider as any)._client.chat.completions.create = vi.fn().mockResolvedValue({
        id: 'chatcmpl-5',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'answer',
              reasoning_content: 'should be ignored',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const stream = await provider.generate('', [], [
        { role: 'user', content: [{ type: 'text', text: 'q' }], toolCalls: [] },
      ]);
      const parts: StreamedMessagePart[] = [];
      for await (const part of stream) parts.push(part);

      expect(parts).toEqual([{ type: 'text', text: 'answer' }]);
    });

    it('extracts reasoning from streaming response', async () => {
      const provider = new OpenAICompletionsChatProvider({
        model: 'test',
        apiKey: 'test-key',
        stream: true,
        baseUrl: 'https://api.example.test/v1',
      });

      async function* mockedStream(): AsyncIterable<Record<string, unknown>> {
        yield { id: 'c1', choices: [{ index: 0, delta: { reasoning_content: 'think 1' } }] };
        yield { id: 'c1', choices: [{ index: 0, delta: { reasoning_content: ' think 2' } }] };
        yield { id: 'c1', choices: [{ index: 0, delta: { content: 'final' } }] };
        yield { id: 'c1', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] };
      }

      (provider as any)._client.chat.completions.create = vi
        .fn()
        .mockResolvedValue(mockedStream());

      const stream = await provider.generate('', [], [
        { role: 'user', content: [{ type: 'text', text: 'q' }], toolCalls: [] },
      ]);
      const parts: StreamedMessagePart[] = [];
      for await (const part of stream) parts.push(part);

      expect(parts).toEqual([
        { type: 'think', think: 'think 1' },
        { type: 'think', think: ' think 2' },
        { type: 'text', text: 'final' },
      ]);
    });
  });

  describe('generation kwargs', () => {
    it('normalizes max_tokens to max_completion_tokens on the wire', async () => {
      const provider = createProvider().withGenerationKwargs({
        temperature: 0.7,
        max_tokens: 2048,
      });
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      expect(body['temperature']).toBe(0.7);
      expect(body['max_completion_tokens']).toBe(2048);
      expect(body['max_tokens']).toBeUndefined();
    });

    it('sends no completion-token cap by default', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      expect(body['max_tokens']).toBeUndefined();
      expect(body['max_completion_tokens']).toBeUndefined();
    });

    it('prefers max_completion_tokens when both fields are set', async () => {
      const provider = createProvider().withGenerationKwargs({
        max_completion_tokens: 2048,
        max_tokens: 4096,
      });
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      expect(body['max_completion_tokens']).toBe(2048);
      expect(body['max_tokens']).toBeUndefined();
    });
  });

  describe('with thinking', () => {
    it('.withThinking("high") sets reasoning_effort and thinking config', async () => {
      const provider = createProvider().withThinking('high');
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Think' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      expect(body['reasoning_effort']).toBe('high');
      expect(body['thinking']).toEqual({ type: 'enabled' });
    });

    it('.withThinking("off") disables thinking', async () => {
      const provider = createProvider().withThinking('off');
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Think' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      expect(body['thinking']).toEqual({ type: 'disabled' });
    });

    it('uses custom thinkingEffortKey when configured', async () => {
      const provider = new OpenAICompletionsChatProvider({
        model: 'test',
        apiKey: 'test-key',
        baseUrl: 'https://api.example.test/v1',
        stream: false,
        thinkingEffortKey: 'thinking_effort',
      }).withThinking('high');
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Think' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      expect(body['thinking_effort']).toBe('high');
      expect(body['reasoning_effort']).toBeUndefined();
    });

    it('thinkingEffort property reflects current state', () => {
      const provider = createProvider();
      expect(provider.thinkingEffort).toBeNull();

      const withHigh = provider.withThinking('high');
      expect(withHigh.thinkingEffort).toBe('high');
    });

    it('returns a new instance without mutating the original', () => {
      const provider = createProvider();
      const newProvider = provider.withThinking('high');
      expect(newProvider).toBeInstanceOf(OpenAICompletionsChatProvider);
      expect(newProvider).not.toBe(provider);
      expect(provider.thinkingEffort).toBeNull();
    });
  });

  describe('auto reasoning_effort', () => {
    it('auto-injects reasoning_effort=high when history has ThinkPart', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }], toolCalls: [] },
        {
          role: 'assistant',
          content: [
            { type: 'think', think: 'Let me think...' },
            { type: 'text', text: 'Hi!' },
          ],
          toolCalls: [],
        },
        { role: 'user', content: [{ type: 'text', text: 'How are you?' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      expect(body['reasoning_effort']).toBe('high');
    });

    it('does not auto-inject reasoning_effort when history has no ThinkPart', async () => {
      const provider = createProvider();
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }], toolCalls: [] },
        { role: 'assistant', content: [{ type: 'text', text: 'Hi!' }], toolCalls: [] },
        { role: 'user', content: [{ type: 'text', text: 'How are you?' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      expect(body['reasoning_effort']).toBeUndefined();
    });

    it('does not overwrite reasoning_effort pinned via withGenerationKwargs', async () => {
      const provider = createProvider().withGenerationKwargs({
        reasoning_effort: 'low',
      });
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }], toolCalls: [] },
        {
          role: 'assistant',
          content: [
            { type: 'think', think: 'thinking' },
            { type: 'text', text: 'Hi!' },
          ],
          toolCalls: [],
        },
        { role: 'user', content: [{ type: 'text', text: 'Again?' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      expect(body['reasoning_effort']).toBe('low');
    });
  });

  describe('model capability', () => {
    it('returns registry capability for known models', () => {
      const provider = createProvider({ model: 'gpt-4o' });
      const cap = provider.getCapability('gpt-4o');
      // Known model should have non-UNKNOWN capability
      expect(cap).not.toEqual(UNKNOWN_CAPABILITY);
    });

    it('returns UNKNOWN_CAPABILITY for unknown models', () => {
      const provider = createProvider({ model: 'some-unknown-model' });
      const cap = provider.getCapability('some-unknown-model');
      expect(cap).toEqual(UNKNOWN_CAPABILITY);
    });
  });

  describe('usage extraction', () => {
    it('extracts top-level usage from streaming chunk', () => {
      const chunk = {
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
      expect(extractUsageFromChunk(chunk)).toEqual({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      });
    });

    it('extracts choices[0].usage from streaming chunk', () => {
      const chunk = {
        choices: [
          {
            index: 0,
            delta: {},
            usage: { prompt_tokens: 8, completion_tokens: 11, total_tokens: 19 },
          },
        ],
      };
      expect(extractUsageFromChunk(chunk)).toEqual({
        prompt_tokens: 8,
        completion_tokens: 11,
        total_tokens: 19,
      });
    });

    it('returns null when no usage is present', () => {
      expect(extractUsageFromChunk({ choices: [] })).toBeNull();
      expect(extractUsageFromChunk({ id: 'test' })).toBeNull();
    });
  });

  describe('withExtraBody', () => {
    it('hoists thinking to request top level', async () => {
      const provider = createProvider().withExtraBody({ thinking: { keep: 'all' } });
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'hi' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      expect(body['thinking']).toEqual({ keep: 'all' });
      expect(body['extra_body']).toBeUndefined();
    });

    it('merges thinking when called after withThinking', async () => {
      const provider = createProvider()
        .withThinking('high')
        .withExtraBody({ thinking: { keep: 'all' } });
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'hi' }], toolCalls: [] },
      ];
      const body = await captureRequestBody(provider, '', [], history);

      expect(body['thinking']).toEqual({ type: 'enabled', keep: 'all' });
    });
  });

  describe('clone client sharing', () => {
    function getInternalClient(provider: OpenAICompletionsChatProvider): unknown {
      return Reflect.get(provider, '_client');
    }

    it('withGenerationKwargs clone shares the same OpenAI client', () => {
      const original = createProvider();
      const clone = original.withGenerationKwargs({ max_completion_tokens: 1024 });
      expect(getInternalClient(clone)).not.toBeUndefined();
      expect(Object.is(getInternalClient(clone), getInternalClient(original))).toBe(true);
    });

    it('withThinking clone shares the same OpenAI client', () => {
      const original = createProvider();
      const clone = original.withThinking('high');
      expect(getInternalClient(clone)).not.toBeUndefined();
      expect(Object.is(getInternalClient(clone), getInternalClient(original))).toBe(true);
    });
  });
});
