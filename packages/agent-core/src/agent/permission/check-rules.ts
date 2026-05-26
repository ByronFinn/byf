import { isDefaultAutoAllowTool } from '../../tools/policies/default-permissions';
import { matchesRule } from './matches-rule';
import type { PermissionPathMatchOptions } from './path-glob-match';
import type { PermissionMode, PermissionRule, PermissionRuleDecision } from './types';

export interface CheckRulesResult {
  readonly decision: PermissionRuleDecision;
  /** Rule that produced `decision`. `undefined` for mode/default auto-allow. */
  readonly matchedRule?: PermissionRule | undefined;
}

export function checkMatchingRules(
  rules: readonly PermissionRule[],
  toolName: string,
  toolInput: unknown,
  mode: PermissionMode,
  pathOptions?: PermissionPathMatchOptions,
): CheckRulesResult | undefined {
  // Priority 1: deny wins in every mode.
  for (const rule of rules) {
    if (rule.decision === 'deny' && matchesRule(rule, toolName, toolInput, pathOptions)) {
      return { decision: 'deny', matchedRule: rule };
    }
  }

  const askRule = firstMatchingRule(rules, 'ask', toolName, toolInput, pathOptions);
  const allowRule = firstMatchingRule(rules, 'allow', toolName, toolInput, pathOptions);
  if (askRule === undefined && allowRule === undefined) return undefined;

  if (isDefaultAutoAllowTool(toolName)) {
    return { decision: 'allow' };
  }

  // Mode overlay: yolo treats everything non-deny as allow.
  if (mode === 'yolo' || mode === 'auto') {
    return { decision: 'allow' };
  }

  // Priority 2: ask before allow so unresolved ambiguity defers to the user.
  if (askRule !== undefined) return { decision: 'ask', matchedRule: askRule };

  // Priority 3: explicit allow.
  return { decision: 'allow', matchedRule: allowRule };
}

function firstMatchingRule(
  rules: readonly PermissionRule[],
  decision: PermissionRuleDecision,
  toolName: string,
  toolInput: unknown,
  pathOptions?: PermissionPathMatchOptions,
): PermissionRule | undefined {
  for (const rule of rules) {
    if (rule.decision === decision && matchesRule(rule, toolName, toolInput, pathOptions)) {
      return rule;
    }
  }
  return undefined;
}
