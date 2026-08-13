/**
 * 把原始 stdin 字节解码为可比较的可打印字符。
 *
 * 当终端(如 VSCode 集成终端)启用 Kitty 键盘协议的 disambiguate 标志时,
 * 普通可打印键以 CSI-u 序列发送:按 `r` 到达 "\x1b[114u",按 `q` 到达
 * "\x1b[113u"。因此在 Kitty 模式终端下,Container `handleInput` 内裸的
 * `data === 'q'` 比较永远不会命中。
 *
 * 规则:
 * - 所有裸字面量可打印字符比较(字母、数字、空格、标点)必须先经过本函数。
 * - 功能键(方向键、Enter、Tab、Esc …)继续使用 `matchesKey(data, Key.*)`;
 *   pi-tui 的 `matchesKey` 已处理 Kitty。
 * - 控制字符(codepoint < 32,如 ctrl-b、ctrl-f)仍可比较原始 `data`——
 *   `decodeKittyPrintable` 会拒绝它们。
 *
 * 本模块的存在本身就是「别忘了解码」的约束:
 * `test/tui/printable-key-guard.test.ts` 扫描 `tui/components/**` 下每个
 * `handleInput`,拒绝裸字面量比较。
 */

import { decodeKittyPrintable } from '@earendil-works/pi-tui';

export function printableChar(data: string): string {
  return decodeKittyPrintable(data) ?? data;
}

/**
 * 当解码后的键是单个可打印字符、可安全追加到文本查询(如搜索框)时为 true。
 * 拒绝 C0 控制字符、DEL 与任何多码点转义序列。空格被接受。
 */
export function isPrintableChar(ch: string): boolean {
  if (ch.length !== 1) return false;
  const code = ch.codePointAt(0)!;
  return code >= 0x20 && code !== 0x7f;
}
