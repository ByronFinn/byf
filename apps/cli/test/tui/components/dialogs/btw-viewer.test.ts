import type { Terminal } from '@earendil-works/pi-tui';
import { visibleWidth } from '@earendil-works/pi-tui';
import { describe, expect, it, vi } from 'vitest';

import { BtwViewer, type BtwViewerProps } from '#/tui/components/dialogs/btw-viewer';
import { darkColors } from '#/tui/theme/colors';

const ANSI_SGR = /\[[0-9;]*m/g;
function strip(text: string): string {
  return text.replaceAll(ANSI_SGR, '');
}

function fakeTerminal(rows: number, columns = 80): Terminal {
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

function makeProps(overrides: Partial<BtwViewerProps> = {}): BtwViewerProps {
  return {
    query: 'where is the config?',
    answer: '',
    status: 'streaming',
    colors: darkColors,
    onClose: vi.fn(),
    ...overrides,
  };
}

function makeViewer(props?: Partial<BtwViewerProps>, rows = 20, columns = 80) {
  return new BtwViewer(makeProps(props), fakeTerminal(rows, columns));
}

describe('BtwViewer', () => {
  it('fills terminal height', () => {
    const rows = 20;
    const lines = makeViewer({}, rows).render(80);
    expect(lines.length).toBe(rows);
  });

  it('renders the question and a streaming placeholder', () => {
    const out = strip(makeViewer().render(80).join('\n'));
    expect(out).toContain('where is the config?');
    expect(out).toContain('A: …');
    expect(out).toContain('streaming');
  });

  it('renders the answer when completed', () => {
    const out = strip(
      makeViewer({ answer: 'config/runtime.toml', status: 'completed' }).render(80).join('\n'),
    );
    expect(out).toContain('A: config/runtime.toml');
    expect(out).toContain('done');
  });

  it('renders token usage when completed', () => {
    const out = strip(
      makeViewer({
        answer: 'config/runtime.toml',
        status: 'completed',
        usage: {
          inputCacheRead: 100,
          inputCacheCreation: 50,
          inputOther: 30,
          output: 20,
        },
      })
        .render(80)
        .join('\n'),
    );
    expect(out).toContain('tokens: 200');
    expect(out).toContain('in-cache 100');
  });

  it('renders an error message when failed', () => {
    const out = strip(
      makeViewer({
        answer: '',
        status: 'failed',
        error: 'provider rate limit',
      })
        .render(80)
        .join('\n'),
    );
    expect(out).toContain('failed');
    expect(out).toContain('Error: provider rate limit');
  });

  it('closes on Esc', () => {
    const onClose = vi.fn();
    const viewer = makeViewer({ onClose });
    viewer.handleInput('\u001B');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on Enter', () => {
    const onClose = vi.fn();
    const viewer = makeViewer({ onClose });
    viewer.handleInput('\r');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on q', () => {
    const onClose = vi.fn();
    const viewer = makeViewer({ onClose });
    viewer.handleInput('q');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('updates via setProps and follows the tail', () => {
    const viewer = makeViewer();
    viewer.setProps(makeProps({ answer: 'partial', status: 'streaming' }));
    const out = strip(viewer.render(80).join('\n'));
    expect(out).toContain('A: partial');
  });

  it('scrolls up and down', () => {
    const viewer = makeViewer({
      answer: Array.from({ length: 50 }, (_, i) => `line ${String(i)}`).join('\n'),
      status: 'completed',
    });
    // Scroll to top then down one line.
    viewer.handleInput('g');
    viewer.handleInput('j');
    const out = strip(viewer.render(80).join('\n'));
    expect(out).toContain('line 1');
  });

  it('wraps long lines into multiple visual rows', () => {
    const longAnswer = 'a'.repeat(200);
    const viewer = makeViewer({ answer: longAnswer, status: 'completed' }, 20, 40);
    const out = viewer.render(40);
    // The wrapped answer should occupy more than one body row.
    const bodyRows = out.slice(2, -1);
    const joined = strip(bodyRows.join(''));
    const aCount = (joined.match(/a/g) ?? []).length;
    expect(aCount).toBeGreaterThan(20);
  });

  it('honors maxHeight so the bottom border is not clipped', () => {
    const rows = 40;
    const maxHeight = 16;
    const viewer = makeViewer({ maxHeight }, rows);
    const out = viewer.render(80);
    expect(out.length).toBe(maxHeight);
    const topLine = out[0];
    const bottomLine = out[maxHeight - 2];
    const footerLine = out[maxHeight - 1];
    expect(topLine).toBeDefined();
    expect(bottomLine).toBeDefined();
    expect(footerLine).toBeDefined();
    expect(strip(topLine)).toBe('─'.repeat(80));
    expect(strip(bottomLine)).toBe('─'.repeat(80));
    expect(strip(footerLine)).toContain('scroll');
  });

  it('keeps every rendered line within the requested width', () => {
    const viewer = makeViewer({
      answer: '中'.repeat(200),
      status: 'completed',
      maxHeight: 12,
    });
    const width = 30;
    const out = viewer.render(width);
    for (const line of out) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    }
  });
});
