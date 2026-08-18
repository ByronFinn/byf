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

/**
 * 触发弹窗键盘导航的跟随滚动:高亮项在弹窗可视区上方/下方时返回应滚到的
 * scrollTop(上方对齐项顶、下方对齐项底),已在可视区内则原样返回。
 * 纯函数,便于单元测试。
 */
export function listboxScrollTop(item: {
  readonly itemTop: number;
  readonly itemHeight: number;
  readonly listScrollTop: number;
  readonly listClientHeight: number;
}): number {
  const { itemTop, itemHeight, listScrollTop, listClientHeight } = item;
  if (itemTop < listScrollTop) return itemTop;
  if (itemTop + itemHeight > listScrollTop + listClientHeight) {
    return itemTop + itemHeight - listClientHeight;
  }
  return listScrollTop;
}

/**
 * mention 选中后插入输入框的文本:文件 `@path `;文件夹带尾斜杠 `@dir/ `
 * (目录标记,与 TUI pi-tui 的 @dir/ 补全同约定),均以尾空格结束 token。
 */
export function mentionInsertText(path: string, isDir: boolean): string {
  return `@${path}${isDir ? '/' : ''} `;
}

/**
 * submit 路径的统一解析(对齐 TUI resolveSlashCommandInput 语义):整条输入
 * 以 `/name` 开头且 name 命中已知命令/技能 → 返回其名与参数(执行);否则
 * null(按普通消息发送)。仅认行首 token,`x /theme` 不拦截。
 */
export function resolveSlashSubmit(
  text: string,
  knownNames: ReadonlySet<string>,
): { readonly name: string; readonly args: string } | null {
  const m = /^\/([^\s]+)\s*([\s\S]*)$/.exec(text);
  if (m === null) return null;
  const name = m[1] ?? '';
  if (!knownNames.has(name)) return null;
  return { name, args: (m[2] ?? '').trim() };
}
