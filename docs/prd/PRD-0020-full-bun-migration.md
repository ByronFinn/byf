# 全量迁移至 Bun

> **Status**: In Progress | **PRD**: PRD-0020 | **Created**: 2026-07-09 | **Last updated**: 2026-07-09
>
> `/story` 已拆分。正式决策见 ADR 0028。父 Issue #209。

## Goal

将 BYF monorepo 从「Node.js + pnpm」工具链**全量**切换到 Bun（包管理、开发运行时、测试/脚本、CI；`bun build --compile` 取代 Node SEA），并明确三条对外契约：

1. **开发工具链契约** — 贡献与 CI 仅 Bun
2. **库运行时契约** — `@byfriends/*` 库包仅支持在 Bun 中 import/运行（不支持 Node 解释执行）
3. **CLI 分发契约** — 终端用户通过 compile 二进制使用（GitHub Release 与 npm 分平台 optionalDependencies），**零运行时预装**

在保持 CLI/TUI、vis 与更新通道可用的前提下统一工具链。

## What I already know

- 用户目标：当前项目**全量转 Bun**，需要可落地的 PRD 与分阶段实施规划。
- **已决策（Q1）**：采用 **Approach C** — 开发 + CI + 运行时/分发全 Bun；单二进制改为 `bun build --compile`，**目标删除 Node SEA 管线**。
- **已决策（Q4）**：库与需解释执行的发布包 **仅保证 Bun**（`engines.bun` 等）；**不再承诺 Node 可运行**。
- **已决策（Q3）**：**直接以 `bun test` 为唯一测试 runner**（不保留 Vitest 双跑过渡）。
- **澄清（npm × compile 二进制）**：`bun build --compile` 产出平台原生可执行文件；可用 npm 分发，用户无需预装 Bun/Node。
- **已决策（Q6）**：CLI npm 包装采用 **A — 主包 + 分平台 optionalDependencies 二进制子包**（esbuild 风格）；与 GitHub Release 同源 compile 产物。
- **已决策（Q5，经 research 精化）**：**`bun publish` / `bun pm pack` 内置**剥离 `workspace:`/`catalog:` 为主路径；**`pubcheck:manifest` 为硬门禁**；显式 rewrite 脚本仅补 Bun 未覆盖变换（如 `publishConfig` 展开、changesets 衔接）。过渡 pnpm publish **须在首次 major 前删除**。见 `docs/research/bun-publish-workspace-protocol-rewrite-1.md`。
- **已决策（grill #3）**：官方二进制 **MVP 矩阵 = darwin-arm64 + linux-x64**（对齐现 `release.yml`）；其余 `SUPPORTED_TARGETS` / install.sh 目标 **deferred**；Windows 不新增 CI。
- **已决策（grill #4）**：官方 Bun = **当前最新稳定版 1.3.14**（2026-07-09 经 [GitHub Releases latest](https://github.com/oven-sh/bun/releases/latest) 确认，`tag bun-v1.3.14`）。`engines.bun`：`>=1.3.14`；CI `bun-version: 1.3.14`（或与该稳定版等价的 pin）。后续有新稳定版时，**显式 bump** 下限/CI pin 并视需要重跑 compile/native spike，不无限浮动无记录。
- **已决策（grill #5）**：**docs 并入 monorepo Bun workspace（D1）**；**Nix/flake 标 experimental/broken until updated（N2）**，不阻塞主迁移完成定义。
- **已决策（grill #6）**：库包构建迁到 **`bun build`（选项 B）**；类型产物另管道（如 `tsc` / api-extractor，沿用 node-sdk 现有 dts 思路）；CLI 分发仍 `bun build --compile`。
- **已决策（grill #7）**：版本 **保持 0.x，抬 minor（如 0.4.0）+ CHANGELOG/README 大字 breaking**（选项 C），**不**做 1.0 协调 major。`byf update` 对旧 Node 全局 JS 安装：检测后提示重装（二进制或新 npm 包装），不强行热更。
- **已决策（grill #9）**：升格 **ADR 0028**（`docs/adr/0028-full-bun-toolchain.md`）记录全量 Bun 工具链与分发契约。
- **包管理现状**：根 `packageManager` 锁定 `pnpm@11.9.0`；`pnpm-workspace.yaml` 含 `packages` 多 glob、`catalog`（如 `zod`）、`overrides`、`allowBuilds`（esbuild / koffi / protobufjs / simple-git-hooks）；`.npmrc` 设 `engine-strict=true`、`install-strategy=shallow`。
- **运行时现状**：根 `engines.node` 与 `.nvmrc` 为 `>=24.15.0` / `24.15.0`；CLI 包 `engines.node` 为 `>=22.19.0`。
- **脚本入口**：几乎所有 `package.json` scripts 通过 `pnpm -r` / `pnpm --filter` / `node` / `tsx` / `vitest` 驱动；Makefile 是 pnpm 的薄封装。
- **构建**：packages + cli + vis-server 用 `tsdown`；vis-web 用 `vite`；CLI 发布产物为 ESM `dist/main.mjs`（shebang `#!/usr/bin/env node`）。
- **测试**：根 `vitest.config.ts` projects 覆盖 `packages/*` 与 `apps/cli`；约 372 个 `*.test.ts`。
- **原生单二进制（待替换）**：`apps/cli/scripts/native/*` 为 Node **SEA** 管线（tsdown CJS bundle → `--experimental-sea-config` blob → postject 注入 → codesign/verify）；强制 Node `>=24.15.0`；原生资产注册表覆盖 `koffi` 与 `@mariozechner/clipboard` 平台包（`native-deps.mjs`）。
- **发布**：`docs/agents/releasing.md` 明确 **必须用 pnpm 发布**——`workspace:` / `catalog:` 需由 pnpm/`changeset publish` 改写；`release-npm.yml` + `release.yml` 均基于 `pnpm/action-setup` + `actions/setup-node@24`。
- **Nix**：`flake.nix` 深度绑定 Node 24 + `pnpmConfigHook`，并注释 SEA 与 minNodeVersion 约束。
- **用户侧已有 Bun 痕迹**：`byf update` 已识别 `bun-global` 安装源（路径启发式 + `bun add -g`）。
- **其它 Node 硬依赖点**（C 路径下需替换或验证兼容）：
  - `@hono/node-server`（`apps/vis/server`）→ 倾向 `Bun.serve` 或 Hono 的 Bun 适配
  - `node:http` OAuth callback server（`agent-core`）→ Bun 兼容层或改写
  - 自定义 raw-text loader（Node `register()` / `--import`）→ Bun preload / 插件 / 构建期内联
  - 大量 `node:*` 用法 → 默认依赖 Bun 的 Node 兼容层，失败点再改
  - `docs/` 独立 VitePress 工作区
- **分层架构（ADR-0006）** 迁移不应破坏依赖方向。
- **无**现有 Bun 主题 ADR；研究记录见 `docs/research/`（INDEX + 8 条 bun@1 记录）。
- 目录名 `packages/node-sdk` 与包名 `@byfriends/sdk` 不在本 PRD 强制重命名范围。

## Assumptions (temporary)

- ~~原生模块假设~~ → **grill #2 已决（策略 A）**：compile 在 TUI 最小 smoke（启动 + 一次无网交互路径；clipboard 可测则测）通过前，**不发**替代 SEA 的正式二进制、不切 npm optionalDep；开发侧 Bun 迁移可并行。默认**不允许**靠砍 koffi/降级 TUI 换发布。不静默改回 Approach B。
- ~~workspaces/catalog~~ → **research 已验证**（`bun-monorepo-workspaces-catalog-1`）：Bun 一等 workspaces + catalog + 自 pnpm 迁移；`allowBuilds` → `trustedDependencies`。
- ~~发布协议仅靠自建 rewrite~~ → **research 精化 Q5**（`bun-publish-workspace-protocol-rewrite-1`）：内置 pack/publish 改写 + pubcheck；脚本补洞。
- ~~compile 对 native 仅猜测~~ → **research**（`bun-compile-native-addons-1`）：官方可嵌 N-API；**koffi/clipboard 仍须 spike**；与 grill #2 策略 A 一致。
- ~~bun test 可行性~~ → **research**（`bun-test-migration-from-vitest-1`）：唯一 runner 可行；`vi` 兼容 + 单进程清障。
- GitHub Release / CLI 二进制用户**不需要**预装 Bun/Node。
- **三条契约（grill #1）**；**spike 策略 A（grill #2）**；**MVP 平台矩阵 2 端（grill #3）**。
- codesign/notarize 经验可复用，脚本需重写；optionalDep 仅发 MVP 有产物的平台。
- **版本（grill #7=C）**：0.x **minor** 抬升 + 大字 breaking；非 major 1.0。
- **Bun 版本（grill #4）**：**1.3.14**；`engines.bun >=1.3.14`；CI pin 1.3.14。
- **库构建（grill #6）**：**bun build** + 独立 types。

## Open Questions

- （无）think Q1–Q6 与 grill #1–#9 均已关闭。正式决策见 **ADR 0028**。

## Requirements

- R1：贡献与文档以 **Bun 为唯一官方开发工具链**；**官方版本 Bun 1.3.14**（`engines.bun`: `>=1.3.14`；CI pin `1.3.14`）。抬升稳定版时同步改 engines/文档/CI。
- R2：`bun install` 可复现安装 monorepo（workspaces、catalog、overrides、`trustedDependencies` 覆盖原 allowBuilds 语义）。
- R3：常用命令经 `bun run` / Makefile 可用：`build` / `typecheck` / `lint` / `fmt` / `test` / `dev:cli` / `vis` / `dev:docs`。
- R4：CI（PR 门禁 + npm 发布 + 二进制 release）以 Bun 为主路径；Node/pnpm 步骤有删除 deadline，不长期双轨。
- R5：发布 manifest **不得**泄漏 `workspace:` / `catalog:`；`pubcheck:manifest` 类守卫保留并适配新 pack 路径。
- R6：**单二进制**由 `bun build --compile` 产出；**官方 MVP 矩阵 = darwin-arm64 + linux-x64**（grill #3）；smoke + 签名策略有文档；`install.sh` 对 MVP 平台可用，其它平台文案标明 deferred 或不提供。
- R7：删除（或归档后删除）Node SEA 管线依赖：`postject`、`--experimental-sea-config`、SEA 专用 Node 版本钉死；`apps/cli/scripts/native/*` 重写或替换为 compile 管线。
- R8：`byf update` 与安装源一致：`native`（compile 二进制）、npm/pnpm/bun global（落到新包装）可升级；**旧 npm-global JS 布局**提示重装（grill #7），不假设 Node 解释执行。
- R9：分层架构与 cli↛agent-core 边界不破坏。
- R10：vis-server 在 Bun 下可启动（`byf vis` 嵌入 + 独立服务入口）；去掉 `@hono/node-server` 硬依赖（改 Bun.serve 或 Hono Bun 适配）；CONTEXT/文档不再写 `node server/dist` 为官方路径。
- R11：落实**三条契约**——开发仅 Bun；库包 `engines`/文档仅 Bun；CLI npm = 主包 + 分平台 optionalDependencies 二进制（与 Release 同源），用户零运行时预装。**移除**「需要 Node.js」作为官方支持表述。
- R12：测试门禁 **仅 `bun test`**；移除 Vitest 官方入口。
- R13（grill #7=C）：changeset 使用 **minor**（0.x 线，如 0.3.x→0.4.0），**不**写 major；CHANGELOG/README/**release notes 显著标明 breaking**（库 Bun-only、CLI 二进制包装、Node 解释路径废弃）。`byf update`：旧 npm-global JS 路径提示重装。
- R14（Q5 精化）：publish 主路径为 **`bun pm pack` / `bun publish`（内置协议改写）**；**pubcheck** 断言无 `workspace:`/`catalog:`；显式 rewrite **仅**覆盖 Bun 未覆盖项（publishConfig、changesets 衔接等）；过渡 pnpm publish 不得越过本 PRD 的 **breaking minor 发版收口**。
- R15（grill #2）：**compile 门禁** — TUI 最小 smoke 未过则不得用 compile 取代 SEA 正式分发、不得发 CLI npm 平台二进制；开发轨可并行。
- R16（grill #3）：可选/平台子包与 Release **仅保证 MVP 两平台**；扩展矩阵另开工作，不阻塞本 PRD 完成定义。
- R17（grill #5）：`docs/` 纳入 Bun workspace；`dev:docs` / docs build 经 `bun run` 可用。`flake.nix` 标注 experimental/broken 或等价说明，**不**作为本 PRD 完成门禁；完整 Nix+Bun 另开 follow-up。
- R18（grill #6）：发布库与 vis-server 等包的 **JS 构建主路径为 `bun build`**（非 tsdown）；**types** 由独立步骤生成且 pubcheck/attw 通过；raw-text 等现有构建插件能力在 bun build 下有等价实现（loader/preload/构建期嵌入）。

## Acceptance Criteria

- [ ] 干净环境安装 **Bun >=1.3.14**（无 pnpm 作为主路径）可完成：install → typecheck → lint → test → build →（本地）compile smoke。
- [ ] 库包 `build` 使用 `bun build`（或文档化的 bun build 编排），**不**再以 tsdown 为官方库构建入口；types 与 publint/attw 通过。
- [ ] 锁文件与 workspace 以 Bun 为源；`pnpm-lock.yaml` / pnpm-only 配置已删除或有 deadline 的过渡说明且最终删除。
- [ ] CI 不再以 `pnpm/action-setup` + Node 为发布/测试主路径。
- [ ] Makefile / `AGENTS.md` / `CONTRIBUTING` / `docs/agents/releasing.md` 与 Bun 路径一致。
- [ ] 发布预检通过：rewrite 后 pack 的 manifest **无** `workspace:`/`catalog:`；changeset + Bun 发布路径有自动化与文档；过渡 pnpm job 若存在则有 deadline 注释。
- [ ] GitHub Release 二进制由 compile 管线产出；平台 smoke（至少 `--version` + 关键 native 路径）通过；签名策略有文档。
- [ ] Node SEA 相关脚本与 devDependency（如 `postject`）从主路径移除；无文档仍指向 SEA 作为唯一官方二进制方式。
- [ ] 运行时差异导致的测试失败有清单与关闭条件，门禁最终全绿。
- [ ] 库包 manifest / 文档不再将 Node 标为支持的运行时；`engines`（或等价）指向 Bun。
- [ ] GitHub Release **与** `npm i -g @byfriends/cli`（optionalDependencies 解析到当前平台二进制）均可在**未预装 Bun/Node** 的环境跑通。
- [ ] 测试仅通过 `bun test` 门禁；仓库无 Vitest 作为默认 `test` 脚本。
- [ ] 分平台 CLI 二进制包与主包版本对齐；错误平台/缺失 optionalDep 时有可理解错误信息。
- [ ] 存在可重复的 compile TUI 最小 smoke；该门禁失败时 CI/发布不得宣称「已用 compile 取代 SEA」。

## Definition of Done

- Bun 路径下质量门禁全绿
- Lint / typecheck / CI green
- 贡献、发布、安装文档已更新（含 Node 不再支持的说明）
- SEA → compile 的 rollback 说明已记录
- 难逆转决策已升格 **ADR 0028**
- 版本按 **minor + breaking 说明**（grill #7=C）；不强制 1.0 major

## Out of Scope

- 为迁就 Bun 而**无必要**地大规模改写业务 API（能跑通优先；允许为 Bun-only 契约删除纯 Node 特殊路径）
- 继续官方支持在 **Node 上解释执行** CLI JS 入口或库包
- 长期保留 Vitest 与 `bun test` 双门禁
- 重命名 `packages/node-sdk` 或改变 `@byfriends/sdk` 包名
- 用另一前端栈重写 vis-web（Vite/React 可保留）
- 与工具链无关的产品功能
- **长期**维护 Node SEA 与 bun compile 双二进制管线（迁移期允许短暂并行仅验证）
- 为库包再维护一套 Node 专用 dist
- **本 PRD 内完整修复 Nix/flake 为生产级 Bun 支持**（仅标 experimental；follow-up）
- 官方二进制扩到 darwin-x64 / linux-arm64 / Windows（deferred，非 MVP）

## Technical Approach

**已选：Approach C**

1. **包管理**（research）：根 `workspaces` + catalog + overrides；`bun.lock`；isolated linker；`trustedDependencies` 覆盖原 `allowBuilds`（koffi/esbuild 等）；`bun install` 自 pnpm 迁移后删 pnpm 源真相。
2. **开发运行时**：`tsx`/`node` → `bun`；raw-text → preload/内置 loader/构建期嵌入；dev:cli / vis。
3. **测试**（research）：**仅 `bun test`**；`vi` 兼容优先；按包清全局污染与 mock；删 Vitest。
4. **库构建（grill #6=B）**：**`bun build`** 产发布 JS；types 另管道（tsc/api-extractor）；删 tsdown 主路径；raw-text 用 Bun loader/嵌入。
5. **CLI 分发**：`bun build --compile` + N-API embed 路径（research）；MVP 仅 **darwin-arm64 + linux-x64**；Q6=A optionalDep；**R15 门禁**。
6. **vis**：Bun 适配 server；web 仍 Vite。
7. **发布**（research 精化）：**`bun pm pack`/`bun publish` 内置改写** + **pubcheck**；脚本只补 publishConfig/changesets；断 pnpm。
8. **顺序**：spike(native) ‖ install → dev → test → CI → publish 安全网 → compile 管线（过 R15）→ npm 平台包 → 删 SEA → 文档/major。

**原则**：三条契约；开发轨与分发轨可解耦（R15）；pubcheck 不可关；矩阵不膨胀。

## Research References

- 通用工具链（已有）：[bun-package-manager-1](../research/bun-package-manager-1.md)、[bun-runtime-1](../research/bun-runtime-1.md)、[bun-test-runner-1](../research/bun-test-runner-1.md)、[bun-bundler-1](../research/bun-bundler-1.md)
- 迁移专题（2026-07-09 `/research` 补齐，见 [INDEX](../research/INDEX.md)）：
  - [bun-monorepo-workspaces-catalog-1](../research/bun-monorepo-workspaces-catalog-1.md) — workspaces + catalog + pnpm 迁移
  - [bun-publish-workspace-protocol-rewrite-1](../research/bun-publish-workspace-protocol-rewrite-1.md) — 支撑 Q5：`bun publish`/`pm pack` 内置改写；pubcheck 仍必做；显式 rewrite 仅补洞
  - [bun-compile-native-addons-1](../research/bun-compile-native-addons-1.md) — **阻塞级**：`--compile` 可嵌 N-API；koffi/clipboard 必须 PR1 spike
  - [bun-test-migration-from-vitest-1](../research/bun-test-migration-from-vitest-1.md) — 支撑 Q3=2：唯一 `bun test`；`vi` 兼容 + 单进程清障

## Feasible Approaches

**Approach A: 仅包管理器迁移** — 未选。

**Approach B: 开发全量 Bun + 产物/Node SEA 保留** — 未选。

**Approach C: 运行时与分发也全 Bun（含 compile 取代 SEA）** — **已选**

- How it works: 见 Technical Approach。
- Pros: 工具链统一；去掉 SEA/Node 版本钉死；分发与开发同源 runtime。
- Cons: 原生模块与 compile、codesign、npm engines 契约风险高；工期长；更易触发 major。

## Decision (ADR-lite)

**正式记录**: [ADR 0028](../adr/0028-full-bun-toolchain.md)

**Context**: 「全量转 Bun」存在 A/B/C 三档；决定单二进制与工期。

**Decision**:

1. **Approach C** — 开发/CI/分发全 Bun；**`bun build --compile` 取代 Node SEA**；删除 pnpm 与 SEA 主路径。
2. **运行时契约** — **库包**仅 Bun；**CLI** 以 compile 二进制服务终端用户（GitHub + npm）。
3. **测试** — 仅 `bun test`。
4. **CLI npm 包装（Q6=A）** — 主包 + 分平台 optionalDependencies 二进制子包。
5. **发布协议（Q5 精化）** — Bun 内置 pack/publish 协议改写 + pubcheck；显式脚本补洞；pnpm publish 过渡不得越过 breaking minor 发版收口。
6. **平台矩阵（grill #3）** — MVP 仅 darwin-arm64 + linux-x64。
7. **Spike 失败（grill #2）** — 策略 A：阻塞分发切换，不砍 TUI 换发版。
8. **Bun 版本（grill #4）** — **1.3.14**（调查日最新稳定）；`engines.bun >=1.3.14`；CI pin 1.3.14；抬升显式 bump。
9. **docs/Nix（grill #5）** — docs 并入 Bun workspace；Nix 标 experimental，不阻塞完成。
10. **库构建（grill #6）** — `bun build` + 独立 types 管道；非 tsdown。
11. **版本（grill #7）** — 0.x minor + breaking 文案；非协调 major 1.0。

**Consequences**:

- koffi/clipboard 仍 **spike 判决**（research：文档可行≠本仓保证）。
- 发布不必默认自建完整 rewrite，但 **changeset 必须走会改写的 pack 路径** + pubcheck。
- optionalDep / Release 只保证两平台；install.sh 四平台中未构建者需改文案。
- `trustedDependencies` 取代 allowBuilds 心智。
- `bun test` 单进程清障是主要测试成本。
- **Breaking 行为 + 0.x minor 发版**（非 1.0）；Nix/文档全改。

## Implementation Plan (small PRs)

> Approach C 下的小 PR 序列；每步可独立合并与回滚。

- **PR1 — Spike / 证据**
  - 使用**当时最新稳定版** Bun；workspaces+catalog 迁移可行性
  - **compile + koffi + clipboard** 探针 + **TUI 最小 smoke 定义**
  - 失败 → **策略 A**：阻塞 compile 分发切换；开发轨可继续；不静默改 B
- **PR2 — Workspace 安装切换**：`bunfig.toml`、workspaces、catalog、`bun.lock`；根 scripts 可 `bun run`；双锁过渡策略
- **PR3 — 去 pnpm 脚本编排**：filter/递归；**docs 并入 workspace（D1）**；Makefile / AGENTS / CONTRIBUTING
- **PR4 — Dev 运行时**：tsx→bun；raw-text；`dev:cli` / vis
- **PR4b — 库构建迁 `bun build`（grill #6）**：替换 tsdown 主路径；types 管道；raw-text 等价；publint/attw 绿
- **PR5 — 测试切 `bun test`**：替换根与各包 test 脚本；删 vitest 依赖/配置；修不兼容用例至门禁绿
- **PR6 — CI 主路径 Bun**：PR 门禁；缓存；`bun test`
- **PR7 — 发布安全网**：`bun pm pack`/`publish` + **pubcheck**；必要时补 publishConfig/changesets 脚本；releasing.md
- **PR8 — vis-server Bun 适配**：替换 `@hono/node-server`；`byf vis` smoke
- **PR9 — compile 管线 v1（过 R15）**：MVP 两平台；N-API/koffi/clipboard 按 research 路径；release.yml + 签名
- **PR10 — CLI npm optionalDep（仅 MVP 平台）**：与 Release 同源；update 适配；干净机 `npm i -g` smoke
- **PR11 — 库 engines Bun-only + 删 SEA/Node 开发钉死**：postject、sea、`.nvmrc`/Node CI；**flake 标 experimental（N2）**
- **PR12 — 文档与 minor 发版收口**：README（Release + npm i -g）；库 Bun-only；changeset **minor** + breaking 专节；update 重装提示

## Technical Notes

### 关键路径

- 根：`package.json`、`pnpm-workspace.yaml`、`.npmrc`、`.nvmrc`、`Makefile`、`vitest.config.ts`、`flake.nix`
- CI：`.github/workflows/release.yml`、`release-npm.yml`
- CLI native（待替换）：`apps/cli/scripts/native/**`、`apps/cli/tsdown.native.config.ts`
- 发布：`docs/agents/releasing.md`、`scripts/check-published-manifest.mjs`
- Update：`apps/cli/src/cli/update/{types,source,preflight}.ts`
- Vis：`apps/vis/server`、`apps/vis/web`
- Loader：`build/raw-text-*.mjs`、`build/register-raw-text-loader.mjs`

### grill #8 代码交叉结论（无需用户再选）

| 代码事实                                                       | 目标状态                                                                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `detectNative()` / `InstallSource: 'native'` 面向 **Node SEA** | compile 后仍用 `native` 语义，检测改为 **Bun standalone**（如 `Bun.isStandaloneExecutable` 或等价），见 research |
| `release.yml` 仅 2 平台；`SUPPORTED_TARGETS` 6；`install.sh` 4 | MVP 只保证 2；install.sh/文档对未构建平台标明不可用或 deferred                                                   |
| `postinstall.mjs` shebang `node`                               | 改为 Bun 或由二进制包装替代 postinstall 职责                                                                     |
| `apps/cli` `bin` → `dist/main.mjs`                             | 改为解析 optionalDep 平台二进制（Q6=A）                                                                          |
| `packages/node-sdk` 目录名                                     | **保留**（Out of Scope 重命名）；包名仍 `@byfriends/sdk`                                                         |
| ADR-0006 分层                                                  | 不变；仅工具链与 engines 变                                                                                      |
| vis-server `@hono/node-server`                                 | 替换为 Bun 侧服务（R10）                                                                                         |

### Research 对方案的修正（2026-07-09）

| 原 PRD 表述                        | 修正                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| Q5 默认「自建 prepublish rewrite」 | **内置 bun pack/publish 改写为主**，pubcheck 硬门禁，脚本补洞                  |
| allowBuilds 直接迁移               | 映射为 **`trustedDependencies`**（非 1:1）                                     |
| compile×native 仅风险表            | 官方 **可嵌 N-API**；koffi 可能超「单 .node」模型 → spike 步骤按 research 拆分 |
| bun test 笼统                      | **vi 兼容、单进程、无 **mocks** auto-mock** 为清障重点                         |
| 平台「至少 CI 两平台」             | **明确 MVP 仅两平台**，其余 deferred                                           |

### 风险清单

| 风险                                           | 影响                         | 缓解                                                                            |
| ---------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| koffi/clipboard 在 compile 下不可用            | 无法切换正式分发             | **策略 A**：阻塞 compile 发布/切 SEA；开发轨继续；升级维护者（不砍 TUI 换发版） |
| 发布 manifest 泄漏 protocol                    | npm 安装失败                 | pubcheck 硬门禁 + 集成测试                                                      |
| npm 用户失去 Node 支持                         | breaking；**0.x minor 发版** | grill #7=C；CHANGELOG 大字 + 重装引导                                           |
| bun test 与 Vitest 行为差                      | 大规模失败                   | 直接迁（Q3=2）；按包修/删；差异清单                                             |
| bun build 缺 tsdown 插件/dts                   | 库发布/types 失败            | PR4b：独立 types 管道 + raw-text 等价；attw/publint 门禁                        |
| CLI npm 包装二进制错误（装到 JS 仍要 runtime） | 与「npm 也可装可跑」目标不符 | PR10 验收：干净机无 Bun/Node 仅用 npm 装 CLI 可跑                               |
| codesign/notarize 与 compile 产物              | 发布阻断                     | 复用 04-sign 经验，针对新产物验证                                               |
| Nix 绑定 pnpm/Node                             | Nix 路径断裂                 | **N2**：标 experimental，不阻塞主路径                                           |
| 工期与范围蔓延                                 | 半迁移长期化                 | 小 PR + 明确删除 SEA/pnpm 的 deadline                                           |

### Expansion 收敛（C 下默认）

| 项                               | MVP 内？                             |
| -------------------------------- | ------------------------------------ |
| compile 取代 SEA                 | **是（核心）**                       |
| 删除长期双二进制管线             | **是（终态）**；迁移期短暂并行仅验证 |
| docs 并入 monorepo Bun workspace | **是（D1）**                         |
| Nix 完整可用                     | **否（N2 experimental）**；follow-up |
| SDK Bun-first 示例               | 否（Out of Scope）                   |
| Windows / 非 MVP 平台官方二进制  | deferred                             |
| 双锁并存                         | 仅短过渡，有删除 deadline            |

## Traceability

- **Created by**: `/think`
- **Prototyped by**:
- **Grilled by**: `/grill` (completed 2026-07-09) — 三条契约；spike 策略 A；MVP 两平台；Bun 1.3.14；docs D1 + Nix N2；bun build 库；0.x minor+breaking；代码交叉收口；**ADR 0028**
- **Sliced into**:
  - #210 — [PRD-0020] Spike：compile + koffi/clipboard + TUI 最小 smoke — go/no-go 结论 (HITL) — Done
  - #211 — [PRD-0020] Bun workspace 可安装 — catalog / trustedDependencies / bun.lock (AFK) — Done
  - #212 — [PRD-0020] 根脚本与 docs 并入 workspace — Bun 1.3.14 贡献入口 (AFK, blocked by #211)
  - #213 — [PRD-0020] 开发态 CLI/vis 用 Bun 运行 — 替换 tsx/node 入口 (AFK, blocked by #211)
  - #214 — [PRD-0020] 库包 bun build + 独立 types — 替换 tsdown 主路径 (AFK, blocked by #211)
  - #215 — [PRD-0020] 测试门禁仅 bun test — 清障至全绿 (AFK, blocked by #211)
  - #216 — [PRD-0020] CI 主路径 Bun — install/test/lint/typecheck/build (AFK, blocked by #212 #214 #215)
  - #217 — [PRD-0020] 发布安全网 — bun pack/publish + pubcheck + releasing 文档 (AFK, blocked by #214 #216)
  - #218 — [PRD-0020] vis-server Bun 适配 — 去 node-server + byf vis smoke (AFK, blocked by #213 #214)
  - #219 — [PRD-0020] compile 管线 v1 + release.yml — MVP 两平台过 R15 门禁 (HITL, blocked by #210 #214 #216)
  - #220 — [PRD-0020] CLI npm optionalDep 平台包 — 干净机 npm i -g 可跑 (AFK, blocked by #219)
  - #221 — [PRD-0020] engines Bun-only + 删除 SEA/pnpm 钉死 + flake experimental (AFK, blocked by #219 #220)
  - #222 — [PRD-0020] 文档与 minor 发版收口 — breaking 说明 + 重装引导 (AFK, blocked by #220 #221)
- **Implemented by**: #210（Spike — GO，见 `docs/research/spike-0020-compile-native-smoke.md`）
- **Debugged by**:
- **Arch reviewed by**:
- **Reviewed by**:
- **New terms**: 开发工具链契约、库运行时契约、CLI 分发契约、bun compile 路径、发布协议改写
- **New decisions**: ADR 0028；详见 PRD Decision 节
- **Parent Issue**: #209

## Child Issues

| Issue | Type | Blocked by       |
| ----- | ---- | ---------------- |
| #210  | HITL | —                |
| #211  | AFK  | —                |
| #212  | AFK  | #211             |
| #213  | AFK  | #211             |
| #214  | AFK  | #211             |
| #215  | AFK  | #211             |
| #216  | AFK  | #212, #214, #215 |
| #217  | AFK  | #214, #216       |
| #218  | AFK  | #213, #214       |
| #219  | HITL | #210, #214, #216 |
| #220  | AFK  | #219             |
| #221  | AFK  | #219, #220       |
| #222  | AFK  | #220, #221       |

## Domain Terms

| 术语               | 含义（与 CONTEXT.md 对齐）                 | 备注         |
| ------------------ | ------------------------------------------ | ------------ |
| 开发工具链契约     | 贡献与 CI 仅 Bun                           | grill #1     |
| 库运行时契约       | 库包仅 Bun 解释执行                        | grill #1     |
| CLI 分发契约       | 终端用户用 compile 二进制，零运行时预装    | grill #1     |
| 发布协议改写       | 优先 Bun 内置 pack/publish 改写 + pubcheck | Q5 精化      |
| Node SEA 路径      | 现有 postject/SEA 管线                     | **退役**     |
| bun compile 路径   | `bun build --compile` 单二进制             | **取代 SEA** |
| CLI npm 二进制包装 | 主包 + 分平台 optionalDependencies         | Q6=A         |

## Issue

#209 — 全量迁移至 Bun（PRD-0020）
