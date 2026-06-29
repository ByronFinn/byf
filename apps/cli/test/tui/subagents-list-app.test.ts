import type { Terminal } from '@earendil-works/pi-tui';
import chalk from 'chalk';
import { describe, expect, it, vi } from 'vitest';

import {
  SubagentsListApp,
  type SubagentListEntry,
  type SubagentPreviewPane,
  type SubagentDetailPane,
} from '#/tui/components/dialogs/subagents/list-app';
import { darkColors } from '#/tui/theme/colors';

const ANSI_SGR = /\[[0-9;]*m/g;
function strip(text: string): string {
  return text.replaceAll(ANSI_SGR, '');
}

const ANSI_ESCAPE = /\u001B\[[0-9;]*m/g;
function stripAnsi(text: string): string {
  return text.replaceAll(ANSI_ESCAPE, '');
}

/** Minimal Terminal stub — only `rows` is read by the component. */
function fakeTerminal(rows: number, columns = 120): Terminal {
  return {
    start: () => {},
    stop: () => {},
    drainInput: () => Promise.resolve(),
    write: () => {},
    get columns() {
      return columns;
    },
    get rows() {
      return rows;
    },
    get kittyProtocolActive() {
      return false;
    },
    moveBy: () => {},
    hideCursor: () => {},
    showCursor: () => {},
    clearLine: () => {},
    clearFromCursor: () => {},
    clearScreen: () => {},
    setTitle: () => {},
    setProgress: () => {},
  };
}

function entry(overrides: Partial<SubagentListEntry> = {}): SubagentListEntry {
  return {
    toolCallId: 'agent-abc',
    agentName: 'Explore',
    description: 'Search codebase for references',
    phase: 'running',
    toolCount: 3,
    tokens: 5400,
    elapsedSeconds: 12,
    ...overrides,
  };
}

function makeApp(
  entries: SubagentListEntry[] = [],
  onClose = vi.fn(),
  rows = 30,
  onSelect?: (toolCallId: string) => void,
) {
  return new SubagentsListApp(
    { entries, filter: 'all', colors: darkColors, onClose, onSelect },
    fakeTerminal(rows),
  );
}

describe('SubagentsListApp', () => {
  it('fills exactly terminal.rows lines', () => {
    const rows = 30;
    const lines = makeApp([], vi.fn(), rows).render(120);
    expect(lines.length).toBe(rows);
  });

  it('shows AGENTS header when no entries', () => {
    const out = strip(makeApp([], vi.fn()).render(120).join('\n'));
    expect(out).toContain('AGENTS');
    expect(out).toContain('0 total');
  });

  it('renders one row per entry', () => {
    const entries = [
      entry({ toolCallId: 'a', agentName: 'Explore', phase: 'running' }),
      entry({ toolCallId: 'b', agentName: 'Review', phase: 'done' }),
    ];
    const out = strip(makeApp(entries).render(120).join('\n'));
    expect(out).toContain('Explore');
    expect(out).toContain('Review');
  });

  it('renders a visible Backgrounded label if a backgrounded entry reaches the list (filter guard)', () => {
    // Backgrounded agents belong to /tasks and are filtered out by
    // byf-tui.ts `collectItems` before reaching this component. This test
    // guards that, IF filtering is ever removed, a backgrounded entry renders
    // with a recognizable label rather than crashing or vanishing silently —
    // so the regression is immediately visible.
    const entries = [
      entry({ toolCallId: 'bg', phase: 'backgrounded' as const, agentName: 'Explore' }),
    ];
    const out = strip(makeApp(entries).render(120).join('\n'));
    expect(out).toContain('Backgrounded');
  });

  it('shows phase, tool count, tokens and elapsed time per row', () => {
    const e = entry({
      agentName: 'Debug',
      phase: 'running',
      toolCount: 5,
      tokens: 12000,
      elapsedSeconds: 45,
    });
    const out = strip(makeApp([e]).render(120).join('\n'));
    expect(out).toContain('5 tools');
    expect(out).toContain('12.0k tok');
    expect(out).toContain('45s');
  });

  it('highlights the selected row', () => {
    const entries = [
      entry({ toolCallId: 'a', agentName: 'Alpha', phase: 'running' }),
      entry({ toolCallId: 'b', agentName: 'Beta', phase: 'done' }),
    ];
    const app = makeApp(entries);
    app.selectedIndex = 1;
    const out = strip(app.render(120).join('\n'));
    // Beta should appear somewhere (selected)
    expect(out).toContain('Beta');
  });

  it('closes on Q or Esc via handleInput', () => {
    const onClose = vi.fn();
    const app = makeApp([entry()], onClose);
    app.handleInput('q');
    expect(onClose).toHaveBeenCalledTimes(1);

    app.handleInput('\u001B'); // Esc
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('selects next/prev with j/k', () => {
    const entries = [
      entry({ toolCallId: 'a', agentName: 'Alpha' }),
      entry({ toolCallId: 'b', agentName: 'Beta' }),
      entry({ toolCallId: 'c', agentName: 'Gamma' }),
    ];
    const app = makeApp(entries);
    expect(app.selectedIndex).toBe(0);

    app.handleInput('j');
    expect(app.selectedIndex).toBe(1);

    app.handleInput('j');
    expect(app.selectedIndex).toBe(2);

    app.handleInput('j'); // past end — clamped
    expect(app.selectedIndex).toBe(2);

    app.handleInput('k');
    expect(app.selectedIndex).toBe(1);
  });

  it('notifies onSelectionChange when moving with j/k', () => {
    const onSelectionChange = vi.fn();
    const entries = [
      entry({ toolCallId: 'a', agentName: 'Alpha' }),
      entry({ toolCallId: 'b', agentName: 'Beta' }),
    ];
    const app = new SubagentsListApp(
      { entries, filter: 'all', colors: darkColors, onClose: vi.fn(), onSelectionChange },
      fakeTerminal(30),
    );

    app.handleInput('j');
    expect(onSelectionChange).toHaveBeenCalledWith(1);

    app.handleInput('k');
    expect(onSelectionChange).toHaveBeenCalledWith(0);
  });

  it('Enter triggers onSelect for the selected entry', () => {
    const onSelect = vi.fn();
    const entries = [
      entry({ toolCallId: 'a', agentName: 'Alpha' }),
      entry({ toolCallId: 'b', agentName: 'Beta' }),
    ];
    const app = makeApp(entries, vi.fn(), 30, onSelect);

    app.handleInput('\n');
    expect(onSelect).toHaveBeenCalledWith('a'); // selectedIndex = 0 by default

    app.handleInput('j'); // select Beta
    app.handleInput('\r');
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('Enter in Kitty protocol form triggers onSelect', () => {
    const onSelect = vi.fn();
    const app = makeApp([entry({ toolCallId: 'a', agentName: 'Alpha' })], vi.fn(), 30, onSelect);
    app.handleInput('\u001B[13u'); // Kitty Enter
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('Enter does nothing when list is empty', () => {
    const onSelect = vi.fn();
    const app = makeApp([], vi.fn(), 30, onSelect);

    app.handleInput('\n'); // no crash
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('updates entries via setProps()', () => {
    const app = makeApp([entry({ toolCallId: 'a', agentName: 'Alpha' })]);
    let out = strip(app.render(120).join('\n'));
    expect(out).toContain('Alpha');

    app.setProps({
      entries: [entry({ toolCallId: 'b', agentName: 'Beta' })],
      filter: 'all',
      colors: darkColors,
      onClose: vi.fn(),
    });
    out = strip(app.render(120).join('\n'));
    expect(out).toContain('Beta');
    expect(out).not.toContain('Alpha');
  });

  // ── Two-pane layout tests (matching TasksBrowserApp) ───────────

  it('renders list and right-stack panes with two-pane layout', () => {
    const entries = [entry({ toolCallId: 'a', agentName: 'Alpha', phase: 'running' })];
    const app = makeApp(entries);
    const lines = app.render(100);
    // Should have two panes: left list + right stack (no separator)
    expect(lines.length).toBeGreaterThan(2);
  });

  it('renders detail frame with agent name and stats', () => {
    const entries = [
      entry({
        toolCallId: 'agent-abc-123',
        agentName: 'Explorer',
        phase: 'running',
        description: 'Searching files',
        toolCount: 3,
        tokens: 5400,
        elapsedSeconds: 12,
      }),
    ];
    const app = makeApp(entries);
    app.setProps({
      entries,
      filter: 'all',
      colors: darkColors,
      selectedDetail: {
        latestActivity: 'Using Grep (pattern)',
        toolList: ['• Grep', '• Read'],
        errorText: undefined,
      } as SubagentDetailPane,
      selectedPreview: { lines: [], resultSummary: undefined, toolOutputs: [] },
      onClose: vi.fn(),
    });
    const out = strip(app.render(100).join('\n'));
    expect(out).toContain('Agent ID:');
    expect(out).toContain('Explorer'); // type
    expect(out).toContain('Status:');
    expect(out).toContain('Running');
    expect(out).toContain('3 tools');
    expect(out).toContain('Using Grep');
  });

  it('shows preview pane with output lines', () => {
    const entries = [entry({ toolCallId: 'a', agentName: 'Alpha' })];
    const app = makeApp(entries);
    app.setProps({
      entries,
      filter: 'all',
      colors: darkColors,
      selectedPreview: {
        lines: ['line1', 'line2', 'line3'],
        resultSummary: undefined,
        toolOutputs: [],
      },
      onClose: vi.fn(),
    });
    const out = strip(app.render(100).join('\n'));
    expect(out).toContain('line1');
    expect(out).toContain('line3');
  });

  it('shows real-time activity stream in preview pane', () => {
    const entries = [entry({ toolCallId: 'a', agentName: 'Alpha', phase: 'running' })];
    const app = makeApp(entries);
    app.setProps({
      entries,
      filter: 'all',
      colors: darkColors,
      selectedPreview: {
        lines: [],
        resultSummary: undefined,
        toolOutputs: [],
        activityLines: ['Used Grep (pattern)', 'Using Read (src/foo.ts)'],
      },
      onClose: vi.fn(),
    });
    const out = strip(app.render(100).join('\n'));
    expect(out).toContain('Used Grep');
    expect(out).toContain('Using Read');
  });

  it('shows "Waiting for output" in preview when running but no output', () => {
    const entries = [entry({ toolCallId: 'a', agentName: 'Alpha', phase: 'running' })];
    const app = makeApp(entries);
    app.setProps({
      entries,
      filter: 'all',
      colors: darkColors,
      selectedPreview: { lines: [], resultSummary: undefined, toolOutputs: [] },
      onClose: vi.fn(),
    });
    const out = strip(app.render(100).join('\n'));
    expect(out).toContain('Waiting for output');
  });

  it('shows result summary in preview when available', () => {
    const entries = [entry({ toolCallId: 'a', agentName: 'Alpha', phase: 'done' })];
    const app = makeApp(entries);
    app.setProps({
      entries,
      filter: 'all',
      colors: darkColors,
      selectedPreview: {
        lines: [],
        resultSummary: 'Completed the search with 3 matches.',
        toolOutputs: ['[Grep] src/foo.ts:1:bar'],
      },
      onClose: vi.fn(),
    });
    const out = strip(app.render(100).join('\n'));
    expect(out).toContain('Completed the search');
    expect(out).toContain('[Grep]');
  });

  it('pads every rendered line to exactly the terminal width so colored text does not break frame alignment', () => {
    const previousLevel = chalk.level;
    chalk.level = 3;
    try {
      const entries = [
        entry({
          toolCallId: 'agent-abc-123',
          agentName: 'Explore',
          phase: 'running',
          description: 'Search codebase',
          toolCount: 3,
          tokens: 5400,
          elapsedSeconds: 12,
        }),
      ];
      const app = makeApp(entries);
      app.setProps({
        entries,
        filter: 'all',
        colors: darkColors,
        selectedDetail: {
          latestActivity: 'Using Grep (pattern)',
          toolList: ['• Grep', '• Read'],
          errorText: undefined,
        } as SubagentDetailPane,
        selectedPreview: {
          lines: ['line one', 'line two'],
          resultSummary: undefined,
          toolOutputs: [],
        },
        onClose: vi.fn(),
      });

      const width = 100;
      const lines = app.render(width);
      for (const line of lines) {
        expect(stripAnsi(line).length).toBe(width);
      }
    } finally {
      chalk.level = previousLevel;
    }
  });
});
