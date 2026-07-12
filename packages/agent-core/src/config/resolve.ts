const TRUE_BOOLEAN_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_BOOLEAN_ENV_VALUES = new Set(['0', 'false', 'no', 'off']);

/** Default print-mode background wait ceiling (seconds). ADR-0029 / PRD-0023. */
export const DEFAULT_PRINT_WAIT_CEILING_S = 3600;

export const PRINT_WAIT_CEILING_ENV_KEY = 'BYF_PRINT_WAIT_CEILING_S';

export interface ResolveConfigValueInput<T> {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly envKey: string;
  readonly configValue?: T;
  readonly defaultValue: T;
  readonly parseEnv: (value: string | undefined) => T | undefined;
}

/**
 * Precedence: env (parsed) → configValue → defaultValue.
 * Matches docs: environment variables override `config.toml`.
 */
export function resolveConfigValue<T>(input: ResolveConfigValueInput<T>): T {
  return input.parseEnv(input.env?.[input.envKey]) ?? input.configValue ?? input.defaultValue;
}

export function parseBooleanEnv(value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === undefined || normalized.length === 0) return undefined;
  if (TRUE_BOOLEAN_ENV_VALUES.has(normalized)) return true;
  if (FALSE_BOOLEAN_ENV_VALUES.has(normalized)) return false;
  return undefined;
}

/**
 * Parse a positive integer env value. Empty, non-numeric, non-finite, or
 * non-positive values return `undefined` so resolution can fall through
 * (never returns `NaN`, which would break `??` chains).
 */
export function parsePositiveIntEnv(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

/**
 * Resolve print-mode background wait ceiling in seconds.
 * Precedence: `BYF_PRINT_WAIT_CEILING_S` → `background.printWaitCeilingS` → 3600.
 * Always returns a finite positive integer (never NaN).
 */
export function resolvePrintWaitCeilingS(input: {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly configValue?: number;
}): number {
  const configValue =
    input.configValue !== undefined && Number.isFinite(input.configValue) && input.configValue > 0
      ? input.configValue
      : undefined;
  const raw = resolveConfigValue({
    env: input.env,
    envKey: PRINT_WAIT_CEILING_ENV_KEY,
    configValue,
    defaultValue: DEFAULT_PRINT_WAIT_CEILING_S,
    parseEnv: parsePositiveIntEnv,
  });
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_PRINT_WAIT_CEILING_S;
}
