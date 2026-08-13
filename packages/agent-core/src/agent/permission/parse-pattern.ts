/**
 * PermissionRule `pattern` 字符串的 DSL 解析器。
 *
 * 文法:
 *   pattern    := toolName ( "(" argPattern ")" )?
 *   toolName   := 标识符字符(例如 `Bash`、`mcp__github__*`)
 *   argPattern := 任意字符串(可以 `!` 开头表示取反)
 *
 * 示例:
 *   "Write"            → { toolName: "Write" }
 *   "Read(/etc/**)"    → { toolName: "Read", argPattern: "/etc/**" }
 *   "Bash(!rm *)"      → { toolName: "Bash", argPattern: "!rm *" }
 *   "mcp__github__*"   → { toolName: "mcp__github__*" }
 */

export interface ParsedPattern {
  readonly toolName: string;
  readonly argPattern?: string;
}

/**
 * 解析 DSL pattern。输入畸形时抛出(缺少闭合括号、工具名为空)。该解析器是
 * DSL 语法的唯一事实源,由表驱动测试覆盖。
 */
export function parsePattern(pattern: string): ParsedPattern {
  const trimmed = pattern.trim();
  if (trimmed.length === 0) {
    throw new Error('permission pattern: empty string');
  }

  const openIdx = trimmed.indexOf('(');
  if (openIdx === -1) {
    return { toolName: trimmed };
  }

  if (!trimmed.endsWith(')')) {
    throw new Error(`permission pattern: missing closing paren in "${pattern}"`);
  }

  const toolName = trimmed.slice(0, openIdx);
  const argPattern = trimmed.slice(openIdx + 1, -1);
  if (toolName.length === 0) {
    throw new Error(`permission pattern: empty tool name in "${pattern}"`);
  }
  // Empty arg pattern (`Read()`) is treated as "toolName only" — it
  // matches every call to that tool. This aligns with the intuition
  // that writing `Read()` is an odd but non-fatal way of saying `Read`.
  return { toolName, argPattern: argPattern.length > 0 ? argPattern : undefined };
}
