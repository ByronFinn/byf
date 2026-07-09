# 0028 - 全量 Bun 工具链与分发契约

日期：2026-07-09

## 状态

已接受

## 背景

BYF monorepo 长期以 **Node.js + pnpm** 为开发与发布工具链，CLI 单二进制依赖 **Node SEA**（postject）。这带来：

- 开发依赖 Node 版本钉死（≥24.15.0）与 pnpm 独有协议（`workspace:` / `catalog:`）的发布改写
- 双工具心智（安装用 pnpm、脚本用 node/tsx/vitest）
- SEA 管线与 Node 小版本强耦合

产品上仍需保留：**终端用户零运行时预装的 CLI 分发**，以及 monorepo 内清晰的库/应用分层（ADR 0006）。

PRD-0020 与 `/grill` 收敛了「全量迁 Bun」的边界与三条对外契约，本 ADR 固化其中难逆转部分。

## 决策

1. **开发与 CI 仅 Bun**  
   官方基线 **Bun 1.3.14**（`engines.bun` ≥1.3.14；CI pin 同版本）。有新稳定版时显式 bump。不再以 pnpm/Node 为官方开发路径。

2. **三条契约**（术语见 `CONTEXT.md`）
   - **开发工具链契约**：贡献/CI 仅 Bun
   - **库运行时契约**：`@byfriends/*` 库包仅支持在 Bun 中 import/运行
   - **CLI 分发契约**：终端用户使用 **compile 单二进制**（GitHub Release 与 npm「主包 + 分平台 optionalDependencies」同源），**无需**预装 Bun/Node

3. **分发技术**  
   用 **`bun build --compile`** 取代 Node SEA 主路径。官方 MVP 二进制矩阵：**darwin-arm64 + linux-x64**。compile 切换正式分发前须过 TUI 最小 smoke（koffi/clipboard 等原生路径）；失败则阻塞分发切换，不砍 TUI 换发版。

4. **构建与测试**  
   库包 JS 构建主路径为 **`bun build`**（types 独立管道）。测试唯一 runner 为 **`bun test`**。

5. **发布**  
   优先 **`bun pm pack` / `bun publish` 内置**改写 `workspace:`/`catalog:`，并以 **pubcheck** 为硬门禁；显式脚本仅补 Bun 未覆盖变换。

6. **版本策略**  
   本迁移引入的 breaking 以 **0.x minor 抬升 + CHANGELOG 显著 breaking 说明**发布，**不**要求协调 major 到 1.0。

7. **范围裁剪**  
   docs 并入 monorepo Bun workspace；Nix/flake 标 experimental，不阻塞本决策落地。不重命名 `packages/node-sdk`。

## 结果

### 正面

- 开发、测试、打包、分发工具链统一为 Bun
- CLI 用户仍可零预装运行时；库契约清晰（Bun-only）
- 去掉 SEA/Node 版本钉死与 pnpm 发布唯一路径
- 分层架构（ADR 0006）保持不变

### 负面

- 对 Node 解释执行 CLI/库为 **breaking**（0.x minor + 文案，非 1.0）
- koffi/clipboard × compile 仍依赖 spike；失败会阻塞正式二进制切换
- `bun test` 单进程与 Vitest 差异需按包清障
- 库 `bun build` + 独立 types 替换 tsdown，构建配置重写成本
- 非 MVP 平台（darwin-x64、linux-arm64、Windows 等）官方二进制 deferred

## 备选方案

- **仅迁包管理（pnpm→bun install）**：风险低，但保留 Node/SEA 双心智 — 未选
- **开发全 Bun、分发保留 Node SEA**：降低 compile 风险，工具链不统一 — 未选
- **协调 major 1.0**：semver 更「诚实」，团队选择 0.x minor + 大字 breaking — 未选 major

## 参考

- PRD-0020：`docs/prd/PRD-0020-full-bun-migration.md`
- 父 Issue：#209
- Research：`docs/research/INDEX.md`（bun@1 系列，含 compile-native、publish-rewrite、workspaces-catalog、test-migration 等）
- ADR 0006：Monorepo 分层架构（本决策不改变分层）
