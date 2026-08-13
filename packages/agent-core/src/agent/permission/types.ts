import type { ToolInputDisplay } from '../../tools/display';

export type PermissionRuleDecision = 'allow' | 'deny' | 'ask';

/**
 * 规则来源。`session-runtime` 是运行时「批准本会话」路径使用的值;
 * `turn-override`、`project`、`user` 预留给由外部调用方呈现的静态加载规则。
 */
export type PermissionRuleScope = 'turn-override' | 'session-runtime' | 'project' | 'user';

/**
 * 面向用户的顶层权限姿态。控制构建闭包时如何处理非 deny 规则。
 * 独立于规则合并:deny 规则无论何种模式都生效。
 *
 *   - `manual` — 规则集驱动决策;未匹配的工具调用会询问
 *   - `yolo`   — 仅 deny 规则可阻止;其余全部放行
 *   - `auto`   — 调用方可完全绕过规则检查
 */
export type PermissionMode = 'manual' | 'yolo' | 'auto';

/**
 * 单条权限规则。`pattern` 为 DSL 形式(`Read(/etc/**)`、`Bash(rm *)`
 * 或裸 `Write`)。解析器见 `parse-pattern.ts`,匹配器见 `matches-rule.ts`。
 */
export interface PermissionRule {
  readonly decision: PermissionRuleDecision;
  readonly scope: PermissionRuleScope;
  readonly pattern: string;
  readonly reason?: string;
}

export interface ApprovalRequest {
  toolCallId: string;
  toolName: string;
  action: string;
  display: ToolInputDisplay;
}

export interface ApprovalResponse {
  decision: 'approved' | 'rejected' | 'cancelled';
  scope?: 'session';
  feedback?: string;
  selectedLabel?: string;
}

export interface PermissionApprovalResultRecord {
  readonly turnId: number;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly action: string;
  readonly result: ApprovalResponse;
}

export interface PermissionData {
  mode: PermissionMode;
  rules: PermissionRule[];
}
