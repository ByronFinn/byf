import { CURSOR_MARKER } from '@earendil-works/pi-tui';
import { describe, expect, it, vi } from 'vitest';

import {
  ApprovalPanelComponent,
  resolveSection,
} from '#/tui/components/dialogs/approval-panel';
import type { PendingApproval } from '#/tui/reverse-rpc/types';
import { getColorPalette } from '#/tui/theme/colors';

import { captureProcessWrite } from '../../../helpers/process';

const COLORS = getColorPalette('dark');

function strip(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

function makePending(): PendingApproval {
  return {
    data: {
      id: 'approval_1',
      tool_call_id: 'tool_1',
      tool_name: 'WriteFile',
      action: 'write a file',
      description: 'Update README.md',
      display: [],
      choices: [
        { label: 'Approve once', response: 'approved' },
        { label: 'Approve for this session', response: 'approved_for_session' },
        { label: 'Reject', response: 'rejected' },
        { label: 'Reject with feedback', response: 'rejected', requires_feedback: true },
      ],
    },
  };
}

function makeDialog(): {
  dialog: ApprovalPanelComponent;
  responses: Array<{
    response: string;
    feedback?: string | undefined;
    selected_label?: string | undefined;
  }>;
} {
  const responses: Array<{
    response: string;
    feedback?: string | undefined;
    selected_label?: string | undefined;
  }> = [];
  const dialog = new ApprovalPanelComponent(
    makePending(),
    (response) => responses.push(response),
    COLORS,
  );
  return { dialog, responses };
}

// ── resolveSection ─────────────────────────────────────────────────────

describe('resolveSection', () => {
  it('converts a diff block into a section with +/- counts and formatted lines', () => {
    const section = resolveSection(
      {
        type: 'diff',
        path: 'src/foo.ts',
        old_text: 'a\nb\nc',
        new_text: 'a\nx\nc',
      },
      COLORS,
    );
    expect(section.header).toContain('src/foo.ts');
    const added = section.lines.filter((l) => strip(l).includes('+'));
    const deleted = section.lines.filter((l) => strip(l).includes('-'));
    expect(added.length).toBeGreaterThan(0);
    expect(deleted.length).toBeGreaterThan(0);
    // Header should include counts like "+1 -1"
    expect(section.header).toContain('+1');
    expect(section.header).toContain('-1');
  });

  it('converts a file_content block into a section with path and highlighted lines', () => {
    const section = resolveSection(
      {
        type: 'file_content',
        path: 'src/bar.ts',
        content: 'const x = 1;\nconst y = 2;',
      },
      COLORS,
    );
    expect(section.header).toBe('src/bar.ts');
    expect(section.lines.length).toBe(2);
    // Lines should contain line numbers in gutter
    const plain = section.lines.map(strip);
    expect(plain[0]).toContain('1');
    expect(plain[1]).toContain('2');
  });

  it('returns [no changes] for empty diff (both sides empty)', () => {
    const section = resolveSection(
      {
        type: 'diff',
        path: 'src/same.ts',
        old_text: '',
        new_text: '',
      },
      COLORS,
    );
    const plain = section.lines.map(strip);
    expect(plain.some((l) => l.includes('[no changes]'))).toBe(true);
  });

  it('returns context lines for identical non-empty diff', () => {
    const section = resolveSection(
      {
        type: 'diff',
        path: 'src/same.ts',
        old_text: 'hello',
        new_text: 'hello',
      },
      COLORS,
    );
    expect(section.lines.length).toBe(1);
    const plain = strip(section.lines[0]!);
    expect(plain).toContain('hello');
  });
});

// ── ApprovalPanelComponent ─────────────────────────────────────────────

describe('ApprovalPanelComponent', () => {
  it('renders only numeric approval shortcuts in the hint', () => {
    const { dialog } = makeDialog();
    const out = strip(dialog.render(80).join('\n'));
    expect(out).toContain('1/2/3/4 choose');
    expect(out).not.toContain('y/a/n/f');
  });

  it('renders dangerous shell warnings with simple copy and no icon', () => {
    const pending: PendingApproval = {
      data: {
        id: 'approval_danger',
        tool_call_id: 'tool_danger',
        tool_name: 'Bash',
        action: 'run',
        description: '',
        display: [
          {
            type: 'shell',
            language: 'bash',
            command: 'rm -rf /tmp/cache',
            danger: 'recursive delete',
          },
        ],
        choices: [{ label: 'Approve once', response: 'approved' }],
      },
    };
    const dialog = new ApprovalPanelComponent(pending, () => {}, COLORS);

    const out = strip(dialog.render(80).join('\n'));
    expect(out).toContain('Dangerous: recursive delete');
    expect(out).not.toContain('potentially destructive');
    expect(out).not.toContain('⚠');
  });

  it('numeric shortcuts still drive approval actions', () => {
    const { dialog, responses } = makeDialog();
    dialog.handleInput('2');
    expect(responses).toEqual([{ response: 'approved_for_session', feedback: undefined }]);
  });

  it('shortcut 4 enters feedback mode and submits the typed feedback', () => {
    const { dialog, responses } = makeDialog();
    dialog.handleInput('4');
    dialog.handleInput('n');
    dialog.handleInput('o');
    dialog.handleInput('\r');
    expect(responses).toEqual([{ response: 'rejected', feedback: 'no' }]);
  });

  it('renders feedback input inline with the selected choice', () => {
    const { dialog } = makeDialog();
    dialog.handleInput('4');

    const out = strip(dialog.render(80).join('\n'));
    expect(out).toContain('▶ 4. Reject with feedback');
    expect(out).not.toContain('\n  > ');
  });

  it('legacy y/a/n/f shortcuts no longer trigger approval actions', () => {
    for (const key of ['y', 'a', 'n', 'f']) {
      const { dialog, responses } = makeDialog();
      dialog.handleInput(key);
      expect(responses).toEqual([]);
    }
  });

  it('feedback input supports left/right cursor editing', () => {
    const { dialog, responses } = makeDialog();
    dialog.handleInput('4');
    dialog.handleInput('n');
    dialog.handleInput('o');
    dialog.handleInput('\u001B[D');
    dialog.handleInput('!');
    dialog.handleInput('\r');
    expect(responses).toEqual([{ response: 'rejected', feedback: 'n!o' }]);
  });

  it('feedback input keeps editor shortcuts like ctrl+b / ctrl+f', () => {
    const { dialog, responses } = makeDialog();
    dialog.handleInput('4');
    dialog.handleInput('a');
    dialog.handleInput('b');
    dialog.handleInput('c');
    dialog.handleInput('\u0002');
    dialog.handleInput('\u0002');
    dialog.handleInput('X');
    dialog.handleInput('\u0006');
    dialog.handleInput('Y');
    dialog.handleInput('\r');
    expect(responses).toEqual([{ response: 'rejected', feedback: 'aXbYc' }]);
  });

  it('renders an IME cursor marker while editing feedback', () => {
    const { dialog } = makeDialog();
    dialog.focused = true;
    dialog.handleInput('4');

    const out = dialog.render(80).join('\n');
    expect(out).toContain(CURSOR_MARKER);
  });

  it.each(['\u0003', '\u0004', '\u001B'])(
    'shortcut %j rejects approval immediately',
    (key) => {
      const { dialog, responses } = makeDialog();
      dialog.handleInput(key);
      expect(responses).toEqual([{ response: 'rejected' }]);
    },
  );

  it('renders generic approval with custom choices', () => {
    const pending: PendingApproval = {
      data: {
        id: 'approval_plan',
        tool_call_id: 'tool_plan',
        tool_name: 'CustomTool',
        action: 'review plan',
        description: '',
        display: [],
        choices: [
          { label: 'Approve', response: 'approved' },
          { label: 'Reject', response: 'rejected' },
          { label: 'Revise', response: 'rejected', requires_feedback: true },
        ],
      },
    };
    const dialog = new ApprovalPanelComponent(pending, () => {}, COLORS);

    const out = strip(dialog.render(80).join('\n'));
    expect(out).toContain('Approve CustomTool?');
    expect(out).toContain('Approve');
    expect(out).toContain('Reject');
    expect(out).toContain('Revise');
    expect(out).not.toContain('Approve for this session');
    expect(out).not.toContain('Investigate');
  });

  it('renders an Edit diff truncated at 10 lines with ctrl+e view hint', () => {
    const responses: Array<{ response: string }> = [];
    const oldLines: string[] = [];
    const newLines: string[] = [];
    for (let i = 1; i <= 30; i++) {
      oldLines.push(`old${String(i)}`);
      newLines.push(`new${String(i)}`);
    }
    const pending: PendingApproval = {
      data: {
        id: 'approval_diff',
        tool_call_id: 'tool_diff',
        tool_name: 'Edit',
        action: 'edit',
        description: '',
        display: [
          {
            type: 'diff',
            path: 'src/foo.ts',
            old_text: oldLines.join('\n'),
            new_text: newLines.join('\n'),
          },
        ],
        choices: [{ label: 'Approve once', response: 'approved' }],
      },
    };
    let viewFullscreenCalls = 0;
    const dialog = new ApprovalPanelComponent(
      pending,
      (r) => responses.push(r),
      COLORS,
      () => {},
      undefined,
      () => viewFullscreenCalls++,
    );

    const rendered = strip(dialog.render(120).join('\n'));
    expect(rendered).toContain('+30');
    expect(rendered).toContain('-30');
    expect(rendered).toContain('ctrl+e to view');
    expect(rendered).toContain('ctrl+e view');
    expect(rendered).not.toContain('ctrl+e expand');
    expect(rendered).not.toContain('ctrl+e collapse');
    // Content is truncated — last line should not be visible
    expect(rendered).not.toContain('new30');

    // Ctrl+E triggers the fullscreen callback instead of toggling inline
    dialog.handleInput('\u0005'); // Ctrl+E
    expect(viewFullscreenCalls).toBe(1);

    // After callback, panel still renders truncated (no inline expand)
    const after = strip(dialog.render(120).join('\n'));
    expect(after).not.toContain('new30');
    expect(after).toContain('ctrl+e view');
    expect(responses).toEqual([]);
  });

  it('ctrl+e is no-op when onViewFullscreen is not provided', () => {
    const pending: PendingApproval = {
      data: {
        id: 'approval_no_expand',
        tool_call_id: 'tool_ne',
        tool_name: 'Edit',
        action: 'edit',
        description: '',
        display: [
          {
            type: 'diff',
            path: 'src/foo.ts',
            old_text: 'a',
            new_text: 'b',
          },
        ],
        choices: [{ label: 'Approve once', response: 'approved' }],
      },
    };
    const dialog = new ApprovalPanelComponent(pending, () => {}, COLORS);
    // Should not throw — the ?.() makes it a no-op
    dialog.handleInput('\u0005'); // Ctrl+E
    const after = strip(dialog.render(120).join('\n'));
    // Still shows truncated, no change
    expect(after).toContain('ctrl+e view');
  });

  it('no ctrl+e hint when there are no expandable blocks', () => {
    const pending: PendingApproval = {
      data: {
        id: 'approval_no_expand_hint',
        tool_call_id: 'tool_neh',
        tool_name: 'Bash',
        action: 'run',
        description: '',
        display: [
          {
            type: 'shell',
            language: 'bash',
            command: 'echo hi',
          },
        ],
        choices: [{ label: 'Approve once', response: 'approved' }],
      },
    };
    const dialog = new ApprovalPanelComponent(pending, () => {}, COLORS);
    const out = strip(dialog.render(80).join('\n'));
    expect(out).not.toContain('ctrl+e');
  });

  it('forwards ctrl+o to the global tool-output toggle', () => {
    const pending: PendingApproval = {
      data: {
        id: 'approval_forward',
        tool_call_id: 'tool_forward',
        tool_name: 'Edit',
        action: 'edit',
        description: '',
        display: [
          {
            type: 'diff',
            path: 'src/foo.ts',
            old_text: Array.from({ length: 30 }, (_, i) => `old${String(i + 1)}`).join('\n'),
            new_text: Array.from({ length: 30 }, (_, i) => `new${String(i + 1)}`).join('\n'),
          },
        ],
        choices: [{ label: 'Approve once', response: 'approved' }],
      },
    };
    let globalToggleCalls = 0;
    const dialog = new ApprovalPanelComponent(pending, () => {}, COLORS, () => globalToggleCalls++);

    dialog.handleInput('\u000F'); // Ctrl+O — forwarded

    const after = strip(dialog.render(120).join('\n'));
    expect(globalToggleCalls).toBe(1);
    expect(after).toContain('ctrl+e view');
    expect(after).not.toContain('new30');
  });

  it('renders Write as a syntax-highlighted code block (file_content), not a diff', () => {
    const responses: Array<{ response: string }> = [];
    const lines: string[] = [];
    for (let i = 1; i <= 30; i++) lines.push(`const x${String(i)} = ${String(i)};`);
    const pending: PendingApproval = {
      data: {
        id: 'approval_write',
        tool_call_id: 'tool_write',
        tool_name: 'Write',
        action: 'write',
        description: '',
        display: [{ type: 'file_content', path: 'src/new.ts', content: lines.join('\n') }],
        choices: [{ label: 'Approve once', response: 'approved' }],
      },
    };
    const dialog = new ApprovalPanelComponent(pending, (r) => responses.push(r), COLORS);

    const collapsed = strip(dialog.render(120).join('\n'));
    // No diff markers, no +N -M header.
    expect(collapsed).not.toMatch(/^\s*\+\d+/m);
    expect(collapsed).not.toMatch(/^\s*-\d+/m);
    expect(collapsed).toContain('src/new.ts');
    expect(collapsed).toContain('const x1 = 1;');
    expect(collapsed).toContain('const x10 = 10;');
    expect(collapsed).not.toContain('const x25 = 25;');
    // Truncation hint says "ctrl+e to view"
    expect(collapsed).toContain('20 more lines hidden (ctrl+e to view)');
    // Footer says "ctrl+e view" (not expand/collapse)
    expect(collapsed).toContain('ctrl+e view');
    expect(collapsed).not.toContain('ctrl+e expand');

    // Ctrl+E doesn't toggle inline expansion — content stays truncated
    dialog.handleInput('\u0005'); // Ctrl+E — no fullscreen callback, so no-op
    const after = strip(dialog.render(120).join('\n'));
    expect(after).not.toContain('const x30 = 30;');
    expect(after).toContain('more lines hidden');
    expect(responses).toEqual([]);
  });

  it('renders unknown file_content extensions as plain text without stderr noise', () => {
    const pending: PendingApproval = {
      data: {
        id: 'approval_unknown_write',
        tool_call_id: 'tool_unknown_write',
        tool_name: 'Write',
        action: 'write',
        description: '',
        display: [{ type: 'file_content', path: 'demo.abcxyz', content: 'hello\nworld' }],
        choices: [{ label: 'Approve once', response: 'approved' }],
      },
    };
    const stderr = captureProcessWrite('stderr');
    try {
      const dialog = new ApprovalPanelComponent(pending, () => {}, COLORS);
      const collapsed = strip(dialog.render(120).join('\n'));
      expect(collapsed).toContain('hello');
      // File is only 2 lines, fits in cap, no truncation hint needed
    } finally {
      stderr.restore();
    }
  });

  it('returns feedback for revise choice', () => {
    const responses: Array<{
      response: string;
      feedback?: string | undefined;
      selected_label?: string | undefined;
    }> = [];
    const pending: PendingApproval = {
      data: {
        id: 'approval_plan',
        tool_call_id: 'tool_plan',
        tool_name: 'CustomTool',
        action: 'review plan',
        description: '',
        display: [],
        choices: [
          { label: 'Approve', response: 'approved' },
          {
            label: 'Revise',
            response: 'rejected',
            selected_label: 'Revise',
            requires_feedback: true,
          },
        ],
      },
    };
    const dialog = new ApprovalPanelComponent(
      pending,
      (response) => responses.push(response),
      COLORS,
    );

    dialog.handleInput('2');
    dialog.handleInput('n');
    dialog.handleInput('o');
    dialog.handleInput('\r');
    expect(responses).toEqual([
      { response: 'rejected', feedback: 'no', selected_label: 'Revise' },
    ]);
  });

  it('renderDisplayBlock always caps diff at max lines regardless of expanded state', () => {
    const oldLines: string[] = [];
    const newLines: string[] = [];
    for (let i = 1; i <= 30; i++) {
      oldLines.push(`old${String(i)}`);
      newLines.push(`new${String(i)}`);
    }
    const pending: PendingApproval = {
      data: {
        id: 'approval_cap',
        tool_call_id: 'tool_cap',
        tool_name: 'Edit',
        action: 'edit',
        description: '',
        display: [
          {
            type: 'diff',
            path: 'src/foo.ts',
            old_text: oldLines.join('\n'),
            new_text: newLines.join('\n'),
          },
        ],
        choices: [{ label: 'Approve once', response: 'approved' }],
      },
    };
    const dialog = new ApprovalPanelComponent(pending, () => {}, COLORS);

    // Even after pressing Ctrl+E (no-op without callback), content stays truncated
    dialog.handleInput('\u0005');
    const out = strip(dialog.render(120).join('\n'));
    expect(out).not.toContain('new30');
  });

  it('renderDisplayBlock always caps file_content at max lines', () => {
    const lines: string[] = [];
    for (let i = 1; i <= 30; i++) lines.push(`line${String(i)}`);
    const pending: PendingApproval = {
      data: {
        id: 'approval_cap_file',
        tool_call_id: 'tool_cap_file',
        tool_name: 'Write',
        action: 'write',
        description: '',
        display: [{ type: 'file_content', path: 'src/big.ts', content: lines.join('\n') }],
        choices: [{ label: 'Approve once', response: 'approved' }],
      },
    };
    const dialog = new ApprovalPanelComponent(pending, () => {}, COLORS);

    const out = strip(dialog.render(120).join('\n'));
    expect(out).toContain('line1');
    expect(out).not.toContain('line25');
    expect(out).toContain('20 more lines hidden (ctrl+e to view)');
  });
});
