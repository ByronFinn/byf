const TRUE_BOOLEAN_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_BOOLEAN_ENV_VALUES = new Set(['0', 'false', 'no', 'off']);

/** 打印模式后台等待上限默认值(秒)。ADR-0029 / PRD-0023。 */
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
 * 优先级:env(解析后)→ configValue → defaultValue。
 * 与文档一致:环境变量覆盖 `config.toml`。
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
 * 解析正整数环境变量值。空、非数字、非有限或非正值返回 `undefined`,
 * 使解析可以回退(绝不返回 `NaN`,那会破坏 `??` 链)。
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
 * 解析打印模式后台等待上限(秒)。
 * 优先级:`BYF_PRINT_WAIT_CEILING_S` → `background.printWaitCeilingS` → 3600。
 * 始终返回有限的正整数(绝不返回 NaN)。
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
