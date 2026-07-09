# Bun: Test Runner

> **Stack**: bun@unknown  | **Major**: 1  | **Verified**: 2026-07-09  | **Status**: verified

## TL;DR

Bun 内置的测试运行器是 Jest 兼容的、TypeScript-first 的测试工具，单进程执行（非 worker 隔离），启动速度极快。支持快照测试、DOM 测试、watch 模式、并发执行、重试、随机化排序。API 与 Jest 高度兼容（`bun:test` 模块），但架构上不同——所有测试在同一进程中运行，共享全局状态。

## Question

在 Bun 1.x 中，测试运行器（bun test）的最佳实践是什么，与 Jest/Vitest 相比有哪些关键差异？

## Approach

阅读 Bun 官方文档的测试运行器章节（bun.com/docs/cli/test），包括测试文件匹配、执行控制、并发、重试、快照、DOM 测试、CI/CD 集成等内容。

## Findings

| 选项 | 优势 | 劣势 | 适用场景 |
|---|---|---|---|
| bun test（默认） | 极速启动，TypeScript/JSX 原生支持，Jest 兼容 API | 单进程执行，测试间共享全局状态 | 大多数 TypeScript/JS 项目，尤其是已使用 Bun 的项目 |
| bun test --concurrent | 异步测试并行执行，加速 I/O 密集型测试 | 测试间不能共享状态，需标记 test.serial | 独立测试、API 测试、网络请求测试 |
| bun test --preload | 预加载脚本，统一的 beforeAll/afterAll | 需在单文件中定义全局钩子 | 需要全局设置的测试套件 |
| bun test --retry / --rerun-each | 自动重试失败测试，检测不稳定测试 | 重试会掩盖真正的失败 | 调试不稳定测试（--rerun-each） |
| bun test --randomize / --seed | 随机执行顺序，检测测试间依赖 | 需要 --seed 复现特定顺序的问题 | 检测共享状态问题的测试套件 |

**与 Jest/Vitest 的关键差异**：
- **执行模型**：Bun 在单进程中运行所有测试（非 worker 隔离），Jest/Vitest 默认每文件一个 worker
- **API 兼容**：`bun:test` 提供与 Jest 相同的 `test`/`expect`/`describe`/`mock` API，也支持 `jest.fn()`
- **TypeScript**：原生支持，无需额外配置 ts-jest 或 vite-tsconfig-paths
- **快照**：支持 `toMatchSnapshot()`，使用 `--update-snapshots` 更新
- **DOM 测试**：兼容 HappyDOM、DOM Testing Library、React Testing Library

## Verdict & Rationale

Bun 测试运行器适合作为 Jest 的替代品，尤其是在 Bun 生态内。核心优势是速度和零配置 TypeScript 支持。关键权衡是单进程执行模型——测试间共享全局状态，需要更严格的测试隔离（使用 `--randomize` 检测问题，`test.serial` 标记有序测试）。

对于新项目（尤其是已使用 Bun 的项目），`bun test` 是默认选择。对于已有大量 Jest 测试的项目，迁移成本较低（API 兼容）。对于需要 worker 隔离的大型测试套件，Vitest 可能更合适。

## Boundary Conditions

仅适用于 Bun 1.x。项目未声明 bun 依赖，版本号设为 unknown，跳过过期检查。Bun 的单进程模型意味着测试间的共享状态问题比 Jest/Vitest 更常见，需使用 `--randomize` 和 `test.serial` 管理。不支持 glob 模式的测试文件过滤（仅支持文件名/目录名匹配）。

## Sources

**Tier 1 (maintainer-authored, required)**
- [Bun 官方文档: Test runner](https://bun.com/docs/cli/test) — bun test CLI 用法、测试文件匹配、执行控制、并发、重试、快照、DOM 测试、CI/CD 集成

**Tier 2 (supplementary only, never sole evidence)**
- [Bun GitHub Releases: v1.3.14](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14) — 最新版本确认
