---
'@byfriends/vis-server': patch
---

fix(vis-server): bundle @byfriends/* deps to fix ESM resolution in CLI

`node apps/cli/dist/main.mjs vis` crashed with `ERR_MODULE_NOT_FOUND`
because vis-server's `neverBundle` excluded `@byfriends/agent-core`, leaving
an external import in the compiled `.mjs`. That import resolved to agent-core's
`exports` which point to `.ts` source files (workspace dev mode), and Node
cannot execute TypeScript natively.

Switched from `neverBundle` to `alwaysBundle: [/^@byfriends\//]` so these
internal workspace deps are bundled into vis-server's output. This is correct
because vis-server only imports read-only wire-record utilities from agent-core
(a small, pure code path). Bundle size increased by ~2 kB.
