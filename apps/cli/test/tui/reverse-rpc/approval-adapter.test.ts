import { describe, expect, it } from 'vitest';

import { adaptApprovalRequest, adaptPanelResponse } from '#/tui/reverse-rpc/approval/adapter';

describe('approval adapter', () => {
  it('adapts generic command displays into shell blocks with approval choices', () => {
    const adapted = adaptApprovalRequest({
      toolCallId: 'tc-1',
      toolName: 'Bash',
      action: 'run',
      display: {
        kind: 'generic',
        summary: 'run',
        detail: {
          command: 'sudo rm -rf /tmp/cache',
          cwd: '/tmp',
        },
      },
    });

    expect(adapted).toMatchObject({
      id: 'tc-1',
      tool_call_id: 'tc-1',
      tool_name: 'Bash',
      display: [
        {
          type: 'shell',
          language: 'bash',
          command: 'sudo rm -rf /tmp/cache',
          cwd: '/tmp',
          danger: 'recursive delete',
        },
      ],
    });
    expect(adapted.choices.map((choice) => choice.label)).toEqual([
      'Approve once',
      'Approve for this session',
      'Reject',
      'Reject with feedback',
    ]);
  });

  it('emits only a diff block for Edit — no separate file_op title row', () => {
    const adapted = adaptApprovalRequest({
      toolCallId: 'tc-edit',
      toolName: 'Edit',
      action: 'edit',
      display: {
        kind: 'generic',
        summary: 'edit',
        detail: {
          file_path: 'src/foo.ts',
          old_string: 'a\nb\nc',
          new_string: 'a\nB\nc',
        },
      },
    });

    expect(adapted.display).toEqual([
      { type: 'diff', path: 'src/foo.ts', old_text: 'a\nb\nc', new_text: 'a\nB\nc' },
    ]);
  });

  it('emits a file_content block for Write so the new file previews as code, not diff', () => {
    const adapted = adaptApprovalRequest({
      toolCallId: 'tc-write',
      toolName: 'Write',
      action: 'write',
      display: {
        kind: 'generic',
        summary: 'write',
        detail: {
          file_path: 'src/new.ts',
          content: 'export const x = 1;\nexport const y = 2;',
        },
      },
    });

    expect(adapted.display).toEqual([
      {
        type: 'file_content',
        path: 'src/new.ts',
        content: 'export const x = 1;\nexport const y = 2;',
      },
    ]);
  });

  it('maps approved-for-session responses into core approval payloads', () => {
    expect(
      adaptPanelResponse({
        response: 'approved_for_session',
        feedback: 'looks good',
        selected_label: 'Approve for this session',
      }),
    ).toEqual({
      decision: 'approved',
      scope: 'session',
      feedback: 'looks good',
      selectedLabel: 'Approve for this session',
    });
  });
});
