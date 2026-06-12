import type { Terminal } from '@earendil-works/pi-tui';
import { describe, expect, it, vi } from 'vitest';

import { FileViewerComponent } from '#/tui/components/dialogs/file-viewer';
import type { FileViewerProps, FileViewerSection } from '#/tui/components/dialogs/file-viewer';
import { darkColors } from '#/tui/theme/colors';

const ANSI_SGR = /\u001B\[[0-9;]*m/g;
function strip(text: string): string {
  return text.replaceAll(ANSI_SGR, '');
}

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

function makeViewer(
  sections: FileViewerSection[],
  opts: { rows?: number; columns?: number; onClose?: () => void } = {},
): FileViewerComponent {
  const onClose = opts.onClose ?? (() => {});
  const props: FileViewerProps = {
    sections,
    colors: darkColors,
    onClose,
  };
  return new FileViewerComponent(props, fakeTerminal(opts.rows ?? 24, opts.columns ?? 120));
}

// ── Construction & rendering ──────────────────────────────────────────────

describe('FileViewerComponent — construction & rendering', () => {
  it('fills exactly terminal.rows lines', () => {
    const viewer = makeViewer(
      [{ header: 'src/foo.ts', lines: ['line 1', 'line 2'] }],
      { rows: 24 },
    );
    const lines = viewer.render(120);
    expect(lines.length).toBe(24);
  });

  it('renders a section header followed by content lines', () => {
    const viewer = makeViewer(
      [{ header: '+3 -2 src/foo.ts', lines: ['   1  const x = 1;', '   2  const y = 2;'] }],
      { rows: 24 },
    );
    const out = strip(viewer.render(120).join('\n'));
    expect(out).toContain('+3 -2 src/foo.ts');
    expect(out).toContain('const x = 1;');
    expect(out).toContain('const y = 2;');
  });

  it('renders multiple sections concatenated', () => {
    const viewer = makeViewer(
      [
        { header: 'src/a.ts', lines: ['aaa'] },
        { header: 'src/b.ts', lines: ['bbb'] },
      ],
      { rows: 24 },
    );
    const out = strip(viewer.render(120).join('\n'));
    expect(out).toContain('src/a.ts');
    expect(out).toContain('aaa');
    expect(out).toContain('src/b.ts');
    expect(out).toContain('bbb');
  });

  it('shows "no content" when sections are empty', () => {
    const viewer = makeViewer([], { rows: 24 });
    const out = strip(viewer.render(120).join('\n'));
    expect(out).toContain('no content');
  });

  it('shows "no content" when all sections have no lines', () => {
    const viewer = makeViewer(
      [{ header: 'empty.ts', lines: [] }],
      { rows: 24 },
    );
    const out = strip(viewer.render(120).join('\n'));
    expect(out).toContain('no content');
  });
});

// ── Footer / position indicator ───────────────────────────────────────────

describe('FileViewerComponent — footer', () => {
  it('shows position indicator in the footer', () => {
    const viewer = makeViewer(
      [{ header: 'f.ts', lines: ['a', 'b', 'c'] }],
      { rows: 20 },
    );
    const out = strip(viewer.render(120).join('\n'));
    // 1 header + 3 content = 4 lines; footer should show 1-4 / 4 (100%)
    expect(out).toMatch(/1-4 \/ 4/);
    expect(out).toContain('100%');
  });

  it('shows navigation hints in the footer', () => {
    const viewer = makeViewer(
      [{ header: 'f.ts', lines: ['a'] }],
      { rows: 20 },
    );
    const out = strip(viewer.render(120).join('\n'));
    expect(out).toMatch(/PgUp\/PgDn/);
    expect(out).toMatch(/Q\/Esc/);
  });
});

// ── Input handling ────────────────────────────────────────────────────────

describe('FileViewerComponent — input', () => {
  it('q invokes onClose', () => {
    const onClose = vi.fn();
    const viewer = makeViewer(
      [{ header: 'f.ts', lines: ['a'] }],
      { rows: 24, onClose },
    );
    viewer.handleInput('q');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc invokes onClose', () => {
    const onClose = vi.fn();
    const viewer = makeViewer(
      [{ header: 'f.ts', lines: ['a'] }],
      { rows: 24, onClose },
    );
    viewer.handleInput('\u001B');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Q (uppercase) invokes onClose', () => {
    const onClose = vi.fn();
    const viewer = makeViewer(
      [{ header: 'f.ts', lines: ['a'] }],
      { rows: 24, onClose },
    );
    viewer.handleInput('Q');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ── Scrolling ─────────────────────────────────────────────────────────────

describe('FileViewerComponent — scrolling', () => {
  function manyLines(n: number): string[] {
    return Array.from({ length: n }, (_, i) => `line-${String(i + 1).padStart(3, '0')}`);
  }

  it('renders the top of the buffer initially', () => {
    const viewer = makeViewer(
      [{ header: 'big.ts', lines: manyLines(100) }],
      { rows: 12 },
    );
    const out = strip(viewer.render(120).join('\n'));
    // header line + content lines; first content line should be visible
    expect(out).toContain('line-001');
    // The last few lines should not be visible
    expect(out).not.toContain('line-100');
  });

  it('j scrolls down by one line', () => {
    const viewer = makeViewer(
      [{ header: 'big.ts', lines: manyLines(50) }],
      { rows: 12 },
    );
    viewer.handleInput('j');
    const out = strip(viewer.render(120).join('\n'));
    // After scrolling 1 down, line-002 should be first visible content
    expect(out).toContain('line-002');
  });

  it('k scrolls up by one line', () => {
    const viewer = makeViewer(
      [{ header: 'big.ts', lines: manyLines(50) }],
      { rows: 12 },
    );
    viewer.handleInput('j');
    viewer.handleInput('j');
    viewer.handleInput('k');
    const out = strip(viewer.render(120).join('\n'));
    // After j,j,k net scroll = 1, so line-002 should be first visible
    expect(out).toContain('line-002');
  });

  it('g scrolls to the top', () => {
    const viewer = makeViewer(
      [{ header: 'big.ts', lines: manyLines(100) }],
      { rows: 14 },
    );
    viewer.handleInput('G');
    viewer.handleInput('g');
    const out = strip(viewer.render(120).join('\n'));
    expect(out).toContain('line-001');
  });

  it('G scrolls to the bottom', () => {
    const viewer = makeViewer(
      [{ header: 'big.ts', lines: manyLines(100) }],
      { rows: 14 },
    );
    viewer.handleInput('G');
    const out = strip(viewer.render(120).join('\n'));
    expect(out).toContain('line-100');
    expect(out).toContain('100%');
  });

  it('PgDn scrolls by a page', () => {
    const viewer = makeViewer(
      [{ header: 'big.ts', lines: manyLines(50) }],
      { rows: 12 },
    );
    // viewableRows = 12 - 4 = 8. Page scroll = max(1, 8-1) = 7
    viewer.handleInput('\u001B[6~'); // PageDown
    const out = strip(viewer.render(120).join('\n'));
    expect(out).toContain('line-008');
    expect(out).not.toContain('line-001');
  });

  it('PgUp scrolls up by a page', () => {
    const viewer = makeViewer(
      [{ header: 'big.ts', lines: manyLines(50) }],
      { rows: 12 },
    );
    viewer.handleInput('\u001B[6~'); // PageDown
    viewer.handleInput('\u001B[5~'); // PageUp
    const out = strip(viewer.render(120).join('\n'));
    expect(out).toContain('line-001');
  });

  it('scrollTop is clamped at boundaries for small content', () => {
    const viewer = makeViewer(
      [{ header: 'small.ts', lines: ['a', 'b', 'c'] }],
      { rows: 20 },
    );
    // Content fits in view; scrolling down should not change anything
    viewer.handleInput('j');
    viewer.handleInput('j');
    const out = strip(viewer.render(120).join('\n'));
    expect(out).toContain('a');
    expect(out).toContain('c');
  });

  it('large content scrollTop is clamped correctly', () => {
    const viewer = makeViewer(
      [{ header: 'big.ts', lines: manyLines(200) }],
      { rows: 10 },
    );
    // viewableRows = 10 - 4 = 6; total lines = 1 header + 200 content = 201
    // maxScroll = max(0, 201 - 6) = 195
    viewer.handleInput('G');
    const out = strip(viewer.render(120).join('\n'));
    expect(out).toContain('line-200');
    expect(out).toContain('100%');
  });
});
