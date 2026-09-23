import type { Agent } from '..';
import type { PrepareToolExecutionResult, ToolExecutionHookContext } from '../../loop';
import type { TelemetryPropertyValue } from '../../telemetry';
import type { ToolInputDisplay } from '../../tools/display';
import { isDefaultAutoAllowTool } from '../../tools/policies/default-permissions';
import { isAgentRecordOfPrefix } from '../records/types';
import {
  permissionModel,
  permissionRecordApprovalResult,
  permissionSetMode,
} from '../wire/ops/permission';
import { actionToRulePattern, describeApprovalAction } from './action-label';
import { checkMatchingRules, type CheckRulesResult } from './check-rules';
import type { PermissionPathMatchOptions } from './path-glob-match';
import { createBuiltinPermissionPolicies } from './policies';
import type { PermissionPolicy, PermissionPolicyResult } from './policy';
import type {
  ApprovalGrantAuthority,
  ApprovalGrantInput,
  PermissionData,
  PermissionMode,
  PermissionRule,
} from './types';
export * from './policy';
export * from './types';

type ApprovalTelemetryMode = 'manual' | 'yolo' | 'afk' | 'auto_session' | 'cancelled';

export interface PermissionManagerOptions {
  readonly initialRules?: readonly PermissionRule[];
  readonly policies?: readonly PermissionPolicy[];
  readonly parent?: PermissionManager;
}

export class PermissionManager {
  rules: PermissionRule[] = [];
  private _modeOverride: PermissionMode | undefined;
  private readonly parent: PermissionManager | undefined;
  private sessionApprovedActions = new Set<string>();
  private readonly policies: readonly PermissionPolicy[];

  constructor(
    protected readonly agent: Agent,
    options: PermissionManagerOptions = {},
  ) {
    this.rules = [...(options.initialRules ?? [])];
    this.parent = options.parent;
    this.policies = options.policies ?? createBuiltinPermissionPolicies();
  }

  get mode(): PermissionMode {
    return this._modeOverride ?? this.parent?.mode ?? 'manual';
  }

  data(): PermissionData {
    return {
      mode: this.mode,
      rules: this.effectiveRules(),
    };
  }

  /**
   * 权限模式切换的**唯一**入口（#345）。曾经的 `set mode` 访问器会就地改掉
   * `_modeOverride`：不落 wire 记录、不进 replay、不发 status_updated，于是
   * "谁把会话切到 yolo"在持久层查不到任何痕迹——正是本 issue 要堵住的那类
   * "看不出来源"。走这里必定留痕，调用方只有 host/RPC 用户路径与 journal 恢复。
   */
  setMode(mode: PermissionMode): void {
    this.agent.wire.dispatch(permissionSetMode({ mode }));
    this.agent.replayBuilder.push({
      type: 'permission_updated',
      mode,
    });
    this._modeOverride = mode;
    this.agent.emitStatusUpdated();
  }

  /**
   * 落一条审批记录，并按 `authority` 决定是否**扩大**会话级免问集合。
   *
   * #345：审计痕迹与授权能力是两件事。记录本身照落（headless / 托管运行要能查
   * "这个工具被谁放行了"），但 `approved + scope: 'session'` 只有在授权来自真实
   * 用户裁决时才生成 session-runtime 规则。此前这条界线只靠"模式自动放行恰好
   * 不传 scope"这一约定维持：policy 经 `PermissionPolicyContext.recordApprovalResult`
   * 拿到的是同一个铸造入口，任何一次 `scope: 'session'` 上报都会在没有用户裁决
   * 的情况下永久放行该 action。
   *
   * `authority` 是入参的必填字段（不是可选的第二参数），所以"忘了交代来源"在编译
   * 期就不成立；只有从 journal 恢复的旧记录才在恢复处显式补一个来源。
   */
  recordApprovalResult(input: ApprovalGrantInput): void {
    const { authority, ...record } = input;
    this.agent.wire.dispatch(permissionRecordApprovalResult(input));
    this.agent.replayBuilder.push({
      type: 'approval_result',
      record,
    });
    if (!canGrantSessionApproval(authority)) return;
    if (record.result.decision !== 'approved' || record.result.scope !== 'session') {
      return;
    }
    if (this.sessionApprovedActions.has(record.action)) return;

    const pattern = actionToRulePattern(record.action, record.toolName);
    this.sessionApprovedActions.add(record.action);
    if (pattern === undefined) return;

    const rule: PermissionRule = {
      decision: 'allow',
      scope: 'session-runtime',
      pattern,
      reason: `approve_for_session: ${record.action}`,
    };
    if (!this.hasRule(rule)) {
      this.rules.push(rule);
    }
  }

  async beforeToolCall(
    context: ToolExecutionHookContext,
  ): Promise<PrepareToolExecutionResult | undefined> {
    const name = context.toolCall.name;
    const args = context.args;

    const mode = this.mode;
    const { decision, matchedRule } = this.checkPermission(name, args, mode);
    if (decision === 'deny') {
      return {
        block: true,
        reason: this.formatMessage(name, matchedRule?.reason),
      };
    }

    // 处理自动模式
    if (mode === 'auto') {
      const policyResult = await this.evaluatePolicies(context, matchedRule);
      if (policyResult !== undefined) {
        return this.permissionPolicyResultToPrepare(policyResult, context);
      }
      if (this.wouldAskInManualMode(name, args)) {
        this.trackToolApproved(name, 'afk');
        this.recordAutomaticApproval(context, 'auto');
      }
      return undefined;
    }

    // 处理yolo模式 - 仍需评估策略（如workspace外路径检查）
    if (mode === 'yolo') {
      const policyResult = await this.evaluatePolicies(context, matchedRule);
      if (policyResult !== undefined) {
        return this.permissionPolicyResultToPrepare(policyResult, context);
      }
      if (this.wouldAskInManualMode(name, args)) {
        this.trackToolApproved(name, 'yolo');
        this.recordAutomaticApproval(context, 'yolo');
      }
      return undefined;
    }

    // 处理manual模式的策略评估
    const policyResult = await this.evaluatePolicies(context, matchedRule);
    if (policyResult !== undefined) {
      return this.permissionPolicyResultToPrepare(policyResult, context);
    }

    if (decision === 'allow') {
      if (matchedRule?.scope === 'session-runtime') {
        this.trackToolApproved(name, 'auto_session', 'session');
      }
      return undefined;
    }

    // decision === 'ask' → bounce through ApprovalRuntime.
    return this.requestToolApproval(context);
  }

  private async requestToolApproval(
    context: ToolExecutionHookContext,
    options: {
      readonly action?: string;
      readonly display?: ToolInputDisplay;
    } = {},
  ): Promise<PrepareToolExecutionResult | undefined> {
    const { signal } = context;
    const id = context.toolCall.id;
    const name = context.toolCall.name;
    const args = context.args;
    const display =
      options.display ??
      ({
        kind: 'generic',
        summary: `Approve ${name}`,
        detail: args,
      } satisfies ToolInputDisplay);
    const action = options.action ?? describeApprovalAction(name, args, display);
    if (this.sessionApprovedActions.has(action)) {
      this.trackToolApproved(name, 'auto_session', 'session');
      return undefined;
    }

    const result = await this.agent.rpc.requestApproval(
      {
        turnId: Number(context.turnId),
        toolCallId: id,
        toolName: name,
        action,
        display,
      },
      { signal },
    );
    this.recordApprovalResult({
      turnId: Number(context.turnId),
      toolCallId: id,
      toolName: name,
      action,
      result,
      authority: { kind: 'user-verdict' },
    });

    if (result.decision === 'approved') {
      this.trackToolApproved(
        name,
        approvalTelemetryMode(this.mode),
        result.scope === 'session' ? 'session' : 'once',
      );
      return undefined;
    }

    this.agent.telemetry.track('tool_rejected', {
      tool_name: name,
      approval_mode:
        result.decision === 'cancelled' ? 'cancelled' : approvalTelemetryMode(this.mode),
      decision: result.decision,
      has_feedback: result.feedback !== undefined && result.feedback.length > 0,
    });

    return {
      block: true,
      reason: this.formatApprovalRejectionMessage(name, result),
    };
  }

  /**
   * PRD-0038 AC-1.6：yolo / auto 的放行绕过了 `requestApproval`，也就绕过了审批
   * 记录——headless 与托管运行里"这个工具被谁放行了"因此在 session records 中
   * 查不到任何痕迹。模式本身就是一个决策者，所以放行同样落一条
   * `permission.record_approval_result`，用 `selectedLabel` 标明它来自模式而非人。
   *
   * `scope` 必须留空：这不是用户「本会话同类都放行」的批准，不能据此生成
   * session-runtime 规则（见 {@link recordApprovalResult} 的分支）。#345 起这条
   * 不再只靠约定：这里的 `authority` 是 audit-only，即便 `scope` 被误传也不会 mint。
   * 只在 manual 模式下本该询问时才记录——默认自动放行的工具（Read 等）不是
   * 治理决策，记录它们只会把痕迹淹成噪音。
   */
  private recordAutomaticApproval(
    context: ToolExecutionHookContext,
    mode: Extract<PermissionMode, 'yolo' | 'auto'>,
  ): void {
    const name = context.toolCall.name;
    const args = context.args;
    this.recordApprovalResult({
      turnId: Number(context.turnId),
      toolCallId: context.toolCall.id,
      toolName: name,
      action: describeApprovalAction(name, args, {
        kind: 'generic',
        summary: `Approve ${name}`,
        detail: args,
      }),
      result: { decision: 'approved', selectedLabel: `auto_approve:${mode}` },
      authority: { kind: 'audit-only', from: 'mode-auto-approve' },
    });
  }

  private async evaluatePolicies(
    context: ToolExecutionHookContext,
    matchedRule: PermissionRule | undefined,
  ): Promise<PermissionPolicyResult | undefined> {
    for (const policy of this.policies) {
      const result = await policy.evaluate({
        agent: this.agent,
        mode: this.mode,
        toolCallContext: context,
        matchedRule,
        recordApprovalResult: (record) => {
          this.recordApprovalResult({
            ...record,
            authority: { kind: 'audit-only', from: 'policy' },
          });
        },
      });
      if (result !== undefined) return result;
    }
    return undefined;
  }

  private checkPermission(
    toolName: string,
    toolInput: unknown,
    mode: PermissionMode = this.mode,
  ): CheckRulesResult {
    const matched = this.checkMatchingPermissionRules(toolName, toolInput, mode);
    if (matched !== undefined) return matched;
    if (isDefaultAutoAllowTool(toolName)) return { decision: 'allow' };
    if (mode === 'yolo' || mode === 'auto') return { decision: 'allow' };
    return { decision: 'ask' };
  }

  private checkMatchingPermissionRules(
    toolName: string,
    toolInput: unknown,
    mode: PermissionMode,
  ): CheckRulesResult | undefined {
    return (
      checkMatchingRules(this.rules, toolName, toolInput, mode, this.pathMatchOptions()) ??
      this.parent?.checkMatchingPermissionRules(toolName, toolInput, mode)
    );
  }

  private effectiveRules(): PermissionRule[] {
    return [...this.rules, ...(this.parent?.effectiveRules() ?? [])];
  }

  private wouldAskInManualMode(toolName: string, toolInput: unknown): boolean {
    return this.checkPermission(toolName, toolInput, 'manual').decision === 'ask';
  }

  private permissionPolicyResultToPrepare(
    result: PermissionPolicyResult,
    context: ToolExecutionHookContext,
  ): Promise<PrepareToolExecutionResult | undefined> | PrepareToolExecutionResult | undefined {
    switch (result.kind) {
      case 'allow':
        return result.executionMetadata === undefined
          ? undefined
          : { executionMetadata: result.executionMetadata };
      case 'ask':
        return this.requestToolApproval(context, result);
      case 'result':
        return result.result;
    }
  }

  private hasRule(target: PermissionRule): boolean {
    return this.rules.some((rule) => {
      return (
        rule.decision === target.decision &&
        rule.scope === target.scope &&
        rule.pattern === target.pattern &&
        rule.reason === target.reason
      );
    });
  }

  protected formatMessage(toolName: string, reason?: string): string {
    const suffix = reason !== undefined && reason.length > 0 ? ` Reason: ${reason}` : '';
    if (this.agent.type === 'sub') {
      return `Tool "${toolName}" was denied.${suffix} Try a different approach — don't retry the same call, don't attempt to bypass the restriction.`;
    }
    return `Tool "${toolName}" was denied by permission rule.${suffix}`;
  }

  protected formatApprovalRejectionMessage(
    toolName: string,
    result: { decision: 'approved' | 'rejected' | 'cancelled'; feedback?: string },
  ): string {
    const suffix =
      result.feedback !== undefined && result.feedback.length > 0
        ? ` Reason: ${result.feedback}`
        : '';
    const prefix =
      result.decision === 'cancelled'
        ? `Tool "${toolName}" was not run because the approval request was cancelled.`
        : `Tool "${toolName}" was not run because the user rejected the approval request.`;
    if (this.agent.type === 'sub') {
      return `${prefix}${suffix} Try a different approach — don't retry the same call, don't attempt to bypass the restriction.`;
    }
    return `${prefix}${suffix}`;
  }

  private pathMatchOptions(): PermissionPathMatchOptions {
    return {
      cwd: this.agent.config.cwd,
      pathClass: this.agent.runtime.kaos.pathClass(),
      homeDir: this.agent.runtime.kaos.gethome(),
    };
  }

  private trackToolApproved(
    toolName: string,
    approvalMode: Exclude<ApprovalTelemetryMode, 'cancelled'>,
    scope?: 'once' | 'session',
  ): void {
    const properties: Record<string, TelemetryPropertyValue> = {
      tool_name: toolName,
      approval_mode: approvalMode,
    };
    if (scope !== undefined) {
      properties['scope'] = scope;
    }
    this.agent.telemetry.track('tool_approved', properties);
  }

  restoreRecord(record: import('../records/types').AgentRecord): void {
    if (!isAgentRecordOfPrefix(record, 'permission')) return;
    // Test-only entry point (restore-handler unit tests). Production restore
    // uses the pure wire reducer (wire.restore → apply → syncFromWire).
    switch (record.type) {
      case 'permission.set_mode':
        this.setMode(record.mode);
        break;
      case 'permission.record_approval_result': {
        // 缺省只可能是 #345 之前写入的 journal：那时来源还不存在，无从复审。
        this.recordApprovalResult({
          ...record,
          authority: record.authority ?? { kind: 'restored-user-verdict' },
        });
        break;
      }
    }
  }

  /**
   * restore 后从 wire reducer model 同步持久化状态（PRD-0027 Phase 3）。
   * modeOverride 由 set_mode 的纯 apply 重建；sessionApproved（action→toolName）
   * 重建 sessionApprovedActions 与 session-runtime rules（actionToRulePattern +
   * hasRule 去重，对标旧 restoreRecord → recordApprovalResult 的 rules 追加）。
   * parent / policies 是构造注入，不动。
   */
  syncFromWire(): void {
    const model = this.agent.wire.getModel(permissionModel);
    this._modeOverride = model.modeOverride;
    this.sessionApprovedActions = new Set(model.sessionApproved.keys());
    for (const [action, toolName] of model.sessionApproved) {
      const pattern = actionToRulePattern(action, toolName);
      if (pattern === undefined) continue;
      const rule: PermissionRule = {
        decision: 'allow',
        scope: 'session-runtime',
        pattern,
        reason: `approve_for_session: ${action}`,
      };
      if (!this.hasRule(rule)) {
        this.rules.push(rule);
      }
    }
  }
}

function approvalTelemetryMode(
  mode: PermissionMode,
): Extract<ApprovalTelemetryMode, 'manual' | 'yolo' | 'afk'> {
  return mode === 'auto' ? 'afk' : mode;
}

/**
 * 授权来源能不能扩大会话级免问集合（#345）。审计-only 的来源（模式自动放行、
 * policy 上报）落记录但不 mint 规则——它们的 `result` 不是用户裁决的产物。
 *
 * 同一判据在持久层也成立：`authority` 随 `permission.record_approval_result` 一起
 * 落 journal，`wire/ops/permission.ts` 的纯 reducer 对 `audit-only` 不铸造会话规则，
 * 所以"恢复后是谁给的授权"不会在归约过程中丢失。
 */
function canGrantSessionApproval(authority: ApprovalGrantAuthority): boolean {
  return authority.kind === 'user-verdict' || authority.kind === 'restored-user-verdict';
}
