/**
 * 匹配终端解释为命令而非可打印文本的 ANSI 转义序列。包括 CSI 序列
 * (颜色、光标移动、擦除)、OSC 序列(超链接、窗口标题)与 APC 序列。
 *
 * 刻意保守:任何 ESC 前缀序列都被移除,使流式输出中嵌入的光标定位或
 * 擦除命令无法破坏 TUI 布局。
 */
const ANSI_ESCAPE_RE =
  /\u001B(?:[@-Z\\_-]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\)|_.*?(?:\u0007|\u001B\\)|\^.*?\u001B\\)/g;

/**
 * 在 TUI 中渲染前净化外部文本。
 *
 * 流式子 agent 输出(`assistant.delta`、工具输出、错误文本)可能携带原始
 * C0 控制字符——`\r`(回车)、`\b`(退格)、`\x07`(响铃)、垂直制表 /
 * 换页等。在终端中这些会移动光标或响铃而非渲染——当长输出行含游离 `\r`
 * 时,正是它产生了「每行一个字符」的乱码。本辅助函数把它们替换为可见
 * 占位符,使布局永不因传入内容而损坏。`\t` 展开为空格,列对齐保持可预期。
 *
 * 正则保留 `g` 标志以一趟替换全部控制字符,但只经 `.replace()` 使用
 * (绝不 `.test()`/`.exec()`),因此无需管理 `lastIndex` 状态——
 * 单次调用的 `.replace()` 不会把 `lastIndex` 泄漏给调用方。
 */
const CONTROL_CHAR_RE = /[\u0000-\u0008\u000B\u000C\u000D\u000E-\u001F\u007F]/g;

export function sanitizeForDisplay(text: string): string {
  if (text.length === 0) return text;
  const expanded = text.replaceAll('\t', '  ');
  return expanded.replace(CONTROL_CHAR_RE, '·');
}

/**
 * 在 TUI 帧内渲染前净化终端输出(如后台任务捕获的 stdout/stderr)。
 *
 * 与 {@link sanitizeForDisplay}(为小型内联片段把控制字符保留为可见
 * 占位符)不同,本辅助**剥离全部** ANSI 转义序列,并完全移除破坏性的
 * C0 控制字符(`\r`、`\b`、`\x07` 等)。进度条与实时更新的 CLI 工具
 * 常用 `\r` 或 CSI 光标移动重绘同一行;若这些序列到达 TUI 渲染器,
 * 会移动硬件光标并覆盖面板边框。
 */
export function sanitizeTerminalOutput(text: string): string {
  if (text.length === 0) return text;
  const withoutAnsi = text.replace(ANSI_ESCAPE_RE, '');
  // Preserve newlines for line splitting, drop other C0 controls.
  return withoutAnsi
    .replaceAll('\t', '  ')
    .replaceAll(/[\u0000-\u0008\u000B\u000C\u000D\u000E-\u001F\u007F]/g, '');
}
