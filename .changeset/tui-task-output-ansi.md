---
'@byfriends/cli': patch
---

fix(cli): sanitize ANSI/cursor control sequences in background task output viewers

TasksBrowser and TaskOutputViewer rendered captured stdout/stderr as-is. When
a task wrote progress bars that used `\r` or CSI cursor movement (e.g.
`\x1b[A`, `\x1b[2K`) to redraw a line, those sequences reached the terminal and
moved the hardware cursor, overwriting panel borders and causing the frame
corruption seen in task preview/output screens.

Added `sanitizeTerminalOutput()` to strip ANSI escape sequences and destructive
C0 control characters before rendering, and applied it to both preview and
fullscreen task output views. Regression tests verify `\r` and cursor movement
codes are removed while the visible text remains readable and every rendered
line fits within the terminal width.
