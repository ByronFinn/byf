/**
 * Test helper for the `noUncheckedIndexedAccess` / strict-null cases that come up
 * constantly in assertions: a value we constructed in the test (an array element,
 * a mock's first call argument, an optional field we know is set) whose type still
 * allows `undefined`. This narrows it back to `T` with a real runtime check — if the
 * value is unexpectedly `undefined` the helper throws and the test fails loudly —
 * instead of a compile-only non-null assertion that would silently pass a `undefined`
 * through to the assertions below it.
 */
export function defined<T>(value: T | undefined, hint = 'expected a defined value'): T {
  if (value === undefined) {
    throw new Error(`defined(): ${hint} (got undefined)`);
  }
  return value;
}
