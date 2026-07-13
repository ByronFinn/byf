import { join } from 'node:path';

// apps/vis/server/test/lib/context-projector.test.ts
import { describe, it, expect, afterEach } from 'vitest';

import { projectContext } from '../../src/lib/context-projector';
import { readAgentWire } from '../../src/lib/wire-reader';
import { buildSessionFixture } from '../fixtures/build';

describe('context-projector', () => {
  let cleanup: (() => Promise<void>) | null = null;
  afterEach(async () => {
    if (cleanup) await cleanup();
    cleanup = null;
  });

  it('projects messages and aggregates usage', async () => {
    const { sessionDir, cleanup: c } = await buildSessionFixture('sample-main');
    cleanup = c;
    const wire = await readAgentWire(join(sessionDir, 'agents', 'main', 'wire.jsonl'));
    const proj = await projectContext(wire.records);

    expect(proj.messages).toHaveLength(2);
    expect(proj.messages[0].message.role).toBe('user');
    // The assistant message is reconstructed from step.begin/content.part/step.end,
    // not from a separate `context.append_message` (agent-core never emits one).
    expect(proj.messages[1].message.role).toBe('assistant');
    expect(proj.messages[1].message.content).toEqual([{ type: 'text', text: 'hello' }]);

    expect(proj.usage.byScope.turn).toEqual({
      inputOther: 10,
      output: 5,
      inputCacheRead: 0,
      inputCacheCreation: 0,
    });
    // Fixture sample-main wire uses model "mock-model" on usage.record.
    expect(proj.usage.byModel['mock-model']).toEqual({
      inputOther: 10,
      output: 5,
      inputCacheRead: 0,
      inputCacheCreation: 0,
    });

    expect(proj.config.systemPrompt).toBe('You are BYF.');
    expect(proj.config.profileName).toBe('agent');
    expect(proj.permission.mode).toBe('manual');
  });

  it('reconstructs assistant tool-call messages and separates tool results', async () => {
    const entries = [
      {
        lineNo: 2,
        data: {
          type: 'context.append_message' as const,
          message: {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'list files' }],
            toolCalls: [],
          },
        },
        raw: {},
      },
      {
        lineNo: 3,
        data: {
          type: 'context.append_loop_event' as const,
          event: { type: 'step.begin' as const, uuid: 's1', turnId: 't1', step: 0 },
        },
        raw: {},
      },
      {
        lineNo: 4,
        data: {
          type: 'context.append_loop_event' as const,
          event: {
            type: 'content.part' as const,
            uuid: 'c1',
            turnId: 't1',
            step: 0,
            stepUuid: 's1',
            part: { type: 'text' as const, text: 'Let me check' },
          },
        },
        raw: {},
      },
      {
        lineNo: 5,
        data: {
          type: 'context.append_loop_event' as const,
          event: {
            type: 'tool.call' as const,
            uuid: 'tc1',
            turnId: 't1',
            step: 0,
            stepUuid: 's1',
            toolCallId: 'call_1',
            name: 'LS',
            args: { path: '/' },
          },
        },
        raw: {},
      },
      {
        lineNo: 6,
        data: {
          type: 'context.append_loop_event' as const,
          event: { type: 'step.end' as const, uuid: 's1', turnId: 't1', step: 0 },
        },
        raw: {},
      },
      {
        lineNo: 7,
        data: {
          type: 'context.append_loop_event' as const,
          event: {
            type: 'tool.result' as const,
            parentUuid: 'tc1',
            toolCallId: 'call_1',
            result: { output: 'file1.txt\nfile2.txt' },
          },
        },
        raw: {},
      },
    ];

    const proj = await projectContext(entries as any);
    expect(proj.messages).toHaveLength(3);

    expect(proj.messages[0].message.role).toBe('user');

    expect(proj.messages[1].message.role).toBe('assistant');
    expect(proj.messages[1].message.content).toEqual([{ type: 'text', text: 'Let me check' }]);
    expect(proj.messages[1].message.toolCalls).toEqual([
      { type: 'function', id: 'call_1', name: 'LS', arguments: '{"path":"/"}' },
    ]);
    // The assistant message was opened by step.begin (line 3), so its
    // anchor lineNo is that of step.begin even though content/toolCalls
    // were appended later.
    expect(proj.messages[1].lineNo).toBe(3);
    expect(proj.messages[1].toolStepUuids).toEqual(['s1']);

    expect(proj.messages[2].message.role).toBe('tool');
    expect(proj.messages[2].message.toolCallId).toBe('call_1');
    expect(proj.messages[2].message.content).toEqual([
      { type: 'text', text: 'file1.txt\nfile2.txt' },
    ]);
  });

  it('clears messages on context.clear', async () => {
    const entries = [
      {
        lineNo: 2,
        data: {
          type: 'context.append_message' as const,
          message: {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'a' }],
            toolCalls: [],
          },
        },
        raw: {},
      },
      { lineNo: 3, data: { type: 'context.clear' as const }, raw: {} },
      {
        lineNo: 4,
        data: {
          type: 'context.append_message' as const,
          message: {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'b' }],
            toolCalls: [],
          },
        },
        raw: {},
      },
    ];
    const proj = await projectContext(entries as any);
    expect(proj.messages).toHaveLength(1);
    expect(proj.messages[0].message.content[0]).toMatchObject({ text: 'b' });
  });

  it('applies compaction summary as a synthetic message', async () => {
    const entries = [
      {
        lineNo: 2,
        data: {
          type: 'context.append_message' as const,
          message: {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'old' }],
            toolCalls: [],
          },
        },
        raw: {},
      },
      {
        lineNo: 3,
        data: {
          type: 'context.apply_compaction' as const,
          summary: 'old stuff',
          compactedCount: 1,
          tokensBefore: 100,
          tokensAfter: 30,
        },
        raw: {},
      },
      {
        lineNo: 4,
        data: {
          type: 'context.append_message' as const,
          message: {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'new' }],
            toolCalls: [],
          },
        },
        raw: {},
      },
    ];
    const proj = await projectContext(entries as any);
    expect(proj.messages[0].source).toBe('compaction_summary');
    // Compaction summary is an assistant message (agent-core's own
    // representation), not a synthetic system message.
    expect(proj.messages[0].message.role).toBe('assistant');
    expect(proj.messages[0].message.origin).toEqual({ kind: 'compaction_summary' });
    expect(proj.messages[0].message.content[0]).toMatchObject({ text: 'old stuff' });
    expect(proj.messages[1].message.content[0]).toMatchObject({ text: 'new' });
  });

  // Cross-boundary consistency: vis's projectContext must produce the same
  // message sequence as the pure wire-fold function (shared with the live
  // agent's ContextMemory). These cases target the three known divergence
  // points the old hand-written projector had: empty/error tool output
  // normalisation, partial compaction (keeping the post-summary tail), and
  // deferred-message ordering during tool exchanges. See PRD-0025 AC2.
  describe('cross-boundary parity with wire-fold', () => {
    it('normalises empty and error tool outputs the same way the live agent does', async () => {
      const entries = [
        {
          lineNo: 2,
          data: {
            type: 'context.append_loop_event' as const,
            event: { type: 'step.begin' as const, uuid: 's1', turnId: 't1', step: 0 },
          },
          raw: {},
        },
        {
          lineNo: 3,
          data: {
            type: 'context.append_loop_event' as const,
            event: {
              type: 'tool.call' as const,
              uuid: 'c1',
              turnId: 't1',
              step: 0,
              stepUuid: 's1',
              toolCallId: 'call_err',
              name: 'Bash',
              args: { cmd: 'bad' },
            },
          },
          raw: {},
        },
        {
          lineNo: 4,
          data: {
            type: 'context.append_loop_event' as const,
            event: {
              type: 'tool.result' as const,
              parentUuid: 'c1',
              toolCallId: 'call_err',
              result: { output: 'permission denied', isError: true },
            },
          },
          raw: {},
        },
        {
          lineNo: 5,
          data: {
            type: 'context.append_loop_event' as const,
            event: { type: 'step.end' as const, uuid: 's1', turnId: 't1', step: 0 },
          },
          raw: {},
        },
      ];
      const proj = await projectContext(entries as any);
      // The error marker must be present — previously vis showed raw output.
      const toolContent = proj.messages[1].message.content[0] as { text: string };
      expect(toolContent.text).toContain('<system>ERROR: Tool execution failed.</system>');
      expect(toolContent.text).toContain('permission denied');
    });

    it('partial compaction keeps the post-summary tail (no message loss)', async () => {
      const entries = [
        {
          lineNo: 2,
          data: {
            type: 'context.append_message' as const,
            message: {
              role: 'user' as const,
              content: [{ type: 'text' as const, text: 'old 1' }],
              toolCalls: [],
            },
          },
          raw: {},
        },
        {
          lineNo: 3,
          data: {
            type: 'context.append_message' as const,
            message: {
              role: 'user' as const,
              content: [{ type: 'text' as const, text: 'old 2' }],
              toolCalls: [],
            },
          },
          raw: {},
        },
        {
          lineNo: 4,
          data: {
            type: 'context.apply_compaction' as const,
            summary: 'compacted two messages',
            compactedCount: 2,
            tokensBefore: 100,
            tokensAfter: 30,
          },
          raw: {},
        },
        {
          lineNo: 5,
          data: {
            type: 'context.append_message' as const,
            message: {
              role: 'user' as const,
              content: [{ type: 'text' as const, text: 'survives compaction' }],
              toolCalls: [],
            },
          },
          raw: {},
        },
      ];
      const proj = await projectContext(entries as any);
      // [summary, post-compaction-tail] — NOT just [summary].
      expect(proj.messages).toHaveLength(2);
      expect(proj.messages[0].source).toBe('compaction_summary');
      expect(proj.messages[0].message.content[0]).toMatchObject({ text: 'compacted two messages' });
      expect(proj.messages[1].message.content[0]).toMatchObject({ text: 'survives compaction' });
    });

    it('defers messages during an open tool exchange and flushes when it closes', async () => {
      // Simulate: step.begin → tool.call → (background message arrives, must
      // defer) → tool.result → deferred message flushes after the tool message.
      const entries = [
        {
          lineNo: 2,
          data: {
            type: 'context.append_loop_event' as const,
            event: { type: 'step.begin' as const, uuid: 's1', turnId: 't1', step: 0 },
          },
          raw: {},
        },
        {
          lineNo: 3,
          data: {
            type: 'context.append_loop_event' as const,
            event: {
              type: 'tool.call' as const,
              uuid: 'c1',
              turnId: 't1',
              step: 0,
              stepUuid: 's1',
              toolCallId: 'call_1',
              name: 'Bash',
              args: { cmd: 'ls' },
            },
          },
          raw: {},
        },
        {
          lineNo: 4,
          data: {
            type: 'context.append_message' as const,
            message: {
              role: 'user' as const,
              content: [{ type: 'text' as const, text: 'bg notification' }],
              toolCalls: [],
              origin: { kind: 'background_task' as const, taskId: 't1' },
            },
          },
          raw: {},
        },
        {
          lineNo: 5,
          data: {
            type: 'context.append_loop_event' as const,
            event: {
              type: 'tool.result' as const,
              parentUuid: 'c1',
              toolCallId: 'call_1',
              result: { output: 'file.txt' },
            },
          },
          raw: {},
        },
        {
          lineNo: 6,
          data: {
            type: 'context.append_loop_event' as const,
            event: { type: 'step.end' as const, uuid: 's1', turnId: 't1', step: 0 },
          },
          raw: {},
        },
      ];
      const proj = await projectContext(entries as any);
      // Order: [assistant(step.begin), tool(result), user(bg, flushed after tool)]
      const roles = proj.messages.map((m) => m.message.role);
      expect(roles).toEqual(['assistant', 'tool', 'user']);
    });
  });
});
