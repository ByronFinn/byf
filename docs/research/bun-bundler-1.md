# Bun: Bundler

> **Stack**: bun@unknown | **Major**: 1 | **Verified**: 2026-07-09 | **Status**: verified

## TL;DR

Bun 的打包器 API 深受 esbuild 启发，官方基准测试显示比 esbuild 快 1.75 倍。支持 CLI 和 JavaScript API，内置 TypeScript/JSX 转译、代码分割、sourcemap、minify、插件系统。不支持语法降级（no target down-leveling），插件 API 是 esbuild 的子集。适合替代 esbuild 做快速构建，但不适合替代 webpack/Rollup 做复杂的多插件构建。

## Question

在 Bun 1.x 中，打包器（bun build）的最佳实践是什么，与 esbuild/webpack/Rollup 相比有哪些关键差异？

## Approach

阅读 Bun 官方文档的 Bundler 章节（bun.com/docs/bundler）和 esbuild 兼容对照表（bun.com/docs/bundler/esbuild），包括 CLI/JS API、loader、插件、代码分割、sourcemap、minify 等内容。

## Findings

| 选项                                | 优势                                                                  | 劣势                                          | 适用场景                                       |
| ----------------------------------- | --------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| bun build（默认）                   | 极速（比 esbuild 快 1.75x），零配置 TypeScript/JSX，内置 tree-shaking | 不支持语法降级，插件 API 是 esbuild 子集      | 快速构建、Bun/Node 服务端打包、浏览器 ESM 打包 |
| bun build --splitting               | 多入口共享代码提取为 chunk                                            | chunk 文件名默认含 hash，需配置 naming 自定义 | 多页面应用、代码分割场景                       |
| bun build --target node/bun/browser | 按目标环境优化模块解析                                                | 不支持 "neutral" 目标                         | 服务端/浏览器打包                              |
| bun build --format esm/cjs/iife     | 支持 ESM（默认）、CJS、IIFE（实验性）                                 | CJS/IIFE 标记为实验性                         | 库发布（CJS）、浏览器脚本（IIFE）              |
| bun build --compile                 | 生成本地可执行文件（单文件）                                          | 生成的二进制包含 JS 运行时                    | CLI 工具分发、单文件部署                       |

**与 esbuild 的关键差异**：

- **性能**：官方基准测试中比 esbuild 快 1.75 倍
- **语法降级**：Bun 不做语法降级（no target down-leveling），esbuild 支持
- **插件 API**：Bun 实现 `onStart`/`onEnd`/`onResolve`/`onLoad`，不支持 `onDispose`/`resolve`
- **Loader**：Bun 支持 JSON、TOML、YAML、HTML、CSS 等内置 loader；不支持 esbuild 的 `dataurl`/`binary`/`base64`/`copy`/`empty`
- **Tree-shaking**：Bun 默认开启且不可关闭；esbuild 需手动开启
- **可执行文件**：Bun 支持 `--compile` 生成本地二进制；esbuild 不支持

**Bun 内置 loader 支持的文件类型**：

- `.js/.jsx/.ts/.tsx` → 内置转译器
- `.json/.jsonc/.toml/.yaml` → 解析为 JS 对象
- `.txt` → 内联为字符串
- `.html` → 处理引用的资源
- `.css` → 合并为单个 CSS 文件
- `.node/.wasm` → 作为资产处理
- 其他扩展 → 复制到 outdir

## Verdict & Rationale

Bun 打包器适合作为 esbuild 的直接替代品——API 兼容、速度更快、功能覆盖足够。核心优势是速度和零配置，核心限制是不支持语法降级和插件 API 子集。

对于需要快速构建的场景（Bun/Node 服务端、浏览器 ESM），`bun build` 是首选。对于需要复杂插件生态或语法降级的场景（如浏览器兼容性要求严格的库），webpack/Rollup 仍更合适。`--compile` 是 Bun 独有的亮点，适合 CLI 工具分发。

## Boundary Conditions

仅适用于 Bun 1.x。项目未声明 bun 依赖，版本号设为 unknown，跳过过期检查。Bun 不支持语法降级（target 仅控制模块解析规则，不控制语法转换），这意味着输出代码保留了输入代码的 ECMAScript 语法。CJS 和 IIFE 格式标记为实验性。

## Sources

**Tier 1 (maintainer-authored, required)**

- [Bun 官方文档: Bundler](https://bun.com/docs/bundler) — bun build CLI/JS API、loader、插件、代码分割、sourcemap、minify
- [Bun 官方文档: esbuild 兼容对照](https://bun.com/docs/bundler/esbuild) — CLI/JS API/插件 API 与 esbuild 的逐条对照
- [Bun 官方文档: Bundler Loaders](https://bun.com/docs/bundler/loaders) — 内置 loader 支持的文件类型

**Tier 2 (supplementary only, never sole evidence)**

- [Bun 官方博客: The Bun Bundler](https://bun.com/blog/bun-bundler) — Bundler 设计理念和功能概述
- [Bun GitHub Releases: v1.3.14](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14) — 最新版本确认
