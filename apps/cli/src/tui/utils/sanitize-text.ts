/**
 * Sanitize external text before rendering it in the TUI.
 *
 * Streamed sub-agent output (`assistant.delta`, tool output, error text) can
 * carry raw C0 control characters — `\r` (carriage return), `\b` (backspace),
 * `\x07` (bell), vertical tab / form feed, etc. In a terminal these move the
 * cursor or beep instead of rendering, which is what produced the
 * "one character per line" garble when a long output line contained a stray
 * `\r`. This helper replaces them with a visible placeholder so the layout
 * never gets corrupted by incoming content. `\t` is expanded to spaces so
 * column alignment stays predictable.
 *
 * The regex keeps the `g` flag to replace ALL control chars in one pass, but
 * is used only via `.replace()` (never `.test()`/`.exec()`), so there is no
 * `lastIndex` state to manage — `.replace()` does not leak `lastIndex` to the
 * caller for a single invocation.
 */
const CONTROL_CHAR_RE = /[\u0000-\u0008\u000B\u000C\u000D\u000E-\u001F\u007F]/g;

export function sanitizeForDisplay(text: string): string {
  if (text.length === 0) return text;
  const expanded = text.replaceAll('\t', '  ');
  return expanded.replace(CONTROL_CHAR_RE, '·');
}
