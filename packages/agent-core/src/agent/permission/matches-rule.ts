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

import type { ToolFileAccessOperation } from '../../loop/tool-access';
import { parseBashCommand, type BashPathArg } from '../../tools/policies/bash-command';
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
 *   2. `Resource(op:glob)` 命名空间（PRD-0031 2a，资源感知权限模型）——
 *      与调度声明共享同一 `(operation, path)` 资源抽象：匹配工具调用解析
 *      出的资源访问（Bash 经命令解析提取路径，Read/Write/Edit 直接取
 *      path 参数），而非命令字符串。任一资源命中 → 规则生效。
 *   3. 若解析出的 toolName 为 `*`,跳过名称检查;否则按 glob 语义比较,
 *      使 `mcp__github__*` 能匹配 `mcp__github__list`。
 *   4. 若规则无 argPattern,名称匹配 → 规则生效。
 *   5. 否则提取工具特定字段值,与 glob 匹配。对前导 `!` 取反前缀,
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

  // 2a：Resource(op:glob) 资源规则——与调度层共享 (operation, path) 抽象
  if (parsed.toolName === RESOURCE_RULE_NAMESPACE) {
    if (parsed.argPattern === undefined) return false; // 裸 Resource 无语义
    return matchesResourceRule(parsed.argPattern, toolName, args, pathOptions, rule);
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

// —— PRD-0031 2a：资源感知权限模型（调度图与权限图统一） ——

/** 资源规则的 DSL 命名空间：`Resource(read:*.env)`。 */
export const RESOURCE_RULE_NAMESPACE = 'Resource';

const RESOURCE_OPERATIONS: readonly string[] = new Set(['read', 'write', 'readwrite', 'search']);

/**
 * 从工具调用提取 `(operation, path)` 资源访问（与调度层 `ToolAccesses`
 * 同一资源词汇，单一来源）：
 *   - Bash/Shell/Background：命令解析器提取的路径（narrow/broad 子命令；
 *     indirect/无路径 → 无资源可匹配，规则不生效——已知局限）；
 *   - Read/ReadMediaFile：read + path；Write/Edit：write + path；
 *   - Grep/Glob：search + pattern。
 * 无法提取资源的工具返回 undefined（规则不匹配）。
 */
function extractResourceAccesses(
  toolName: string,
  args: unknown,
):
  | readonly BashPathArg[]
  | readonly { readonly rawPath: string; readonly operation: ToolFileAccessOperation }[]
  | undefined {
  if (args === null || typeof args !== 'object') return undefined;
  const rec = args as Record<string, unknown>;

  switch (toolName) {
    case 'Bash':
    case 'Shell':
    case 'Background': {
      if (typeof rec['command'] !== 'string') return undefined;
      const subcommands = parseBashCommand(rec['command']).subcommands;
      const paths = subcommands.flatMap((s) => s.paths);
      return paths.length > 0 ? paths : undefined;
    }
    case 'Read':
    case 'ReadMediaFile':
      return typeof rec['path'] === 'string'
        ? [{ rawPath: rec['path'], operation: 'read' as const }]
        : undefined;
    case 'Write':
    case 'Edit':
      return typeof rec['path'] === 'string'
        ? [{ rawPath: rec['path'], operation: 'write' as const }]
        : undefined;
    case 'Grep':
    case 'Glob':
      return typeof rec['pattern'] === 'string'
        ? [{ rawPath: rec['pattern'], operation: 'search' as const }]
        : undefined;
    default:
      return undefined;
  }
}

/** 解析 `op:glob`（或 `!op:glob`）资源规则参数。 */
function parseResourceArgPattern(argPattern: string): {
  readonly negated: boolean;
  readonly operation: ToolFileAccessOperation | undefined;
  readonly glob: string;
} {
  const negated = argPattern.startsWith('!');
  const positive = negated ? argPattern.slice(1) : argPattern;
  const colonIdx = positive.indexOf(':');
  if (colonIdx <= 0 || colonIdx === positive.length - 1) {
    return { negated, operation: undefined, glob: positive };
  }
  const op = positive.slice(0, colonIdx) as ToolFileAccessOperation;
  return {
    negated,
    operation: RESOURCE_OPERATIONS.has(op) ? op : undefined,
    glob: positive.slice(colonIdx + 1),
  };
}

function matchesResourceRule(
  argPattern: string,
  toolName: string,
  args: unknown,
  pathOptions: PermissionPathMatchOptions | undefined,
  rule: PermissionRule,
): boolean {
  const { negated, operation, glob } = parseResourceArgPattern(argPattern);
  if (operation === undefined || glob.length === 0) return false;

  const resources = extractResourceAccesses(toolName, args);
  if (resources === undefined || resources.length === 0) return false;

  const hit = resources.some((resource) => {
    if (resource.operation !== operation) return false;
    return pathGlobMatch(resource.rawPath, glob, {
      pathOptions,
      conservativeCaseFold: rule.decision === 'deny' && !negated,
    });
  });
  return negated ? !hit : hit;
}
