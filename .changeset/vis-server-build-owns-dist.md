---
'@byfriends/vis-server': patch
---

fix(vis-server): own the `public/` copy step to fix a build race

`make build` (root `pnpm -r run build`) could leave `apps/vis/server/dist/public/`
empty: the `apps/vis` build chain ran `copy-web-dist.mjs` concurrently with
vis-server's own `tsdown --clean`, and whenever the clean ran after the copy the
SPA assets were wiped. The published tarball — and therefore `byf vis` after a
fresh install — could ship without a web UI.

vis-server is now the single owner of its `dist/`. `copy-web-dist.mjs` runs as
the tail step of vis-server's own `build` (after `tsdown`), and
`@byfriends/vis-web` is declared as a build-time workspace dependency of
vis-server so `pnpm -r` orders the two builds correctly. The redundant `build`
script in `apps/vis/package.json` is removed; `prestart` now uses
`pnpm --filter @byfriends/vis-server... build`.

No source or test changes. ADR-0021 documents the new ownership.
