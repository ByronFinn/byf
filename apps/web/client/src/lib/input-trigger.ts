/**
 * 输入触发 token 解析(ComposerCard 的 `/` 命令与 `@` 引用的行内解析)。
 * 纯函数,便于单元测试。
 */

export interface TriggerToken {
  readonly token: string;
  readonly args: string;
}

/**
 * 光标前的触发 token:行首或空白后的 `/xxx` 或 `@xxx`。slash 允许带参数
 * (`/research 主题` → token=`/research`、args=`主题`),参数随命令执行
 * (TUI 语义),mention 不取参数。无触发则 null。
 */
export function tokenAt(text: string, caret: number): TriggerToken | null {
  const before = text.slice(0, caret);
  const m = /(?:^|\s)([/@][^\s]*)(?:\s+([\s\S]*))?$/.exec(before);
  if (m === null) return null;
  return { token: m[1] ?? '', args: m[2] ?? '' };
}

/** 把光标前的触发 token 连同其后的参数替换为 replacement,返回新值与光标位。 */
export function replaceToken(
  text: string,
  caret: number,
  replacement: string,
): { value: string; caret: number } {
  const before = text.slice(0, caret);
  const m = /(?:^|\s)([/@][^\s]*)(?:\s+([\s\S]*))?$/.exec(before);
  if (m === null) return { value: text, caret };
  // token 起点 = 匹配起点 + token 在匹配中的偏移(m[0] = 前导 + token + 参数分隔符 + args)
  const start = m.index + m[0].indexOf(m[1] ?? '');
  const value = `${text.slice(0, start)}${replacement}${text.slice(caret)}`;
  return { value, caret: start + replacement.length };
}
