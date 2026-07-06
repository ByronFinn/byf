import type {
  AgentReplayRecord,
  BackgroundTaskInfo,
  ContentPart,
  PromptOrigin,
  ResumedAgentState,
  Role,
  ToolCall,
} from '@byfriends/sdk';
import { describe, expect, it } from 'vitest';

import { distillSubagents, projectReplayRecords } from '#/tui/actions/replay-ops';

interface ReplayMessageExtra {
  readonly toolCalls?: readonly ToolCall[];
  readonly toolCallId?: string;
  readonly origin?: PromptOrigin;
  readonly isError?: boolean;
}

function message(
  role: Role,
  content: readonly ContentPart[],
  extra: ReplayMessageExtra = {},
): AgentReplayRecord {
  return {
    type: 'message',
    message: {
      role,
      content: [...content],
      toolCalls: [...(extra.toolCalls ?? [])],
      toolCallId: extra.toolCallId,
      origin: extra.origin,
      isError: extra.isError,
    },
  };
}

function backgroundTask(
  taskId: string,
  description: string,
  status: BackgroundTaskInfo['status'] = 'running',
): BackgroundTaskInfo {
  return {
    taskId,
    command: `[agent] ${description}`,
    description,
    status,
    pid: 0,
    exitCode: status === 'completed' ? 0 : null,
    startedAt: 1,
    endedAt: status === 'running' || status === 'awaiting_approval' ? null : 2,
  };
}

describe('projectReplayRecords', () => {
  it('projects only the most recent ten visible user turns from agent replay', () => {
    const projected = projectReplayRecords(
      Array.from({ length: 12 }, (_, index) => [
        message('user', [{ type: 'text', text: `prompt ${index}` }]),
        message('assistant', [{ type: 'text', text: `answer ${index}` }]),
      ]).flat(),
    );

    expect(
      projected.entries.filter((entry) => entry.kind === 'user').map((entry) => entry.content),
    ).toEqual([
      'prompt 2',
      'prompt 3',
      'prompt 4',
      'prompt 5',
      'prompt 6',
      'prompt 7',
      'prompt 8',
      'prompt 9',
      'prompt 10',
      'prompt 11',
    ]);
    expect(
      projected.entries.filter((entry) => entry.kind === 'assistant').map((entry) => entry.content),
    ).toEqual([
      'answer 2',
      'answer 3',
      'answer 4',
      'answer 5',
      'answer 6',
      'answer 7',
      'answer 8',
      'answer 9',
      'answer 10',
      'answer 11',
    ]);
  });

  it('does not count model-triggered skill activations as user turns', () => {
    const records: AgentReplayRecord[] = Array.from({ length: 9 }, (_, index) => [
      message('user', [{ type: 'text', text: `prompt ${index}` }]),
      message('assistant', [{ type: 'text', text: `answer ${index}` }]),
    ]).flat();
    for (const index of [0, 1, 2, 3]) {
      records.push(
        message('user', [{ type: 'text', text: `Skill body ${index}` }], {
          origin: {
            kind: 'skill_activation',
            activationId: `act-${index}`,
            skillName: 'review',
            trigger: 'model-tool',
          },
        }),
      );
    }

    const projected = projectReplayRecords(records);

    expect(
      projected.entries.filter((entry) => entry.kind === 'user').map((entry) => entry.content),
    ).toEqual([
      'prompt 0',
      'prompt 1',
      'prompt 2',
      'prompt 3',
      'prompt 4',
      'prompt 5',
      'prompt 6',
      'prompt 7',
      'prompt 8',
    ]);
    expect(projected.entries.filter((entry) => entry.kind === 'skill_activation')).toHaveLength(4);
  });

  it('projects UserPromptSubmit hook results as assistant transcript entries', () => {
    const hookResult =
      '<hook_result hook_event="UserPromptSubmit">\nhook response 1\n</hook_result>\n<hook_result hook_event="UserPromptSubmit">\nhook response 2\n</hook_result>';
    const projected = projectReplayRecords([
      message('user', [{ type: 'text', text: 'prompt' }]),
      message('user', [{ type: 'text', text: hookResult }], {
        origin: { kind: 'hook_result', event: 'UserPromptSubmit' },
      }),
      message('assistant', [{ type: 'text', text: 'model response' }]),
    ]);

    expect(projected.entries.map((e) => [e.kind, e.content])).toEqual([
      ['user', 'prompt'],
      [
        'assistant',
        '*UserPromptSubmit hook*\n\nhook response 1\n\n*UserPromptSubmit hook*\n\nhook response 2',
      ],
      ['assistant', 'model response'],
    ]);
  });

  it('projects blocking UserPromptSubmit hook results from replayed assistant entries', () => {
    const hookResult =
      '<hook_result hook_event="UserPromptSubmit">\nblocked reason\n</hook_result>';
    const projected = projectReplayRecords([
      message('user', [{ type: 'text', text: 'blocked prompt' }]),
      message('assistant', [{ type: 'text', text: hookResult }], {
        origin: { kind: 'hook_result', event: 'UserPromptSubmit', blocked: true },
      }),
    ]);

    expect(projected.entries.map((e) => [e.kind, e.content])).toEqual([
      ['user', 'blocked prompt'],
      ['assistant', '*UserPromptSubmit hook blocked*\n\nblocked reason'],
    ]);
  });

  it('does not infer blocked UserPromptSubmit hook results from assistant role alone', () => {
    const hookResult =
      '<hook_result hook_event="UserPromptSubmit">\nlegacy hook response\n</hook_result>';
    const projected = projectReplayRecords([
      message('user', [{ type: 'text', text: 'prompt' }]),
      message('assistant', [{ type: 'text', text: hookResult }], {
        origin: { kind: 'hook_result', event: 'UserPromptSubmit' },
      }),
    ]);

    expect(projected.entries.map((e) => [e.kind, e.content])).toEqual([
      ['user', 'prompt'],
      ['assistant', '*UserPromptSubmit hook*\n\nlegacy hook response'],
    ]);
  });

  it('preserves literal hook result XML from normal assistant replies', () => {
    const hookResult = '<hook_result hook_event="UserPromptSubmit">\nhook response\n</hook_result>';
    const projected = projectReplayRecords([
      message('user', [{ type: 'text', text: 'show me the hook XML' }]),
      message('assistant', [{ type: 'text', text: hookResult }]),
    ]);

    expect(projected.entries.map((e) => [e.kind, e.content])).toEqual([
      ['user', 'show me the hook XML'],
      ['assistant', hookResult],
    ]);
  });

  it('projects user messages plus thinking and assistant content', () => {
    const projected = projectReplayRecords([
      message('user', [{ type: 'text', text: 'hello' }]),
      message('assistant', [
        { type: 'think', think: 'thinking...' },
        { type: 'text', text: 'answer' },
      ]),
    ]);

    expect(projected.entries.map((e) => [e.kind, e.content])).toEqual([
      ['user', 'hello'],
      ['thinking', 'thinking...'],
      ['assistant', 'answer'],
    ]);
  });

  it('projects skill activation origin metadata without exposing the full prompt', () => {
    const projected = projectReplayRecords([
      message(
        'user',
        [{ type: 'text', text: 'Review the requested file.\n\nUser request:\nsrc/app.ts' }],
        {
          origin: {
            kind: 'skill_activation',
            activationId: 'act-1',
            skillName: 'review',
            skillArgs: 'src/app.ts',
            trigger: 'user-slash',
          },
        },
      ),
    ]);

    expect(projected.entries).toHaveLength(1);
    expect(projected.entries[0]).toEqual(
      expect.objectContaining({
        kind: 'skill_activation',
        content: 'Activated skill: review',
        skillActivationId: 'act-1',
        skillName: 'review',
        skillArgs: 'src/app.ts',
      }),
    );
    expect(JSON.stringify(projected.entries)).not.toContain('Review the requested file');
  });

  it('deduplicates replayed skill activation cards by activation id', () => {
    const record = message('user', [{ type: 'text', text: 'Skill body' }], {
      origin: {
        kind: 'skill_activation',
        activationId: 'act-1',
        skillName: 'review',
        trigger: 'user-slash',
      },
    });

    const projected = projectReplayRecords([record, record]);

    expect(projected.entries).toHaveLength(1);
    expect(projected.entries[0]).toEqual(
      expect.objectContaining({
        kind: 'skill_activation',
        skillActivationId: 'act-1',
        skillName: 'review',
      }),
    );
  });

  it('projects background task notifications as status rows', () => {
    const notificationXml = [
      '<notification id="task:agent-bg123:completed" category="task" type="task.completed" source_kind="background_task" source_id="agent-bg123">',
      'Title: Background agent completed',
      'Severity: info',
      'Optimize summary completed.',
      '<task-notification>',
      'Subagent detailed output should stay out of the transcript row.',
      '</task-notification>',
      '</notification>',
    ].join('\n');
    const projected = projectReplayRecords(
      [
        message('assistant', [], {
          toolCalls: [
            {
              type: 'function',
              id: 'call_agent',
              name: 'Agent',
              arguments: JSON.stringify({
                description: 'Optimize summary',
                subagent_type: 'coder',
                run_in_background: true,
              }),
            },
          ],
        }),
        message(
          'tool',
          [
            {
              type: 'text',
              text: [
                'task_id: agent-bg123',
                'status: running',
                'agent_id: agent-child123',
                'actual_subagent_type: coder',
                'automatic_notification: true',
                '',
                'description: Optimize summary',
              ].join('\n'),
            },
          ],
          {
            toolCallId: 'call_agent',
          },
        ),
        message('user', [{ type: 'text', text: notificationXml }], {
          origin: {
            kind: 'background_task',
            taskId: 'agent-bg123',
            status: 'completed',
            notificationId: 'task:agent-bg123:completed',
          },
        }),
      ],
      [backgroundTask('agent-bg123', 'Optimize summary', 'completed')],
    );

    expect(projected.entries.map((entry) => [entry.kind, entry.content])).toEqual([
      ['tool_call', ''],
      ['status', 'agent completed in background'],
    ]);
    expect(projected.entries[1]?.backgroundAgentStatus).toMatchObject({
      phase: 'completed',
      headline: 'agent completed in background',
      detail: 'Optimize summary',
    });
    expect(JSON.stringify(projected.entries)).not.toContain('<notification');
    expect(JSON.stringify(projected.entries)).not.toContain('Subagent detailed output');
  });

  it('uses background notification origin over XML attributes', () => {
    const projected = projectReplayRecords(
      [
        message(
          'user',
          [
            {
              type: 'text',
              text: [
                '<notification id="task:wrong:completed" category="task" type="task.completed" source_kind="background_task" source_id="wrong">',
                'Title: Background agent completed',
                'Severity: info',
                'Optimize ch03 lost.',
                '</notification>',
              ].join('\n'),
            },
          ],
          {
            origin: {
              kind: 'background_task',
              taskId: 'agent-real',
              status: 'lost',
              notificationId: 'task:agent-real:lost',
            },
          },
        ),
      ],
      [backgroundTask('agent-real', 'Real task description', 'lost')],
    );

    expect(projected.entries).toHaveLength(1);
    expect(projected.entries[0]).toEqual(
      expect.objectContaining({
        kind: 'status',
        content: 'agent lost in background',
        backgroundAgentStatus: expect.objectContaining({
          phase: 'failed',
          detail: 'Real task description',
        }),
      }),
    );
  });

  it('renders multimodal user parts as stable placeholders', () => {
    const projected = projectReplayRecords([
      message('user', [
        { type: 'text', text: 'look ' },
        { type: 'image_url', imageUrl: { url: 'file:///tmp/a.png' } },
        { type: 'video_url', videoUrl: { url: 'file:///tmp/a.mov' } },
      ]),
    ]);

    expect(projected.entries[0]?.content).toBe(
      'look <image url="file:///tmp/a.png"><video url="file:///tmp/a.mov">',
    );
  });

  it('summarizes data URLs in resumed multimodal user parts', () => {
    const projected = projectReplayRecords([
      message('user', [
        { type: 'text', text: 'look ' },
        { type: 'image_url', imageUrl: { url: 'data:image/png;base64,qrs=' } },
        { type: 'video_url', videoUrl: { url: 'data:video/mp4;base64,AQIDBA==' } },
      ]),
    ]);

    expect(projected.entries[0]?.content).toBe('look [image image/png, 2 B][video video/mp4, 4 B]');
    expect(projected.entries[0]?.content).not.toContain('qrs=');
    expect(projected.entries[0]?.content).not.toContain('AQIDBA==');
  });

  it('pairs tool results with their tool call entry', () => {
    const projected = projectReplayRecords([
      message('assistant', [], {
        toolCalls: [
          {
            type: 'function',
            id: 'tc_1',
            name: 'Bash',
            arguments: '{"command":"pwd"}',
          },
        ],
      }),
      message('tool', [{ type: 'text', text: 'done' }], {
        toolCallId: 'tc_1',
      }),
    ]);

    expect(projected.entries).toHaveLength(1);
    expect(projected.entries[0]?.toolCallData).toMatchObject({
      id: 'tc_1',
      name: 'Bash',
      result: { tool_call_id: 'tc_1', output: 'done' },
    });
  });

  it('preserves failed tool result state', () => {
    const projected = projectReplayRecords([
      message('assistant', [], {
        toolCalls: [
          {
            type: 'function',
            id: 'tc_1',
            name: 'Bash',
            arguments: '{"command":"false"}',
          },
        ],
      }),
      message('tool', [{ type: 'text', text: 'failed' }], {
        toolCallId: 'tc_1',
        isError: true,
      }),
    ]);

    expect(projected.entries[0]?.toolCallData?.result).toMatchObject({
      tool_call_id: 'tc_1',
      output: 'failed',
      is_error: true,
    });
  });

  it('projects resumed assistant text, tool call, and tool result records in order', () => {
    const projected = projectReplayRecords([
      message('user', [{ type: 'text', text: 'try call a tool' }]),
      message(
        'assistant',
        [
          { type: 'think', think: 'I should call Bash.' },
          { type: 'text', text: 'Calling Bash now.' },
        ],
        {
          toolCalls: [
            {
              type: 'function',
              id: 'call_resume_bash',
              name: 'Bash',
              arguments: '{"command":"echo ok"}',
            },
          ],
        },
      ),
      message('tool', [{ type: 'text', text: 'ok' }], {
        toolCallId: 'call_resume_bash',
      }),
    ]);

    expect(projected.entries.map((entry) => [entry.kind, entry.content])).toEqual([
      ['user', 'try call a tool'],
      ['thinking', 'I should call Bash.'],
      ['assistant', 'Calling Bash now.'],
      ['tool_call', ''],
    ]);
    expect(projected.entries[3]?.toolCallData).toMatchObject({
      id: 'call_resume_bash',
      name: 'Bash',
      args: { command: 'echo ok' },
      result: { tool_call_id: 'call_resume_bash', output: 'ok' },
    });
  });

  it('keeps media-bearing tool results as a JSON envelope', () => {
    const mediaContent: ContentPart[] = [
      { type: 'text', text: '<image path="/tmp/a.png">' },
      { type: 'image_url', imageUrl: { url: 'data:image/png;base64,QUJD' } },
      { type: 'text', text: '</image>' },
    ];
    const projected = projectReplayRecords([
      message('assistant', [], {
        toolCalls: [
          {
            type: 'function',
            id: 'tc_media',
            name: 'ReadMediaFile',
            arguments: '{"path":"/tmp/a.png"}',
          },
        ],
      }),
      message('tool', mediaContent, {
        toolCallId: 'tc_media',
      }),
    ]);

    const output = projected.entries[0]?.toolCallData?.result?.output ?? '';
    expect(JSON.parse(output)).toEqual(mediaContent);
  });

  it('projects permission replay records as notices', () => {
    const projected = projectReplayRecords([
      { type: 'permission_updated', mode: 'auto' },
      { type: 'permission_updated', mode: 'yolo' },
      { type: 'permission_updated', mode: 'manual' },
    ]);

    expect(projected.entries.map((e) => [e.kind, e.renderMode, e.content])).toEqual([
      ['status', 'notice', 'Permission mode: auto'],
      ['status', 'notice', 'YOLO mode: ON'],
      ['status', 'notice', 'YOLO mode: OFF'],
    ]);
    expect(projected.entries[1]?.detail).toBe(
      'All actions will be approved automatically. Use with caution.',
    );
  });

  it('ignores config replay records and system injections', () => {
    const projected = projectReplayRecords([
      { type: 'config_updated', config: { thinkingLevel: 'off' } },
      message('user', [{ type: 'text', text: 'ignore by origin' }], {
        origin: { kind: 'injection', variant: 'permission_mode' },
      }),
      message('user', [{ type: 'text', text: 'visible' }]),
    ]);

    expect(projected.entries.map((e) => [e.kind, e.content])).toEqual([['user', 'visible']]);
  });
});

describe('projectReplayRecords — subagent activity projection (AC2)', () => {
  // AC2: after resume, each child agent's activity is projected onto the
  // matching main-agent `Agent` tool-call card so /agent shows the child's
  // name, tool calls, text, and token count. The child state is supplied as a
  // map keyed by the parent tool-call id (parentToolCallId).

  function agentToolCall(id: string, description: string): ToolCall {
    return {
      type: 'function',
      id,
      name: 'Agent',
      arguments: JSON.stringify({ description, subagent_type: 'coder' }),
    };
  }

  it('S0: leaves subagent undefined when no child map is passed (backward compat)', () => {
    const projected = projectReplayRecords([
      message('assistant', [], { toolCalls: [agentToolCall('tc_a', 'Fix bug')] }),
      message('tool', [{ type: 'text', text: 'summary' }], { toolCallId: 'tc_a' }),
    ]);

    expect(projected.entries[0]?.toolCallData?.subagent).toBeUndefined();
  });

  it('S1: attaches the child name, tool calls, and text when ids match', () => {
    const subagents = new Map([
      [
        'tc_a',
        {
          id: 'c1',
          name: 'Coder',
          text: 'done',
          toolCalls: [{ id: 'sub1', name: 'Bash', args: { command: 'ls' } }],
        },
      ],
    ]);

    const projected = projectReplayRecords(
      [message('assistant', [], { toolCalls: [agentToolCall('tc_a', 'Fix bug')] })],
      [],
      subagents,
    );

    expect(projected.entries[0]?.toolCallData?.subagent).toMatchObject({
      id: 'c1',
      name: 'Coder',
      text: 'done',
      toolCalls: [{ id: 'sub1', name: 'Bash', args: { command: 'ls' } }],
    });
  });

  it('S2a: threads the child usage into the projected subagent block', () => {
    const subagents = new Map([
      [
        'tc_a',
        {
          id: 'c1',
          name: 'Coder',
          usage: { inputOther: 1300, inputCacheRead: 8700, inputCacheCreation: 0, output: 5000 },
        },
      ],
    ]);

    const projected = projectReplayRecords(
      [message('assistant', [], { toolCalls: [agentToolCall('tc_a', 'Fix bug')] })],
      [],
      subagents,
    );

    expect(projected.entries[0]?.toolCallData?.subagent?.usage).toMatchObject({
      inputOther: 1300,
      inputCacheRead: 8700,
      output: 5000,
    });
  });

  it('S3: attaches each child to its own Agent tool-call with no cross-wiring', () => {
    const subagents = new Map([
      ['tc_a', { id: 'c1', name: 'Coder', text: 'A out' }],
      ['tc_b', { id: 'c2', name: 'Reviewer', text: 'B out' }],
    ]);

    const projected = projectReplayRecords(
      [
        message('assistant', [], {
          toolCalls: [agentToolCall('tc_a', 'Implement'), agentToolCall('tc_b', 'Review')],
        }),
      ],
      [],
      subagents,
    );

    const calls = projected.entries.filter((e) => e.kind === 'tool_call');
    expect(calls).toHaveLength(2);
    expect(calls[0]?.toolCallData?.subagent?.name).toBe('Coder');
    expect(calls[1]?.toolCallData?.subagent?.name).toBe('Reviewer');
  });

  it('S4: preserves multiple child tool calls in order with their results', () => {
    const subagents = new Map([
      [
        'tc_a',
        {
          id: 'c1',
          name: 'Coder',
          text: 'line1\nline2',
          toolCalls: [
            {
              id: 's1',
              name: 'Read',
              args: { path: '/a' },
              result: { tool_call_id: 's1', output: 'x' },
            },
            {
              id: 's2',
              name: 'Bash',
              args: { command: 'pwd' },
              result: { tool_call_id: 's2', output: '/', is_error: false },
            },
            { id: 's3', name: 'Grep', args: { pattern: 'foo' } },
          ],
        },
      ],
    ]);

    const projected = projectReplayRecords(
      [message('assistant', [], { toolCalls: [agentToolCall('tc_a', 'Fix bug')] })],
      [],
      subagents,
    );

    const toolCalls = projected.entries[0]?.toolCallData?.subagent?.toolCalls ?? [];
    expect(toolCalls).toHaveLength(3);
    expect(toolCalls[2]).toMatchObject({ id: 's3', name: 'Grep' });
    // Finished calls keep their result; the ongoing one (s3) has no result.
    expect(toolCalls[0]?.result).toMatchObject({ tool_call_id: 's1', output: 'x' });
    expect(toolCalls[2]?.result).toBeUndefined();
    expect(projected.entries[0]?.toolCallData?.subagent?.text).toBe('line1\nline2');
  });

  it('S5: leaves subagent undefined for an Agent tool-call with no matching child, but keeps the result', () => {
    const projected = projectReplayRecords(
      [
        message('assistant', [], { toolCalls: [agentToolCall('tc_orphan', 'Fix bug')] }),
        message('tool', [{ type: 'text', text: 'summary' }], { toolCallId: 'tc_orphan' }),
      ],
      [],
      new Map(),
    );

    expect(projected.entries[0]?.toolCallData?.subagent).toBeUndefined();
    expect(projected.entries[0]?.toolCallData?.result).toMatchObject({
      tool_call_id: 'tc_orphan',
      output: 'summary',
    });
  });

  it('S6: never attaches a subagent block to a non-Agent tool-call even when ids collide', () => {
    const subagents = new Map([['tc_x', { id: 'c1', name: 'Coder' }]]);

    const projected = projectReplayRecords(
      [
        message('assistant', [], {
          toolCalls: [
            { type: 'function', id: 'tc_x', name: 'Bash', arguments: '{"command":"pwd"}' },
          ],
        }),
      ],
      [],
      subagents,
    );

    expect(projected.entries[0]?.toolCallData?.name).toBe('Bash');
    expect(projected.entries[0]?.toolCallData?.subagent).toBeUndefined();
  });
});

describe('distillSubagents — child state → subagent block (AC2 wiring, S8)', () => {
  // S8: the wiring helper that turns each non-main agent's ResumedAgentState
  // into a SubagentReplayBlockData keyed by parentToolCallId. This is the seam
  // between agent-core (which now threads parentToolCallId + child replay) and
  // the projection above.

  function childState(overrides: Partial<ResumedAgentState> = {}): ResumedAgentState {
    return {
      type: 'sub',
      config: { profileName: 'Coder' } as ResumedAgentState['config'],
      context: {} as ResumedAgentState['context'],
      replay: [],
      permission: {} as ResumedAgentState['permission'],
      usage: { total: { inputOther: 1000, inputCacheRead: 0, inputCacheCreation: 0, output: 500 } },
      tools: [],
      background: [],
      parentToolCallId: 'tc_a',
      goal: null,
      ...overrides,
    };
  }

  it('distills a child with tool calls and text, keyed by parentToolCallId', () => {
    const child = childState({
      replay: [
        message('user', [{ type: 'text', text: 'do the work' }]),
        message('assistant', [{ type: 'text', text: 'working on it' }]),
        message('assistant', [], {
          toolCalls: [{ type: 'function', id: 'sub1', name: 'Read', arguments: '{"path":"/a"}' }],
        }),
        message('tool', [{ type: 'text', text: 'file contents' }], { toolCallId: 'sub1' }),
        message('assistant', [{ type: 'text', text: 'done' }]),
      ],
    });

    const map = distillSubagents({
      main: childState({ type: 'main', parentToolCallId: undefined }),
      'agent-0': child,
    });
    const block = map.get('tc_a');

    expect(block).toMatchObject({
      id: 'agent-0',
      name: 'Coder',
      text: 'working on it\ndone',
    });
    expect(block?.toolCalls).toHaveLength(1);
    expect(block?.toolCalls?.[0]).toMatchObject({
      id: 'sub1',
      name: 'Read',
      result: { tool_call_id: 'sub1', output: 'file contents' },
    });
    // usage flows through from the child's total.
    expect(block?.usage).toMatchObject({ inputOther: 1000, output: 500 });
  });

  it('skips the main agent and children without a parentToolCallId', () => {
    const map = distillSubagents({
      main: childState({ type: 'main', parentToolCallId: undefined }),
      'agent-0': childState({ parentToolCallId: undefined }),
    });

    expect(map.size).toBe(0);
  });

  it('handles a child with no tool calls and no assistant text', () => {
    const map = distillSubagents({ 'agent-0': childState() });

    const block = map.get('tc_a');
    expect(block).toMatchObject({ id: 'agent-0', name: 'Coder' });
    expect(block?.text).toBeUndefined();
    expect(block?.toolCalls).toBeUndefined();
  });
});

describe('projectReplayRecords — Agent grouping precondition (AC3)', () => {
  // AC3: adjacent Agent tool-calls in the same step/turn must share step and
  // turnId so hydrateProjectedEntries groups them into an AgentGroupComponent.
  // Live uses provider step_uuid; in replay, "one assistant message = one
  // step" and turnId increments at each user-turn boundary.

  function agentToolCall(id: string): ToolCall {
    return {
      type: 'function',
      id,
      name: 'Agent',
      arguments: JSON.stringify({ description: 'work', subagent_type: 'coder' }),
    };
  }

  it('G1: two Agent calls in one assistant message share step and turnId', () => {
    const projected = projectReplayRecords([
      message('user', [{ type: 'text', text: 'run two agents' }]),
      message('assistant', [], { toolCalls: [agentToolCall('tc_a'), agentToolCall('tc_b')] }),
    ]);

    const calls = projected.entries.filter((e) => e.kind === 'tool_call');
    expect(calls).toHaveLength(2);
    expect(calls[0]?.toolCallData?.step).toBeDefined();
    expect(calls[0]?.toolCallData?.step).toBe(calls[1]?.toolCallData?.step);
    expect(calls[0]?.toolCallData?.turnId).toBe(calls[1]?.toolCallData?.turnId);
  });

  it('G2: Agent calls across separate user turns get different turnIds', () => {
    const projected = projectReplayRecords([
      message('user', [{ type: 'text', text: 'turn 1' }]),
      message('assistant', [], { toolCalls: [agentToolCall('tc_a')] }),
      message('user', [{ type: 'text', text: 'turn 2' }]),
      message('assistant', [], { toolCalls: [agentToolCall('tc_b')] }),
    ]);

    const calls = projected.entries.filter((e) => e.kind === 'tool_call');
    expect(calls[0]?.toolCallData?.turnId).not.toBe(calls[1]?.toolCallData?.turnId);
  });

  it('G3: Agent calls in separate assistant messages (same turn) get different steps', () => {
    // Two assistant messages in one turn = two steps, so they do NOT group.
    const projected = projectReplayRecords([
      message('user', [{ type: 'text', text: 'one turn' }]),
      message('assistant', [], { toolCalls: [agentToolCall('tc_a')] }),
      message('assistant', [], { toolCalls: [agentToolCall('tc_b')] }),
    ]);

    const calls = projected.entries.filter((e) => e.kind === 'tool_call');
    expect(calls[0]?.toolCallData?.step).not.toBe(calls[1]?.toolCallData?.step);
    // Same turn, though.
    expect(calls[0]?.toolCallData?.turnId).toBe(calls[1]?.toolCallData?.turnId);
  });
});

describe('resume degradation for sessions without parentToolCallId (AC4)', () => {
  // AC4: an old session persisted before parentToolCallId existed still resumes
  // without crashing, and Agent cards degrade to result-derived rendering.
  // This composes distillSubagents (S8: empty map) + projection (S5: no child)
  // + grouping precondition (AC3) end-to-end at the projection layer.

  it('renders Agent cards from their result when no child activity is available', () => {
    // Old-session resume snapshot: a main agent whose Agent tool-call has no
    // matching child (children lack parentToolCallId, so distillSubagents
    // returns an empty map).
    const resumeState = {
      main: {
        type: 'main' as const,
        config: {} as ResumedAgentState['config'],
        context: {} as ResumedAgentState['context'],
        replay: [
          message('user', [{ type: 'text', text: 'run an agent' }]),
          message('assistant', [], {
            toolCalls: [
              {
                type: 'function',
                id: 'tc_legacy',
                name: 'Agent',
                arguments: JSON.stringify({ description: 'legacy work' }),
              },
            ],
          }),
          message('tool', [{ type: 'text', text: 'legacy summary' }], {
            toolCallId: 'tc_legacy',
          }),
        ],
        permission: {} as ResumedAgentState['permission'],
        usage: {},
        tools: [],
        background: [],
        goal: null,
      },
      // Legacy child: no parentToolCallId → skipped by distillSubagents.
      'agent-0': {
        type: 'sub' as const,
        config: { profileName: 'Coder' } as ResumedAgentState['config'],
        context: {} as ResumedAgentState['context'],
        replay: [],
        permission: {} as ResumedAgentState['permission'],
        usage: {},
        tools: [],
        background: [],
        goal: null,
      },
    };

    const subagents = distillSubagents(resumeState);
    expect(subagents.size).toBe(0);

    const projected = projectReplayRecords(
      resumeState.main.replay,
      resumeState.main.background,
      subagents,
    );

    const call = projected.entries.find((e) => e.kind === 'tool_call');
    // No subagent block (degraded), but the result-derived card still renders.
    expect(call?.toolCallData?.subagent).toBeUndefined();
    expect(call?.toolCallData?.result).toMatchObject({
      tool_call_id: 'tc_legacy',
      output: 'legacy summary',
    });
    // step/turnId are still set so grouping could apply to multi-Agent turns.
    expect(call?.toolCallData?.step).toBeDefined();
    expect(call?.toolCallData?.turnId).toBeDefined();
  });
});
