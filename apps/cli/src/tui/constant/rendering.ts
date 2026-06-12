// Continuation indent for transcript rows that use a two-cell leading marker.
export const MESSAGE_INDENT = '  ';

// Outer left/right padding applied to the transcript, panels, and the
// statusline so the chrome's left edge lines up with the input box's
// interior (the `>` prompt). The editor itself stays at column 0 — its
// vertical borders are the visual anchor everything else aligns against.
export const CHROME_GUTTER = 1;

// Shared preview caps used by thinking, tool results, and shell snippets.
export const RESULT_PREVIEW_LINES = 3;
export const COMMAND_PREVIEW_LINES = 10;

// Circle-halves spinner used for live thinking, MCP loading, and login progress.
export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
export const SPINNER_INTERVAL_MS = 80;

// Laughing-face spinner for activity pane (waiting, tool execution).
export const MOON_SPINNER_FRAMES = ['😀', '😃', '😄', '😁', '😆', '😊', '😉', '🙂', '😌', '😗'];
export const MOON_SPINNER_INTERVAL_MS = 160;
