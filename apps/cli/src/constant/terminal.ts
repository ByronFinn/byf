// 用于构建终端协议消息的 C0 / 控制序列字节。
export const ESC = '\u001B';
export const BEL = '\u0007';
export const ST = '\\';

// CLI 提示使用的 ANSI 光标可见性开关。
export const HIDE_CURSOR = `${ESC}[?25l`;
export const SHOW_CURSOR = `${ESC}[?25h`;
