import type { Agent } from '..';
import type { PrepareToolExecutionResult, ToolExecutionHookContext } from '../../loop';
import type { ToolInputDisplay } from '../../tools/display';
import type { PermissionApprovalResultRecord, PermissionMode, PermissionRule } from './types';

export interface PermissionPolicyContext {
  readonly agent: Agent;
  readonly mode: PermissionMode;
  readonly toolCallContext: ToolExecutionHookContext;
  /**
   * The rule matched by `checkPermission()`, if any.
   *
   * Policies that want to defer to user-defined rules (e.g. a default-allow
   * policy that should not override an explicit `ask`/`deny` rule) inspect
   * this to decide whether to fire. `undefined` means the decision came
   * from the built-in default permission table rather than a user rule.
   */
  readonly matchedRule: PermissionRule | undefined;
  readonly recordApprovalResult: (record: PermissionApprovalResultRecord) => void;
}

export type PermissionPolicyResult =
  | {
      readonly kind: 'allow';
      readonly executionMetadata?: unknown;
    }
  | {
      readonly kind: 'result';
      readonly result: PrepareToolExecutionResult;
    }
  | {
      readonly kind: 'ask';
      readonly action?: string;
      readonly display?: ToolInputDisplay;
    };

export interface PermissionPolicy {
  readonly name: string;
  evaluate(
    context: PermissionPolicyContext,
  ): PermissionPolicyResult | undefined | Promise<PermissionPolicyResult | undefined>;
}
