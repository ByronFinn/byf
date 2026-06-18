import { describe, expect, it, vi } from 'vitest';

import { AgentGroupComponent } from '#/tui/components/messages/agent-group';
import { ToolCallComponent } from '#/tui/components/messages/tool-call';
import { darkColors } from '#/tui/theme/colors';
import type { ToolCallBlockData } from '#/tui/types';

function makeToolCall(overrides: Partial<ToolCallBlockData> = {}): ToolCallBlockData {
  return {
    id: 'tc-1',
    name: 'Agent',
    args: { description: 'Test agent' },
    description: 'Test agent',
    step: 1,
    turnId: 'turn-1',
    ...overrides,
  };
}

describe('AgentGroupComponent', () => {
  it('exposes attached entries via getSubagentEntries()', () => {
    const ui = { requestRender: vi.fn() } as any;
    const group = new AgentGroupComponent(darkColors, ui);
    const tc1 = new ToolCallComponent(makeToolCall({ id: 'tc-1' }), undefined, darkColors, ui);
    const tc2 = new ToolCallComponent(makeToolCall({ id: 'tc-2' }), undefined, darkColors, ui);

    group.attach('tc-1', tc1);
    group.attach('tc-2', tc2);

    const entries = group.getSubagentEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.toolCallId).toBe('tc-1');
    expect(entries[1]!.toolCallId).toBe('tc-2');
    expect(entries[0]!.tc).toBe(tc1);
    expect(entries[1]!.tc).toBe(tc2);
  });

  it('getSubagentEntries() returns empty array for fresh group', () => {
    const ui = { requestRender: vi.fn() } as any;
    const group = new AgentGroupComponent(darkColors, ui);

    expect(group.getSubagentEntries()).toEqual([]);
  });
});
