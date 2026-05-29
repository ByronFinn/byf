---
"@byfriends/cli": patch
---

Remove remaining upstream Kimi Code brand references (postinstall, flake, build scripts)

### @byfriends/cli

- Replaced the postinstall hook (`scripts/postinstall.mjs`) with a deliberate
  no-op. The previous hook was a full Kimi-to-BYF CLI migration script that
  probed PATH for a Python `kimi-cli` installation and renamed/removed its
  shim. BYF has no Python predecessor, so every global install would have run
  irrelevant migration logic and printed "kimi now runs the new version" to the
  user. The script now exits silently; future first-install UX (PATH
  reachability check etc.) can be added without any upstream baggage.
- Deleted the three submodule files (`scripts/postinstall/migrate.mjs`,
  `reach.mjs`, `ui.mjs`) and removed `"scripts/postinstall"` from the `files`
  array in `package.json`.
- `scripts/native/build.mjs`: error message updated from
  "Kimi Code native SEA build requires…" to "BYF native SEA build requires…".
- `flake.nix`: fully rebranded — description, derivation names (`kimi-code` →
  `byf`, `kimi-code-pnpm-deps` → `byf-pnpm-deps`), package paths
  (`apps/kimi-code` → `apps/cli`), binary name (`kimi` → `byf`), env-var name
  (`KIMI_CODE_BUILD_TARGET` → `BYF_CODE_BUILD_TARGET`), meta fields (homepage,
  license `mit` → `unfree`, `mainProgram`), and the `update-pnpm-deps` helper
  script.
