import { describe, expect, it } from 'vitest';

import type { Message, StreamedMessagePart, ToolCall } from '#/message';
import type { StreamedMessage } from '#/provider';
import { OpenAICompletionsChatProvider } from '#/providers/openai-completions';
import type { Tool } from '#/tool';

import { createFakeProviderHarness, type FakeProviderHarness } from './fake-provider-harness';

function createProvider(
  baseUrl: string,
  opts?: { stream?: boolean; reasoningKey?: string },
): OpenAICompletionsChatProvider {
  return new OpenAICompletionsChatProvider({
    model: 'test-model',
    apiKey: 'test-key',
    baseUrl,
    stream: opts?.stream ?? true,
    reasoningKey: opts?.reasoningKey,
  }).withThinking('high');
}

function createProviderWithoutThinking(baseUrl: string): OpenAICompletionsChatProvider {
  return new OpenAICompletionsChatProvider({
    model: 'test-model',
    apiKey: 'test-key',
    baseUrl,
    stream: true,
  });
}

async function withHarness<T>(fn: (harness: FakeProviderHarness) => Promise<T>): Promise<T> {
  const harness = await createFakeProviderHarness();
  try {
    return await fn(harness);
  } finally {
    await harness.close();
  }
}

async function collectStream(
  provider: OpenAICompletionsChatProvider,
  systemPrompt: string,
  tools: Tool[],
  history: Message[],
): Promise<{ id: string | null; usage: unknown; parts: StreamedMessagePart[] }> {
  const stream: StreamedMessage = await provider.generate(systemPrompt, tools, history);
  const parts: StreamedMessagePart[] = [];
  for await (const part of stream) {
    parts.push(part);
  }
  return { id: stream.id, usage: stream.usage, parts };
}

const LOOKUP_TOOL: Tool = {
  name: 'lookup_weather',
  description: 'Look up the weather for a city.',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string' },
    },
    required: ['city'],
    additionalProperties: false,
  },
};

function makeChunk(
  delta: Record<string, unknown>,
  opts?: { id?: string; finishReason?: string; usage?: Record<string, unknown> },
): Record<string, unknown> {
  const chunk: Record<string, unknown> = {
    id: opts?.id ?? 'chatcmpl-e2e-1',
    object: 'chat.completion.chunk',
    created: 1234567890,
    model: 'test-model',
    choices: [
      {
        index: 0,
        delta,
        finish_reason: opts?.finishReason ?? null,
      },
    ],
  };
  if (opts?.usage !== undefined) {
    chunk['choices'] = [
      {
        index: 0,
        delta,
        finish_reason: opts?.finishReason ?? null,
        usage: opts.usage,
      },
    ];
  }
  return chunk;
}

describe('e2e: openai-completions adapter', () => {
  it('streams reasoning + text + tool-call deltas and preserves usage', async () => {
    await withHarness(async (harness) => {
      let capturedRequest: Record<string, unknown> | null = null;

      harness.route('POST', '/v1/chat/completions', async (request, reply) => {
        capturedRequest = request.bodyJson as Record<string, unknown>;
        await reply.sseJson(200, [
          makeChunk({ reasoning_content: 'Let me think. ' }),
          makeChunk({ content: 'All set. ' }),
          makeChunk({
            tool_calls: [
              {
                index: 0,
                id: 'call_weather',
                function: { name: 'lookup_weather', arguments: '{"city":"' },
              },
            ],
          }),
          makeChunk({
            tool_calls: [{ index: 0, function: { arguments: 'Shanghai"}' } }],
          }),
          makeChunk(
            {},
            {
              finishReason: 'tool_calls',
              usage: {
                prompt_tokens: 12,
                completion_tokens: 6,
                total_tokens: 18,
                cached_tokens: 2,
              },
            },
          ),
        ]);
      });

      const provider = createProvider(`${harness.baseUrl}/v1`);
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Check the weather.' }], toolCalls: [] },
        {
          role: 'assistant',
          content: [
            { type: 'think', think: 'I should call a tool.' },
            { type: 'text', text: 'I will look it up.' },
          ],
          toolCalls: [
            {
              type: 'function',
              id: 'call_weather',
              name: 'lookup_weather',
              arguments: '{"city":"Shanghai"}',
            } satisfies ToolCall,
          ],
        },
        {
          role: 'tool',
          content: [{ type: 'text', text: 'sunny and 26C' }],
          toolCallId: 'call_weather',
          toolCalls: [],
        },
      ];

      const result = await collectStream(provider, 'You are helpful.', [LOOKUP_TOOL], history);

      expect(capturedRequest).toMatchObject({
        model: 'test-model',
        stream: true,
        stream_options: { include_usage: true },
        reasoning_effort: 'high',
        thinking: { type: 'enabled' },
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Check the weather.' },
          {
            role: 'assistant',
            content: 'I will look it up.',
            reasoning_content: 'I should call a tool.',
            tool_calls: [
              {
                type: 'function',
                id: 'call_weather',
                function: { name: 'lookup_weather', arguments: '{"city":"Shanghai"}' },
              },
            ],
          },
          { role: 'tool', content: 'sunny and 26C', tool_call_id: 'call_weather' },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'lookup_weather',
              description: 'Look up the weather for a city.',
              parameters: {
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city'],
                additionalProperties: false,
              },
            },
          },
        ],
      });

      expect(harness.requests).toHaveLength(1);
      expect(harness.requests[0].pathname).toBe('/v1/chat/completions');
      expect(harness.requests[0].headers['authorization']).toBe('Bearer test-key');
      expect(result.id).toBe('chatcmpl-e2e-1');
      expect(result.usage).toEqual({
        inputOther: 10,
        output: 6,
        inputCacheRead: 2,
        inputCacheCreation: 0,
      });
      expect(result.parts).toHaveLength(4);
      expect(result.parts[0]).toMatchObject({ type: 'think', think: 'Let me think. ' });
      expect(result.parts[1]).toMatchObject({ type: 'text', text: 'All set. ' });
      expect(result.parts[2]).toMatchObject({
        type: 'function',
        id: 'call_weather',
        name: 'lookup_weather',
        arguments: '{"city":"',
      });
      expect(result.parts[2]).toHaveProperty('_streamIndex', 0);
      expect(result.parts[3]).toMatchObject({
        type: 'tool_call_part',
        argumentsPart: 'Shanghai"}',
      });
      expect(result.parts[3]).toHaveProperty('index', 0);
    });
  });

  it('propagates upstream HTTP failures as APIStatusError', async () => {
    await withHarness(async (harness) => {
      let capturedRequest: Record<string, unknown> | null = null;

      harness.route('POST', '/v1/chat/completions', async (request, reply) => {
        capturedRequest = request.bodyJson as Record<string, unknown>;
        await reply.json(
          500,
          {
            error: {
              message: 'upstream unavailable',
              type: 'server_error',
            },
          },
          { 'x-should-retry': 'false' },
        );
      });

      const provider = createProvider(`${harness.baseUrl}/v1`);
      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Check the weather.' }], toolCalls: [] },
      ];

      await expect(collectStream(provider, '', [LOOKUP_TOOL], history)).rejects.toMatchObject({
        name: 'APIStatusError',
        statusCode: 500,
      });
      expect(capturedRequest).toMatchObject({
        model: 'test-model',
        stream: true,
        stream_options: { include_usage: true },
        reasoning_effort: 'high',
      });
      expect(harness.requests.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('handles non-stream response with reasoning and tool calls', async () => {
    await withHarness(async (harness) => {
      let capturedRequest: Record<string, unknown> | null = null;

      harness.route('POST', '/v1/chat/completions', async (request, reply) => {
        capturedRequest = request.bodyJson as Record<string, unknown>;
        await reply.json(200, {
          id: 'chatcmpl-nonstream-e2e',
          object: 'chat.completion',
          created: 1234567890,
          model: 'test-model',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'The answer is 42.',
                reasoning_content: 'Let me reason about this.',
                tool_calls: [
                  {
                    id: 'call_calc',
                    type: 'function',
                    function: { name: 'lookup_weather', arguments: '{"city":"Berlin"}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
        });
      });

      const provider = new OpenAICompletionsChatProvider({
        model: 'test-model',
        apiKey: 'test-key',
        baseUrl: `${harness.baseUrl}/v1`,
        stream: false,
      });

      const history: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'What is the answer?' }], toolCalls: [] },
      ];
      const result = await collectStream(provider, 'Be concise.', [LOOKUP_TOOL], history);

      expect(capturedRequest).toMatchObject({
        model: 'test-model',
        stream: false,
        messages: [
          { role: 'system', content: 'Be concise.' },
          { role: 'user', content: 'What is the answer?' },
        ],
      });
      expect(harness.requests[0].headers['authorization']).toBe('Bearer test-key');
      expect(result.id).toBe('chatcmpl-nonstream-e2e');
      expect(result.usage).toEqual({
        inputOther: 20,
        output: 10,
        inputCacheRead: 0,
        inputCacheCreation: 0,
      });
      expect(result.parts).toEqual([
        { type: 'think', think: 'Let me reason about this.' },
        { type: 'text', text: 'The answer is 42.' },
        {
          type: 'function',
          id: 'call_calc',
          name: 'lookup_weather',
          arguments: '{"city":"Berlin"}',
        },
      ]);
    });
  });
});
