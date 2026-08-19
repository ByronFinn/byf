import { describe, expect, it } from 'vitest';

import { ShellExecutionComponent } from '#/tui/components/messages/shell-execution';
import { darkColors } from '#/tui/theme/colors';

function strip(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

describe('ShellExecutionComponent', () => {
  it('renders shell command previews with prompt indentation', () => {
    const component = new ShellExecutionComponent({
      command: 'printf hello\nprintf world',
      colors: darkColors,
      showCommand: true,
    });

    const output = component.render(100).map((line) => strip(line).trimEnd());

    expect(output).toContain('  $ printf hello');
    expect(output).toContain('    printf world');
  });

  it('keeps collapsed shell output short and expands on demand', () => {
    const collapsed = new ShellExecutionComponent({
      result: {
        tool_call_id: 'call_shell',
        output: ['line1', 'line2', 'line3', 'line4', 'line5'].join('\n'),
        is_error: false,
      },
      colors: darkColors,
    });

    const collapsedOutput = collapsed.render(100).map(strip).join('\n');
    expect(collapsedOutput).toContain('line1');
    expect(collapsedOutput).toContain('line3');
    expect(collapsedOutput).not.toContain('line4');
    expect(collapsedOutput).toContain('... (2 more lines, ctrl+o to expand)');

    const expanded = new ShellExecutionComponent({
      result: {
        tool_call_id: 'call_shell',
        output: ['line1', 'line2', 'line3', 'line4', 'line5'].join('\n'),
        is_error: false,
      },
      colors: darkColors,
      expanded: true,
    });

    const expandedOutput = expanded.render(100).map(strip).join('\n');
    expect(expandedOutput).toContain('line4');
    expect(expandedOutput).toContain('line5');
    expect(expandedOutput).not.toContain('ctrl+o to expand');
  });

  it('renders the command above a finished result and caps it while collapsed', () => {
    const multiline = ['echo a', 'echo b', 'echo c'].join('\n');
    const collapsed = new ShellExecutionComponent({
      command: multiline,
      commandPreviewLines: 2,
      showCommand: true,
      result: { tool_call_id: 'call_shell', output: 'a\nb\nc', is_error: false },
      colors: darkColors,
    });

    const collapsedOutput = collapsed.render(100).map(strip).join('\n');
    expect(collapsedOutput).toContain('$ echo a');
    expect(collapsedOutput).toContain('echo b');
    // 超出 commandPreviewLines 的命令行在折叠态被截断
    expect(collapsedOutput).not.toContain('echo c');
    // 结果预览照常渲染
    expect(collapsedOutput).toContain('a');
  });

  it('shows the full multi-line command when expanded', () => {
    const multiline = ['echo a', 'echo b', 'echo c'].join('\n');
    const expanded = new ShellExecutionComponent({
      command: multiline,
      commandPreviewLines: 2,
      expanded: true,
      showCommand: true,
      result: { tool_call_id: 'call_shell', output: 'a\nb\nc', is_error: false },
      colors: darkColors,
    });

    const expandedOutput = expanded.render(100).map(strip).join('\n');
    expect(expandedOutput).toContain('$ echo a');
    expect(expandedOutput).toContain('echo c');
  });
});
