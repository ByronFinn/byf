import { describe, expect, it } from 'vitest';

import { formatBytes } from '#/utils/format';

/**
 * Golden tests for formatBytes.
 *
 * The canonical definition lives in `apps/cli/src/utils/format.ts`.
 * `apps/vis/web/src/components/shared/SizePreview.tsx` intentionally
 * duplicates this exact behaviour — keep both in sync.
 *
 * These values are the contract: every consumer must produce exactly
 * these strings for the given inputs.
 */
describe('formatBytes', () => {
  it('formats bytes (0–1023) with no decimal, space before B', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats KB (1024–1048575) with 1 decimal, space before KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10240)).toBe('10.0 KB');
    expect(formatBytes(1048575)).toBe('1024.0 KB');
  });

  it('formats MB (>= 1048576) with 1 decimal, space before MB', () => {
    expect(formatBytes(1_048_576)).toBe('1.0 MB');
    expect(formatBytes(1_572_864)).toBe('1.5 MB');
    expect(formatBytes(10_485_760)).toBe('10.0 MB');
    expect(formatBytes(1_073_741_824)).toBe('1024.0 MB');
  });

  it('handles zero', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('handles negative values (passes through)', () => {
    // No negative guards — the function trivially passes through
    expect(formatBytes(-1)).toBe('-1 B');
  });
});
