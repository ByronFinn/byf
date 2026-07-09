# Bun: Test Migration From Vitest

> **Stack**: bun@unknown  | **Major**: 1  | **Verified**: 2026-07-09  | **Status**: verified

## TL;DR

在 Bun 1.x 下，**以 `bun test` 为唯一 runner 是官方支持的迁移路径**：`bun:test` 兼容 Jest API，并提供 **`vi` 别名**（`vi.fn` / `vi.mock` / `vi.spyOn` 等）降低从 Vitest 搬迁成本；许多套件可少改甚至不改 import。权衡是**单进程执行**（非默认 per-file worker）、matcher/配置并非 100% 覆盖，以及**无 Jest 式 `__mocks__` 自动 mock**——大型 Vitest monorepo 应按包清障，而不是假设零 diff。

## Question

在 Bun 1.x 中，从 Vitest 全量切换到 `bun test` 的最佳实践与已知不兼容点是什么？

## Approach

阅读官方 Test runner、Mocks（含 Vitest Compatibility）、Migrate from Jest 指南；对照首页/博客中将 Vitest 列为可替换对象的表述。结合本仓库根 `vitest` scripts 与大量 `*.test.ts` 的迁移语境。`stack@version=unknown`。

## Findings

| 选项 | 优势 | 劣势 | 适用场景 |
|---|---|---|---|
| **直接 `bun test` 替换 `vitest run`** | 零配置 TS/JSX；官方定位即替换 Jest/Vitest；启动快 | 配置项映射不全；失败需逐包修 | PRD 选定的唯一 runner |
| **import 从 `vitest` → `bun:test`** | 类型与意图清晰 | 有改动面 | 长期主路径 |
| **保留 `vitest`/`@jest/globals` import** | Bun 内部可 remap 到 `bun:test`（Jest 指南 + 历史兼容叙述） | 依赖 remap 行为；类型可能别扭 | 快速切换、少动文件 |
| **使用 `vi` API** | 贴近 Vitest mock 习惯；1.3.1+ 全局 `vi` 更易迁 | 仅为子集别名，非完整 Vitest | 已有大量 `vi.*` 的测试 |
| **双跑 Vitest + bun test** | 对比差异 | 与「仅 bun test」策略冲突；双维护 | 非本 PRD 策略（仅私有 spike 可短暂） |

**兼容与迁移要点**：

| 主题 | Bun 行为 | 迁移动作 |
|---|---|---|
| API 表面 | `test` / `describe` / `expect` / `mock` / `jest.fn` / `spyOn` | 多数断言可原样；查 matchers 表补洞 |
| Vitest mock | `vi.fn`、`vi.spyOn`、`vi.mock`、`vi.restoreAllMocks`、`vi.resetAllMocks`、`vi.clearAllMocks` | 优先继续用 `vi`，失败再改 `mock`/`jest` |
| Jest globals | 可注入；TS 用 `/// <reference types="bun-types/test-globals" />` | 加一处 reference 或显式 import |
| 执行模型 | **单进程**，共享全局状态 | 清全局污染；`--randomize` 找顺序依赖；必要时 `test.serial` |
| 并发 | `--concurrent` 等 | I/O 多的套件再开；共享状态测试勿盲目并发 |
| 模块 mock | `mock.module`；**无** `__mocks__` 自动 mock | 改写 Vitest/Jest auto-mock 为显式 mock + 必要时 `--preload` |
| 配置 | 大量 Jest/Vitest config **无等价**（transform/haste/watchPlugins 等） | 删配置；TS/JSX 靠 runtime；preload 进 `bunfig.toml` `[test]` |
| 覆盖率/超时/bail | `--coverage` / `--timeout` / `--bail` CLI | 从 vitest config 迁到 CLI 或 bunfig |
| DOM | 非内置 jsdom；官方推 happy-dom preload | 有 DOM 的包单独 preload |
| monorepo | `--filter`、包级脚本；`--pass-with-no-tests`（近版） | 按 workspace 脚本切换，允许空测包 |

## Verdict & Rationale

**迁移策略：唯一入口 `bun test`；先 remap/vi 兼容，再按失败清单修语义差异，不为兼容而长期保留 Vitest。**

1. 官方 Mocks 文档提供 Vitest 向的 `vi` 兼容层，降低 mock 重写成本。
2. Migrate from Jest 表明「多数套件可直接跑」是产品目标；Vitest 与 Jest API 高度同构，同样适用「先跑再修」。
3. 明确缺口（单进程、无 auto-mock、matcher/配置子集）决定了工作量在**清障**而非**双轨**。

建议步骤：根 `test` 脚本 → `bun test`；删除 vitest 依赖与 `vitest.config.*`；`bunfig.toml` 收纳 preload/coverage；CI 只跑 `bun test`；按包修复 mock 与全局状态；DOM 包单独 happy-dom。

## Boundary Conditions

- 仅 Bun 1.x；`stack@version=unknown`。
- 兼容性「大多可跑」≠「本仓库 372 个测试零修改」；以门禁全绿为完成定义。
- 依赖 worker 隔离、Vitest 独有 pool/browser mode、或深度 Vite 集成的测试，可能需改写场景而非硬适配。
- `vi` 是 mock 子集别名，不是完整 Vitest 运行时。
- 无 `__mocks__` auto-mocking：依赖该约定的测试必须改写。
- 与 [bun-test-runner-1.md](bun-test-runner-1.md) 互补：本记录偏**迁移**，彼记录偏**runner 能力本身**。

## Sources

**Tier 1 (maintainer-authored, required)**
- [Bun 官方文档: Mocks · Vitest Compatibility](https://bun.com/docs/test/mocks) — `vi` API 子集、`mock.module`、无 auto-mocking、preload 时机
- [Bun 官方指南: Migrate from Jest to Bun's test runner](https://bun.com/docs/guides/test/migrate-from-jest) — 少改迁移、globals、config 映射与不支持项、happy-dom
- [Bun 官方文档: Test runner](https://bun.com/docs/cli/test) — `bun test` CLI、并发/重试/覆盖率等执行模型

**Tier 2 (supplementary only, never sole evidence)**
- [Bun Blog: v1.3.1 — Vitest global `vi` / `--pass-with-no-tests`](https://bun.com/blog/bun-v1.3.1) — 迁移体验增强
- [Bun Blog: Bun 1.0 · Testing](https://bun.com/blog/bun-v1.0) — `vitest` import remap 到 `bun:test` 的产品叙述
- [Bun GitHub Releases: bun-v1.3.14](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14) — 研究时点版本锚点
