---
'@byfriends/agent-core': patch
'@byfriends/kaos': patch
'@byfriends/kosong': patch
'@byfriends/sdk': patch
'@byfriends/oauth': patch
---

chore: enable oxfmt formatting across the monorepo

Installs oxfmt as a root devDependency and adds `pnpm fmt` / `pnpm fmt:check`
scripts, with corresponding `make fmt` / `make fmt-check` targets. Integrates
`oxfmt --write` into lint-staged pre-commit hook and `fmt:check` into the
publish pipeline. Runs initial formatting on all source files.
