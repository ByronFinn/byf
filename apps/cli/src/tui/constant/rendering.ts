// 使用两单元前导标记的 transcript 行的续行缩进。
export const MESSAGE_INDENT = '  ';

// 应用于 transcript、面板与状态行的外侧左 / 右内边距,使 chrome 左缘与
// 输入框内部(「>」提示符)对齐。编辑器本身保持在列 0——其垂直边框是
// 一切对齐所参照的视觉锚点。
export const CHROME_GUTTER = 1;

// thinking、工具结果与 shell 片段共享的预览上限。
export const RESULT_PREVIEW_LINES = 3;
export const COMMAND_PREVIEW_LINES = 10;

// Circle-halves spinner used for live thinking, MCP loading, and login progress.
export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
export const SPINNER_INTERVAL_MS = 80;

// Laughing-face spinner for activity pane (waiting, tool execution).
export const MOON_SPINNER_FRAMES = ['😀', '😃', '😄', '😁', '😆', '😊', '😉', '🙂', '😌', '😗'];
export const MOON_SPINNER_INTERVAL_MS = 160;
