/**
 * TUI 组件共用的纯格式化辅助。
 *
 * 保持无 ANSI(不用 chalk),使单元测试简单;着色是调用方的责任。
 */

/**
 * 把字节数格式化为人类可读字符串(B / KB / MB)。
 * KB/MB 统一使用 `.toFixed(1)`。
 *
 * 规范定义。`apps/vis/web/src/components/shared/SizePreview.tsx`
 * duplicates this — keep both in sync.  There is intentionally no shared
 * utility package between the two apps.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 把已用秒数格式化为人类可读字符串(s / m s)。
 * 示例:`30s`、`2m 15s`。
 */
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes)}m ${String(remainder)}s`;
}
