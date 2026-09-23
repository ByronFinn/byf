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
  /**
   * 本条记录的授权来源（#345）。随记录一起持久化，所以恢复后仍然查得到"这是人
   * 裁决的，还是模式/policy 自动落的"。缺失 = #345 之前写入的旧 journal。
   */
  readonly authority?: ApprovalGrantAuthority;
}

/**
 * 一条审批记录的**授权来源**（#345）。特权判定不接受"从文本推断出的授权"：
 * 只有真实用户裁决（`requestApproval` 的应答，或它的持久化形态）能铸造会话级
 * 免问；模式自动放行与 policy 上报的记录只用于审计。
 *
 * 这不是安全边界（ADR-0033）——它钉住的是一个可复查的性质：谁能扩大"本会话同类
 * 都放行"的集合。
 */
export type ApprovalGrantAuthority =
  | { readonly kind: 'user-verdict' }
  | { readonly kind: 'restored-user-verdict' }
  | { readonly kind: 'audit-only'; readonly from: 'mode-auto-approve' | 'policy' };

/**
 * 活的调用方必须交代的审批记录（#345）：与持久化记录同形，只是 `authority` 必填。
 * 持久化侧保留可选，因为 #345 之前写入的 journal 里确实没有这个字段。
 */
export type ApprovalGrantInput = Omit<PermissionApprovalResultRecord, 'authority'> & {
  readonly authority: ApprovalGrantAuthority;
};

export interface PermissionData {
  mode: PermissionMode;
  rules: PermissionRule[];
}
