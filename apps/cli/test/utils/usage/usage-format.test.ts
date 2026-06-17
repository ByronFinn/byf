import { describe, it, expect } from 'vitest';

import {
  computeCacheHitRate,
  formatCacheHitRate,
  formatTokenCount,
  renderProgressBar,
  ratioSeverity,
  safeUsageRatio,
} from '#/utils/usage/usage-format';

describe('formatTokenCount', () => {
  it('passes small values through unchanged', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(1)).toBe('1');
    expect(formatTokenCount(999)).toBe('999');
  });

  it('rounds integers over 1k to 1 decimal', () => {
    expect(formatTokenCount(1_000)).toBe('1.0k');
    expect(formatTokenCount(1_234)).toBe('1.2k');
    expect(formatTokenCount(9_876)).toBe('9.9k');
  });

  it('switches to M above a million', () => {
    expect(formatTokenCount(1_000_000)).toBe('1.0M');
    expect(formatTokenCount(2_500_000)).toBe('2.5M');
  });

  it('clamps negatives and NaN to 0', () => {
    expect(formatTokenCount(-1)).toBe('0');
    expect(formatTokenCount(Number.NaN)).toBe('0');
    expect(formatTokenCount(Number.POSITIVE_INFINITY)).toBe('0');
  });
});

describe('renderProgressBar', () => {
  it('empty bar at ratio 0', () => {
    expect(renderProgressBar(0, 10)).toBe('░'.repeat(10));
  });
  it('full bar at ratio 1', () => {
    expect(renderProgressBar(1, 10)).toBe('█'.repeat(10));
  });
  it('half bar at ratio 0.5', () => {
    expect(renderProgressBar(0.5, 10)).toBe('█'.repeat(5) + '░'.repeat(5));
  });
  it('clamps ratios outside [0,1]', () => {
    expect(renderProgressBar(-1, 8)).toBe('░'.repeat(8));
    expect(renderProgressBar(2, 8)).toBe('█'.repeat(8));
  });
  it('coerces NaN to 0', () => {
    expect(renderProgressBar(Number.NaN, 6)).toBe('░'.repeat(6));
  });
});

describe('safeUsageRatio', () => {
  it('matches footer context usage clamping semantics', () => {
    expect(safeUsageRatio(Number.NaN)).toBe(0);
    expect(safeUsageRatio(-1)).toBe(0);
    expect(safeUsageRatio(0.427)).toBe(0.427);
    expect(safeUsageRatio(1.5)).toBe(1);
  });
});

describe('computeCacheHitRate', () => {
  it('computes cache hit rate from uncached input and cache reads', () => {
    expect(computeCacheHitRate(500, 8_700, 0)).toBeCloseTo(0.9457, 3);
  });

  it('returns undefined when all inputs are zero (no data)', () => {
    expect(computeCacheHitRate(0, 0, 0)).toBeUndefined();
  });

  it('returns 0 when cache reads are zero but other inputs exist', () => {
    expect(computeCacheHitRate(8000, 0, 2000)).toBe(0);
  });

  it('returns 1.0 when all input is from cache reads', () => {
    expect(computeCacheHitRate(0, 5000, 0)).toBe(1);
  });

  it('includes cache creation in denominator', () => {
    // 5000 / (1000 + 5000 + 4000) = 0.5
    expect(computeCacheHitRate(1000, 5000, 4000)).toBeCloseTo(0.5, 3);
  });
});

describe('formatCacheHitRate', () => {
  it('returns undefined for undefined rate', () => {
    expect(formatCacheHitRate(undefined)).toBeUndefined();
  });

  it('returns undefined for rate <= 0', () => {
    expect(formatCacheHitRate(0)).toBeUndefined();
    expect(formatCacheHitRate(-0.5)).toBeUndefined();
  });

  it('returns undefined when rounded percentage is 0 (too small to display)', () => {
    // 0.5% → banker's rounding → 0% → hidden
    expect(formatCacheHitRate(0.005)).toBeUndefined();
  });

  it('formats as integer percentage string', () => {
    expect(formatCacheHitRate(0.87)).toBe('87%');
    expect(formatCacheHitRate(1)).toBe('100%');
    expect(formatCacheHitRate(0.01)).toBe('1%');
  });

  it('does not include decimal places', () => {
    expect(formatCacheHitRate(0.873)).toBe('87%');
    expect(formatCacheHitRate(0.337)).toBe('34%');
  });

  it('uses banker rounding for .5 ties (rounds to even)', () => {
    // 86.5 → 86 (even), 87.5 → 88 (even)
    expect(formatCacheHitRate(0.865)).toBe('86%');
    expect(formatCacheHitRate(0.875)).toBe('88%');
  });
});

describe('ratioSeverity', () => {
  it('green below 0.5', () => {
    expect(ratioSeverity(0)).toBe('ok');
    expect(ratioSeverity(0.49)).toBe('ok');
  });
  it('yellow in [0.5, 0.85)', () => {
    expect(ratioSeverity(0.5)).toBe('warn');
    expect(ratioSeverity(0.7)).toBe('warn');
    expect(ratioSeverity(0.849)).toBe('warn');
  });
  it('red at or above 0.85', () => {
    expect(ratioSeverity(0.85)).toBe('danger');
    expect(ratioSeverity(1)).toBe('danger');
  });
});
