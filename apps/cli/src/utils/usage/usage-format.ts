/**
 * Formatting helpers for the `/usage` slash command.
 *
 * Kept pure + ANSI-free so they're trivial to unit-test; the slash
 * command itself chalks the colour afterwards.
 */

export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

/**
 * Build a `[███░░░░░░░]` style bar. Returns a plain-ASCII string with
 * `filled`/`empty` glyphs — colouring is the caller's responsibility.
 */
export function renderProgressBar(ratio: number, width = 20, filled = '█', empty = '░'): string {
  const clamped = safeUsageRatio(ratio);
  const filledCount = Math.round(clamped * width);
  return filled.repeat(filledCount) + empty.repeat(Math.max(0, width - filledCount));
}

export function safeUsageRatio(ratio: number): number {
  return Number.isFinite(ratio) ? Math.max(0, Math.min(ratio, 1)) : 0;
}

/**
 * Map a usage ratio to a semantic colour token — the `/usage` renderer
 * translates these into palette hex values.
 */
export function ratioSeverity(ratio: number): 'ok' | 'warn' | 'danger' {
  if (ratio >= 0.85) return 'danger';
  if (ratio >= 0.5) return 'warn';
  return 'ok';
}

/**
 * Coerce RPC/serialized values to a safe non-negative finite number, defaulting to 0.
 */
export function safeNumber(value: unknown): number {
  return Number.isFinite(value) && (value as number) >= 0 ? (value as number) : 0;
}

/**
 * Compute cache hit rate (0..1).
 * Formula: inputCacheRead / (inputOther + inputCacheRead + inputCacheCreation)
 * Returns undefined when denominator is zero (signal: "no data").
 */
export function computeCacheHitRate(
  inputOther: number,
  inputCacheRead: number,
  inputCacheCreation: number,
): number | undefined {
  const denom = inputOther + inputCacheRead + inputCacheCreation;
  if (denom === 0) return undefined;
  return inputCacheRead / denom;
}

/**
 * Format cache hit rate as integer percentage string like "87%".
 * Uses round-half-to-even (banker's rounding) for exact .5 ties.
 * Returns undefined when rate is undefined or ≤ 0 (signal: "don't display").
 */
export function formatCacheHitRate(rate: number | undefined): string | undefined {
  if (rate === undefined || rate <= 0) return undefined;
  const rounded = roundHalfToEven(rate * 100);
  if (rounded === 0) return undefined; // Too small to display as a percentage
  return `${rounded}%`;
}

function roundHalfToEven(n: number): number {
  const floor = Math.floor(n);
  const frac = n - floor;
  if (frac < 0.5) return floor;
  if (frac > 0.5) return floor + 1;
  // frac ≈ 0.5: round to nearest even
  return floor % 2 === 0 ? floor : floor + 1;
}
