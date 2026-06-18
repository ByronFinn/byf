import type { TUI } from '@earendil-works/pi-tui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  formatSubagentTokens,
  ToolCallComponent,
} from '#/tui/components/messages/tool-call';
import { STATUS_BULLET } from '#/tui/constant/symbols';
import { darkColors } from '#/tui/theme/colors';
import { createMarkdownTheme } from '#/tui/theme/pi-tui-theme';

import { captureProcessWrite } from '../../../helpers/process';

const ESC = String.fromCodePoint(0x1b);
const BEL = String.fromCodePoint(0x07);

function strip(text: string): string {
  return text
    .replaceAll(/\u001B\[[0-9;]*m/g, '')
    .replaceAll(new RegExp(`${ESC}\\]8;;[^${BEL}]*${BEL}`, 'g'), '');
}

function stubTui(rows: number): TUI {
  return {
    terminal: { rows },
    requestRender: () => {},
  } as unknown as TUI;
}

describe('ToolCallComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the shared non-emoji tool status bullet', () => {
    const component = new ToolCallComponent(
      {
        id: 'call_read_marker',
        name: 'Read',
        args: { path: 'foo.ts' },
      },
      {
        tool_call_id: 'call_read_marker',
        output: 'content',
        is_error: false,
      },
      darkColors,
    );

    const out = strip(component.render(100).join('\n'));
    expect(out).toContain(`${STATUS_BULLET}Used Read`);
    expect(out).not.toContain(`\u23FA Used Read`);
    expect(out).not.toContain(`${String.fromCodePoint(0x23fa, 0xfe0e)} Used Read`);
  });

  it('keeps collapsed tool results short and expands on demand', () => {
    const component = new ToolCallComponent(
      {
        id: 'call_shell',
        name: 'Bash',
        args: { command: 'printf output' },
      },
      {
        tool_call_id: 'call_shell',
        output: ['line1', 'line2', 'line3', 'line4', 'line5'].join('\n'),
        is_error: false,
      },
      darkColors,
    );

    const collapsed = strip(component.render(100).join('\n'));
    expect(collapsed).toContain('line1');
    expect(collapsed).toContain('line2');
    expect(collapsed).toContain('line3');
    expect(collapsed).not.toContain('line4');
    expect(collapsed).toContain('... (2 more lines, ctrl+o to expand)');

    component.setExpanded(true);

    const expanded = strip(component.render(100).join('\n'));
    expect(expanded).toContain('line4');
    expect(expanded).toContain('line5');
    expect(expanded).not.toContain('ctrl+o to expand');
  });

  it('hides tool output bodies that start with a <system tag', () => {
    const reminderOutput =
      '<system-reminder>\nThe task tools have not been used recently.\n</system-reminder>';
    const component = new ToolCallComponent(
      {
        id: 'call_hidden',
        name: 'Bash',
        args: { command: 'echo hi' },
      },
      {
        tool_call_id: 'call_hidden',
        output: reminderOutput,
        is_error: false,
      },
      darkColors,
    );

    const collapsed = strip(component.render(100).join('\n'));
    expect(collapsed).toContain(`${STATUS_BULLET}Used Bash`);
    expect(collapsed).not.toContain('system-reminder');
    expect(collapsed).not.toContain('task tools');

    component.setExpanded(true);
    const expanded = strip(component.render(100).join('\n'));
    expect(expanded).not.toContain('system-reminder');
    expect(expanded).not.toContain('task tools');
  });

  it('hides <system-prefixed output even when the tool result is an error', () => {
    const component = new ToolCallComponent(
      {
        id: 'call_hidden_err',
        name: 'Bash',
        args: { command: 'false' },
      },
      {
        tool_call_id: 'call_hidden_err',
        output: '<system-reminder>do not show</system-reminder>',
        is_error: true,
      },
      darkColors,
    );

    const out = strip(component.render(100).join('\n'));
    expect(out).not.toContain('system-reminder');
    expect(out).not.toContain('do not show');
  });

  it('still renders tool output when the body merely contains <system later on', () => {
    const component = new ToolCallComponent(
      {
        id: 'call_inline',
        name: 'Bash',
        args: { command: 'echo hi' },
      },
      {
        tool_call_id: 'call_inline',
        output: 'first line\n<system-reminder>nope</system-reminder>',
        is_error: false,
      },
      darkColors,
    );

    const out = strip(component.render(100).join('\n'));
    expect(out).toContain('first line');
  });

  it('renders AskUserQuestion with a friendly header instead of the raw tool name', () => {
    const component = new ToolCallComponent(
      {
        id: 'call_question',
        name: 'AskUserQuestion',
        args: {},
      },
      {
        tool_call_id: 'call_question',
        output: JSON.stringify({
          answers: {
            'Favorite editor?': 'Vim',
          },
        }),
        is_error: false,
      },
      darkColors,
    );

    const out = strip(component.render(100).join('\n'));
    expect(out).toContain('Collected your answers');
    expect(out).toContain('Favorite editor?');
    expect(out).toContain('Vim');
    expect(out).not.toContain('AskUserQuestion');
  });

  it('appends a chip to the header once a result arrives', () => {
    const component = new ToolCallComponent(
      {
        id: 'call_read',
        name: 'Read',
        args: { path: 'foo.ts' },
      },
      {
        tool_call_id: 'call_read',
        output: '1\tfoo\n2\tbar\n3\tbaz',
        is_error: false,
      },
      darkColors,
    );

    const out = strip(component.render(100).join('\n'));
    expect(out).toContain('Used Read');
    expect(out).toContain('· 3 lines');
  });

  it('truncates a long file path from the head so the filename stays visible', () => {
    const longPath =
      'apps/cli/src/tui/components/messages/tool-renderers/long-path/example/final-file.ts';
    const component = new ToolCallComponent(
      {
        id: 'call_long_path',
        name: 'Read',
        args: { path: longPath },
      },
      undefined,
      darkColors,
    );

    const out = strip(component.render(100).join('\n'));
    expect(out).toContain('final-file.ts');
    expect(out).toContain('…');
    expect(out).not.toContain('apps/cli/src/tui/components/messages/tool-renderers/long-pa…');
  });

  it('shows Read paths relative to the active workspace', () => {
    const component = new ToolCallComponent(
      {
        id: 'call_workspace_read',
        name: 'Read',
        args: { path: '/tmp/proj-a/apps/cli/src/main.ts' },
      },
      {
        tool_call_id: 'call_workspace_read',
        output: '1\tcontent',
        is_error: false,
      },
      darkColors,
      undefined,
      undefined,
      '/tmp/proj-a',
    );

    const out = strip(component.render(100).join('\n'));
    expect(out).toContain('Used Read (apps/cli/src/main.ts)');
    expect(out).not.toContain('/tmp/proj-a/apps');
    expect(component.getReadSnapshot().filePath).toBe('apps/cli/src/main.ts');
  });

  it('keeps Read paths outside the active workspace absolute', () => {
    const component = new ToolCallComponent(
      {
        id: 'call_external_read',
        name: 'Read',
        args: { path: '/tmp/proj-ab/src/main.ts' },
      },
      undefined,
      darkColors,
      undefined,
      undefined,
      '/tmp/proj-a',
    );

    const out = strip(component.render(100).join('\n'));
    expect(out).toContain('Using Read (/tmp/proj-ab/src/main.ts)');
    expect(component.getReadSnapshot().filePath).toBe('/tmp/proj-ab/src/main.ts');
  });

  it('does not append a chip while a tool is still running', () => {
    const component = new ToolCallComponent(
      {
        id: 'call_pending',
        name: 'Read',
        args: { path: 'foo.ts' },
      },
      undefined,
      darkColors,
    );

    const out = strip(component.render(100).join('\n'));
    expect(out).toContain('Using Read');
    expect(out).not.toContain('lines');
  });

  it('renders a single foreground subagent without the generic Agent tool header', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const component = new ToolCallComponent(
      {
        id: 'call_agent',
        name: 'Agent',
        args: { description: 'explore project xxx' },
      },
      undefined,
      darkColors,
    );

    component.onSubagentSpawned({
      agentId: 'sub_explore_123456',
      agentName: 'explore',
      runInBackground: false,
    });

    let out = strip(component.render(120).join('\n'));
    expect(out).toContain('Explore Agent Starting (explore project xxx) · 0 tools · 0s');
    expect(out).not.toContain('Using Agent');
    expect(out).not.toContain('Used Agent');

    vi.setSystemTime(20_000);
    component.appendSubagentText('think1\nthink2\nthink3', 'thinking');
    component.appendSubagentText('answer1\nanswer2\nanswer3', 'text');
    component.appendSubToolCall({
      id: 'sub_explore_123456:read',
      name: 'Read',
      args: { path: 'apps/cli/src/tui/utils/background-agent-status.ts' },
    });

    out = strip(component.render(120).join('\n'));
    expect(out).toContain('Explore Agent Running (explore project xxx) · 1 tool · 10s');
    expect(out).toContain('Using Read (apps/cli/src/tui/utils/background-agent-status.ts)');
    expect(out).not.toContain('think1');
    expect(out).not.toContain('think2');
    expect(out).toContain('think3');
    expect(out).toContain('◌ think3');
    expect(out).not.toContain('answer1');
    expect(out).not.toContain('answer2');
    expect(out).toContain('answer3');
    expect(out).toContain('└ answer3');

    vi.setSystemTime(22_000);
    component.onSubagentCompleted({ resultSummary: 'summary fallback' });
    component.setResult({
      tool_call_id: 'call_agent',
      output: 'parent duplicate result',
      is_error: false,
    });
    vi.setSystemTime(30_000);

    out = strip(component.render(120).join('\n'));
    expect(out).toContain('Explore Agent Completed (explore project xxx) · 1 tool · 12s');
    expect(out).not.toContain('think3');
    expect(out).toContain('└ answer3');
    expect(out).not.toContain('Used Agent');
    expect(out).not.toContain('parent duplicate result');
    expect(out).not.toContain('summary fallback');
  });

  it('keeps the single subagent tool area to the latest four activities', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const component = new ToolCallComponent(
      {
        id: 'call_agent_tools',
        name: 'Agent',
        args: { description: 'inspect tools' },
      },
      undefined,
      darkColors,
    );
    component.onSubagentSpawned({
      agentId: 'sub_tools',
      agentName: 'explore',
      runInBackground: false,
    });

    for (let i = 1; i <= 4; i++) {
      const id = `sub_tools:read-${String(i)}`;
      component.appendSubToolCall({ id, name: 'Read', args: { path: `file${String(i)}.ts` } });
      component.finishSubToolCall({ tool_call_id: id, output: 'ok', is_error: false });
    }
    component.appendSubToolCall({
      id: 'sub_tools:grep',
      name: 'Grep',
      args: { pattern: 'auth' },
    });

    const out = strip(component.render(120).join('\n'));
    expect(out).toContain('Explore Agent Running (inspect tools) · 5 tools · 0s');
    expect(out).not.toContain('file1.ts');
    expect(out).toContain('Used Read (file2.ts)');
    expect(out).toContain('Used Read (file3.ts)');
    expect(out).toContain('Used Read (file4.ts)');
    expect(out).not.toContain('… Using Grep (auth)');
    expect(out).toContain('• Using Grep (auth)');
    expect(out).toContain('Using Grep (auth)');
  });

  it('keeps the single subagent tool window stable when older tools update', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const component = new ToolCallComponent(
      {
        id: 'call_agent_stable_tools',
        name: 'Agent',
        args: { description: 'inspect tools' },
      },
      undefined,
      darkColors,
    );
    component.onSubagentSpawned({
      agentId: 'sub_tools',
      agentName: 'explore',
      runInBackground: false,
    });

    for (let i = 1; i <= 5; i++) {
      component.appendSubToolCall({
        id: `sub_tools:read-${String(i)}`,
        name: 'Read',
        args: { path: `file${String(i)}.ts` },
      });
    }
    component.appendSubToolCallDelta({
      id: 'sub_tools:read-1',
      name: 'Read',
      argumentsPart: '{"path":"file1-updated.ts"}',
    });
    component.finishSubToolCall({
      tool_call_id: 'sub_tools:read-1',
      output: 'ok',
      is_error: false,
    });

    const out = strip(component.render(120).join('\n'));
    expect(out).not.toContain('file1-updated.ts');
    expect(out).toContain('Using Read (file2.ts)');
    expect(out).toContain('Using Read (file3.ts)');
    expect(out).toContain('Using Read (file4.ts)');
    expect(out).toContain('Using Read (file5.ts)');
  });

  it('wraps single subagent thinking and output with hanging indentation', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const component = new ToolCallComponent(
      {
        id: 'call_agent_wrapped_text',
        name: 'Agent',
        args: { description: 'inspect wrapping' },
      },
      undefined,
      darkColors,
    );
    component.onSubagentSpawned({
      agentId: 'sub_wrapped',
      agentName: 'explore',
      runInBackground: false,
    });
    component.appendSubagentText(
      'thinking words that should wrap with a clean hanging indent',
      'thinking',
    );
    component.appendSubagentText(
      'output words that should also wrap with a clean hanging indent',
      'text',
    );

    const lines = strip(component.render(34).join('\n')).split('\n');
    expect(lines).toContain('  ◌ thinking words that should    ');
    expect(lines).toContain('    wrap with a clean hanging     ');
    expect(lines).toContain('    indent                        ');
    expect(lines).toContain('  └ output words that should also ');
    expect(lines).toContain('    wrap with a clean hanging     ');
  });

  it('renders failed single subagents with the dedicated header and error text', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const component = new ToolCallComponent(
      {
        id: 'call_agent_failed',
        name: 'Agent',
        args: { description: 'check failure' },
      },
      undefined,
      darkColors,
    );
    component.onSubagentSpawned({
      agentId: 'sub_failed',
      agentName: 'explore',
      runInBackground: false,
    });

    vi.setSystemTime(4000);
    component.onSubagentFailed({ error: 'subagent exceeded max_steps' });

    const out = strip(component.render(120).join('\n'));
    expect(out).toContain('Explore Agent Failed (check failure) · 0 tools · 3s');
    expect(out).toContain('└ subagent exceeded max_steps');
    expect(out).not.toContain('Using Agent');
    expect(out).not.toContain('Used Agent');
  });

  it('shows /agent to inspect hint for running subagents (AC8)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const component = new ToolCallComponent(
      {
        id: 'call_hint',
        name: 'Agent',
        args: { description: 'test hint' },
      },
      undefined,
      darkColors,
    );

    // Spawning phase — hint should appear
    component.onSubagentSpawned({
      agentId: 'sub_hint',
      agentName: 'explore',
      runInBackground: false,
    });
    let out = strip(component.render(120).join('\n'));
    expect(out).toContain('/agent to inspect');

    // Running phase — hint should still appear
    component.appendSubagentText('working...', 'text');
    component.appendSubToolCall({
      id: 'sub_hint:read',
      name: 'Read',
      args: { path: 'src/foo.ts' },
    });
    out = strip(component.render(120).join('\n'));
    expect(out).toContain('/agent to inspect');

    // Completed phase — hint should be gone
    component.onSubagentCompleted({ resultSummary: 'Done' });
    out = strip(component.render(120).join('\n'));
    expect(out).not.toContain('/agent to inspect');
  });

  it('hides /agent to inspect hint for failed subagents (AC8)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const component = new ToolCallComponent(
      {
        id: 'call_hint_fail',
        name: 'Agent',
        args: { description: 'test hint fail' },
      },
      undefined,
      darkColors,
    );
    component.onSubagentSpawned({
      agentId: 'sub_hint_fail',
      agentName: 'explore',
      runInBackground: false,
    });
    component.onSubagentFailed({ error: 'error' });
    const out = strip(component.render(120).join('\n'));
    expect(out).not.toContain('/agent to inspect');
  });

  it('scrolls the Write streaming preview to the last COMMAND_PREVIEW_LINES', () => {
    const lines: string[] = [];
    for (let i = 1; i <= 30; i++) lines.push(`line${String(i)}`);
    const escaped = lines.join('\\n');
    const component = new ToolCallComponent(
      {
        id: 'call_write_stream',
        name: 'Write',
        args: { file_path: 'foo.ts', content: lines.join('\n') },
        streamingArguments: `{"file_path":"foo.ts","content":"${escaped}`,
      },
      undefined,
      darkColors,
    );

    const out = strip(component.render(100).join('\n'));
    expect(out).toContain('Using Write');
    // Streaming preview caps at COMMAND_PREVIEW_LINES (10) and shows the tail.
    expect(out).not.toContain('line1');
    expect(out).not.toContain('line20');
    expect(out).toContain('line21');
    expect(out).toContain('line30');
    // Line numbers should reflect actual file positions.
    expect(out).toContain('  21');
    expect(out).toContain('  30');
    expect(out).not.toContain('ctrl+o to expand');
  });

  it('switches a streaming tool call to Truncated when the step ended with max_tokens', () => {
    const lines: string[] = [];
    for (let i = 1; i <= 10; i++) lines.push(`line${String(i)}`);
    const escaped = lines.join('\\n');
    const component = new ToolCallComponent(
      {
        id: 'call_write_truncated',
        name: 'Write',
        args: { file_path: 'foo.ts', content: lines.join('\n') },
        streamingArguments: `{"file_path":"foo.ts","content":"${escaped}`,
        truncated: true,
      },
      undefined,
      darkColors,
    );

    const out = strip(component.render(100).join('\n'));
    expect(out).toContain('Truncated Write');
    expect(out).not.toContain('Preparing Write');
    expect(out).toContain('Tool call arguments truncated by max_tokens');
    // The live argument preview must NOT render once the call is
    // truncated — leaving the half-streamed Write content on screen
    // was the original "preparing write" bug.
    expect(out).not.toContain('line1');
    expect(out).not.toContain('line10');
  });

  it('renders a stable Edit progress placeholder during the streaming delta window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(4000);
    const oldLines: string[] = [];
    const newLines: string[] = [];
    for (let i = 1; i <= 20; i++) {
      oldLines.push(`old${String(i)}`);
      newLines.push(`new${String(i)}`);
    }
    const oldEscaped = oldLines.join('\\n');
    const newEscaped = newLines.join('\\n');
    const streaming = `{"file_path":"foo.ts","old_string":"${oldEscaped}","new_string":"${newEscaped}`;
    const component = new ToolCallComponent(
      {
        id: 'call_edit_stream',
        name: 'Edit',
        args: {
          file_path: 'foo.ts',
          old_string: oldLines.join('\n'),
          new_string: newLines.join('\n'),
        },
        streamingArguments: streaming,
        streamingStartedAtMs: 0,
      },
      undefined,
      darkColors,
    );

    const out = strip(component.render(100).join('\n'));
    expect(out).toContain('Using Edit');
    expect(out).toContain('foo.ts');
    expect(out).toContain('Preparing changes for foo.ts...');
    expect(out).toContain('4s elapsed');
    expect(out).toMatch(/\d+(?:\.\d+)? (?:B|KB|MB)/);
    expect(out).not.toContain('old20');
    expect(out).not.toContain('new20');
    expect(out).not.toMatch(/^\s*\d+\s+[+-]\s/m);
    expect(out).not.toContain('ctrl+o to expand');
  });

  it('caps the Write preview between finalized args and result to keep transcript height stable', () => {
    // The wire sequence is: tool.call.delta → ... → tool.call (final
    // args, no streamingArguments) → tool.result. Between tool.call and
    // tool.result we briefly sit with finalized args and no result yet —
    // even without an approval panel, at least one render tick can land
    // in this state. The preview must stay capped so the transcript
    // height does not balloon and then snap back when the result lands;
    // a big shrink triggers pi-tui's full-redraw path which wipes the
    // terminal scrollback (history before TUI start).
    const lines: string[] = [];
    for (let i = 1; i <= 30; i++) lines.push(`line${String(i)}`);
    const component = new ToolCallComponent(
      {
        id: 'call_write_pending',
        name: 'Write',
        args: { file_path: 'foo.ts', content: lines.join('\n') },
        // No streamingArguments → finalized args; no result yet.
      },
      undefined,
      darkColors,
    );
    const out = strip(component.render(100).join('\n'));
    expect(out).toContain('line1');
    expect(out).toContain('line10');
    expect(out).not.toContain('line11');
    expect(out).not.toContain('line25');
    expect(out).toContain('ctrl+o to expand');
  });

  it('snaps a long Write preview to the collapsed cap when the result arrives', () => {
    const lines: string[] = [];
    for (let i = 1; i <= 30; i++) lines.push(`line${String(i)}`);
    const escaped = lines.join('\\n');
    const component = new ToolCallComponent(
      {
        id: 'call_write_snap',
        name: 'Write',
        args: { file_path: 'big.txt', content: lines.join('\n') },
        streamingArguments: `{"file_path":"big.txt","content":"${escaped}"}`,
      },
      undefined,
      darkColors,
    );
    expect(strip(component.render(100).join('\n'))).toContain('line25');

    component.setResult({
      tool_call_id: 'call_write_snap',
      output: 'Wrote big.txt',
      is_error: false,
    });

    const after = strip(component.render(100).join('\n'));
    expect(after).toContain('line1');
    expect(after).not.toContain('line25');
    expect(after).toContain('ctrl+o to expand');
  });

  it('refreshes the header when file_path arrives in a later streaming delta', () => {
    // First delta: only an opening brace, no file_path yet.
    const component = new ToolCallComponent(
      {
        id: 'call_write_path',
        name: 'Write',
        args: {},
        streamingArguments: '{',
      },
      undefined,
      darkColors,
    );
    const before = strip(component.render(100).join('\n'));
    expect(before).toContain('Using Write');
    expect(before).not.toContain('foo.ts');

    // Later delta: file_path is now parseable from streamingArguments.
    component.updateToolCall({
      id: 'call_write_path',
      name: 'Write',
      args: { file_path: 'foo.ts' },
      streamingArguments: '{"file_path":"foo.ts","content":"hello',
    });
    const after = strip(component.render(100).join('\n'));
    expect(after).toContain('foo.ts');
  });

  it('builds the call preview when finalized args arrive after streaming', () => {
    // Mimic the wire sequence: tool.call.delta → ... → tool.call (finalized).
    const component = new ToolCallComponent(
      {
        id: 'call_write_seq',
        name: 'Write',
        args: { file_path: 'foo.ts', content: 'a\nb' },
        streamingArguments: '{"file_path":"foo.ts","content":"a\\nb',
      },
      undefined,
      darkColors,
    );
    // While streaming, body is rendered live from streamingArguments.
    expect(strip(component.render(100).join('\n'))).toMatch(/^\s*1\s+a\s*$/m);

    // Finalized tool.call: streamingArguments is undefined; the body
    // re-renders from finalized args, content unchanged.
    component.updateToolCall({
      id: 'call_write_seq',
      name: 'Write',
      args: { file_path: 'foo.ts', content: 'a\nb' },
    });
    const out = strip(component.render(100).join('\n'));
    expect(out).toMatch(/^\s*1\s+a\s*$/m);
    expect(out).toMatch(/^\s*2\s+b\s*$/m);
  });

  it('builds the Edit diff when finalized args arrive after streaming', () => {
    const component = new ToolCallComponent(
      {
        id: 'call_edit_seq',
        name: 'Edit',
        args: { file_path: 'foo.ts' },
        streamingArguments: '{"file_path":"foo.ts","old_string":"a\\nb","new_string":"a\\nB',
        streamingStartedAtMs: Date.now(),
      },
      undefined,
      darkColors,
    );
    expect(strip(component.render(100).join('\n'))).toContain('Preparing changes');
    expect(strip(component.render(100).join('\n'))).not.toMatch(/^\s*\d+\s+[+-]\s/m);

    component.updateToolCall({
      id: 'call_edit_seq',
      name: 'Edit',
      args: { file_path: 'foo.ts', old_string: 'a\nb', new_string: 'a\nB' },
    });
    const out = strip(component.render(100).join('\n'));
    expect(out).toContain('foo.ts');
    expect(out).toMatch(/^\s*2\s+- b\s*$/m);
    expect(out).toMatch(/^\s*2\s+\+ B\s*$/m);
  });

  it('refreshes and stops the Edit streaming progress timer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const ui = { requestRender: vi.fn() };
    const component = new ToolCallComponent(
      {
        id: 'call_edit_timer',
        name: 'Edit',
        args: { file_path: 'foo.ts' },
        streamingArguments: '{"file_path":"foo.ts","old_string":"a',
        streamingStartedAtMs: 0,
      },
      undefined,
      darkColors,
      ui as never,
    );

    expect(strip(component.render(100).join('\n'))).toContain('0s elapsed');
    vi.advanceTimersByTime(1000);
    expect(ui.requestRender).toHaveBeenCalled();
    expect(strip(component.render(100).join('\n'))).toContain('1s elapsed');

    ui.requestRender.mockClear();
    component.setResult({
      tool_call_id: 'call_edit_timer',
      output: 'Replaced 1 occurrence in foo.ts',
      is_error: false,
    });
    vi.advanceTimersByTime(1000);
    expect(ui.requestRender).not.toHaveBeenCalled();

    const componentToDispose = new ToolCallComponent(
      {
        id: 'call_edit_dispose',
        name: 'Edit',
        args: { file_path: 'bar.ts' },
        streamingArguments: '{"file_path":"bar.ts","old_string":"a',
        streamingStartedAtMs: 0,
      },
      undefined,
      darkColors,
      ui as never,
    );
    ui.requestRender.mockClear();
    componentToDispose.dispose();
    vi.advanceTimersByTime(1000);
    expect(ui.requestRender).not.toHaveBeenCalled();
  });

  it('expands the Write call preview when ctrl+o expansion is set', () => {
    const lines: string[] = [];
    for (let i = 1; i <= 30; i++) lines.push(`line${String(i)}`);
    const component = new ToolCallComponent(
      {
        id: 'call_write_done',
        name: 'Write',
        args: { file_path: 'big.txt', content: lines.join('\n') },
      },
      {
        tool_call_id: 'call_write_done',
        output: 'Wrote big.txt',
        is_error: false,
      },
      darkColors,
    );

    const collapsed = strip(component.render(100).join('\n'));
    expect(collapsed).toContain('line1');
    expect(collapsed).toContain('line10');
    expect(collapsed).not.toContain('line25');
    expect(collapsed).toContain('ctrl+o to expand');

    component.setExpanded(true);

    const expanded = strip(component.render(100).join('\n'));
    expect(expanded).toContain('line25');
    expect(expanded).toContain('line30');
    expect(expanded).not.toContain('ctrl+o to expand');
  });

  it('shows Rejected in the header when blockedReason is rejected', () => {
    const component = new ToolCallComponent(
      {
        id: 'call_bash_rejected',
        name: 'Bash',
        args: { command: 'rm -rf /' },
      },
      {
        tool_call_id: 'call_bash_rejected',
        output: 'Tool "Bash" was not run because the user rejected the tool call.',
        is_error: true,
        blockedReason: 'rejected',
      },
      darkColors,
    );

    const out = strip(component.render(100).join('\n'));
    expect(out).toContain('Rejected Bash');
    expect(out).not.toContain('Used Bash');
    // Body should be suppressed.
    expect(out).not.toContain('was not run');
  });

  it('shows Cancelled in the header when blockedReason is cancelled', () => {
    const component = new ToolCallComponent(
      {
        id: 'call_bash_cancelled',
        name: 'Bash',
        args: { command: 'rm -rf /' },
      },
      {
        tool_call_id: 'call_bash_cancelled',
        output: 'Tool "Bash" was not run because the operation was cancelled.',
        is_error: true,
        blockedReason: 'cancelled',
      },
      darkColors,
    );

    const out = strip(component.render(100).join('\n'));
    expect(out).toContain('Cancelled Bash');
    expect(out).not.toContain('Used Bash');
    expect(out).not.toContain('was not run');
  });

  it('still says Used when blockedReason is undefined even if is_error is true', () => {
    const component = new ToolCallComponent(
      {
        id: 'call_bash_error',
        name: 'Bash',
        args: { command: 'false' },
      },
      {
        tool_call_id: 'call_bash_error',
        output: 'command exited with code 1',
        is_error: true,
      },
      darkColors,
    );

    const out = strip(component.render(100).join('\n'));
    expect(out).toContain('Used Bash');
    expect(out).toContain('command exited with code 1');
  });

  it('renders unknown Write file extensions as plain text without stderr noise', () => {
    const stderr = captureProcessWrite('stderr');
    try {
      const component = new ToolCallComponent(
        {
          id: 'call_write_unknown_ext',
          name: 'Write',
          args: { file_path: 'demo.abcxyz', content: 'hello\nworld' },
        },
        {
          tool_call_id: 'call_write_unknown_ext',
          output: 'Wrote demo.abcxyz',
          is_error: false,
        },
        darkColors,
      );

      const collapsed = strip(component.render(100).join('\n'));
      expect(collapsed).toContain('hello');

      component.setExpanded(true);
      const expanded = strip(component.render(100).join('\n'));
      expect(expanded).toContain('world');
      expect(stderr.text()).not.toContain('Could not find the language');
    } finally {
      stderr.restore();
    }
  });
});

describe('formatSubagentTokens', () => {
  it('appends cache hit-rate suffix when inputCacheRead > 0', () => {
    // scenario 1: 87% with k-suffix
    const result = formatSubagentTokens({
      inputOther: 1300,
      inputCacheRead: 8700,
      inputCacheCreation: 0,
      output: 5000,
    });
    expect(result).toBe('15.0k tok (87%)');
  });

  it('omits cache suffix when inputCacheRead is 0', () => {
    // scenario 2: hit rate = 0, no suffix
    const result = formatSubagentTokens({
      inputOther: 10000,
      inputCacheRead: 0,
      inputCacheCreation: 0,
      output: 5000,
    });
    expect(result).toBe('15.0k tok');
  });

  it('omits cache suffix when all input breakdown fields are 0', () => {
    // scenario 3: denominator = 0, computeCacheHitRate → undefined, no suffix
    const result = formatSubagentTokens({
      inputOther: 0,
      inputCacheRead: 0,
      inputCacheCreation: 0,
      output: 5000,
    });
    expect(result).toBe('5.0k tok');
  });

  it('returns undefined for undefined input', () => {
    // scenario 4
    expect(formatSubagentTokens(undefined)).toBeUndefined();
  });

  it('returns undefined when total tokens is 0', () => {
    // scenario 5: all fields 0
    const result = formatSubagentTokens({
      inputOther: 0,
      inputCacheRead: 0,
      inputCacheCreation: 0,
      output: 0,
    });
    expect(result).toBeUndefined();
  });

  it('formats percentage without decimals', () => {
    // scenario 6: 88% exactly, no decimal
    const result = formatSubagentTokens({
      inputOther: 1200,
      inputCacheRead: 8800,
      inputCacheCreation: 0,
      output: 5000,
    });
    expect(result).toBe('15.0k tok (88%)');
  });

  it('uses banker rounding for exact .5 ties', () => {
    // scenario 7: 87.5 → 88 (round-half-to-even: 87 is odd, round up)
    const result = formatSubagentTokens({
      inputOther: 1250,
      inputCacheRead: 8750,
      inputCacheCreation: 0,
      output: 5000,
    });
    expect(result).toBe('15.0k tok (88%)');
  });

  it('formats small token counts without k-suffix', () => {
    // scenario 8: total < 1000, no k-suffix; 10/17 ≈ 59%
    const result = formatSubagentTokens({
      inputOther: 5,
      inputCacheRead: 10,
      inputCacheCreation: 2,
      output: 3,
    });
    expect(result).toBe('20 tok (59%)');
  });

  it('computes hit rate with inputCacheCreation in denominator', () => {
    // scenario 9: 5000 / (1000+5000+4000) = 50%
    const result = formatSubagentTokens({
      inputOther: 1000,
      inputCacheRead: 5000,
      inputCacheCreation: 4000,
      output: 5000,
    });
    expect(result).toBe('15.0k tok (50%)');
  });

  it('skips cache suffix when legacy input field is present without breakdown', () => {
    // scenario 10: legacy input, no breakdown fields — no suffix
    const result = formatSubagentTokens({
      input: 10000,
      output: 5000,
    });
    expect(result).toBe('15.0k tok');
  });

  it('skips cache suffix when legacy input is present even with breakdown fields', () => {
    // scenario 11: legacy input present, skip cache computation entirely
    const result = formatSubagentTokens({
      input: 10000,
      inputOther: 1300,
      inputCacheRead: 8700,
      inputCacheCreation: 0,
      output: 5000,
    });
    expect(result).toBe('15.0k tok');
  });

  it('rounds up to 100% when close to full cache read', () => {
    // scenario 14: 24900/25000 = 99.6% → rounds to 100%
    const result = formatSubagentTokens({
      inputOther: 100,
      inputCacheRead: 24900,
      inputCacheCreation: 0,
      output: 5000,
    });
    expect(result).toBe('30.0k tok (100%)');
  });

  it('hides suffix for tiny hit rates that round to 0%', () => {
    // scenario 15: 50/10000 = 0.5% → banker's rounding → 0% → hidden
    const result = formatSubagentTokens({
      inputOther: 9950,
      inputCacheRead: 50,
      inputCacheCreation: 0,
      output: 5000,
    });
    expect(result).toBe('15.0k tok');
  });
});

describe('ToolCallComponent snapshot listeners', () => {
  it('supports multiple concurrent listeners via addSnapshotListener', () => {
    const component = new ToolCallComponent(
      { id: 'call_a', name: 'Read', args: { path: 'a.ts' } },
      undefined,
      darkColors,
    );

    const calls: string[] = [];
    const unsubscribeA = component.addSnapshotListener(() => {
      calls.push('A');
    });
    const unsubscribeB = component.addSnapshotListener(() => {
      calls.push('B');
    });

    // Both listeners should have been called immediately on registration.
    expect(calls).toEqual(['A', 'B']);

    calls.length = 0;
    component['notifySnapshotChange']();
    expect(calls).toEqual(['A', 'B']);

    unsubscribeA();
    calls.length = 0;
    component['notifySnapshotChange']();
    expect(calls).toEqual(['B']);

    unsubscribeB();
    calls.length = 0;
    component['notifySnapshotChange']();
    expect(calls).toEqual([]);
  });

  it('setSnapshotListener clears existing listeners for backward compatibility', () => {
    const component = new ToolCallComponent(
      { id: 'call_b', name: 'Read', args: { path: 'b.ts' } },
      undefined,
      darkColors,
    );

    const calls: string[] = [];
    const unsubscribe = component.addSnapshotListener(() => {
      calls.push('added');
    });

    calls.length = 0;
    component.setSnapshotListener(() => {
      calls.push('set');
    });

    // The previous listener should have been replaced.
    expect(calls).toEqual(['set']);

    calls.length = 0;
    component['notifySnapshotChange']();
    expect(calls).toEqual(['set']);

    unsubscribe(); // no-op, already cleared
  });
});
