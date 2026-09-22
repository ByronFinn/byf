/**
 * F5.1 (PRD-0038 review) — `defined()` had two contracts under one name.
 *
 * The CLI copy rejected `null` as well as `undefined`, threw a
 * `FixtureMissingError` and returned `NonNullable<T>`; the agent-core copy
 * rejected only `undefined`, threw a plain `Error` and returned `T`. A test
 * written against one silently meant something else in the other, which is the
 * same failure this whole batch is about: a helper whose type does not describe
 * what it checks.
 *
 * Both halves are pinned here on purpose:
 *   - the behavioural assertions cover the agreed contract;
 *   - the byte-identity check is the cross-package half, which no type import can
 *     express because the two packages must not import each other's test tree.
 *     It reads the sibling file off disk (a filesystem read, not a module import —
 *     `scripts/lib/check-app-layering.mjs` forbids the latter from `apps/**`).
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { defined, FixtureMissingError } from './defined';

const REPO_ROOT = path.resolve(import.meta.dir, '..', '..', '..', '..');

/** The agreed contract, asserted for both kinds of "missing". */
describe('defined() fixture narrowing (F5.1)', () => {
  it('returns the value and narrows away undefined', () => {
    const maybe: string | undefined = 'here';
    const narrowed: string = defined(maybe, 'maybe');
    expect(narrowed).toBe('here');
  });

  it('throws on undefined', () => {
    const maybe: string | undefined = undefined;
    expect(() => defined(maybe, 'capture[0]')).toThrow(FixtureMissingError);
    expect(() => defined(maybe, 'capture[0]')).toThrow(
      'expected fixture to be present: capture[0]',
    );
  });

  it('throws on null too — the half the agent-core copy used to accept', () => {
    const maybe: string | null = null;
    expect(() => defined(maybe, 'leaf')).toThrow(FixtureMissingError);
  });

  it('keeps falsy-but-present values', () => {
    expect(defined(0, 'count')).toBe(0);
    expect(defined('', 'text')).toBe('');
    expect(defined(false, 'flag')).toBe(false);
  });

  it('is a real Error subclass with a stable name', () => {
    const error = new FixtureMissingError('x');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('FixtureMissingError');
  });
});

describe('defined() stays one helper across packages (F5.1)', () => {
  it('the agent-core copy is byte-identical to this one', async () => {
    const here = await readFile(path.join(import.meta.dir, 'defined.ts'), 'utf8');
    const there = await readFile(
      // packages/agent-core/test/helpers/defined.ts — assembled from segments so
      // this stays a path string and not an importable module specifier.
      path.join(REPO_ROOT, 'packages', 'agent-core', 'test', 'helpers', 'defined.ts'),
      'utf8',
    );
    expect(
      there,
      'apps/cli/test/helpers/defined.ts and packages/agent-core/test/helpers/defined.ts ' +
        'have drifted. They are one contract under one name; change both, or collapse ' +
        'them into a shared helper package.',
    ).toBe(here);
  });
});
