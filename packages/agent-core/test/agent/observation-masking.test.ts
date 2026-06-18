import { describe, expect, it } from 'vitest';

import {
  applyObservationMasking,
  DEFAULT_MASKING_CONFIG,
  getToolPriority,
  type MaskingConfig,
} from '../../src/agent/context/observation-masking';
import type { ContextMessage } from '../../src/agent/context/types';
import { estimateTokensForMessages } from '../../src/utils/tokens';

const MAX_CONTEXT = 10_000;

function createToolResultMessage(
  toolCallId: string,
  text: string,
  isError?: boolean,
): ContextMessage {
  return {
    role: 'tool',
    content: [{ type: 'text', text }],
    toolCalls: [],
    toolCallId,
    isError,
  };
}

function createUserMessage(text: string): ContextMessage {
  return {
    role: 'user',
    content: [{ type: 'text', text }],
    toolCalls: [],
  };
}

function createAssistantMessage(text: string): ContextMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    toolCalls: [],
  };
}

function makeInfoMap(
  entries: Array<[string, { name: string; args?: unknown }]>,
): Map<string, { name: string; args: unknown }> {
  return new Map(
    entries.map(([id, info]) => [id, { name: info.name, args: info.args ?? {} }]),
  );
}

function generateLines(count: number): string {
  return Array.from({ length: count }, (_, i) => `line ${String(i + 1)}`).join('\n');
}

function buildHistoryWithToolResults(
  toolResults: Array<{ toolCallId: string; name: string; lines: number; isError?: boolean }>,
  extraMessages: ContextMessage[] = [],
): { history: ContextMessage[]; infoMap: Map<string, { name: string; args: unknown }> } {
  const history: ContextMessage[] = [...extraMessages];
  const infoMap = new Map<string, { name: string; args: unknown }>();

  for (const tr of toolResults) {
    history.push(createToolResultMessage(tr.toolCallId, generateLines(tr.lines), tr.isError));
    infoMap.set(tr.toolCallId, { name: tr.name, args: {} });
  }

  return { history, infoMap };
}

describe('getToolPriority', () => {
  it('returns high for Write, Edit, and Agent', () => {
    expect(getToolPriority('Write')).toBe('high');
    expect(getToolPriority('Edit')).toBe('high');
    expect(getToolPriority('Agent')).toBe('high');
  });

  it('returns medium for Bash', () => {
    expect(getToolPriority('Bash')).toBe('medium');
  });

  it('returns low for Read, Glob, and Grep', () => {
    expect(getToolPriority('Read')).toBe('low');
    expect(getToolPriority('Glob')).toBe('low');
    expect(getToolPriority('Grep')).toBe('low');
  });

  it('returns low for unknown tools', () => {
    expect(getToolPriority('UnknownTool')).toBe('low');
  });
});

describe('applyObservationMasking thresholds', () => {
  const config: MaskingConfig = {
    effectiveCapacityRatio: 0.6,
    lowPriorityThreshold: 0.60,
    mediumPriorityThreshold: 0.80,
    highPriorityThreshold: 0.85,
  };

  it('does not mask when pressure is below lowPriorityThreshold', () => {
    const { history, infoMap } = buildHistoryWithToolResults(
      [
        { toolCallId: 'call_1', name: 'Read', lines: 10 },
        { toolCallId: 'call_2', name: 'Glob', lines: 10 },
      ],
      [createUserMessage('small prompt')],
    );

    const result = applyObservationMasking(history, MAX_CONTEXT, infoMap, config);
    expect(result.result.masked).toBe(false);
    expect(result.result.maskedCount).toBe(0);
    expect(result.history).toHaveLength(history.length);
    // Original content preserved
    expect(result.history[1]?.content[0]).toEqual(history[1]?.content[0]);
  });

  it('masks only low priority tools when pressure is 60-80%', () => {
    // Build base history with tool results
    const toolResults = [
      { toolCallId: 'call_1', name: 'Read', lines: 50 },
      { toolCallId: 'call_2', name: 'Bash', lines: 50 },
      { toolCallId: 'call_3', name: 'Write', lines: 50 },
    ];
    const baseHistory: ContextMessage[] = [];
    const infoMap = new Map<string, { name: string; args: unknown }>();
    for (const tr of toolResults) {
      baseHistory.push(createToolResultMessage(tr.toolCallId, generateLines(tr.lines)));
      infoMap.set(tr.toolCallId, { name: tr.name, args: {} });
    }

    const baseTokens = estimateTokensForMessages(baseHistory);
    // effectiveCapacity = maxContextSize * 0.6
    // For pressure = 0.7: totalTokens = 0.7 * effectiveCapacity
    // We need maxContextSize such that baseTokens is ~70% of effectiveCapacity.
    // But we also need a filler user message.
    // Let's compute maxContextSize so that (baseTokens + small) / (maxContextSize * 0.6) ≈ 0.7
    // Use a small user message (1 token) and set maxContextSize accordingly.
    const targetPressure = 0.7;
    const maxContextSize = Math.ceil((baseTokens + 2) / config.effectiveCapacityRatio / targetPressure);

    const history = [createUserMessage('x'), ...baseHistory];
    const result = applyObservationMasking(history, maxContextSize, infoMap, config);
    expect(result.result.masked).toBe(true);
    // Only Read should be masked (low priority)
    const readMessage = result.history.find((m) => m.toolCallId === 'call_1');
    const bashMessage = result.history.find((m) => m.toolCallId === 'call_2');
    const writeMessage = result.history.find((m) => m.toolCallId === 'call_3');

    expect(readMessage?.content[0]?.type === 'text' ? readMessage.content[0].text.startsWith('[Read:') : false).toBe(true);
    expect(bashMessage?.content[0]?.type === 'text' ? bashMessage.content[0].text.startsWith('line') : false).toBe(true);
    expect(writeMessage?.content[0]?.type === 'text' ? writeMessage.content[0].text.startsWith('line') : false).toBe(true);
  });

  it('masks low and medium priority when pressure is 80-85%', () => {
    const toolResults = [
      { toolCallId: 'call_1', name: 'Read', lines: 50 },
      { toolCallId: 'call_2', name: 'Bash', lines: 50 },
      { toolCallId: 'call_3', name: 'Write', lines: 50 },
    ];
    const baseHistory: ContextMessage[] = [];
    const infoMap = new Map<string, { name: string; args: unknown }>();
    for (const tr of toolResults) {
      baseHistory.push(createToolResultMessage(tr.toolCallId, generateLines(tr.lines)));
      infoMap.set(tr.toolCallId, { name: tr.name, args: {} });
    }

    const baseTokens = estimateTokensForMessages(baseHistory);
    const targetPressure = 0.82;
    const maxContextSize = Math.ceil((baseTokens + 2) / config.effectiveCapacityRatio / targetPressure);

    const history = [createUserMessage('x'), ...baseHistory];
    const result = applyObservationMasking(history, maxContextSize, infoMap, config);
    expect(result.result.masked).toBe(true);

    const readMessage = result.history.find((m) => m.toolCallId === 'call_1');
    const bashMessage = result.history.find((m) => m.toolCallId === 'call_2');
    const writeMessage = result.history.find((m) => m.toolCallId === 'call_3');

    expect(readMessage?.content[0]?.type === 'text' ? readMessage.content[0]!.text.startsWith('[Read:') : false).toBe(true);
    expect(bashMessage?.content[0]?.type === 'text' ? bashMessage.content[0]!.text.startsWith('[Bash:') : false).toBe(true);
    expect(writeMessage?.content[0]?.type === 'text' ? writeMessage.content[0]!.text.startsWith('line') : false).toBe(true);
  });

  it('never masks high priority tools (Write/Edit)', () => {
    const toolResults = [
      { toolCallId: 'call_1', name: 'Write', lines: 100 },
      { toolCallId: 'call_2', name: 'Edit', lines: 100 },
    ];
    const baseHistory: ContextMessage[] = [];
    const infoMap = new Map<string, { name: string; args: unknown }>();
    for (const tr of toolResults) {
      baseHistory.push(createToolResultMessage(tr.toolCallId, generateLines(tr.lines)));
      infoMap.set(tr.toolCallId, { name: tr.name, args: {} });
    }

    const baseTokens = estimateTokensForMessages(baseHistory);
    // Very high pressure
    const maxContextSize = Math.ceil((baseTokens + 2) / config.effectiveCapacityRatio / 0.99);

    const history = [createUserMessage('x'), ...baseHistory];
    const result = applyObservationMasking(history, maxContextSize, infoMap, config);
    const writeMessage = result.history.find((m) => m.toolCallId === 'call_1');
    const editMessage = result.history.find((m) => m.toolCallId === 'call_2');

    expect(writeMessage?.content[0]?.type === 'text' ? writeMessage.content[0]!.text.startsWith('line') : false).toBe(true);
    expect(editMessage?.content[0]?.type === 'text' ? editMessage.content[0]!.text.startsWith('line') : false).toBe(true);
  });
});

describe('applyObservationMasking summary format', () => {
  it('includes tool name and line count in summary', () => {
    const history = [createToolResultMessage('call_1', 'line1\nline2\nline3')];
    const infoMap = makeInfoMap([['call_1', { name: 'Read' }]]);

    const result = applyObservationMasking(history, 100, infoMap, {
      ...DEFAULT_MASKING_CONFIG,
      lowPriorityThreshold: 0,
    });

    const text = result.history[0]?.content[0]?.type === 'text' ? result.history[0]!.content[0]!.text : '';
    expect(text).toContain('[Read: 3 lines]');
  });

  it('includes error tag for error results', () => {
    const history = [createToolResultMessage('call_1', 'line1\nline2', true)];
    const infoMap = makeInfoMap([['call_1', { name: 'Bash' }]]);

    const result = applyObservationMasking(history, 100, infoMap, {
      ...DEFAULT_MASKING_CONFIG,
      lowPriorityThreshold: 0,
      mediumPriorityThreshold: 0,
    });

    const text = result.history[0]?.content[0]?.type === 'text' ? result.history[0]!.content[0]!.text : '';
    expect(text).toContain('[Bash: 2 lines, error]');
  });

  it('preserves head/tail for Bash with correct line counts', () => {
    const lines = generateLines(20);
    const history = [createToolResultMessage('call_1', lines)];
    const infoMap = makeInfoMap([['call_1', { name: 'Bash' }]]);

    const result = applyObservationMasking(history, 100, infoMap, {
      ...DEFAULT_MASKING_CONFIG,
      mediumPriorityThreshold: 0,
    });

    const text = result.history[0]?.content[0]?.type === 'text' ? result.history[0]!.content[0]!.text : '';
    const parts = text.split('---\n');
    expect(parts).toHaveLength(2);
    const body = parts[1] ?? '';
    const bodyLines = body.split('\n');
    expect(bodyLines[0]).toBe('line 1');
    expect(bodyLines[1]).toBe('line 2');
    expect(bodyLines[2]).toBe('line 3');
    expect(bodyLines[3]).toBe('...');
    expect(bodyLines[4]).toBe('line 16');
    expect(bodyLines[5]).toBe('line 17');
    expect(bodyLines[6]).toBe('line 18');
    expect(bodyLines[7]).toBe('line 19');
    expect(bodyLines[8]).toBe('line 20');
  });

  it('preserves head/tail for Read with correct line counts', () => {
    const lines = generateLines(10);
    const history = [createToolResultMessage('call_1', lines)];
    const infoMap = makeInfoMap([['call_1', { name: 'Read' }]]);

    const result = applyObservationMasking(history, 100, infoMap, {
      ...DEFAULT_MASKING_CONFIG,
      lowPriorityThreshold: 0,
    });

    const text = result.history[0]?.content[0]?.type === 'text' ? result.history[0]!.content[0]!.text : '';
    const parts = text.split('---\n');
    const body = parts[1] ?? '';
    const bodyLines = body.split('\n');
    expect(bodyLines[0]).toBe('line 1');
    expect(bodyLines[1]).toBe('line 2');
    expect(bodyLines[2]).toBe('line 3');
    expect(bodyLines[3]).toBe('...');
    expect(bodyLines[4]).toBe('line 8');
    expect(bodyLines[5]).toBe('line 9');
    expect(bodyLines[6]).toBe('line 10');
  });

  it('shows full content when line count is small enough', () => {
    const lines = generateLines(5);
    const history = [createToolResultMessage('call_1', lines)];
    const infoMap = makeInfoMap([['call_1', { name: 'Read' }]]);

    const result = applyObservationMasking(history, 100, infoMap, {
      ...DEFAULT_MASKING_CONFIG,
      lowPriorityThreshold: 0,
    });

    const text = result.history[0]?.content[0]?.type === 'text' ? result.history[0]!.content[0]!.text : '';
    expect(text).toContain('line 1');
    expect(text).toContain('line 5');
    expect(text).not.toContain('...');
  });

  it('never masks high priority tools like Edit', () => {
    const lines = generateLines(50);
    const history = [createToolResultMessage('call_1', lines)];
    const infoMap = makeInfoMap([['call_1', { name: 'Edit' }]]);

    const result = applyObservationMasking(history, 100, infoMap, {
      ...DEFAULT_MASKING_CONFIG,
      lowPriorityThreshold: 0,
      mediumPriorityThreshold: 0,
      highPriorityThreshold: 0,
    });

    // Edit is high priority and is never masked regardless of thresholds
    const text = result.history[0]?.content[0]?.type === 'text' ? result.history[0]!.content[0]!.text : '';
    expect(text).toBe(lines);
  });
});

describe('applyObservationMasking priority order', () => {
  it('masks Read/Glob/Grep before Bash', () => {
    const config: MaskingConfig = {
      effectiveCapacityRatio: 0.6,
      lowPriorityThreshold: 0.60,
      mediumPriorityThreshold: 0.80,
      highPriorityThreshold: 0.85,
    };

    // At low pressure (60-80%), only low priority should be masked
    const toolResults = [
      { toolCallId: 'call_read', name: 'Read', lines: 20 },
      { toolCallId: 'call_grep', name: 'Grep', lines: 20 },
      { toolCallId: 'call_bash', name: 'Bash', lines: 20 },
      { toolCallId: 'call_write', name: 'Write', lines: 20 },
    ];
    const baseHistory: ContextMessage[] = [];
    const infoMap = new Map<string, { name: string; args: unknown }>();
    for (const tr of toolResults) {
      baseHistory.push(createToolResultMessage(tr.toolCallId, generateLines(tr.lines)));
      infoMap.set(tr.toolCallId, { name: tr.name, args: {} });
    }

    const baseTokens = estimateTokensForMessages(baseHistory);
    const targetPressure = 0.7;
    const maxContextSize = Math.ceil((baseTokens + 2) / config.effectiveCapacityRatio / targetPressure);

    const history = [createUserMessage('x'), ...baseHistory];
    const result = applyObservationMasking(history, maxContextSize, infoMap, config);
    expect(result.result.maskedCount).toBe(2); // Read and Grep

    const readMasked = result.history.find((m) => m.toolCallId === 'call_read')?.content[0]?.type === 'text'
      ? (result.history.find((m) => m.toolCallId === 'call_read')!.content[0] as { type: 'text'; text: string }).text.startsWith('[Read:')
      : false;
    const grepMasked = result.history.find((m) => m.toolCallId === 'call_grep')?.content[0]?.type === 'text'
      ? (result.history.find((m) => m.toolCallId === 'call_grep')!.content[0] as { type: 'text'; text: string }).text.startsWith('[Grep:')
      : false;
    expect(readMasked).toBe(true);
    expect(grepMasked).toBe(true);
  });
});

describe('applyObservationMasking long session', () => {
  it('reduces token count significantly for long sessions', () => {
    const toolResults: Array<{ toolCallId: string; name: string; lines: number }> = [];
    for (let i = 0; i < 20; i++) {
      toolResults.push({
        toolCallId: `call_${String(i)}`,
        name: i % 3 === 0 ? 'Read' : i % 3 === 1 ? 'Bash' : 'Grep',
        lines: 100,
      });
    }

    const extraMessages: ContextMessage[] = [];
    for (let i = 0; i < 10; i++) {
      extraMessages.push(createUserMessage(`user prompt ${String(i)}`));
      extraMessages.push(createAssistantMessage(`assistant response ${String(i)}`));
    }

    const { history, infoMap } = buildHistoryWithToolResults(toolResults, extraMessages);
    const tokensBefore = estimateTokensForMessages(history);

    const result = applyObservationMasking(history, 20_000, infoMap, {
      ...DEFAULT_MASKING_CONFIG,
      lowPriorityThreshold: 0,
    });

    expect(result.result.maskedCount).toBeGreaterThan(0);
    const reduction = (tokensBefore - result.result.tokensAfter) / tokensBefore;
    expect(reduction).toBeGreaterThan(0.3);
  });
});

describe('applyObservationMasking adversarial', () => {
  it('does not change message order', () => {
    const history: ContextMessage[] = [
      createUserMessage('first'),
      createAssistantMessage('second'),
      createToolResultMessage('call_1', 'third'),
      createUserMessage('fourth'),
    ];
    const infoMap = makeInfoMap([['call_1', { name: 'Read' }]]);

    const result = applyObservationMasking(history, 100, infoMap, {
      ...DEFAULT_MASKING_CONFIG,
      lowPriorityThreshold: 0,
    });

    expect(result.history.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'user']);
  });

  it('preserves toolCallId on masked messages', () => {
    const history = [createToolResultMessage('call_abc', 'line1\nline2')];
    const infoMap = makeInfoMap([['call_abc', { name: 'Read' }]]);

    const result = applyObservationMasking(history, 100, infoMap, {
      ...DEFAULT_MASKING_CONFIG,
      lowPriorityThreshold: 0,
    });

    expect(result.history[0]?.toolCallId).toBe('call_abc');
  });

  it('does not delete messages, only replaces content', () => {
    const history = [createToolResultMessage('call_1', 'original content')];
    const infoMap = makeInfoMap([['call_1', { name: 'Read' }]]);

    const result = applyObservationMasking(history, 100, infoMap, {
      ...DEFAULT_MASKING_CONFIG,
      lowPriorityThreshold: 0,
    });

    expect(result.history).toHaveLength(1);
    expect(result.history[0]?.role).toBe('tool');
  });

  it('preserves non-tool messages unchanged', () => {
    const history: ContextMessage[] = [
      createUserMessage('user text'),
      createAssistantMessage('assistant text'),
    ];
    const infoMap = new Map<string, { name: string; args: unknown }>();

    const result = applyObservationMasking(history, 100, infoMap, {
      ...DEFAULT_MASKING_CONFIG,
      lowPriorityThreshold: 0,
    });

    expect(result.history[0]).toEqual(history[0]);
    expect(result.history[1]).toEqual(history[1]);
  });

  it('skips tool results with unknown toolCallId', () => {
    const history = [createToolResultMessage('call_unknown', 'content')];
    const infoMap = new Map<string, { name: string; args: unknown }>();

    const result = applyObservationMasking(history, 100, infoMap, {
      ...DEFAULT_MASKING_CONFIG,
      lowPriorityThreshold: 0,
    });

    expect(result.history[0]).toEqual(history[0]);
  });

  it('handles empty tool output', () => {
    const history = [createToolResultMessage('call_1', '')];
    const infoMap = makeInfoMap([['call_1', { name: 'Read' }]]);

    const result = applyObservationMasking(history, 100, infoMap, {
      ...DEFAULT_MASKING_CONFIG,
      lowPriorityThreshold: 0,
    });

    const text = result.history[0]?.content[0]?.type === 'text' ? result.history[0]!.content[0]!.text : '';
    expect(text).toBe('[Read: 0 lines]');
  });

  it('handles tool results with non-text content parts', () => {
    const history: ContextMessage[] = [
      {
        role: 'tool',
        content: [
          { type: 'text', text: 'text part' },
          { type: 'image_url', imageUrl: { url: 'http://example.com/img.png' } },
        ],
        toolCalls: [],
        toolCallId: 'call_1',
      },
    ];
    const infoMap = makeInfoMap([['call_1', { name: 'Read' }]]);

    const result = applyObservationMasking(history, 100, infoMap, {
      ...DEFAULT_MASKING_CONFIG,
      lowPriorityThreshold: 0,
    });

    const text = result.history[0]?.content[0]?.type === 'text' ? result.history[0]!.content[0]!.text : '';
    expect(text).toContain('[Read: 1 lines]');
  });
});

describe('applyObservationMasking thrashing', () => {
  it('does not alter already-masked messages on repeated application', () => {
    const history = [createToolResultMessage('call_1', generateLines(20))];
    const infoMap = makeInfoMap([['call_1', { name: 'Read' }]]);

    const config = { ...DEFAULT_MASKING_CONFIG, lowPriorityThreshold: 0 };

    const first = applyObservationMasking(history, 100, infoMap, config);
    const second = applyObservationMasking(first.history, 100, infoMap, config);

    // Second application should not mask again (the message is already masked)
    expect(second.result.maskedCount).toBe(0);
    expect(second.history[0]).toEqual(first.history[0]);
  });
});
