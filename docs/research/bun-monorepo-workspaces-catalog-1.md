# Bun: Monorepo Workspaces Catalog

> **Stack**: bun@unknown  | **Major**: 1  | **Verified**: 2026-07-09  | **Status**: verified

## TL;DR

Bun 1.x 可直接承载 pnpm 式 monorepo：`workspaces` + `workspace:` + `catalog:`/`catalogs`，新 monorepo 默认 isolated linker，并提供从 `pnpm-lock.yaml` / `pnpm-workspace.yaml` 的自动迁移。发布侧协议改写见 [bun-publish-workspace-protocol-rewrite-1.md](bun-publish-workspace-protocol-rewrite-1.md)；本记录只定安装与开发期依赖图。

## Question

在 Bun 1.x 中，如何用官方 workspaces + catalog 表达 monorepo 依赖图（含从 pnpm 迁移），以及与 pnpm 的关键差异？

## Approach

阅读官方 Workspaces、Catalogs、Isolated installs、bun install（含 pnpm migration、`--filter`）文档；对照本仓库 `pnpm-workspace.yaml`（`packages` 多 glob、`catalog.zod`、`overrides`、`allowBuilds`）确认映射面。本地 CLI 为 Bun 1.3.14，项目 manifest 未声明 `bun`，故 `stack@version=unknown`。

## Findings

| 选项 | 优势 | 劣势 | 适用场景 |
|---|---|---|---|
| `workspaces: ["packages/*", ...]` | npm 兼容字段；支持完整 glob 与负向排除 | 根包是否声明 dependencies 需约定（指南倾向根包少放 deps） | 任意 monorepo 安装图 |
| `workspace:*` / `workspace:^` / `workspace:~` | 本地包互引，install 时链到源码目录 | 协议仅 monorepo 内有效；发布需改写 | 包间依赖 |
| 根级 / `workspaces` 内 `catalog` + `catalogs` | 一处定版，`catalog:` / `catalog:name` 引用；锁文件记录 catalog | 仅 workspace 内可用 | 跨包统一 zod 等版本 |
| `--linker isolated`（新 monorepo 默认） | 防幽灵依赖；workspace 包直链源码 | 依赖幽灵依赖的旧包可能炸 | 新 monorepo、严格隔离 |
| `--linker hoisted` | 接近 npm 扁平布局，兼容性更好 | 幽灵依赖风险 | 兼容性优先的旧图 |
| `bun install` 自动 pnpm 迁移 | 无 `bun.lock` 时转 lock + workspace/catalog/overrides/patches | 需 pnpm lockfile v7+；无 opt-out | 从 pnpm 迁入 |
| `bun install --filter` / 脚本 `--filter` | 按包名/路径子集安装与跑脚本 | 过滤语义需对齐现有 `pnpm --filter` 习惯 | 大 monorepo 子集任务 |

**配置落点（相对 pnpm）**：

| pnpm | Bun 1.x |
|---|---|
| `pnpm-workspace.yaml` → `packages` | 根 `package.json` → `workspaces`（数组或含 `packages` 的对象） |
| `catalog` / `catalogs` | 同名字段（可在 `workspaces` 内或根级） |
| `workspace:` 协议 | 同名，发布时由 pack/publish 改写 |
| `pnpm.overrides` | 根级 `overrides`（亦支持 Yarn `resolutions`） |
| `allowBuilds` / 生命周期脚本 | `trustedDependencies`（依赖默认不跑 lifecycle；esbuild/sharp 等有优化） |
| `pnpm-lock.yaml` | `bun.lock`（文本锁；旧 `bun.lockb` 可迁移） |

**pnpm 迁移时官方会搬迁**：packages 列表、catalog(s)、overrides、patchedDependencies；`catalog:` 引用保留；要求 workspace 包有 `name`、catalog 引用可解析。

## Verdict & Rationale

**采用 Bun 原生 workspaces + catalog 表达 monorepo**，不必再维护 `pnpm-workspace.yaml` 作为源真相。证据链：

1. Workspaces 与 `workspace:` 协议为官方一等能力，install 对 monorepo 去重/链接。
2. Catalogs 与 pnpm catalog 同构（含默认 catalog 与命名 catalogs），锁文件跟踪 catalog 解析。
3. 新 monorepo 默认 isolated，对齐「防幽灵依赖」目标。
4. 官方 install 文档明确自动从 pnpm lock + workspace 迁移。

对本仓库：把 `packages/*`、`apps/*`、`apps/vis/*` 写入 `workspaces`；`zod: catalog:` 进根 catalog；`workspace:^` 保持；`overrides` 迁到根 `overrides`；`koffi` 等 native 构建权限改用 `trustedDependencies`（或等价 install 配置），并在 spike 中验证。

## Boundary Conditions

- 仅 Bun 1.x；catalog 在 1.2.x 引入并在 1.3 强化 monorepo 体验。
- 项目未声明 bun 依赖 → `unknown`，跳过 stale 主版本比对。
- Catalog 不能用于 monorepo 外；空 catalog 名等同默认 catalog。
- 自动 pnpm 迁移：仅当不存在 `bun.lock`；要求 lockfile v7+；迁移后可删 pnpm 文件。
- 本记录**不**覆盖发布协议改写细节、compile 原生模块、`bun test` 迁移（各有独立记录）。
- `allowBuilds` 与 Bun 安全模型不是 1:1 字段映射，需按包配置 `trustedDependencies`。

## Sources

**Tier 1 (maintainer-authored, required)**
- [Bun 官方文档: Workspaces](https://bun.com/docs/pm/workspaces) — workspaces 结构、`workspace:` 协议、filter 安装、发布时 workspace 改写规则摘要、catalog 交叉引用
- [Bun 官方文档: Catalogs](https://bun.com/docs/pm/catalogs) — `catalog`/`catalogs`、`catalog:` 协议、锁文件、限制、publish/pack 时 catalog 替换
- [Bun 官方文档: bun install](https://bun.com/docs/pm/cli/install) — workspaces、overrides、linker 默认值、`--filter`、pnpm 自动迁移（lock + workspace + catalog + overrides/patches）
- [Bun 官方文档: Isolated installs](https://bun.com/docs/pm/isolated-installs) — monorepo 默认 isolated、workspace 包直链
- [Bun 官方指南: Configuring a monorepo using workspaces](https://bun.com/docs/guides/install/workspaces) — monorepo 根 package.json 约定

**Tier 2 (supplementary only, never sole evidence)**
- [Bun Blog: Bun 1.3](https://bun.com/blog/bun-v1.3) — monorepo catalogs 与 isolated 默认的产品说明
- [Bun GitHub Releases: 以本机 1.3.14 为研究时点](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14) — 版本锚点
