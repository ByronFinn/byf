/**
 * Zod schemas for the display unions.
 *
 * The wire-record layer validates incoming / outgoing
 * `input_display` / `result_display` fields against these schemas.
 */

import { z } from 'zod';

export const ToolInputDisplaySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('command'),
    command: z.string(),
    cwd: z.string().optional(),
    description: z.string().optional(),
    language: z.literal('bash').optional(),
  }),
  z.object({
    kind: z.literal('file_io'),
    operation: z.enum(['read', 'write', 'edit', 'glob', 'grep']),
    path: z.string(),
    detail: z.string().optional(),
  }),
  z.object({
    kind: z.literal('diff'),
    path: z.string(),
    before: z.string(),
    after: z.string(),
    hunks: z.number().optional(),
  }),
  z.object({
    kind: z.literal('search'),
    query: z.string(),
    scope: z.string().optional(),
  }),
  z.object({
    kind: z.literal('url_fetch'),
    url: z.string(),
    method: z.string().optional(),
  }),
  z.object({
    kind: z.literal('agent_call'),
    agent_name: z.string(),
    prompt: z.string(),
    background: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('skill_call'),
    skill_name: z.string(),
    args: z.string().optional(),
  }),
  z.object({
    kind: z.literal('todo_list'),
    items: z.array(z.object({ title: z.string(), status: z.string() })),
  }),
  z.object({
    kind: z.literal('background_task'),
    task_id: z.string(),
    status: z.string(),
    description: z.string(),
    task_kind: z.string().optional(),
  }),
  z.object({
    kind: z.literal('task_stop'),
    task_id: z.string(),
    task_description: z.string(),
  }),
  z.object({
    kind: z.literal('plan_review'),
    plan: z.string(),
    path: z.string().optional(),
    options: z
      .array(
        z.object({
          label: z.string(),
          description: z.string(),
        }),
      )
      .readonly()
      .optional(),
  }),
  z.object({
    kind: z.literal('generic'),
    summary: z.string(),
    detail: z.unknown().optional(),
  }),
]);

export const ToolResultDisplaySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('command_output'),
    exit_code: z.number(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
  }),
  z.object({
    kind: z.literal('file_content'),
    path: z.string(),
    content: z.string(),
    range: z.object({ start: z.number(), end: z.number() }).optional(),
    truncated: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('diff'),
    path: z.string(),
    before: z.string(),
    after: z.string(),
    hunks: z.number().optional(),
  }),
  z.object({
    kind: z.literal('search_results'),
    query: z.string(),
    matches: z.array(z.object({ file: z.string(), line: z.number(), text: z.string() })),
  }),
  z.object({
    kind: z.literal('url_content'),
    url: z.string(),
    status: z.number(),
    preview: z.string().optional(),
    content_type: z.string().optional(),
  }),
  z.object({
    kind: z.literal('agent_summary'),
    agent_name: z.string(),
    result: z.string().optional(),
    steps: z.number().optional(),
  }),
  z.object({
    kind: z.literal('background_task'),
    task_id: z.string(),
    status: z.string(),
    description: z.string(),
  }),
  z.object({
    kind: z.literal('todo_list'),
    items: z.array(z.object({ title: z.string(), status: z.string() })),
  }),
  z.object({ kind: z.literal('structured'), data: z.unknown() }),
  z.object({
    kind: z.literal('text'),
    text: z.string(),
    truncated: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('error'),
    message: z.string(),
    code: z.string().optional(),
  }),
  z.object({
    kind: z.literal('generic'),
    summary: z.string(),
    detail: z.unknown().optional(),
  }),
]);

// Types inferred from schemas — single source of truth.
export type ToolInputDisplay = z.infer<typeof ToolInputDisplaySchema>;
export type ToolResultDisplay = z.infer<typeof ToolResultDisplaySchema>;

/**
 * kind 全集的**运行时投影**，由上面的 discriminated union 派生（不是第二份清单）。
 *
 * 存在理由（PRD-0038 AC-6.1）：三个表面（TUI 审批面板、web client 工具卡、
 * web server 透传）各自要"处理每一个 kind"。此前它们都用 `default` 分支兜底，
 * 新增 kind 会静默降级。消费方改为以本列表为覆盖基准（类型侧由
 * `ToolInputDisplay['kind']` 派生，运行时侧由本列表驱动契约测试），新增 kind
 * 时在编译期（`Record<ToolInputDisplay['kind'], …>` 少键）与测试期（覆盖用例
 * 少项）同时报错。
 */
export const TOOL_INPUT_DISPLAY_KINDS: readonly ToolInputDisplay['kind'][] =
  ToolInputDisplaySchema.options.map((option) => option.shape.kind.value);

export const TOOL_RESULT_DISPLAY_KINDS: readonly ToolResultDisplay['kind'][] =
  ToolResultDisplaySchema.options.map((option) => option.shape.kind.value);

/** 判断任意值是否为已定义的 `ToolInputDisplay`（跨表面边界处的统一收窄入口）。 */
export function parseToolInputDisplay(value: unknown): ToolInputDisplay | null {
  const parsed = ToolInputDisplaySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
