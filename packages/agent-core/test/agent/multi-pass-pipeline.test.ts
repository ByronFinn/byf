import { describe, expect, it, vi } from 'vitest';

import { testAgent } from './harness/agent';
import { createFakeKaos } from '../tools/fixtures/fake-kaos';

describe('Output offloading integration', () => {
  it('offloads large tool result to scratch file', async () => {
    const written = new Map<string, string>();
    const kaos = createFakeKaos({
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeText: vi.fn().mockImplementation(async (path: string, content: string) => {
        written.set(path, content);
        return content.length;
      }),
      readText: vi.fn().mockImplementation(async (path: string) => {
        const c = written.get(path);
        if (c === undefined) throw new Error('ENOENT');
        return c;
      }),
      stat: vi.fn().mockRejectedValue(new Error('ENOENT')),
    });

    const ctx = testAgent({ kaos, homedir: '/home/byf', sessionId: 'test-session' });
    ctx.configure();

    const largeOutput = 'a'.repeat(32_001);

    ctx.agent.context.appendUserMessage([{ type: 'text', text: 'run tool' }]);
    await ctx.agent.context.appendLoopEvent({
      type: 'step.begin',
      uuid: 'step-1',
      turnId: '0',
      step: 1,
    });
    await ctx.agent.context.appendLoopEvent({
      type: 'tool.call',
      uuid: 'tc-1',
      turnId: '0',
      step: 1,
      stepUuid: 'step-1',
      toolCallId: 'call_1',
      name: 'Read',
      args: {},
    });
    await ctx.agent.context.appendLoopEvent({
      type: 'tool.result',
      parentUuid: 'tc-1',
      toolCallId: 'call_1',
      result: { output: largeOutput },
    });

    const toolMessage = ctx.agent.context.history.find((m) => m.role === 'tool');
    expect(toolMessage).toBeDefined();
    const content = toolMessage!.content[0]?.type === 'text' ? toolMessage!.content[0].text : '';
    expect(content).not.toBe(largeOutput);
    expect(content).toContain('Tool output offloaded');
    expect(content).toContain('/home/byf/sessions/test-session/scratch/call_1.txt');
    expect(written.get('/home/byf/sessions/test-session/scratch/call_1.txt')).toBe(largeOutput);
  });

  it('does not offload small tool result', async () => {
    const kaos = createFakeKaos({
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeText: vi.fn().mockResolvedValue(12),
      stat: vi.fn().mockRejectedValue(new Error('ENOENT')),
    });

    const ctx = testAgent({ kaos, homedir: '/home/byf', sessionId: 'test-session' });
    ctx.configure();

    const smallOutput = 'small result';

    ctx.agent.context.appendUserMessage([{ type: 'text', text: 'run tool' }]);
    await ctx.agent.context.appendLoopEvent({
      type: 'step.begin',
      uuid: 'step-1',
      turnId: '0',
      step: 1,
    });
    await ctx.agent.context.appendLoopEvent({
      type: 'tool.call',
      uuid: 'tc-1',
      turnId: '0',
      step: 1,
      stepUuid: 'step-1',
      toolCallId: 'call_1',
      name: 'Read',
      args: {},
    });
    await ctx.agent.context.appendLoopEvent({
      type: 'tool.result',
      parentUuid: 'tc-1',
      toolCallId: 'call_1',
      result: { output: smallOutput },
    });

    const toolMessage = ctx.agent.context.history.find((m) => m.role === 'tool');
    const content = toolMessage!.content[0]?.type === 'text' ? toolMessage!.content[0].text : '';
    expect(content).toBe(smallOutput);
    expect(kaos.writeText).not.toHaveBeenCalled();
  });
});

describe('Multi-pass compaction pipeline', () => {
  it('applies masking before checking compaction', async () => {
    const ctx = testAgent();
    ctx.configure({
      modelCapabilities: {
        max_context_tokens: 5_000,
        tool_use: true,
        image_in: true,
        video_in: true,
        audio_in: true,
        thinking: true,
        thinking_effort: true,
        thinking_xhigh: true,
        thinking_max: true,
      },
    });

    // Fill context to near capacity with low-priority tool results
    const toolResults: string[] = [];
    for (let i = 0; i < 50; i++) {
      toolResults.push('line\n'.repeat(50));
    }

    ctx.agent.context.appendUserMessage([{ type: 'text', text: 'run tools' }]);
    await ctx.agent.context.appendLoopEvent({
      type: 'step.begin',
      uuid: 'step-1',
      turnId: '0',
      step: 1,
    });
    for (let i = 0; i < toolResults.length; i++) {
      await ctx.agent.context.appendLoopEvent({
        type: 'tool.call',
        uuid: `tc-${String(i)}`,
        turnId: '0',
        step: 1,
        stepUuid: 'step-1',
        toolCallId: `call_${String(i)}`,
        name: 'Read',
        args: {},
      });
      await ctx.agent.context.appendLoopEvent({
        type: 'tool.result',
        parentUuid: `tc-${String(i)}`,
        toolCallId: `call_${String(i)}`,
        result: { output: toolResults[i]! },
      });
    }
    await ctx.agent.context.appendLoopEvent({
      type: 'step.end',
      uuid: 'step-1',
      turnId: '0',
      step: 1,
      usage: {
        inputOther: 0,
        output: 0,
        inputCacheRead: 0,
        inputCacheCreation: 0,
      },
      finishReason: 'end_turn',
    });

    const beforeTokens = ctx.agent.context.tokenCountWithPending;

    // Trigger beforeStep which should apply masking
    await ctx.agent.fullCompaction.beforeStep(new AbortController().signal);

    const afterTokens = ctx.agent.context.tokenCountWithPending;
    expect(afterTokens).toBeLessThan(beforeTokens);
  });
});
