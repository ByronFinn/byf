import { parseBashCommand } from '../../tools/policies/bash-command';
import { isDefaultAutoAllowTool } from '../../tools/policies/default-permissions';
import { matchesRule } from './matches-rule';
import type { PermissionPathMatchOptions } from './path-glob-match';
import type { PermissionMode, PermissionRule, PermissionRuleDecision } from './types';

export interface CheckRulesResult {
  readonly decision: PermissionRuleDecision;
  /** Rule that produced `decision`. `undefined` for mode/default auto-allow. */
  readonly matchedRule?: PermissionRule;
}

/**
 * 命令字符串工具（Bash/Shell/Background）：规则匹配按**逐子命令**聚合
 * （PRD-0031 0a，grill Q1）。
 *
 * 复合命令（`; && || |`）被解析为子命令序列后，每个子命令作为独立命令参与
 * 规则匹配，聚合遵循现有优先级：
 *   - 任一子命令命中 deny → 整条 deny；
 *   - 任一子命令命中 ask（且无 deny）→ ask；
 *   - 全部子命令命中 allow → allow；
 *   - 无规则命中 → 默认表（调用方决策：manual 下 ask、yolo/auto 下 allow）。
 *
 * 行为变更（修掉现有整串匹配绕过）：`Bash(rm *)` deny 现在对 `echo hi; rm x`
 * 生效（旧：整串不匹配 → deny 逃逸）；`Bash(!rm *)` allow 不再放行含 `rm`
 * 子命令的复合命令。单子命令命令与旧行为完全一致（零回归）。
 */
export function checkMatchingRules(
  rules: readonly PermissionRule[],
  toolName: string,
  toolInput: unknown,
  mode: PermissionMode,
  pathOptions?: PermissionPathMatchOptions,
): CheckRulesResult | undefined {
  const command = commandStringOf(toolName, toolInput);
  if (command !== undefined) {
    const subcommands = parseBashCommand(command).subcommands.map((s) => s.text);
    if (subcommands.length > 1) {
      return checkMatchingRulesPerSubcommand(
        rules,
        toolName,
        toolInput,
        subcommands,
        mode,
        pathOptions,
      );
    }
  }
  return checkMatchingRulesCore(rules, toolName, toolInput, mode, pathOptions);
}

function checkMatchingRulesPerSubcommand(
  rules: readonly PermissionRule[],
  toolName: string,
  toolInput: unknown,
  subcommands: readonly string[],
  mode: PermissionMode,
  pathOptions?: PermissionPathMatchOptions,
): CheckRulesResult | undefined {
  let anyAsk = false;
  let anyAllowMatch = false;
  for (const sub of subcommands) {
    const subInput = { ...(toolInput as Record<string, unknown>), command: sub };
    const decision = checkMatchingRulesCore(rules, toolName, subInput, mode, pathOptions);
    if (decision === undefined) {
      // 无规则命中 → 默认表：manual 下该子命令默认 ask，yolo/auto 与默认自动
      // 放行工具默认 allow
      if (mode !== 'yolo' && mode !== 'auto' && !isDefaultAutoAllowTool(toolName)) {
        anyAsk = true;
      }
      continue;
    }
    if (decision.decision === 'deny') return decision;
    if (decision.decision === 'ask') anyAsk = true;
    else anyAllowMatch = true;
  }
  if (anyAsk) return { decision: 'ask' };
  if (anyAllowMatch) return { decision: 'allow' };
  return undefined;
}

function checkMatchingRulesCore(
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

function commandStringOf(toolName: string, toolInput: unknown): string | undefined {
  if (toolName !== 'Bash' && toolName !== 'Shell' && toolName !== 'Background') return undefined;
  if (toolInput === null || typeof toolInput !== 'object') return undefined;
  const value = (toolInput as Record<string, unknown>)['command'];
  return typeof value === 'string' ? value : undefined;
}
