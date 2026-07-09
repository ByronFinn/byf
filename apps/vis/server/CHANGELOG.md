# @byfriends/vis-server

## 0.4.0

### Minor Changes

- 034150a: **BREAKING:** 全量切换至 Bun 工具链（0.x minor，非 1.0 major）。

  - 库包仅支持在 Bun 中 import/运行，不再支持 Node 解释执行。
  - CLI 改为 compile 原生二进制分发（GitHub Release + npm 分平台 optionalDependencies）；Node SEA 与旧 npm-global JS（`dist/main.mjs`）路径废弃。
  - 贡献与 CI 仅支持 Bun >=1.3.14；pnpm 不再是官方开发工具链。

  旧 CLI 全局 JS 安装请重装：`npm uninstall -g @byfriends/cli && npm install -g @byfriends/cli`，或 `curl -fsSL https://github.com/ByronFinn/byf/releases/latest/download/install.sh | bash`。

- 451cd50: 发布包 `engines` 仅声明 Bun（`>=1.3.14`），不再声明 Node 支持。请使用 Bun 1.3.14+ 安装与运行库包。

### Patch Changes

- e06dbec: Migrate published package builds from tsdown to `bun build` with a separate declaration pipeline (`tsc` / api-extractor), matching ADR 0028.
- 9235563: 测试门禁切换为 `bun test`；CLI 入口仅在作为进程主模块时自动启动，避免测试导入时拉起 TUI。
- cf167c1: HTTP 服务改为通过 Bun.serve 绑定，移除对 Node 适配器的依赖。
- Updated dependencies [04be685]
- Updated dependencies [7352e83]
- Updated dependencies [367ecc9]
- Updated dependencies [50de09b]
- Updated dependencies [94426ae]
- Updated dependencies [8c54d30]
- Updated dependencies [80f1657]
- Updated dependencies [81b29d1]
- Updated dependencies [4b4be75]
- Updated dependencies [e06dbec]
- Updated dependencies [034150a]
- Updated dependencies [9235563]
- Updated dependencies [451cd50]
- Updated dependencies [27a9eec]
  - @byfriends/agent-core@0.4.0

## 0.3.6

### Patch Changes

- b7fb767: ci(release): standardize the publish pipeline and guard against workspace:/catalog: leaks

  手动 `npm publish` 不会改写 `workspace:`/`catalog:` 协议,会把它们原样发到
  npm registry,导致 npm 用户安装时报 `EUNSUPPORTEDPROTOCOL`。本次统一发布与校验
  流程,从工具链层面杜绝此类回归:

  - 新增 `scripts/check-published-manifest.mjs`:对每个非私有工作区包 `pnpm pack`,
    解压后检查 `dependencies`/`peerDependencies`/`optionalDependencies` 是否残留
    `workspace:` 或 `catalog:`,有即失败。已接入 `pnpm run publish` 流水线和
    `make pubcheck`。
  - `scripts/attw-pkg.mjs` 的包发现逻辑从写死的 `packages/*` 改为遍历全部发布包,
    `@byfriends/cli`、`@byfriends/vis-server` 现在也被类型导出校验覆盖;纯 bin 应用
    (无 exports/main)会被自动跳过。
  - 新增 `.github/workflows/release-npm.yml`:用 changesets/action 的全自动模式,
    合并 Version Packages PR 后自动发布到 npm 并打 tag,衔接到现有的二进制 release
    流程。CI 中同样运行上述预发布校验。
  - 统一 `publishConfig.provenance: false`(agent-core/kosong/kaos/oauth 对齐已有设置)。
  - `@byfriends/cli` 的 `zod` 依赖改用 `catalog:`,与其余包一致。
  - 新增 `docs/agents/releasing.md` 记录标准发布流程、根因说明和紧急手动发布步骤。

  注意:provenance 与 zod 声明方式的改动不改变运行时行为或公共 API,仅统一发布元数据。

- Updated dependencies [fdebd28]
- Updated dependencies [b7fb767]
  - @byfriends/agent-core@0.3.6

## 0.3.5

### Patch Changes

- chore: align to 0.3.5 and adopt MIT license

  These four packages were left at 0.3.4 when cli/sdk/agent-core were
  bumped to 0.3.5, leaving the publishable set out of sync. They also
  carry the MIT relicense from the 0.3.5 cycle but never got a release
  entry. This changeset brings them to 0.3.5 so the whole published
  surface ships one consistent version.

## 0.1.2

### Patch Changes

- Updated dependencies [77387fa]
- Updated dependencies [ef167a8]
- Updated dependencies [8b7b3e2]
  - @byfriends/agent-core@0.3.0

## 0.1.1

### Patch Changes

- fa5a6bd: Codebase cleanup: remove dead code, telemetry, legacy artifacts, and align with ADRs (#58)

  - **Remove telemetry package entirely** — delete `packages/telemetry`, remove all telemetry bootstrap from CLI and SDK, keep minimal `noopTelemetryClient` in agent-core
  - **Remove Kaos SSH orphan** — delete `ssh.ts` and all SSH test files, remove ssh2 dependency
  - **Fix kosong wire types** — use `'openai-completions'` in catalog tests, rename `kimi-*` test files
  - **Remove 16 unused imports** across CLI and kosong
  - **Delete dead code** — unused barrel files, already-deleted components confirmed
  - **Clean up skipped tests** — remove 14 disabled test blocks, fix `managed:byf` fixture references
  - **Re-export OAuth through SDK seam** — CLI no longer imports `@byfriends/oauth` directly (ADR 0006)
  - **Extract vis shared types** — vis-web typechecks independently, no longer imports from vis-server source

- Updated dependencies [0a9bb30]
- Updated dependencies [68987f7]
- Updated dependencies [fa5a6bd]
- Updated dependencies [0a9bb30]
- Updated dependencies [0a9bb30]
- Updated dependencies [1b35310]
- Updated dependencies [0a9bb30]
- Updated dependencies [0a9bb30]
- Updated dependencies [0a9bb30]
- Updated dependencies [1d06a98]
- Updated dependencies [0a9bb30]
  - @byfriends/agent-core@0.2.0

## 0.0.2

### Patch Changes

- Updated dependencies [eb5f4fc]
  - @byfriends/agent-core@0.1.0
