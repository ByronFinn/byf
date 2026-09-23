/**
 * F3 (PRD-0038 review) — `apps/cli/test/helpers/vitest.d.ts` must not declare
 * more than the runtime provides.
 *
 * The declaration is compile-time only and the runtime is Bun's `vi` plus the
 * shims in `build/test-preload.ts`, so nothing otherwise connects them. The first
 * version of that file declared `vi.unmock`, `vi.advanceTimers` and
 * `vi.getSystemTime`, none of which either layer implements: a test calling one
 * typechecked and then died with "undefined is not a function".
 *
 * Two halves, because each catches what the other cannot:
 *   - the compile-time checks below (list ⊆ declaration, declaration ⊆ list) only
 *     fail through `bun run typecheck:tests` / `bun run gate:typecheck`;
 *   - the runtime loop only fails through `bun test`.
 * Together they pin declaration and availability to each other.
 */

import { vi } from 'bun:test';

import { describe, expect, it } from 'vitest';
import type { Assertion, MockUtils } from 'vitest';

/**
 * The single list: exactly the members `vitest.d.ts` declares on `MockUtils`.
 * `satisfies` rejects a name that is not declared; the `noUndeclaredMembers`
 * check below rejects a declared name that is not listed here.
 */
const DECLARED_VI_MEMBERS = [
  'fn',
  'mocked',
  'mock',
  'hoisted',
  'spyOn',
  'clearAllMocks',
  'resetAllMocks',
  'restoreAllMocks',
  'useFakeTimers',
  'useRealTimers',
  'advanceTimersByTime',
  'advanceTimersByTimeAsync',
  'runAllTimers',
  'runAllTimersAsync',
  'runOnlyPendingTimers',
  'runOnlyPendingTimersAsync',
  'setSystemTime',
  'waitFor',
  'stubGlobal',
  'unstubAllGlobals',
  'stubEnv',
  'unstubAllEnvs',
  'importActual',
  'doMock',
  'resetModules',
] as const satisfies readonly (keyof MockUtils)[];

type UndeclaredMembers = Exclude<keyof MockUtils, (typeof DECLARED_VI_MEMBERS)[number]>;
const noUndeclaredMembers: UndeclaredMembers extends never ? true : false = true;

type Phantom = 'unmock' | 'advanceTimers' | 'getSystemTime';
const phantomsStayDeleted: Phantom extends keyof MockUtils ? false : true = true;

/** Structural identity, so `Assertion<Awaited<T>>` cannot be "close enough". */
type IsExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const resolvesUnwrapsPromise: IsExact<
  Assertion<Promise<number>>['resolves'],
  Assertion<number>
> = true;
const rejectsUnwrapsPromise: IsExact<
  Assertion<Promise<string>>['rejects'],
  Assertion<string>
> = true;
void noUndeclaredMembers;
void phantomsStayDeleted;
void resolvesUnwrapsPromise;
void rejectsUnwrapsPromise;

describe('vitest ambient surface vs the Bun runtime (F3)', () => {
  it('declares nothing but functions — every listed member exists on vi', () => {
    const runtime = vi as unknown as Record<string, unknown>;
    const missing: string[] = [];
    for (const member of DECLARED_VI_MEMBERS) {
      if (typeof runtime[member] !== 'function')
        missing.push(`${member}: ${String(runtime[member])}`);
    }
    expect(missing).toEqual([]);
    expect(DECLARED_VI_MEMBERS.length).toBeGreaterThan(20);
  });

  it('the three phantom members are absent from both layers', () => {
    const runtime = vi as unknown as Record<string, unknown>;
    for (const phantom of ['unmock', 'advanceTimers', 'getSystemTime'] as const) {
      expect(typeof runtime[phantom], `${phantom} must stay undeclared AND unimplemented`).not.toBe(
        'function',
      );
    }
  });
});
