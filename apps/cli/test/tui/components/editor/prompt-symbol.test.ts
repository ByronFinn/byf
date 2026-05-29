import { describe, it, expect } from 'vitest';

import { injectPromptSymbol, stripShellModePrefix } from '#/tui/components/editor/custom-editor';

describe('injectPromptSymbol', () => {
  it('places a "> " prompt at columns 2-3 (col 0 = border, col 1 = single-space gap)', () => {
    expect(injectPromptSymbol('    hello world')).toBe('  > hello world');
  });

  it('preserves overall visible width (prompt occupies padding slots)', () => {
    const original = '    hello       ';
    expect(injectPromptSymbol(original)).toHaveLength(original.length);
  });

  it('preserves trailing ANSI escapes (e.g. cursor inverse marker)', () => {
    const line = '    [7m [0m         ';
    const out = injectPromptSymbol(line);
    expect(out).toBe('  > [7m [0m         ');
  });

  it('emits no SGR (terminal default foreground renders the symbol)', () => {
    const out = injectPromptSymbol('    hello');
    expect(out).not.toMatch(/\[/);
  });

  it('returns undefined when the line is too short', () => {
    expect(injectPromptSymbol('   ')).toBeUndefined();
    expect(injectPromptSymbol('')).toBeUndefined();
  });

  it('returns undefined when the leading four characters are not all spaces', () => {
    expect(injectPromptSymbol('x   hello')).toBeUndefined();
    expect(injectPromptSymbol(' x  hello')).toBeUndefined();
    expect(injectPromptSymbol('  x hello')).toBeUndefined();
    expect(injectPromptSymbol('   xhello')).toBeUndefined();
  });

  it('supports shell-mode prompt symbol with color', () => {
    const out = injectPromptSymbol('    ls', { symbol: '$', colorHex: '#00ff00' });
    expect(out).toBe('  $ ls');
  });
});

describe('stripShellModePrefix', () => {
  it('hides leading `! ` from shell-mode content line', () => {
    expect(stripShellModePrefix('    ! ls -la')).toBe('    ls -la');
  });

  it('preserves ANSI markers around hidden prefix', () => {
    const line = '    \u001B[7m!\u001B[0m \u001B[7ml\u001B[0ms';
    expect(stripShellModePrefix(line)).toBe('    \u001B[7m\u001B[0m\u001B[7ml\u001B[0ms');
  });

  it('leaves non-shell lines untouched', () => {
    expect(stripShellModePrefix('    /help')).toBe('    /help');
  });
});
