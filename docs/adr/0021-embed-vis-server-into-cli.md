# 0021 - Embed vis-server into the CLI via Package Publish + Bundler Inline

Date: 2026-06-25

## Status

Accepted

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

**Publish `@byfriends/vis-server` and bundle (inline) it into the published
`@byfriends/cli` via the existing `tsdown` build.**

Concretely:

- `@byfriends/vis-server` is changed from `private: true` to a published package
  (`access: public`), with its built web assets (`public/`) included in the
  published tarball (the existing `copy-web-dist.mjs` already places
  `web/dist/**` into `server/dist/public/`).
- The server's side-effect-only entry (`src/index.ts`) is refactored to expose a
  reusable programmatic API (`startVisServer(...)`) so the CLI can import it.
- `@byfriends/cli` adds `@byfriends/vis-server` as a dependency; `tsdown` (which
  already inlines workspace `@byf/*`-style packages) bundles the server code
  into the single `dist/main.mjs` artifact.
- At runtime `byf vis` calls `startVisServer(...)` in-process, locates the
  inlined `public/` assets, binds one port, and opens a browser. One process,
  one port.

## Consequences

### Positive

- A single `npm install -g @byfriends/cli` gives the user the visualizer — no
  second install, no separate binary on PATH, no orchestrator script.
- One process, one port: simpler mental model than the dev-mode two-port setup,
  and nothing to clean up beyond the CLI process itself.
- The web assets travel with the server package, so the same artifact works in
  `node server/dist/server.mjs` standalone mode and inlined into the CLI.
- The existing `copy-web-dist.mjs` mechanism is reused unchanged.

### Negative

- `@byfriends/vis-server` becomes a published package with a public surface and
  SemVer obligations; the `startVisServer` export is now an API that consumers
  (at minimum, the CLI) depend on.
- The CLI bundle grows by the size of the server + inlined web assets.
- `resolvePublicDir()` (which uses `import.meta.dirname/public`) must be made
  injectable, because once inlined into `cli/dist/main.mjs` that relative path no
  longer points at the web assets — the CLI must pass the correct location.
- Two build chains (vis-web → vis-server → CLI) must stay in sync; a stale or
  missing `public/` at CLI build time yields a CLI that serves API but no UI.

## Alternatives Considered

- **Spawn `@byfriends/vis-server/dist/server.mjs` as a child process.** Rejected:
  as a `private` package it is not installed on the user's machine, so there is
  no `server.mjs` to spawn. Would require publishing the package anyway, at
  which point inlining is strictly simpler (no IPC, no port negotiation, no
  orphan-process risk).
- **Ship a separate `vis` binary / published package with its own bin.**
  Rejected: adds a second thing to install and keep on PATH, a separate release
  pipeline, and a second process to manage. `byf vis` as a subcommand of the
  existing binary is a better UX for a tool the user already has.
- **Bundle the web assets directly into the CLI package (without publishing
  vis-server).** Rejected: would duplicate the server source into the CLI,
  breaking the monorepo's package boundaries (CLI is not supposed to own server
  code) and forking the server implementation. Publishing vis-server keeps a
  single source of truth.

## References

- PRD-0017 `byf vis` Command (`docs/prd/PRD-0017-byf-vis-command.md`)
- `apps/vis/server/src/index.ts`, `apps/vis/server/src/app.ts`
- `apps/vis/scripts/copy-web-dist.mjs`
- `apps/cli/tsdown.config.ts` (workspace inlining)
