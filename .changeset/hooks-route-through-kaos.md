---
'@byfriends/agent-core': minor
'@byfriends/cli': patch
---

refactor(hooks): route hook execution through the Kaos environment (ADR-0006)

`HookEngine` previously spawned hook commands via `node:child_process`
directly, bypassing the `Kaos` execution abstraction. Since hooks run in
the user's project working directory — the exact path that becomes remote
under the planned `SSHKaos` — this violated the ADR-0006 invariant that
agent-core never spawns processes outside of `Kaos`.

Hook execution is now routed through `Kaos.execWithEnv` via a new
`HookExec` interface. `Session` injects the runtime's active `Kaos` +
shell so hooks follow the user's working directory; the engine falls back
to the local `Kaos` when constructed standalone.

- New exports: `HookExec` interface, `createKaosHookExec(kaos, shell)`.
- `HookEngine` ctor gains an optional third `exec?: HookExec` argument
  (backwards compatible — defaults to local Kaos).
- `RunHookOptions` gains an optional `exec?: HookExec` field.
- `runHook` now collects stdout/stderr via stream `end` (not just `data`)
  to correctly drain `KaosProcess` buffered streams for fast-exiting hooks.

Also removes a third inline copy of `computeCacheHitRate` /
`formatCacheHitRate` from `subagent-activity-store.ts` (now imported from
`#/utils/usage/usage-format`, same package — no layering concern).
