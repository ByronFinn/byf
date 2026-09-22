/**
 * PRD-0038 review F5.5 — pin the shape of a `*.module.css` default export at the
 * place a reader will understand it.
 *
 * `build/test-surface-globals.d.ts` declares two wildcard module shapes whose
 * order is load-bearing: `*.module.css` (a class map) must precede `*.css` (a
 * string), because two wildcard patterns that both consume the whole candidate
 * name tie on specificity and tsc keeps the first declaration it sees. If that
 * order ever flips, the failure today surfaces as TS7015 on
 * `src/components/inspector/wire/TrajectoryTimeline.tsx:228` / `:366-370` — an
 * unfamiliar line in a component nobody touched, with a message about index
 * types. The three lines below make the same flip fail on this file instead.
 *
 * The assertion is compile-time on purpose. At runtime Bun's CSS loader hands
 * back a string for a `*.module.css` import (Vite hands back the class map, and
 * Vite is what actually builds the app), so a `typeof classes === 'object'`
 * check would be wrong here. What this file checks at runtime is only that the
 * import resolves and the file compiles, which is the part that must not rot.
 */

import { expect, test } from 'bun:test';

import classes from '../src/components/inspector/wire/TrajectoryTimeline.module.css';

// The pin. TS7015 lands on THIS line if the declaration order changes: a class map
// is indexable by a string key (and, with `noUncheckedIndexedAccess`, the answer is
// `string | undefined`). A stylesheet *string* is not, and that is the difference.
const rootClass: string | undefined = classes['root'];

test('module-CSS default export is a class map, not a stylesheet string (F5.5)', () => {
  expect(typeof rootClass).toMatch(/^string|undefined$/);
  // `classes` must be indexable at all: under the flipped order it is a primitive
  // string, and the line above stops compiling before this ever runs.
  expect(classes).toBeDefined();
});
