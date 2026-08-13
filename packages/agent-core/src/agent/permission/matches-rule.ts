/**
 * matchesRule — 判定 PermissionRule 是否适用于给定工具调用的纯函数。
 *
 * 契约:
 *   - 无副作用、无 `this`、无 IO、无异常。
 *   - 确定性:相同 `(rule, toolName, args)` → 相同结果。
 *   - 只返回布尔值;决策语义(deny/ask/allow)是调用方的事
 *     (见 `check-rules.ts`)。
 */

import picomatch from 'picomatch';

import { parsePattern } from './parse-pattern';
import { globMatch, pathGlobMatch, type PermissionPathMatchOptions } from './path-glob-match';
import type { PermissionRule } from './types';

type ArgFieldKind = 'generic' | 'path';

interface ArgField {
  readonly value: string;
  readonly kind: ArgFieldKind;
}

/**
 * Tool-specific argument field convention. When a rule uses an arg
 * pattern (`Read(./src/**)`), we extract the listed field from the tool
 * call args and match the glob against its value.
 *
 * Unknown tools fall back to `undefined`, which means "arg pattern
 * cannot match" — rules with an arg pattern on an unknown tool will
 * never fire. Rules without an arg pattern (`UnknownTool`) still match
 * on name alone.
 */
function extractArgField(toolName: string, args: unknown): ArgField | undefined {
  if (args === null || typeof args !== 'object') return undefined;
  const rec = args as Record<string, unknown>;

  switch (toolName) {
    case 'Bash':
    case 'Shell':
    case 'Background':
      return typeof rec['command'] === 'string'
        ? { value: rec['command'], kind: 'generic' }
        : undefined;
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'ReadMediaFile':
      return typeof rec['path'] === 'string' ? { value: rec['path'], kind: 'path' } : undefined;
    case 'Grep':
    case 'Glob':
      return typeof rec['pattern'] === 'string'
        ? { value: rec['pattern'], kind: 'generic' }
        : undefined;
    case 'Task':
    case 'Agent':
      return typeof rec['subagent_type'] === 'string'
        ? { value: rec['subagent_type'], kind: 'generic' }
        : undefined;
    default:
      return undefined;
  }
}

/**
 * 判定单条规则是否匹配特定的工具调用。
 *
 * 算法:
 *   1. 把 `rule.pattern` 解析为 `{toolName, argPattern?}`。
 *   2. 若解析出的 toolName 为 `*`,跳过名称检查;否则按 glob 语义比较,
 *      使 `mcp__github__*` 能匹配 `mcp__github__list`。
 *   3. 若规则无 argPattern,名称匹配 → 规则生效。
 *   4. 否则提取工具特定字段值,与 glob 匹配。对前导 `!` 取反前缀,
 *      通过翻转最终布尔值处理。
 */
export function matchesRule(
  rule: PermissionRule,
  toolName: string,
  args: unknown,
  pathOptions?: PermissionPathMatchOptions,
): boolean {
  let parsed;
  try {
    parsed = parsePattern(rule.pattern);
  } catch {
    // Malformed patterns never match. The loader is responsible for
    // surfacing DSL errors at load time; matcher stays total.
    return false;
  }

  // 1. Tool-name match (support `*` wildcard + glob-style tool names)
  const nameGlob = parsed.toolName;
  if (nameGlob !== '*' && !picomatch.isMatch(toolName, nameGlob)) return false;

  // 2. No arg pattern → name match is enough
  if (parsed.argPattern === undefined) return true;

  // 3. Arg pattern — resolve negation and glob-match the field
  const rawPattern = parsed.argPattern;
  const negated = rawPattern.startsWith('!');
  const positivePattern = negated ? rawPattern.slice(1) : rawPattern;

  const fieldValue = extractArgField(toolName, args);
  if (fieldValue === undefined) {
    // No extractable field → positive pattern cannot match; negation
    // semantics here mean "the field is not in the disallowed set",
    // which by missing-field convention we treat as a non-match to
    // avoid accidentally firing deny rules on malformed args.
    return false;
  }

  // If the field is a path, use `pathGlobMatch` which handles normalization.
  const hit =
    fieldValue.kind === 'path'
      ? pathGlobMatch(fieldValue.value, positivePattern, {
          pathOptions,
          conservativeCaseFold: rule.decision === 'deny' && !negated,
        })
      : globMatch(fieldValue.value, positivePattern);
  return negated ? !hit : hit;
}

export type { PermissionPathMatchOptions } from './path-glob-match';
