# Bun: Runtime

> **Stack**: bun@unknown | **Major**: 1 | **Verified**: 2026-07-09 | **Status**: verified

## TL;DR

Bun 运行时是 Node.js 的替代品，基于 JavaScriptCore（Apple 开发）而非 V8，用 Rust 编写。启动速度比 Node.js 快 4 倍，内存占用更低。原生支持 TypeScript/JSX（无需转译），内置 Web 标准 API（fetch、WebSocket、ReadableStream）。`bun run` 支持脚本执行和自动安装（auto-install），无需先运行 `bun install`。Node.js 兼容性是持续改进中的目标，非 100% 兼容。

## Question

在 Bun 1.x 中，运行时（bun run）的最佳实践是什么，与 Node.js 相比有哪些关键差异？

## Approach

阅读 Bun 官方文档的概览页（bun.com/docs）、自动安装（bun.com/docs/runtime/auto-install）和环境变量（bun.com/docs/runtime/environment-variables）等内容，了解运行时设计目标、模块解析、Node.js 兼容性等。

## Findings

| 选项                    | 优势                                            | 劣势                                                 | 适用场景                      |
| ----------------------- | ----------------------------------------------- | ---------------------------------------------------- | ----------------------------- |
| bun run（默认）         | 极速启动，TypeScript/JSX 原生支持，自动安装依赖 | Node.js 兼容性非 100%，JavaScriptCore 与 V8 行为差异 | CLI 工具、脚本执行、快速原型  |
| bun run --hot           | 热重载，文件变更自动重启                        | 仅开发环境使用                                       | 开发服务器、TUI 应用开发      |
| bun run（auto-install） | 无需 node_modules，按需自动安装并缓存           | IDE 无 IntelliSense，不支持 patch-package            | 独立脚本、Gist 分享、快速原型 |
| bun exec                | 类似 bun run 但语义更明确（执行而非运行脚本）   | 功能与 bun run 重叠                                  | 明确执行单个文件的场景        |
| bun --watch             | 文件变更自动重启                                | 需在脚本外层使用                                     | 开发环境热重载                |

**与 Node.js 的关键差异**：

- **JS 引擎**：JavaScriptCore（Apple/Safari）vs V8（Google/Chrome），启动快 4 倍
- **TypeScript/JSX**：原生支持，无需 ts-node 或 swc/babel 转译
- **Web API**：内置 `fetch`、`WebSocket`、`ReadableStream`（无需 node-fetch 等 polyfill）
- **模块系统**：推荐 ESM，兼容 CommonJS
- **自动安装**：无 node_modules 时自动从 npm 安装到全局缓存
- **Node.js 兼容性**：目标是完全兼容 `process`、`Buffer`、`node:fs`、`node:http` 等，仍在持续改进中

**自动安装行为**：

- 无 node_modules 时触发 Bun 模块解析算法
- 版本解析优先级：bun.lock → package.json → latest
- 缓存位置：`~/.bun/install/cache/${name}@${version}`
- 支持在 import 中直接指定版本：`import { z } from "zod@3.0.0"`

## Verdict & Rationale

Bun 运行时适合作为 Node.js 的快速替代品，尤其在 CLI 工具、脚本执行、开发服务器等场景。核心优势是速度和零配置 TypeScript 支持，核心限制是 Node.js 兼容性仍在改进中。

对于新项目（尤其是 TypeScript CLI 工具），Bun 是合理选择。对于已有 Node.js 项目，需评估 Node.js API 兼容性（查看官方 Node.js compatibility 页面）。自动安装功能适合独立脚本和快速原型，但不适合需要严格依赖管理的生产项目。

## Boundary Conditions

仅适用于 Bun 1.x。项目未声明 bun 依赖，版本号设为 unknown，跳过过期检查。Bun 的 Node.js 兼容性是持续改进中的目标，部分边缘 API 可能不兼容。JavaScriptCore 与 V8 的行为差异可能导致正则表达式、JSON 解析等边缘情况不一致。

## Sources

**Tier 1 (maintainer-authored, required)**

- [Bun 官方文档: Welcome to Bun](https://bun.com/docs) — 运行时设计目标、JavaScriptCore 引擎、TypeScript/JSX 支持、Web API、Node.js 兼容性
- [Bun 官方文档: Auto-install](https://bun.com/docs/runtime/auto-install) — 自动安装机制、版本解析、缓存行为、import 版本指定
- [Bun 官方文档: Environment Variables](https://bun.com/docs/runtime/environment-variables) — 环境变量处理、BUN_OPTIONS

**Tier 2 (supplementary only, never sole evidence)**

- [Bun GitHub Releases: v1.3.14](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14) — 最新版本确认
