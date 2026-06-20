import { describe, expect, it, vi } from 'vitest';
import type { Terminal } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import { SubagentLiveViewer, type SubagentLiveViewerProps } from '#/tui/components/dialogs/subagents/live-viewer';
import type { SubagentActivityDetail } from '#/tui/components/messages/tool-call';
import { darkColors } from '#/tui/theme/colors';

const ANSI_SGR = /\[[0-9;]*m/g;
function strip(text: string): string {
  return text.replaceAll(ANSI_SGR, '');
}

const ANSI_ESCAPE = /\u001B\[[0-9;]*m/g;
function stripAnsi(text: string): string {
  return text.replaceAll(ANSI_ESCAPE, '');
}

function fakeTerminal(rows: number, columns = 120): Terminal {
  return {
    start: () => {},
    stop: () => {},
    drainInput: () => Promise.resolve(),
    write: () => {},
    get columns() { return columns; },
    get rows() { return rows; },
    get kittyProtocolActive() { return false; },
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

function makeDetail(overrides: Partial<SubagentActivityDetail> = {}): SubagentActivityDetail {
  return {
    toolCallId: 'agent-abc',
    agentName: 'Explore',
    phase: 'running',
    toolCount: 2,
    tokens: 5400,
    elapsedSeconds: 12,
    activities: [
      { orderSeq: 1, name: 'Grep', args: { pattern: 'foo' }, phase: 'done', output: 'src/foo.ts:1:bar', isError: false },
      { orderSeq: 2, name: 'Read', args: { path: 'src/foo.ts' }, phase: 'done', output: 'file content here', isError: false },
    ],
    text: 'Completed the search.',
    thinkingText: 'I should search for references...',
    resultSummary: undefined,
    errorText: undefined,
    ...overrides,
  };
}

function makeProps(overrides: Partial<SubagentLiveViewerProps> = {}): SubagentLiveViewerProps {
  return {
    data: makeDetail(),
    colors: darkColors,
    onClose: vi.fn(),
    ...overrides,
  };
}

function makeViewer(props?: Partial<SubagentLiveViewerProps>, rows = 30) {
  return new SubagentLiveViewer(makeProps(props), fakeTerminal(rows));
}

describe('SubagentLiveViewer', () => {
  it('fills terminal height', () => {
    const rows = 30;
    const lines = makeViewer({}, rows).render(120);
    expect(lines.length).toBe(rows);
  });

  it('renders the agent name in the header', () => {
    const out = strip(makeViewer({ data: makeDetail({ agentName: 'Review' }) }).render(120).join('\n'));
    expect(out).toContain('Review');
  });

  it('renders tool activities with verb and args', () => {
    const out = strip(makeViewer().render(120).join('\n'));
    expect(out).toContain('Grep');
    expect(out).toContain('Read');
  });

  it('renders subagent text output', () => {
    const out = strip(makeViewer({ data: makeDetail({ text: 'Search results found.' }) }).render(120).join('\n'));
    expect(out).toContain('Search results found.');
  });

  it('closes on Q or Esc', () => {
    const onClose = vi.fn();
    const viewer = makeViewer({ onClose });
    viewer.handleInput('q');
    expect(onClose).toHaveBeenCalledTimes(1);

    viewer.handleInput('\u001B');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('scrolls with j/k', () => {
    // Create enough lines to exceed one page
    const manyActivities = Array.from({ length: 50 }, (_, i) => ({
      orderSeq: i + 1,
      name: 'Tool',
      args: {},
      phase: 'done' as const,
      output: `line ${i + 1}`,
      isError: false,
    }));

    const viewer = makeViewer({
      data: makeDetail({
        activities: manyActivities,
        text: '',
        thinkingText: '',
      }),
    }, 10); // small terminal to force scrolling

    expect(viewer['scrollTop']).toBe(0);
    viewer.handleInput('j');
    expect(viewer['scrollTop']).toBe(1);
    viewer.handleInput('k');
    expect(viewer['scrollTop']).toBe(0);
  });

  it('scrolls by page with PgUp/PgDn', () => {
    const manyActivities = Array.from({ length: 50 }, (_, i) => ({
      orderSeq: i + 1,
      name: 'Tool',
      args: {},
      phase: 'done' as const,
      output: `line ${i + 1}`,
      isError: false,
    }));

    const viewer = makeViewer({
      data: makeDetail({
        activities: manyActivities,
        text: '',
        thinkingText: '',
      }),
    }, 10); // body height = 8, page delta = 7

    expect(viewer['scrollTop']).toBe(0);
    viewer.handleInput('\u001B[6~'); // PgDn
    expect(viewer['scrollTop']).toBeGreaterThan(0);

    const afterDown = viewer['scrollTop'];
    viewer.handleInput('\u001B[5~'); // PgUp
    expect(viewer['scrollTop']).toBeLessThan(afterDown);
  });

  it('scrolls to top with g and bottom with G', () => {
    const viewer = makeViewer({
      data: makeDetail({
        activities: Array.from({ length: 30 }, (_, i) => ({
          orderSeq: i + 1, name: 'Tool', args: {}, phase: 'done' as const, output: '', isError: false,
        })),
        text: '',
        thinkingText: '',
      }),
    }, 10);

    viewer.handleInput('g');
    expect(viewer['scrollTop']).toBe(0);

    viewer.handleInput('G');
    expect(viewer['scrollTop']).toBeGreaterThan(0);
  });

  it('follows new content when parked at the bottom (AC4)', () => {
    // Render once so lastBodyWidth + scroll math are valid, then park at bottom.
    const viewer = makeViewer({
      data: makeDetail({
        activities: Array.from({ length: 30 }, (_, i) => ({
          orderSeq: i + 1, name: 'Tool', args: {}, phase: 'done' as const, output: '', isError: false,
        })),
        text: '', thinkingText: '',
      }),
    }, 10);
    viewer.render(120);
    viewer.handleInput('G'); // park at bottom
    const bottomBefore = viewer['scrollTop'];

    // More content arrives via streaming -> viewer must stay pinned to bottom.
    viewer.setProps(makeProps({
      data: makeDetail({
        activities: Array.from({ length: 50 }, (_, i) => ({
          orderSeq: i + 1, name: 'Tool', args: {}, phase: 'done' as const, output: '', isError: false,
        })),
        text: '', thinkingText: '',
      }),
    }));
    expect(viewer['scrollTop']).toBeGreaterThan(bottomBefore);
  });

  it('preserves scroll position when the user is NOT at the bottom (AC4)', () => {
    const viewer = makeViewer({
      data: makeDetail({
        activities: Array.from({ length: 30 }, (_, i) => ({
          orderSeq: i + 1, name: 'Tool', args: {}, phase: 'done' as const, output: '', isError: false,
        })),
        text: '', thinkingText: '',
      }),
    }, 10);
    viewer.render(120);
    viewer.handleInput('g'); // scroll to top — user is NOT at bottom
    expect(viewer['scrollTop']).toBe(0);

    // Content grows while the user is reading near the top: scroll must NOT
    // jump to the new bottom.
    viewer.setProps(makeProps({
      data: makeDetail({
        activities: Array.from({ length: 50 }, (_, i) => ({
          orderSeq: i + 1, name: 'Tool', args: {}, phase: 'done' as const, output: '', isError: false,
        })),
        text: '', thinkingText: '',
      }),
    }));
    expect(viewer['scrollTop']).toBe(0);
  });

  it('updates display via setProps()', () => {
    const viewer = makeViewer({ data: makeDetail({ agentName: 'Alpha' }) });
    let out = strip(viewer.render(120).join('\n'));
    expect(out).toContain('Alpha');

    viewer.setProps(makeProps({ data: makeDetail({ agentName: 'Beta' }) }));
    out = strip(viewer.render(120).join('\n'));
    expect(out).toContain('Beta');
    expect(out).not.toContain('Alpha');
  });

  it('toggles thinking visibility on t key', () => {
    const viewer = makeViewer({
      data: makeDetail({
        thinkingText: 'I am thinking deeply...\nmore thoughts',
      }),
    });

    // Default: hidden
    let out = strip(viewer.render(120).join('\n'));
    expect(out).not.toContain('thinking deeply');

    // Toggle on
    viewer.handleInput('t');
    out = strip(viewer.render(120).join('\n'));
    expect(out).toContain('thinking deeply');

    // Toggle off
    viewer.handleInput('t');
    out = strip(viewer.render(120).join('\n'));
    expect(out).not.toContain('thinking deeply');
  });

  it('shows t hint in footer when thinking is non-empty', () => {
    const viewer = makeViewer({
      data: makeDetail({
        thinkingText: 'Some reasoning...',
      }),
    });
    const out = strip(viewer.render(120).join('\n'));
    expect(out).toContain('t');
    expect(out).toContain('thinking');
  });

  it('hides t hint in footer when thinking is empty', () => {
    const viewer = makeViewer({
      data: makeDetail({
        thinkingText: '',
      }),
    });
    const out = strip(viewer.render(120).join('\n'));
    // The t hint should not appear — we check that 'thinking' is absent
    expect(out).not.toContain('thinking');
  });

  it('pads every rendered line to exactly the terminal width so colored text does not break alignment', () => {
    const previousLevel = chalk.level;
    chalk.level = 3;
    try {
      const viewer = makeViewer({
        data: makeDetail({
          agentName: 'Explore',
          phase: 'running',
          toolCount: 3,
          tokens: 5400,
          elapsedSeconds: 12,
          activities: [
            { orderSeq: 1, name: 'Grep', args: { pattern: 'foo' }, phase: 'done', output: 'src/foo.ts:1:bar', isError: false },
          ],
          text: 'Search complete.',
          thinkingText: 'I should search...',
          resultSummary: 'Found 1 match.',
        }),
      });

      const width = 120;
      const lines = viewer.render(width);
      for (const line of lines) {
        expect(stripAnsi(line).length).toBe(width);
      }
    } finally {
      chalk.level = previousLevel;
    }
  });

  it('escapes raw control characters in streamed text so they do not corrupt the layout', () => {
    // A stray \r in the middle of output is what historically made the cursor
    // jump back and produced the "one character per line" garble.
    const viewer = makeViewer({
      data: makeDetail({
        text: 'line one\rcorrupted\rtail',
        activities: [],
      }),
    });

    const out = strip(viewer.render(120).join('\n'));
    // The raw \r must not survive into the rendered output.
    expect(out).not.toContain('\r');
    // Placeholder glyphs replace the control chars instead of vanishing.
    expect(out).toContain('corrupted');
    expect(out).toContain('tail');
  });

  it('escapes control characters in tool output, thinking, and error text', () => {
    const viewer = makeViewer({
      data: makeDetail({
        phase: 'failed',
        activities: [
          { orderSeq: 1, name: 'Bash', args: { command: 'x' }, phase: 'failed', output: 'err\u0007bell\u000Bvtab', isError: true },
        ],
        thinkingText: 'think\u0008back',
        errorText: 'boom\u0007',
      }),
    });
    viewer.handleInput('t'); // show thinking
    const out = viewer.render(120).join('\n');
    expect(out).not.toContain('\u0007');
    expect(out).not.toContain('\u000B');
    expect(out).not.toContain('\u0008');
    // Control chars are substituted (not stripped): the · placeholder appears,
    // so a future change that silently deletes them instead of replacing would
    // fail this assertion.
    expect(out).toContain('·');
  });

  it('soft-wraps long lines instead of truncating them to ellipsis', () => {
    // A single very long output line must wrap across multiple rows; content
    // near the end of the line must still be visible somewhere in the body.
    const longLine = 'A'.repeat(300);
    const viewer = makeViewer({
      data: makeDetail({ text: longLine, activities: [] }),
    }, 30);

    const out = strip(viewer.render(60).join('\n'));
    // The full content survives wrapping (300 A's), spread across rows.
    const aCount = out.replaceAll('\n', '').split('').filter((c) => c === 'A').length;
    expect(aCount).toBe(300);
  });
});
