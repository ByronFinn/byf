import { describe, expect, it } from 'bun:test';

import {
  ApprovalRequestSchema,
  ApprovalResponseSchema,
  QuestionRequestSchema,
  QuestionResultSchema,
  TOOL_INPUT_DISPLAY_KINDS,
  TOOL_RESULT_DISPLAY_KINDS,
  ToolInputDisplaySchema,
  parseToolInputDisplay,
  type ToolInputDisplay,
} from '#/index';

/**
 * PRD-0038 AC-6.1：审批/提问/展示块载荷的**单一真源**契约。
 *
 * - kind 全集只能由 zod schema 派生（`TOOL_INPUT_DISPLAY_KINDS` 从 union 的
 *   options 现算，不存在第二份手写清单）；
 * - 三表面（TUI / web client / web server 透传）都以本文件导出的同一份列表与
 *   schema 为覆盖基准，新增 kind 时未处理的表面在编译期或测试期报错；
 * - 未定义的 kind 必须被 schema 拒绝，而不是被某个 `default` 分支吞掉。
 */

/** 每个 kind 的最小可判定载荷（只填 required 字段）。 */
const DISPLAY_FIXTURES: Record<string, ToolInputDisplay> = {
  command: { kind: 'command', command: 'ls' },
  file_io: { kind: 'file_io', operation: 'read', path: '/tmp/a' },
  diff: { kind: 'diff', path: '/tmp/a', before: 'a', after: 'b' },
  search: { kind: 'search', query: 'needle' },
  url_fetch: { kind: 'url_fetch', url: 'https://example.com' },
  agent_call: { kind: 'agent_call', agent_name: 'reviewer', prompt: 'check' },
  skill_call: { kind: 'skill_call', skill_name: 'tdd' },
  todo_list: { kind: 'todo_list', items: [{ title: 'a', status: 'pending' }] },
  background_task: {
    kind: 'background_task',
    task_id: 't1',
    status: 'running',
    description: 'sleep',
  },
  task_stop: { kind: 'task_stop', task_id: 't1', task_description: 'sleep' },
  plan_review: { kind: 'plan_review', plan: '# plan' },
  generic: { kind: 'generic', summary: 'do a thing' },
};

function approvalRequestFor(kind: string): unknown {
  return {
    toolCallId: 'tc-1',
    toolName: 'Bash',
    action: 'run',
    display: DISPLAY_FIXTURES[kind],
  };
}

describe('反向 RPC / 展示载荷契约（AC-6.1）', () => {
  it('kind 全集由 schema 派生，且无重复', () => {
    const fromSchema = ToolInputDisplaySchema.options.map((option) => option.shape.kind.value);
    expect(TOOL_INPUT_DISPLAY_KINDS).toEqual(fromSchema);
    expect(new Set(TOOL_INPUT_DISPLAY_KINDS).size).toBe(TOOL_INPUT_DISPLAY_KINDS.length);
    expect(TOOL_RESULT_DISPLAY_KINDS.length).toBe(new Set(TOOL_RESULT_DISPLAY_KINDS).size);
  });

  it('每一个 kind 都能通过审批载荷 schema 并保持 kind 不变（server 透传的等价基准）', () => {
    for (const kind of TOOL_INPUT_DISPLAY_KINDS) {
      expect(DISPLAY_FIXTURES[kind], `缺少 kind=${kind} 的夹具`).toBeDefined();
      const parsed = ApprovalRequestSchema.safeParse(approvalRequestFor(kind));
      expect(parsed.success, `kind=${kind} 未被 ApprovalRequestSchema 接受`).toBe(true);
      if (!parsed.success) continue;
      expect(parsed.data.display.kind).toBe(kind);
      expect(parseToolInputDisplay(parsed.data.display)?.kind).toBe(kind);
    }
  });

  it('未知 kind 被拒绝而不是静默降级', () => {
    const parsed = ApprovalRequestSchema.safeParse({
      toolCallId: 'tc-1',
      toolName: 'Bash',
      action: 'run',
      display: { kind: 'brand_new_kind' },
    });
    expect(parsed.success).toBe(false);
    expect(parseToolInputDisplay({ kind: 'brand_new_kind' })).toBeNull();
  });

  it('夹具集合与 kind 全集一一对应（新增 kind 必须同时补夹具）', () => {
    expect(Object.keys(DISPLAY_FIXTURES).toSorted()).toEqual(
      [...TOOL_INPUT_DISPLAY_KINDS].toSorted(),
    );
  });

  it('裁决与问答载荷同样由 schema 定义', () => {
    expect(ApprovalResponseSchema.safeParse({ decision: 'approved' }).success).toBe(true);
    expect(ApprovalResponseSchema.safeParse({ decision: 'yolo' }).success).toBe(false);
    expect(
      QuestionRequestSchema.safeParse({
        questions: [{ question: 'ok?', options: [{ label: 'yes' }] }],
      }).success,
    ).toBe(true);
    expect(
      QuestionResultSchema.safeParse({ answers: { 'ok?': 'yes' }, method: 'enter' }).success,
    ).toBe(true);
    expect(QuestionResultSchema.safeParse(null).success).toBe(true);
  });
});
