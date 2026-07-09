# CLI compile pipeline (`bun build --compile`)

Official native binary path for `@byfriends/cli` (PRD-0020 / issue #219).

Replaces **Node SEA** for GitHub Release assets on the **MVP matrix**:

| BYF target     | Bun `--target`     | CI runner       |
| -------------- | ------------------ | --------------- |
| `darwin-arm64` | `bun-darwin-arm64` | `macos-latest`  |
| `linux-x64`    | `bun-linux-x64`    | `ubuntu-latest` |

Other platforms (darwin-x64, linux-arm64, Windows) are **deferred** — not built or claimed by `install.sh` as supported release assets.

## Commands

From `apps/cli` (or via `bun run --filter @byfriends/cli …` from the monorepo root):

```sh
# Official release profile (catalog inject + ad-hoc/real codesign + verify)
bun run build:native:release

# Local compile (faster; same layout)
bun run build:native:compile

# Package zip + sha256 under dist-native/artifacts/
bun run package:native

# Stage binary into apps/cli/npm/<target>/ for optionalDep publish (#220)
bun run package:npm-platforms

# TUI minimal smoke (spike-0020 definition)
bun run test:native:smoke
```

Env:

| Variable                               | Meaning                                                      |
| -------------------------------------- | ------------------------------------------------------------ |
| `BYF_CODE_BUILD_TARGET`                | `darwin-arm64` / `linux-x64` (default: host `platform-arch`) |
| `BYF_CODE_CHANNEL` / `BYF_CODE_COMMIT` | Optional build-info defines                                  |
| `BYF_CODE_BUILT_IN_CATALOG_FILE`       | Catalog JSON; release profile auto-generates if unset        |
| `APPLE_SIGNING_IDENTITY`               | macOS codesign identity (`-` = ad-hoc, default)              |
| `APPLE_KEYCHAIN_PATH`                  | Optional keychain for a real Developer ID                    |

## Artifact layout

```
apps/cli/dist-native/
  bin/<target>/byf          # compiled executable (+ byf.sha256 after sign)
  intermediates/            # catalog JSON and compile entry intermediates
  artifacts/
    byf-<target>.zip
    byf-<target>.zip.sha256
  smoke-home/               # used by smoke.mjs (BYF_CODE_HOME)
```

GitHub Release assets (flat names):

- `byf-darwin-arm64.zip` + `.sha256`
- `byf-linux-x64.zip` + `.sha256`
- `install.sh`

## npm optionalDependencies platform packages (#220)

After compile, stage the binary into the matching platform package:

```sh
bun run package:npm-platforms
# -> apps/cli/npm/<target>/bin/byf  (gitignored)
```

| npm package                   | dir                         |
| ----------------------------- | --------------------------- |
| `@byfriends/cli-darwin-arm64` | `apps/cli/npm/darwin-arm64` |
| `@byfriends/cli-linux-x64`    | `apps/cli/npm/linux-x64`    |

Main package `@byfriends/cli` ships `bin/byf.cjs` (launcher) and lists both as `optionalDependencies`. Versions stay aligned via changesets `fixed` group. Platform packages are `private: true` in the monorepo; `release.yml` clears `private` and publishes after staging the binary.

See [docs/agents/releasing.md](../../../../docs/agents/releasing.md).

## Native modules (MVP)

- **`@mariozechner/clipboard`**: the compile entry statically `require()`s the platform `.node` so Bun embeds it, then sets `NAPI_RS_NATIVE_LIBRARY_PATH` so the napi-rs host package loads that embedded binding.
- **`koffi`**: Windows-only path inside `pi-tui`; never invoked on MVP platforms (spike #210 GO).
- **Standalone detection (Bun 1.3.14)**: `Bun.isStandaloneExecutable` is not present; runtime uses `Bun.main` under `/$bunfs/` (see `src/native/standalone.ts`).

Shared packaging helpers (sign / verify / zip / smoke) live under `scripts/native/` and are used by this compile pipeline. The former Node SEA steps (`postject`, `build:native:sea`, `tsdown.native.config.ts`) were removed in #221.

## Rollback（SEA → compile）

Compile is the only official binary path. If a release is bad:

1. **Git**: revert or forward-fix the compile/npm-platform commits on the release branch; do not reintroduce Node SEA as the supported path.
2. **GitHub Release**: re-tag or publish a new release from the last known-good commit; re-run `release.yml` so `byf-<target>.zip` assets are replaced from that compile.
3. **npm**: `@byfriends/cli` and `@byfriends/cli-*` platform packages are **version-fixed** together. Bump a patch/minor that re-stages known-good binaries via `package:npm-platforms`, then publish main + platforms (see [releasing.md](../../../../docs/agents/releasing.md)). Users who already installed a bad optionalDep should reinstall after the good platform packages are on the registry.
4. **Do not** document or ship SEA rebuilds as the recovery path; recovery is always “last good compile binary + aligned npm versions”.

## Codesign / notarize strategy

See [docs/agents/releasing.md](../../../../docs/agents/releasing.md).
