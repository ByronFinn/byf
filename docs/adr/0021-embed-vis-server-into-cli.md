# 0021 - Ship vis-server to CLI users as a published runtime dependency

Date: 2026-06-25

## Status

Accepted (revised 2026-06-25 — original "bundler inline" approach superseded by
a normal runtime dependency; see Revision)

## Context

BYF ships a session visualization tool (`apps/vis`) for debugging sessions and
replays: a Hono API server (`@byfriends/vis-server`) plus a React/Vite SPA
(`@byfriends/vis-web`). Today it can only be started from inside the monorepo
via npm scripts (`pnpm vis`, `pnpm --filter @byfriends/vis-server start`).

We want a built-in `byf vis` command so that users who install the published
`@byfriends/cli` from npm can launch the visualizer in a browser and point it at
their local sessions.

The constraint that drives this decision: **`apps/vis` is a `private` package
that is not published to npm.** The published `byf` CLI therefore cannot
`import '@byfriends/vis-server'` at runtime — the dependency simply does not
exist on the user's machine. Three families of approaches were considered:

1. Inline the server into the CLI at build time.
2. Spawn `server.mjs` as a child process.
3. Ship a separate `vis` binary/package.

(See Alternatives.)

## Decision

**Publish `@byfriends/vis-server` and consume it from `@byfriends/cli` as a
normal runtime dependency.**

Concretely:

- `@byfriends/vis-server` is changed from `private: true` to a published package
  (`access: public`), with its built web assets (`public/`) included in the
  published tarball. The existing `copy-web-dist.mjs` places `web/dist/**` into
  `server/dist/public/`; it runs as the tail step of vis-server's own `build`
  script, after `tsdown` (see Consequences for why this moved out of the
  `apps/vis` build chain).
- The server's side-effect-only entry (`src/index.ts`) is refactored to expose a
  reusable programmatic API (`startVisServer(...)`) so the CLI can import it.
- `@byfriends/cli` adds `@byfriends/vis-server` as a **runtime dependency** and
  lists it in `tsdown`'s `neverBundle`. The server is therefore **not** inlined
  into `dist/main.mjs`; it is resolved from `node_modules` at runtime, so its
  bundled SPA assets (`dist/public/`) stay co-located with the code that serves
  them. (See "Revision" below for why inlining was abandoned.)
- At runtime `byf vis` dynamically `import('@byfriends/vis-server')`, resolves
  `public/` relative to the installed package, binds one port, and opens a
  browser. One process, one port.

## Revision: external dependency instead of inlining (2026-06-25)

The original decision called for `tsdown` to inline the server into the CLI
bundle. Landing it revealed two gaps:

1. **Half-bundling.** The CLI's `alwaysBundle` regex (`/^@byf\//`) did not match
   `@byfriends/vis-server`, so `tsdown` pulled the server entry into the bundle
   while leaving its internal `import './app'` pointing at workspace `.ts`
   source — the bundle crashed at runtime.
2. **Orphaned static assets.** Even fully bundled, the SPA's `public/` assets
   are not JavaScript and cannot enter a JS bundle. An inlined server would have
   no web UI to serve unless a separate copy step shipped the assets alongside.

Treating `@byfriends/vis-server` as a normal published runtime dependency
resolves both: npm installs it (with its `public/`), the CLI imports it, and the
server's own `resolvePublicDir()` finds the assets next to its code. The cost is
a second package on the install graph, which is acceptable.

## Consequences

### Positive

- A single `npm install -g @byfriends/cli` gives the user the visualizer — no
  separate binary on PATH, no orchestrator script.
- One process, one port: simpler mental model than the dev-mode two-port setup,
  and nothing to clean up beyond the CLI process itself.
- The web assets travel with the server package, so the same artifact works in
  `node server/dist/server.mjs` standalone mode and as a CLI runtime dependency.
- The existing `copy-web-dist.mjs` script is reused unchanged. It now runs as
  the tail step of `@byfriends/vis-server`'s own `build` (after `tsdown`), and
  `@byfriends/vis-web` is declared as a build-time workspace dependency of
  vis-server. This makes vis-server the single owner of its `dist/` and removes
  the `pnpm -r` build race in which the previous `apps/vis` build chain ran
  `copy-web-dist.mjs` concurrently with vis-server's `tsdown clean`.

### Negative

- `@byfriends/vis-server` becomes a published package with a public surface and
  SemVer obligations; the `startVisServer` export is now an API that consumers
  (at minimum, the CLI) depend on.
- The CLI install graph gains a second package (`@byfriends/vis-server`), which
  in turn depends on `@byfriends/agent-core`. Users who never run `byf vis` pay
  this cost anyway.
- `resolvePublicDir()` (which uses `import.meta.dirname/public`) must be made
  injectable, and the CLI resolves `public/` relative to the installed package
  via `require.resolve('@byfriends/vis-server/package.json')`.

## Alternatives Considered

- **Spawn `@byfriends/vis-server/dist/server.mjs` as a child process.** Rejected:
  as a `private` package it is not installed on the user's machine, so there is
  no `server.mjs` to spawn. Would require publishing the package anyway, at
  which point importing it in-process is strictly simpler (no IPC, no port
  negotiation, no orphan-process risk).
- **Ship a separate `vis` binary / published package with its own bin.**
  Rejected: adds a second thing to install and keep on PATH, a separate release
  pipeline, and a second process to manage. `byf vis` as a subcommand of the
  existing binary is a better UX for a tool the user already has.
- **Bundle the server into the CLI at build time (original decision).** Rejected
  during landing: half-bundling crashes and static web assets cannot enter a JS
  bundle. See Revision above.

## References

- PRD-0017 `byf vis` Command (`docs/prd/PRD-0017-byf-vis-command.md`)
- `apps/vis/server/src/index.ts`, `apps/vis/server/src/app.ts`
- `apps/vis/scripts/copy-web-dist.mjs`
- `apps/cli/tsdown.config.ts` (`neverBundle: ['@byfriends/vis-server']`)
