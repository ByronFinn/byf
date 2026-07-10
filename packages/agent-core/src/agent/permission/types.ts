import type { ToolInputDisplay } from '../../tools/display';

export type PermissionRuleDecision = 'allow' | 'deny' | 'ask';

/**
 * Rule provenance. `session-runtime` is the value used by the runtime
 * "approve for session" path; `turn-override`, `project`, and `user`
 * are reserved for static-loaded rules surfaced by external callers.
 */
export type PermissionRuleScope = 'turn-override' | 'session-runtime' | 'project' | 'user';

/**
 * Top-level user-facing permission posture. Controls how non-deny rules
 * are treated when the closure is constructed. Independent of rule
 * merging: deny rules always fire regardless of mode.
 *
 *   - `manual` — rule set drives decision; unmatched tool calls ask
 *   - `yolo`   — only deny rules can block; everything else allows
 *   - `auto`   — caller may bypass rule checks entirely
 */
export type PermissionMode = 'manual' | 'yolo' | 'auto';

/**
 * A single permission rule. `pattern` is the DSL form (`Read(/etc/**)`,
 * `Bash(rm *)`, or bare `Write`). See `parse-pattern.ts` for the parser
 * and `matches-rule.ts` for the matcher.
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
