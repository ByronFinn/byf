/**
 * Pure formatting helpers used across TUI components.
 *
 * Kept ANSI-free (no chalk) so they're trivial to unit-test; colouring
 * is the caller's responsibility.
 */

/**
 * Format a byte count into a human-readable string (B / KB / MB).
 * Uses consistent `.toFixed(1)` for KB/MB.
 *
 * CANONICAL definition.  `apps/vis/web/src/components/shared/SizePreview.tsx`
 * duplicates this — keep both in sync.  There is intentionally no shared
 * utility package between the two apps.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Format elapsed seconds into a human-readable string (s / m s).
 * Example: `30s`, `2m 15s`.
 */
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes)}m ${String(remainder)}s`;
}
