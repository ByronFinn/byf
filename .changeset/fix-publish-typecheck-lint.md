---
'@byfriends/agent-core': patch
'@byfriends/cli': patch
---

Fix published type declarations and clear the lint/typecheck/pubcheck gates.

- agent-core: the dts bundler left development-time `#/...` subpath imports
  (e.g. `#/rpc`, `#/config`) untouched in the bundled `.d.mts` chunk. Since
  `src/` is not shipped, consumers could not resolve those specifiers, breaking
  the package's types (attw InternalResolutionError). A post-build step now
  rewrites each leaked import to a self-reference against the chunk that
  inlined the referenced module. Public type surface is unchanged.
- The release validation script (`lint:pkg`) now packs each package with
  `pnpm pack` (which expands `publishConfig`, matching real `pnpm publish`)
  before running attw, instead of `attw --pack` (which uses `npm pack` and
  does not expand `publishConfig`, producing false NoResolution failures).
- Clear all lint errors/warnings and the lone typecheck error across the
  workspace: drop refactor-residue dead code, tidy imports, and resolve
  switch-exhaustiveness findings (real missing cases added; intentional
  fan-out dispatchers suppressed with documented reasons).
