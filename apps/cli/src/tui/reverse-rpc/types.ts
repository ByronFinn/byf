/**
 * Reverse RPC 视图层类型。
 *
 * 这些类型是 UI 层与 reverse RPC 控制器之间的契约,而非 SDK 事件负载。
 * 审批与问题适配器把核心负载转换为这些形态供面板组件使用。
 */

import type { QuestionAnswerMethod } from '@byfriends/sdk';

// ── Display blocks (approval panel) ──────────────────────────────────

export interface BriefDisplayBlock {
  type: 'brief';
  text: string;
}

export interface DiffDisplayBlock {
  type: 'diff';
  path: string;
  old_text: string;
  new_text: string;
  old_start?: number;
  new_start?: number;
  is_summary?: boolean;
}

export interface ShellDisplayBlock {
  type: 'shell';
  language: string;
  command: string;
  cwd?: string;
  description?: string;
  danger?: string;
}

export interface FileOpDisplayBlock {
  type: 'file_op';
  operation: 'read' | 'write' | 'edit' | 'glob' | 'grep';
  path: string;
  detail?: string;
}

/** Write 的完整文件内容预览——代码块,而非 diff。 */
export interface FileContentDisplayBlock {
  type: 'file_content';
  path: string;
  content: string;
  language?: string;
}

export interface UrlFetchDisplayBlock {
  type: 'url_fetch';
  url: string;
  method?: string;
}

export interface SearchDisplayBlock {
  type: 'search';
  query: string;
  scope?: string;
}

export interface InvocationDisplayBlock {
  type: 'invocation';
  kind: 'agent' | 'skill';
  name: string;
  description?: string;
}

export interface TodoDisplayItem {
  title: string;
  status: 'pending' | 'in_progress' | 'done';
}

export interface TodoDisplayBlock {
  type: 'todo';
  items: TodoDisplayItem[];
}

export interface BackgroundTaskDisplayBlock {
  type: 'background_task';
  task_id: string;
  kind: string;
  status: string;
  description: string;
}

export type DisplayBlock =
  | BriefDisplayBlock
  | DiffDisplayBlock
  | ShellDisplayBlock
  | FileOpDisplayBlock
  | FileContentDisplayBlock
  | UrlFetchDisplayBlock
  | SearchDisplayBlock
  | InvocationDisplayBlock
  | TodoDisplayBlock
  | BackgroundTaskDisplayBlock;

export interface ApprovalPanelChoice {
  label: string;
  response: 'approved' | 'approved_for_session' | 'rejected' | 'cancelled';
  selected_label?: string;
  requires_feedback?: boolean;
}

// ── Approval / Question view payloads ────────────────────────────────

export interface ApprovalPanelData {
  id: string;
  tool_call_id: string;
  tool_name: string;
  action: string;
  description: string;
  display: DisplayBlock[];
  choices: ApprovalPanelChoice[];
}

export interface QuestionPanelItem {
  question: string;
  header?: string;
  body?: string;
  multi_select: boolean;
  other_label?: string;
  other_description?: string;
  options: Array<{ label: string; description?: string }>;
}

export interface QuestionPanelData {
  id: string;
  tool_call_id: string;
  questions: QuestionPanelItem[];
}

export type QuestionSubmissionMethod = QuestionAnswerMethod;

export interface QuestionPanelResponse {
  readonly answers: string[];
  readonly method?: QuestionSubmissionMethod;
}

// ── Pending state wrappers ───────────────────────────────────────────

export interface PendingApproval {
  data: ApprovalPanelData;
}

export interface PendingQuestion {
  data: QuestionPanelData;
}
