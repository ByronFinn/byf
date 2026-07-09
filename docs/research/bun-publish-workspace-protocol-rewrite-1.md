# Bun: Publish Workspace Protocol Rewrite

> **Stack**: bun@unknown | **Major**: 1 | **Verified**: 2026-07-09 | **Status**: verified

## TL;DR

Bun 1.x 在 **`bun publish` / `bun pm pack` 路径上会内置剥离并解析 `workspace:` 与 `catalog:`**，发布物 manifest 变为普通 semver，不再依赖 monorepo 协议。主路径应优先走官方 pack/publish 的内置改写，再用 `pubcheck` 做不得泄漏协议的守卫；仅当仍走非 Bun pack 工具（或需改写 `publishConfig` 等 Bun 未覆盖字段）时才需要**额外的显式 rewrite 脚本**。

## Question

在 Bun 1.x monorepo 中，发布时如何处理 `workspace:` / `catalog:`，是否还需要自建 prepublish rewrite？

## Approach

对照官方 `bun publish`、Workspaces、Catalogs 文档中关于 pack/publish 的协议替换说明；结合 PRD-0020（Q5：显式 rewrite + pubcheck）判断「官方已覆盖」与「仍需自建」的边界。项目未声明 bun → `stack@version=unknown`。

## Findings

| 选项                                        | 优势                                                                                           | 劣势                                                                                  | 适用场景                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------- |
| **`bun publish` / `bun pm pack` 内置改写**  | 官方一等能力：strip `workspace:` + `catalog:` 并解析版本；支持 dry-run、tag、access、NPM token | 改写仅发生在 Bun pack/publish 路径；pre-built tarball 再 publish 时**不跑** lifecycle | 主发布路径已切到 Bun                    |
| **仅 `pubcheck`（验 manifest 无协议泄漏）** | 不替代改写，但防回归；可对任意 pack 结果扫描                                                   | 不产生正确版本号                                                                      | 任何发布门禁的最后一道                  |
| **显式 prepublish rewrite 脚本**            | 可覆盖 `publishConfig` 展开、多工具 pack、changeset 中间产物                                   | 与 Bun 内置逻辑可能重复；维护成本                                                     | 非 Bun pack、或需改写官方未文档化的字段 |
| **继续 `pnpm publish` / changeset+pnpm**    | 现有流水线熟悉                                                                                 | 与全量 Bun 目标冲突；workspace/catalog 依赖 pnpm 改写                                 | 仅迁移过渡、有明确 deadline             |

**官方改写语义（Tier 1）**：

- `workspace:*` → 工作区包 `package.json` 的当前 version（如 `1.0.1`）
- `workspace:^` → `^1.0.1`；`workspace:~` → `~1.0.1`
- `workspace:1.0.2`（钉死）→ `1.0.2`（优先于包内 version）
- `catalog:` / `catalog:<name>` → catalog 中解析后的 **semver 字符串**（发布物不再依赖 catalog 定义）

**`bun publish` 行为要点**：

- 流程：pack → 剥离 monorepo 协议 → 发布到配置的 registry（`bunfig.toml` / `.npmrc`）
- 可先 `bun pm pack` 再 `bun publish ./package.tgz`；**对预构建 tarball 不执行** `prepublishOnly`/`prepack` 等 lifecycle
- CI：尊重 `NPM_CONFIG_TOKEN`；`--dry-run`、`--tolerate-republish` 可用

## Verdict & Rationale

**发布协议的默认策略应更新为：Bun 内置 rewrite 为主，pubcheck 为硬门禁，显式脚本为补洞而非默认重复实现。**

1. Catalogs 文档明确：`bun publish` / `bun pm pack` 将 `catalog:` 替换为解析后的版本。
2. Workspaces 文档明确：发布时 `workspace:` 按上述规则替换。
3. `bun publish` 文档开篇即将「strips catalog and workspace protocols」列为核心行为。

因此：PRD-0020 中「显式 prepublish rewrite」在**已 100% 使用 Bun pack/publish** 时应降级为：

- **必须**：`pubcheck:manifest`（或等价）断言 tarball/目录中无 `workspace:`/`catalog:`；
- **按需**：仅对 Bun 未覆盖的变换（例如历史 `publishConfig` 展开、多包编排、与 changesets 的衔接）保留脚本；
- **过渡**：pnpm publish 若仍存在，必须保留其改写能力且不得越过首次 major 发版 deadline。

## Boundary Conditions

- 仅 Bun 1.x 的 pack/publish 行为；用 npm/yarn pack 发布 monorepo 包**不会**自动获得同等改写。
- `stack@version=unknown`（项目未声明 bun）。
- 内置改写解决的是 **依赖协议字段**；不自动等于完整「发布安全网」（types 布局、exports、engines、optionalDependencies 平台包等仍需自检）。
- 预构建 tarball 路径：lifecycle 不跑 → 若 rewrite/构建依赖 `prepack`，必须在 pack 前自行完成。
- 与 changesets：`changeset publish` 调用的底层客户端必须是会改写协议的路径，否则仍需显式 rewrite。
- 本记录不覆盖 compile 分发或 optionalDependencies 平台子包（CLI 分发契约另论）。

## Sources

**Tier 1 (maintainer-authored, required)**

- [Bun 官方文档: bun publish](https://bun.com/docs/pm/cli/publish) — pack 时 strip catalog/workspace、registry、dry-run、lifecycle 与预构建 tarball 差异
- [Bun 官方文档: Workspaces](https://bun.com/docs/pm/workspaces) — 发布时 `workspace:` → semver 的替换规则
- [Bun 官方文档: Catalogs · Publishing](https://bun.com/docs/pm/catalogs) — `bun publish` / `bun pm pack` 替换 `catalog:` 为解析版本

**Tier 2 (supplementary only, never sole evidence)**

- [Bun GitHub Releases: bun-v1.3.14](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14) — 研究时点版本锚点
