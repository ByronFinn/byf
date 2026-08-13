import type { Terminal } from '@earendil-works/pi-tui';

import { BEL, ESC, MAX_TERMINAL_NOTIFICATION_MESSAGE_LENGTH, ST } from '#/tui/constant/terminal';
import type { TUIState } from '#/tui/types';

export interface TerminalNotification {
  readonly title: string;
  readonly body?: string;
}

export interface EmitOptions {
  readonly supportsOsc9?: boolean;
  readonly insideTmux?: boolean;
}

export interface BuildOptions {
  readonly supportsOsc9: boolean;
  readonly insideTmux: boolean;
}

export function notifyTerminalOnce(
  state: TUIState,
  key: string,
  notification: TerminalNotification,
): void {
  const { enabled, condition } = state.appState.notifications;
  if (!enabled) return;
  if (state.terminalState.notificationKeys.has(key)) return;
  state.terminalState.notificationKeys.add(key);
  if (condition === 'unfocused' && state.terminalState.focused) return;
  emitTerminalNotification(state.terminal, notification, {
    supportsOsc9: state.terminalState.supportsOsc9,
    insideTmux: state.terminalState.insideTmux,
  });
}

export function emitTerminalNotification(
  terminal: Pick<Terminal, 'write'>,
  notification: TerminalNotification,
  options: EmitOptions = {},
): void {
  const sequences = buildTerminalNotificationSequences(notification, {
    supportsOsc9: options.supportsOsc9 ?? supportsOsc9Notification(),
    insideTmux: options.insideTmux ?? isInsideTmux(),
  });
  for (const sequence of sequences) {
    terminal.write(sequence);
  }
}

export function formatNotification(notification: TerminalNotification): string {
  const title = sanitizeNotificationText(notification.title);
  const body = sanitizeNotificationText(notification.body ?? '');
  const message =
    title.length > 0 && body.length > 0 ? `${title}: ${body}` : title.length > 0 ? title : body;
  return message.slice(0, MAX_TERMINAL_NOTIFICATION_MESSAGE_LENGTH);
}

/**
 * 构建终端通知的 OSC/BEL 字节。
 *
 * - `supportsOsc9 === true`:发出单个 OSC 9 序列——iTerm2、WezTerm、
 *   Kitty、Ghostty 与 Warp 使用的现代桌面通知路径。
 * - `supportsOsc9 === false`:回退为裸 BEL,使不识别 OSC 9 的终端
 *   用户仍能听到系统响铃。
 *
 * 当 `insideTmux === true` 且发出 OSC 9 时,把序列包进 tmux DCS
 * 直通(`ESC P tmux ; <payload> ESC \`),并把负载内的任何 `ESC` 字节
 * 加倍——否则 tmux 会吞掉 OSC。BEL 是单字节,经 tmux 原样透传,
 * 因此回退路径无需包裹。
 */
export function buildTerminalNotificationSequences(
  notification: TerminalNotification,
  options: BuildOptions,
): string[] {
  const message = formatNotification(notification);
  if (message.length === 0) return [];
  if (!options.supportsOsc9) {
    return [BEL];
  }
  const osc9 = `${ESC}]9;${message}${BEL}`;
  if (options.insideTmux) {
    const escaped = osc9.replaceAll(ESC, `${ESC}${ESC}`);
    return [`${ESC}Ptmux;${escaped}${ESC}${ST}`];
  }
  return [osc9];
}

/**
 * OSC 9 桌面通知支持的尽力检测,完全依据已知环境变量驱动。允许列表
 * 刻意短而保守,因为 BEL 处处安全,而向不识别 OSC 9 的终端发送它会
 * 在屏幕上打印转义垃圾。
 */
export function supportsOsc9Notification(env: NodeJS.ProcessEnv = process.env): boolean {
  const termProgram = env['TERM_PROGRAM'] ?? '';
  if (
    termProgram === 'iTerm.app' ||
    termProgram === 'WezTerm' ||
    termProgram === 'ghostty' ||
    termProgram === 'WarpTerminal'
  ) {
    return true;
  }
  const term = env['TERM'] ?? '';
  if (term === 'xterm-kitty' || term === 'xterm-ghostty') return true;
  return false;
}

export function isInsideTmux(env: NodeJS.ProcessEnv = process.env): boolean {
  const tmux = env['TMUX'] ?? '';
  return tmux.length > 0;
}

function sanitizeNotificationText(value: string): string {
  return Array.from(value)
    .map((ch) => (isControlCharacter(ch) ? ' ' : ch))
    .join('')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function isControlCharacter(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (code >= 0x00 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f);
}
