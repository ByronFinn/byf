import { join } from 'node:path';

// apps/vis/server/test/lib/context-projector.test.ts
import {
  createWireFoldState,
  foldAppendMessage,
  foldApplyCompaction,
  foldLoopEvent,
  type ContextMessage,
  type LoopRecordedEvent,
} from '@byfriends/agent-core';
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

  // PRD-0025 AC2: pure wire-fold and vis projectContext must produce the same
  // ContextMessage sequence for the known divergence points (empty/error tool
  // output, true partial compaction with residual tail, deferred messages).
  // Kernel vs pure is locked in agent-core context.test.ts; here we lock
  // pure vs vis on the same fixtures.
  describe('cross-boundary parity with wire-fold', () => {
    async function pureHistoryFromEntries(
      entries: ReadonlyArray<{ data: { type: string } & Record<string, unknown> }>,
    ): Promise<ContextMessage[]> {
      const state = createWireFoldState();
      const handlers = { onMessage: () => {} };
      for (const entry of entries) {
        const rec = entry.data;
        if (rec.type === 'context.append_message') {
          foldAppendMessage(state, rec.message as ContextMessage, handlers);
        } else if (rec.type === 'context.append_loop_event') {
          await foldLoopEvent(state, rec.event as LoopRecordedEvent, handlers);
        } else if (rec.type === 'context.apply_compaction') {
          foldApplyCompaction(
            state,
            {
              summary: rec.summary as string,
              compactedCount: rec.compactedCount as number,
            },
            handlers,
          );
        } else if (rec.type === 'context.clear') {
          state.history.length = 0;
          state.openSteps.clear();
          state.pendingToolResultIds.clear();
          state.toolCallInfo.clear();
          state.deferredMessages.length = 0;
        }
      }
      return [...state.history];
    }

    it('three-way equality: pure fold === vis projectContext on empty/error tool + true partial compaction', async () => {
      // History before compact: [old1, old2, remaining] — compactedCount 2 keeps remaining.
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
            type: 'context.append_message' as const,
            message: {
              role: 'user' as const,
              content: [{ type: 'text' as const, text: 'remaining tail' }],
              toolCalls: [],
            },
          },
          raw: {},
        },
        {
          lineNo: 5,
          data: {
            type: 'context.append_loop_event' as const,
            event: { type: 'step.begin' as const, uuid: 's1', turnId: 't1', step: 0 },
          },
          raw: {},
        },
        {
          lineNo: 6,
          data: {
            type: 'context.append_loop_event' as const,
            event: {
              type: 'tool.call' as const,
              uuid: 'c_empty',
              turnId: 't1',
              step: 0,
              stepUuid: 's1',
              toolCallId: 'call_empty',
              name: 'Bash',
              args: { cmd: 'true' },
            },
          },
          raw: {},
        },
        {
          lineNo: 7,
          data: {
            type: 'context.append_loop_event' as const,
            event: {
              type: 'tool.result' as const,
              parentUuid: 'c_empty',
              toolCallId: 'call_empty',
              result: { output: '' },
            },
          },
          raw: {},
        },
        {
          lineNo: 8,
          data: {
            type: 'context.append_loop_event' as const,
            event: {
              type: 'tool.call' as const,
              uuid: 'c_err',
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
          lineNo: 9,
          data: {
            type: 'context.append_loop_event' as const,
            event: {
              type: 'tool.result' as const,
              parentUuid: 'c_err',
              toolCallId: 'call_err',
              result: { output: 'permission denied', isError: true },
            },
          },
          raw: {},
        },
        {
          lineNo: 10,
          data: {
            type: 'context.append_loop_event' as const,
            event: { type: 'step.end' as const, uuid: 's1', turnId: 't1', step: 0 },
          },
          raw: {},
        },
        {
          lineNo: 11,
          data: {
            type: 'context.apply_compaction' as const,
            summary: 'compacted old 1+2',
            compactedCount: 2,
            tokensBefore: 100,
            tokensAfter: 40,
          },
          raw: {},
        },
      ];

      const pure = await pureHistoryFromEntries(entries);
      const proj = await projectContext(entries as any);
      const visMessages = proj.messages.map((m) => m.message);

      expect(visMessages).toEqual(pure);

      // True partial compaction: compactedCount < history.length at compact time
      // yields [summary, remaining, assistant, tool_empty, tool_err] — NOT just [summary].
      expect(pure).toHaveLength(5);
      expect(pure[0]?.origin).toEqual({ kind: 'compaction_summary' });
      expect(pure[1]?.content).toEqual([{ type: 'text', text: 'remaining tail' }]);
      expect(pure[3]?.content).toEqual([
        { type: 'text', text: '<system>Tool output is empty.</system>' },
      ]);
      expect(pure[4]?.content).toEqual([
        {
          type: 'text',
          text: '<system>ERROR: Tool execution failed.</system>\npermission denied',
        },
      ]);
    });

    it('defers messages during an open tool exchange and flushes when it closes', async () => {
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
      const pure = await pureHistoryFromEntries(entries);
      const proj = await projectContext(entries as any);
      expect(proj.messages.map((m) => m.message)).toEqual(pure);
      expect(pure.map((m) => m.role)).toEqual(['assistant', 'tool', 'user']);
    });
  });
});
