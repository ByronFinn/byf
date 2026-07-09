# Bun: Package Manager

> **Stack**: bun@unknown  | **Major**: 1  | **Verified**: 2026-07-09  | **Status**: verified

## TL;DR

Bun 的包管理器在速度上显著领先 npm/yarn（官方宣称快 30 倍），支持 hoisted 和 isolated 两种安装策略，默认自动安装 peerDependencies，不执行依赖的生命周期脚本（安全优先）。lockfile 支持 pnpm 自动迁移。新项目（v1.3.2+）默认使用 isolated 策略防止幽灵依赖。

## Question

在 Bun 1.x 中，包管理器（bun install）的最佳实践是什么，与 pnpm/npm/yarn 相比有哪些关键差异？

## Approach

阅读 Bun 官方文档的包管理器章节（bun.com/docs/pm/cli/install），包括安装策略、lockfile、生命周期脚本、workspace 支持、pnpm 迁移等内容。对照 GitHub Releases 确认当前版本为 1.3.14。

## Findings

| 选项 | 优势 | 劣势 | 适用场景 |
|---|---|---|---|
| bun install（hoisted） | 速度快，兼容 npm 生态，自动安装 peerDeps | 传统 node_modules 扁平结构，可能有幽灵依赖 | 新项目（非 workspace），需要最大兼容性的场景 |
| bun install --linker isolated | 防止幽灵依赖，严格依赖隔离，类似 pnpm | 部分依赖隐式幽灵依赖的包可能不兼容 | Monorepo/workspace 项目，或从 pnpm 迁移 |
| bun install（自动 pnpm 迁移） | 自动转换 pnpm-lock.yaml → bun.lock，保留 workspace 和 catalog | 仅支持 pnpm lockfile v7+ | 从 pnpm 迁移到 Bun |
| bun ci / --frozen-lockfile | 可复现安装，lockfile 不匹配时报错 | 需要提交 bun.lock | CI/CD 环境 |

**安装策略默认行为（v1.3.2+）**：
- 新 workspace/monorepo：isolated
- 新单包项目：hoisted
- 已有项目（lockfile configVersion=0）：hoisted（向后兼容）

**生命周期脚本安全模型**：
- Bun 默认不执行已安装依赖的 `{pre|post}install` 等脚本（安全考虑）
- 需将包名加入 `package.json` 的 `trustedDependencies` 才执行
- 自动优化流行包（esbuild、sharp）的 postinstall

## Verdict & Rationale

Bun 包管理器适合作为 npm/yarn 的快速替代品，尤其在 monorepo 场景下 isolated 策略默认启用是安全改进。关键差异在于：

1. **安全优先**：不执行依赖的生命周期脚本，通过 `trustedDependencies` 白名单控制
2. **isolated 默认**：新项目默认 isolated 安装策略，防止幽灵依赖
3. **pnpm 迁移**：自动从 pnpm 迁移，包括 workspace、catalog、overrides
4. **速度优势**：官方基准测试显示比 npm 快 30 倍

对于需要严格依赖隔离的项目（如 monorepo），Bun 的 isolated 策略是合理选择。对于需要执行大量 native 依赖生命周期脚本的项目，需手动配置 trustedDependencies。

## Boundary Conditions

仅适用于 Bun 1.x。项目未声明 bun 依赖，版本号设为 unknown，跳过过期检查。Bun 的 Node.js 兼容性仍在持续改进中，部分边缘包的兼容性可能不如 npm/pnpm。

## Sources

**Tier 1 (maintainer-authored, required)**
- [Bun 官方文档: bun install](https://bun.com/docs/pm/cli/install) — bun install CLI 用法、安装策略、生命周期脚本、workspace、pnpm 迁移
- [Bun 官方文档: Package Manager 概览](https://bun.com/package-manager) — 包管理器概述

**Tier 2 (supplementary only, never sole evidence)**
- [Bun GitHub Releases: v1.3.14](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14) — 最新版本确认
