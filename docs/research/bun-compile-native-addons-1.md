# Bun: Compile Native Addons

> **Stack**: bun@unknown  | **Major**: 1  | **Verified**: 2026-07-09  | **Status**: verified

## TL;DR

Bun 1.x 的 `bun build --compile` 可生成嵌入运行时的单文件可执行文件，并**官方支持嵌入 N-API（`.node`）插件**；跨平台用 `--target=bun-<os>-<arch>`。对 `koffi`、`@mariozechner/clipboard` 等依赖：**架构上可行，但是否在本仓库 CLI 路径可用必须靠 spike 实测**（动态加载路径、prebuild 解析、非 N-API/FFI 边界），不能仅凭文档关闭风险。

## Question

在 Bun 1.x 中，用 `bun build --compile` 分发 CLI 时，原生模块（尤其 N-API / 本仓库的 koffi、clipboard）应如何嵌入与验证？

## Approach

阅读官方 Single-file executable（含 Embed N-API Addons、cross-compile、embed assets）、Loaders（`.node`）、Node-API 页面；对照本仓库 SEA 管线与 `allowBuilds: koffi`、依赖 `@mariozechner/clipboard`。本地 Bun 1.3.14；manifest 无 bun → `unknown`。

## Findings

| 选项 | 优势 | 劣势 | 适用场景 |
|---|---|---|---|
| **`bun build --compile` + 直接 `require("./x.node")`** | 官方支持将 `.node` 打进可执行文件；用户零预装运行时 | 必须能静态解析到具体 `.node`；pre-gyp 动态路径易失败 | N-API 插件、路径可静态确定 |
| **运行时 `import`/dlopen 磁盘上的 `.node`** | 不塞进单文件，体积小 | 破坏「单文件零依赖」；分发复杂 | 可选 native、企业内部分发 |
| **`bun:ffi` 替代部分 native** | 官方 FFI，无独立 `.node` | 需改调用面；不适合任意现成 npm native 包 | 自研薄 C ABI |
| **继续 Node SEA + postject** | 现有脚本 | 与 Approach C 目标冲突；Node 版本钉死 | 已否决路径 |
| **跨编译 `--target=bun-darwin-arm64` 等** | 单 CI 机打多平台二进制 | x64 需注意 baseline vs modern（AVX2）；native `.node` 必须是**目标平台**产物 | GitHub Release 矩阵 |

**官方能力摘要**：

- Compile 把入口、依赖与 **Bun 运行时**打进一个二进制；内置 Bun/Node API 可用。
- **Embed N-API Addons**：可把 `.node` 嵌入可执行文件；使用 `@mapbox/node-pre-gyp` 等时必须**直接 require 到 `.node`**，否则可能打不进包。
- 运行时：`.node` 可用 `import`/`require`/`process.dlopen`；Node-API「most extensions work out of the box」。
- Bundler 中 `.node` 走 **file/napi loader**（作为资产，非 JS 内联）。
- 还可嵌入普通文件、`type: "file"`、SQLite `embed: "true"`；`Bun.isStandaloneExecutable` 检测 standalone。
- 生产建议：`--minify --sourcemap`（可选 `--bytecode`）降低启动成本。

**对本仓库阻塞项的含义**：

| 依赖 | 文档层结论 | 仍需 spike |
|---|---|---|
| 任意标准 N-API `.node` | 可嵌入 compile | 目标三元组 + 加载路径 |
| `koffi` | 多为 FFI/动态库风格，**不一定**等价于「单个可 require 的 addon.node」 | 在 Bun runtime 与 compile 产物中加载；是否需旁路 `.dylib`/`.so` |
| `@mariozechner/clipboard` | 平台包 + native | 同上；各平台 optional 解析与 embed |

## Verdict & Rationale

**分发契约应建立在 `bun build --compile` 上，并把 N-API 嵌入当作官方支持的路径；对 koffi/clipboard 保持「文档可行 + spike 判决」两段论。**

1. Executables 文档专设 *Embed N-API Addons*，说明 compile 不是「纯 JS only」。
2. Node-API 页声明多数现有扩展可在 Bun 中加载。
3. 跨平台 `--target` 覆盖 darwin/linux/windows 与 arm64/x64（及 musl），满足 Release 矩阵。

**实施顺序建议**：

1. 最小 CLI 入口 `bun build --compile` smoke（无 native）。
2. 仅加载 clipboard / 仅加载 koffi 的探针，分别在 `bun run` 与 compile 产物上跑。
3. 若 `.node` 路径动态：在打包前解析到具体文件并改为静态 require，或改用官方 embed/file 模式。
4. 矩阵：至少 `bun-darwin-arm64`、`bun-linux-x64`（必要时 baseline）；codesign 另循官方 macOS 指南。
5. Spike 失败 → 升级 PRD 风险（临时策略），**不**静默退回 Node SEA，除非用户改决策。

## Boundary Conditions

- 仅 Bun 1.x compile；`stack@version=unknown`。
- **文档不保证**每一个 npm native 包都能 embed；prebuild 解析、V8 专用 API（非 N-API）、运行时下载 `.node` 都会失败。
- Cross-compile 的 JS/runtime 目标平台 ≠ 自动交叉编译任意 C++ addon：嵌入的 `.node` 必须匹配目标 OS/arch。
- koffi 可能依赖运行时加载系统/自带动态库，超出「embed 一个 .node」模型时需旁路文件或换实现。
- 本记录不替代发布 optionalDependencies 包装策略（PRD Q6）；compile 产物与 npm 平台子包可同源。
- 对 minor/patch 中的 native 兼容性敏感：N-API 完成度与具体包兼容性会随 Bun 小版本变化，**建议在 Boundary 上将本 topic 视为对 minor 敏感**，依赖变更后重跑 spike。

## Sources

**Tier 1 (maintainer-authored, required)**
- [Bun 官方文档: Single-file executable](https://bun.com/docs/bundler/executables) — `--compile`、cross-compile targets、Embed N-API Addons、embed files/SQLite、`Bun.isStandaloneExecutable`
- [Bun 官方文档: Loaders · napi](https://bun.com/docs/bundler/loaders) — `.node` 在 runtime 可 import；bundler 按 file/napi 处理
- [Bun 官方文档: Node-API](https://bun.com/docs/runtime/node-api) — Bun 实现 Node-API；`.node` 的 require/dlopen

**Tier 2 (supplementary only, never sole evidence)**
- [Bun Blog: v1.0.23 — Embed .node with --compile](https://bun.com/blog/bun-v1.0.23) — 功能引入说明（NAPI embed）
- [Bun GitHub Releases: bun-v1.3.14](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14) — 研究时点版本锚点
