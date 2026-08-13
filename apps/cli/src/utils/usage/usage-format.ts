/**
 * `/usage` 斜杠命令的格式化辅助。
 *
 * 保持纯函数 + 无 ANSI,使单元测试简单;斜杠命令之后自行着色。
 */

export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

/**
 * 构建 `[███░░░░░░░]` 风格条。返回带 `filled`/`empty` 字形的纯 ASCII
 * 字符串——着色是调用方的责任。
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
 * 把用量比例映射为语义颜色 token——`/usage` 渲染器将其转换为调色板
 * 十六进制值。
 */
export function ratioSeverity(ratio: number): 'ok' | 'warn' | 'danger' {
  if (ratio >= 0.85) return 'danger';
  if (ratio >= 0.5) return 'warn';
  return 'ok';
}

/**
 * 把 RPC / 序列化值强制为安全的非负有限数,默认 0。
 */
export function safeNumber(value: unknown): number {
  return Number.isFinite(value) && (value as number) >= 0 ? (value as number) : 0;
}

/**
 * 计算缓存命中率(0..1)。
 * 公式:inputCacheRead / (inputOther + inputCacheRead + inputCacheCreation)
 * 分母为零时返回 undefined(信号:「无数据」)。
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
 * 把缓存命中率格式化为「87%」式的整数百分比字符串。
 * 对精确 .5 平局使用四舍六入五成双(银行家舍入)。
 * rate 为 undefined 或 ≤ 0 时返回 undefined(信号:「不显示」)。
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
