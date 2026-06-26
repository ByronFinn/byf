---
'@byfriends/vis-server': minor
---

feat(vis-server): publish as a public package for CLI consumption

`@byfriends/vis-server` was previously `private` and only runnable from inside
the monorepo. It is now a published package so the `@byfriends/cli` `byf vis`
subcommand can consume it as a runtime dependency (ADR-0021).

- Expose a library entry exporting `startVisServer()` (added in the prior
  refactor) alongside the existing executable entry.
- Include the built SPA assets (`dist/public/`) in the published tarball so the
  server can serve the web UI without a separate Vite dev server.
- Add `exports` / `files` / `publishConfig` (access: public) per the workspace's
  published-package conventions.

First public release. No prior external consumers, so no breaking impact.
