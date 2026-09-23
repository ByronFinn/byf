/**
 * Shared test assertion helpers.
 *
 * These narrow away `T | undefined` for fixture captures (array slots,
 * `mock.calls[i]`, map/array lookups) via an explicit runtime check, so a
 * missing fixture entry fails loudly instead of being silenced with a
 * non-null assertion.
 *
 * Deliberately a byte-for-byte copy of `apps/cli/test/helpers/defined.ts`, and
 * kept in the same `test/helpers/<name>.ts` layout. Two same-named helpers with
 * two contracts is how this pair drifted before PRD-0038 review F5.1: the CLI
 * copy rejected `null` as well as `undefined` and returned `NonNullable<T>`, the
 * agent-core copy rejected only `undefined`, threw a plain `Error`, and returned
 * `T` — so `defined(maybeNull)` typechecked in one package and meant something
 * else in the other. `apps/cli/test/helpers/defined.test.ts` fails if the two
 * files stop matching, so neither copy can be edited alone.
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
