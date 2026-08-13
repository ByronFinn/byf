/**
 * 扩展 pi-tui Editor、带应用级按键绑定的自定义编辑器。
 */

import { Editor, isKeyRelease, matchesKey, Key, type TUI } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import type { ColorPalette } from '#/tui/theme/colors';
import { createEditorTheme } from '#/tui/theme/pi-tui-theme';

// oxlint-disable-next-line no-control-regex -- ESC (\x1b) is required to match ANSI SGR escape sequences
const ANSI_SGR = /\u001B\[[0-9;]*m/g;

// Kitty keyboard protocol CSI-u sequence: ESC [ keycode ; modifier[:eventType] u.
// We intentionally match only the simple two-field form — enough to rewrite
// `ctrl+<LETTER>` with caps_lock into `ctrl+<letter>` without caps_lock.
// oxlint-disable-next-line no-control-regex -- ESC (\x1b) is required to match CSI
const KITTY_CSI_U = /^\u001B\[(\d+);(\d+)((?::\d+)*)u$/;
const SHELL_MODE_PREFIX = /^!\s+/;
// Kitty modifier bit layout: shift=1, alt=2, ctrl=4, super=8, hyper=16,
// meta=32, caps_lock=64, num_lock=128. Reported value is `mask + 1`.
const CAPS_LOCK_BIT = 64;
const CTRL_BIT = 4;
const SHIFT_BIT = 1;

interface AutocompleteInternals {
  cancelAutocomplete(): void;
  readonly autocompleteAbort?: AbortController;
  readonly autocompleteDebounceTimer?: ReturnType<typeof setTimeout>;
}

/**
 * 针对 pi-tui 在 Kitty 键盘协议激活**且** caps_lock 开启时暴露的 bug 的
 * 变通方案。该状态下终端为 ctrl+d 发出例如 `ESC[68;69u`
 * (codepoint=68=`D`,modifier=ctrl|caps_lock)。pi-tui 的
 * `matchesKittySequence` 会把 `caps_lock` 从 *modifier* 中掩掉,但
 * *codepoint* 仍是大写,因此 `matchesKey(data, "ctrl+d")`(期望
 * codepoint=100=`d`)失败,所有 ctrl 快捷键被静默丢弃。
 *
 * 我们在分发前把序列重写回未锁定形式,但仅在按住 ctrl 且未按 shift 时——
 * 即恰好是 `ctrl+<letter>` 情形。纯大写(caps_lock 仅开、无 ctrl)与
 * 显式 ctrl+shift+<letter> 保持原样。
 */
export function normalizeCapsLockedCtrl(data: string): string {
  const m = data.match(KITTY_CSI_U);
  if (m === null) return data;
  const codepoint = Number(m[1]);
  const modifierPlus1 = Number(m[2]);
  const tail = m[3] ?? '';
  if (!Number.isFinite(codepoint) || !Number.isFinite(modifierPlus1)) return data;
  const modifier = modifierPlus1 - 1;
  if ((modifier & CAPS_LOCK_BIT) === 0) return data;
  if ((modifier & CTRL_BIT) === 0) return data;
  if ((modifier & SHIFT_BIT) !== 0) return data;
  if (codepoint < 65 || codepoint > 90) return data;
  const loweredCodepoint = codepoint + 32;
  const strippedModifier = (modifier & ~CAPS_LOCK_BIT) + 1;
  return `\u001B[${String(loweredCodepoint)};${String(strippedModifier)}${tail}u`;
}

/** Convert a visible-char index (ANSI-stripped) back to an index into the raw ANSI-bearing string. */
function mapVisibleIdxToRaw(line: string, visibleIdx: number): number {
  let visibleCount = 0;
  let i = 0;
  const re = new RegExp(ANSI_SGR.source, 'y');
  while (i < line.length && visibleCount < visibleIdx) {
    re.lastIndex = i;
    const m = re.exec(line);
    if (m !== null && m.index === i) {
      i += m[0].length;
    } else {
      visibleCount++;
      i++;
    }
  }
  return i;
}

function stripSgr(s: string): string {
  return s.replace(ANSI_SGR, '');
}

function getNewlineInput(data: string): string | undefined {
  if (data === '\n' || data === '\u001B\r' || data === '\u001B[13;2~') return data;
  if (matchesKey(data, Key.ctrl('j'))) return '\n';
  return undefined;
}

export class CustomEditor extends Editor {
  public onEscape?: () => void;
  public onCtrlD?: () => void;
  public onCtrlC?: () => void;
  public onToggleToolExpand?: () => void;
  // Returns true when a plan card actually handled the toggle. When it
  // returns false (no plan in the transcript) the keystroke falls through
  // to pi-tui's default ctrl+e binding (move cursor to end of line).
  public onTogglePlanExpand?: () => boolean;
  /** Toggle the todo-panel between collapsed (5 items) and expanded (all items). */
  public onToggleTodoExpand?: () => void;
  public onOpenExternalEditor?: () => void;
  public onCtrlS?: () => void;
  public onUndo?: () => void;
  public onInsertNewline?: () => void;
  public onTextPaste?: () => void;
  /**
   * Called when ↑ is pressed in an empty editor. Return `true` to consume
   * the key (e.g. recalled a queued message); return `false` to fall
   * through so pi-tui's built-in history navigation runs.
   */
  public onUpArrowEmpty?: () => boolean;
  public onShiftTab?: () => void;
  /**
   * Called when the user triggers "paste image" (Ctrl-V on Unix,
   * Alt-V on Windows — Ctrl-V is terminal-reserved there). Return
   * `true` to consume the key (image was read and handled); return
   * `false` to let the key fall through to the normal paste path.
   * The callback may be async; pi-tui awaits it before dispatching
   * the next keystroke.
   */
  public onPasteImage?: () => Promise<boolean>;

  /**
   * `colors` is the live `ColorPalette` reference — the host mutates it
   * in place on theme switch (`Object.assign(state.theme.colors, ...)`), so
   * reading `this.colors.<token>` at render time always sees the
   * current theme without any setter plumbing. The `EditorTheme` that
   * pi-tui's `Editor` requires is derived from the same palette, and
   * `paddingX: 2` reserves the two leading columns where `render()`
   * paints the terminal-style `> ` prompt — both are implementation
   * details, not caller knobs.
   */
  constructor(
    tui: TUI,
    private readonly colors: ColorPalette,
  ) {
    // paddingX: 4 reserves column 0 for the left vertical border (│),
    // column 1 as a single space between border and prompt, column 2 for
    // the `>` prompt token, and column 3 as the space between prompt and
    // content. The right side mirrors with 3 padding columns and the right
    // border at the last column.
    super(tui, createEditorTheme(colors), { paddingX: 4 });
  }

  private hasAutocompleteActivity(): boolean {
    const autocomplete = this as unknown as AutocompleteInternals;
    return (
      this.isShowingAutocomplete() ||
      autocomplete.autocompleteAbort !== undefined ||
      autocomplete.autocompleteDebounceTimer !== undefined
    );
  }

  private cancelAutocompleteActivity(): void {
    // pi-tui exposes `isShowingAutocomplete()` but keeps cancellation private.
    // Byf needs Esc to win over app-level cancel while the slash menu request is active.
    (this as unknown as AutocompleteInternals).cancelAutocomplete();
  }

  override render(width: number): string[] {
    const lines = super.render(width);
    if (lines.length < 3) return lines;
    const firstContentIdx = 1;
    const text = this.getText();
    const shellMode = SHELL_MODE_PREFIX.test(text);
    if (!shellMode && text.trimStart().startsWith('/')) {
      // Paint only the FIRST editor content line; multi-line slash commands
      // are not a thing in practice.
      const original = lines[firstContentIdx];
      if (original !== undefined) {
        const highlighted = highlightFirstSlashToken(original, this.colors.primary);
        if (highlighted !== undefined) {
          lines[firstContentIdx] = highlighted;
        }
      }
    }
    const firstContent = lines[firstContentIdx];
    if (firstContent !== undefined) {
      const shellAdjusted = shellMode ? stripShellModePrefix(firstContent) : firstContent;
      const withPrompt = injectPromptSymbol(shellAdjusted, {
        symbol: shellMode ? '$' : '>',
        colorHex: shellMode ? this.colors.success : undefined,
      });
      if (withPrompt !== undefined) {
        lines[firstContentIdx] = withPrompt;
      }
    }
    // `this.borderColor` is pi-tui's per-render paint function. The host may
    // overwrite it (e.g. slash-context highlight via
    // `editor.borderColor = chalk.hex(primary)`), so we route corners and
    // side bars through the same hook to stay in sync.
    return wrapWithSideBorders(lines, (s) => this.borderColor(s));
  }

  override handleInput(data: string): void {
    const normalized = normalizeCapsLockedCtrl(data);
    if (isKeyRelease(normalized)) {
      return;
    }
    // Paste image binding — platform-aware:
    //   Windows terminals reserve Ctrl-V for their own paste handling
    //   (e.g. Windows Terminal's Ctrl+V shortcut), so we listen for
    //   Alt-V there. Everywhere else Ctrl-V pastes. When the host
    //   reports no image available, we fall through to pi-tui's
    //   normal paste path so text from the clipboard still works.
    const pasteKey = process.platform === 'win32' ? 'alt+v' : Key.ctrl('v');
    if (matchesKey(normalized, pasteKey) && this.onPasteImage !== undefined) {
      const handler = this.onPasteImage;
      void handler().then((handled) => {
        if (!handled) {
          this.onTextPaste?.();
          // No image on the clipboard — forward the original keystroke
          // through the base handler so a textual clipboard still works.
          super.handleInput.call(this, normalized);
        }
      });
      return;
    }

    if (matchesKey(normalized, Key.ctrl('d'))) {
      if (this.getText().length === 0) {
        this.onCtrlD?.();
        return;
      }
    }

    if (matchesKey(normalized, Key.ctrl('c'))) {
      this.onCtrlC?.();
      return;
    }

    if (matchesKey(normalized, Key.ctrl('g'))) {
      this.onOpenExternalEditor?.();
      return;
    }

    if (matchesKey(normalized, Key.ctrl('o'))) {
      this.onToggleToolExpand?.();
      return;
    }

    if (matchesKey(normalized, Key.ctrl('t'))) {
      this.onToggleTodoExpand?.();
      return;
    }

    if (matchesKey(normalized, Key.ctrl('e'))) {
      if (this.onTogglePlanExpand?.() === true) return;
      // No plan to toggle — fall through to pi-tui's end-of-line.
    }

    if (matchesKey(normalized, Key.ctrl('s'))) {
      this.onCtrlS?.();
      return;
    }

    if (matchesKey(normalized, 'shift+tab')) {
      this.onShiftTab?.();
      return;
    }

    if (matchesKey(normalized, Key.ctrl('-'))) {
      this.onUndo?.();
    }

    const newlineInput = getNewlineInput(normalized);
    if (newlineInput !== undefined) {
      this.onInsertNewline?.();
      super.handleInput(newlineInput);
      return;
    }

    if (matchesKey(normalized, Key.up)) {
      if (this.getText().length === 0 && this.onUpArrowEmpty) {
        if (this.onUpArrowEmpty()) return;
        // fall through to super so Editor's built-in history navigation runs
      }
    }

    if (matchesKey(normalized, Key.escape)) {
      if (this.hasAutocompleteActivity()) {
        this.cancelAutocompleteActivity();
        return;
      }
      this.onEscape?.();
      return;
    }

    super.handleInput(normalized);
  }
}

/**
 * 返回 `line` 的副本,第一个 `/token` 用 `hex` 着色。
 * `line` 可能已含 SGR 转义(光标反显等);我们经可见索引数学定位 `/`,
 * 使 ANSI 透传得以存活。未找到 token 时返回 `undefined`。
 */
export function highlightFirstSlashToken(line: string, hex: string): string | undefined {
  const visible = stripSgr(line);
  const slashIdx = visible.indexOf('/');
  if (slashIdx < 0) return undefined;
  // Guard: only paint when `/` is the first non-whitespace character
  // on the line (avoids colouring a mid-sentence slash).
  for (let i = 0; i < slashIdx; i++) {
    if (visible[i] !== ' ' && visible[i] !== '\t') return undefined;
  }
  // Token ends at the next whitespace (or the visible end).
  let endVisible = slashIdx + 1;
  while (endVisible < visible.length) {
    const ch = visible[endVisible];
    if (ch === ' ' || ch === '\t') break;
    endVisible++;
  }
  const visibleToken = visible.slice(slashIdx, endVisible);
  if (visibleToken.slice(1).includes('/')) return undefined;
  const rawStart = mapVisibleIdxToRaw(line, slashIdx);
  const rawEnd = mapVisibleIdxToRaw(line, endVisible);
  const before = line.slice(0, rawStart);
  const token = line.slice(rawStart, rawEnd);
  const after = line.slice(rawEnd);
  return before + chalk.hex(hex).bold(token) + after;
}

/**
 * 在首个内容行上叠加终端风格的 `> ` 提示符。
 * 列 0 预留给左侧垂直边框(稍后由 wrapWithSideBorders 叠加);列 1 是
 * 单空格间隙,因此 `>` token 位于列 2,列 3 将其与内容分隔。
 * 依赖编辑器配置为 `paddingX >= 4`,使行以至少四个字面空格开头。
 * 不发出 SGR,使终端的默认前景色渲染该符号。行过短或不以预期内边距
 * 开头时返回 `undefined`。
 */
export function injectPromptSymbol(
  line: string,
  options: { symbol?: '>' | '$'; colorHex?: string } = {},
): string | undefined {
  if (line.length < 4) return undefined;
  for (let i = 0; i < 4; i++) {
    if (line[i] !== ' ') return undefined;
  }
  const symbol = options.symbol ?? '>';
  const prompt = options.colorHex ? chalk.hex(options.colorHex).bold(symbol) : symbol;
  return `  ${prompt} ${line.slice(4)}`;
}

export function stripShellModePrefix(line: string): string {
  if (line.length < 4 || !line.startsWith('    ')) return line;
  const content = line.slice(4);
  const stripped = stripVisiblePrefix(content, '! ');
  if (stripped === null) return line;
  return `    ${stripped}`;
}

function stripVisiblePrefix(input: string, expected: string): string | null {
  let i = 0;
  let matched = 0;
  let preservedAnsi = '';
  while (i < input.length && matched < expected.length) {
    const char = input[i];
    if (char === '\u001B' && input[i + 1] === '[') {
      const ansiEnd = input.indexOf('m', i + 2);
      if (ansiEnd === -1) return null;
      preservedAnsi += input.slice(i, ansiEnd + 1);
      i = ansiEnd + 1;
      continue;
    }
    if (char !== expected[matched]) return null;
    matched += 1;
    i += 1;
  }
  if (matched !== expected.length) return null;
  return preservedAnsi + input.slice(i);
}

/**
 * 后处理 pi-tui 的编辑器输出,在其周围绘制完整边框。
 *
 * pi-tui 只渲染水平顶 / 底边框;我们用 `╭╮╰╯` 角包裹它们,并在每行
 * 外侧列添加垂直 `│` 条。水平边框行(首个可见字符为 `─` 的行,含
 * `── ↑ N more ──` 之类的滚动指示器)会剥离既有 SGR,重绘为单个
 * 盒绘 span。内容行保持内部 SGR 完整;只叠加列 0 与最后一列,且仅当
 * 它们是字面空格时——这保护了最右列是 SGR 标记反显光标的光标溢出情形。
 */
export function wrapWithSideBorders(lines: string[], paint: (s: string) => string): string[] {
  let seenTop = false;
  return lines.map((line) => {
    const plain = stripSgr(line);
    if (plain.length > 0 && plain[0] === '─') {
      const leftCorner = seenTop ? '╰' : '╭';
      const rightCorner = seenTop ? '╯' : '╮';
      seenTop = true;
      if (plain.length === 1) return paint(leftCorner);
      const middle = plain.slice(1, -1);
      return paint(leftCorner + middle + rightCorner);
    }
    if (line.length === 0) return line;
    const firstCh = line[0];
    const lastCh = line.at(-1);
    const head = firstCh === ' ' ? paint('│') : (firstCh ?? '');
    const tail = line.length > 1 && lastCh === ' ' ? paint('│') : (lastCh ?? '');
    if (line.length === 1) return head;
    return head + line.slice(1, -1) + tail;
  });
}
