/**
 * Matches ANSI escape sequences that terminals interpret as commands rather
 * than printable text. This includes CSI sequences (colors, cursor movement,
 * erase), OSC sequences (hyperlinks, window titles), and APC sequences.
 *
 * deliberately conservative: any ESC-prefixed sequence is removed so the TUI
 * layout cannot be corrupted by cursor positioning or erase commands embedded
 * in streamed output.
 */
const ANSI_ESCAPE_RE =
  /\u001B(?:[@-Z\\_-]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\)|_.*?(?:\u0007|\u001B\\)|\^.*?\u001B\\)/g;

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

/**
 * Sanitize terminal output (e.g. captured stdout/stderr from a background
 * task) before it is rendered inside a TUI frame.
 *
 * Unlike {@link sanitizeForDisplay}, which keeps control chars visible as
 * placeholders for small inline snippets, this helper strips **all** ANSI
 * escape sequences and removes destructive C0 control characters (`\r`, `\b`,
 * `\x07`, etc.) entirely. Progress bars and live-updating CLI tools commonly
 * use `\r` or CSI cursor movement to redraw the same line; if those sequences
 * reach the TUI renderer they move the hardware cursor and overwrite panel
 * borders.
 */
export function sanitizeTerminalOutput(text: string): string {
  if (text.length === 0) return text;
  const withoutAnsi = text.replace(ANSI_ESCAPE_RE, '');
  // Preserve newlines for line splitting, drop other C0 controls.
  return withoutAnsi
    .replaceAll('\t', '  ')
    .replaceAll(/[\u0000-\u0008\u000B\u000C\u000D\u000E-\u001F\u007F]/g, '');
}
