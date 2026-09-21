/**
 * Shared test assertion helpers.
 *
 * These narrow away `T | undefined` for fixture captures (array slots,
 * `mock.calls[i]`, map/array lookups) via an explicit runtime check, so a
 * missing fixture entry fails loudly instead of being silenced with a
 * non-null assertion.
 */

export class FixtureMissingError extends Error {
  constructor(description: string) {
    super(`expected fixture to be present: ${description}`);
    this.name = 'FixtureMissingError';
  }
}

/**
 * Return `value` typed as `T`, throwing when it is `null`/`undefined`.
 * Use for fixture reads that a preceding `toHaveLength`/`toBeDefined`
 * assertion already guarantees at runtime.
 */
export function defined<T>(value: T | undefined, description = 'value'): NonNullable<T> {
  if (value === undefined || value === null) {
    throw new FixtureMissingError(description);
  }
  return value;
}
