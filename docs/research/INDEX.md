# Research Index

> Entry point for every research record. Query here first; reuse the TL;DR on a hit, start new research only on a miss.
> Status values: verified (validated) | stale (current project major is higher; suggest re-research) | deprecated (abandoned).

## By Stack

### bun

| Topic                              | Major | Version | Verdict                                                    | File                                                                                       | Status   |
| ---------------------------------- | ----- | ------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| package-manager                    | 1     | unknown | 速度领先 npm，isolated 默认，pnpm 可自动迁移               | [bun-package-manager-1.md](bun-package-manager-1.md)                                       | verified |
| test-runner                        | 1     | unknown | Jest 兼容 API，单进程，零配置 TS，启动极快                 | [bun-test-runner-1.md](bun-test-runner-1.md)                                               | verified |
| bundler                            | 1     | unknown | esbuild 兼容，快约 1.75x，无语法降级，插件子集             | [bun-bundler-1.md](bun-bundler-1.md)                                                       | verified |
| runtime                            | 1     | unknown | JSC 引擎，原生 TS/JSX，Node 兼容持续改进                   | [bun-runtime-1.md](bun-runtime-1.md)                                                       | verified |
| monorepo-workspaces-catalog        | 1     | unknown | workspaces+catalog 一等；isolated 默认；可从 pnpm 迁移     | [bun-monorepo-workspaces-catalog-1.md](bun-monorepo-workspaces-catalog-1.md)               | verified |
| publish-workspace-protocol-rewrite | 1     | unknown | pack/publish 内置改写 workspace:/catalog:；pubcheck 仍必做 | [bun-publish-workspace-protocol-rewrite-1.md](bun-publish-workspace-protocol-rewrite-1.md) | verified |
| compile-native-addons              | 1     | unknown | --compile 可嵌 N-API；koffi/clipboard 必须 spike           | [bun-compile-native-addons-1.md](bun-compile-native-addons-1.md)                           | verified |
| test-migration-from-vitest         | 1     | unknown | 唯一 runner 可行；vi 兼容+单进程清障，勿长期双跑           | [bun-test-migration-from-vitest-1.md](bun-test-migration-from-vitest-1.md)                 | verified |

### Spikes (verification records, not versioned topics)

| Spike                                        | Verdict                                                                         | File                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| PRD-0020 compile + koffi/clipboard TUI smoke | **GO** — clipboard `.node` 嵌入；koffi 为 Windows-only 死代码，MVP 两平台无阻塞 | [spike-0020-compile-native-smoke.md](spike-0020-compile-native-smoke.md) |

## By Topic

| Topic                              | Stacks | See                                                                                        |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| package-manager                    | bun@1  | [bun-package-manager-1.md](bun-package-manager-1.md)                                       |
| test-runner                        | bun@1  | [bun-test-runner-1.md](bun-test-runner-1.md)                                               |
| bundler                            | bun@1  | [bun-bundler-1.md](bun-bundler-1.md)                                                       |
| runtime                            | bun@1  | [bun-runtime-1.md](bun-runtime-1.md)                                                       |
| monorepo-workspaces-catalog        | bun@1  | [bun-monorepo-workspaces-catalog-1.md](bun-monorepo-workspaces-catalog-1.md)               |
| publish-workspace-protocol-rewrite | bun@1  | [bun-publish-workspace-protocol-rewrite-1.md](bun-publish-workspace-protocol-rewrite-1.md) |
| compile-native-addons              | bun@1  | [bun-compile-native-addons-1.md](bun-compile-native-addons-1.md)                           |
| test-migration-from-vitest         | bun@1  | [bun-test-migration-from-vitest-1.md](bun-test-migration-from-vitest-1.md)                 |
