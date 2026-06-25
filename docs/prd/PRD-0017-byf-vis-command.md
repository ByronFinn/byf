# PRD-0017: `byf vis` Command

- **Status**: Grilled
- **Date**: 2026-06-25
- **Owner**: fan.bai
- **Complexity**: Moderate
- **Related**: ADR-0021

## Traceability

- **Grilled by**: `/grill` (completed 2026-06-25) — 9 项决议：删除 `byfHome` 覆盖参数（代码矛盾）、验证 `publicDir` 注入不破坏 dev、token 缺失友好提示、端口占用快速失败、SIGINT/SIGTERM 优雅关闭、确认 BYF_HOME 已对齐、首次发布 changeset 分配（PR1 无 / PR2 vis-server minor / PR3 cli minor）、CONTEXT.md 新增 vis/vis-server 术语、D2 升格为 ADR-0021。

## Goal

新增内置子命令 `byf vis`，在浏览器中启动会话可视化工具（`apps/vis`）并指向本地会话目录（`$BYF_HOME/sessions`）。支持：

- `byf vis` —— 启动可视化服务并在默认浏览器打开会话列表。
- `byf vis <sessionId>` —— 深度链接，直接打开指定会话详情。
- `byf vis --port <n>` / `byf vis --host <h>` —— 自定义端口/主机。
- `byf vis --no-open` —— 启动服务但不自动打开浏览器。

## Background / Motivation

`apps/vis` 是一套完整的会话可视化工具（Hono API server + React/Vite SPA），但当前只能通过 monorepo 内的 npm 脚本启动：

- `pnpm vis`（根）→ `apps/vis/scripts/dev.mjs`（dev 编排，tsx API + Vite 双端口 5174/5173）
- `pnpm --filter @byfriends/vis start`（prod，`node server/dist/server.mjs`）

发布的 `byf` CLI 完全没有引用 `apps/vis`。用户安装 `@byfriends/cli` 后，没有任何途径启动可视化工具。本 PRD 让可视化能力成为 CLI 的一等公民。

## What I already know (code facts)

### CLI 侧（`apps/cli`）

- 二进制名 **`byf`**（`apps/cli/package.json:23` `"bin": { "byf": "dist/main.mjs" }`）。
- 命令框架：**Commander.js**（`commander ^13.1.0`）。
- 唯一现有子命令 `byf export`，注册模式见 `apps/cli/src/cli/sub/export.ts:90` 的 `registerExportCommand(parent)`，在 `apps/cli/src/cli/commands.ts:63` 挂载。
- 子命令规范：`registerXxxCommand(parent, deps?)` 函数 + `handleXxx(deps, ...)` 业务函数 + `Deps` 接口 + `createDefaultDeps(overrides)` 工厂（测试缝）。
- CLI 打包：tsdown，单入口 `apps/cli/src/main.ts` → `dist/main.mjs`，banner 注入 `__dirname` CJS shim（`apps/cli/tsdown.config.ts`）。
- CLI 目前**不引用** `apps/vis`，也没有任何「起 HTTP 服务 + 开浏览器」的先例。
- CLI `dependencies` 含发布的 workspace 包（`@byfriends/sdk` 等被内联），`apps/vis` 当前不在其中。

### Vis 侧（`apps/vis`）

- `apps/vis/server`（`@byfriends/vis-server`）是 **Hono** 应用，入口 `apps/vis/server/src/index.ts` 是**副作用脚本**：只有 `main()` 调用，**无任何 export**。
- 配置全走环境变量（`apps/vis/server/src/config.ts`）：`PORT` 默认 `3001`、`VIS_HOST` 默认 `127.0.0.1`、非回环绑定时 `VIS_AUTH_TOKEN` 必填（`resolveVisAuthToken` `config.ts:42-52`）。
- web 产物定位：`resolvePublicDir()`（`app.ts:15-25`）用 `import.meta.dirname/public`，依赖编译产物旁的 `public/` 目录。
- 深度链接今天就能用：SPA 路由 `/sessions/:sessionId`（`apps/vis/web/src/App.tsx:11`）+ 服务端 SPA fallback（`app.ts:124-135`）。
- **`apps/vis` 是 private 包，不发布**（`apps/vis/package.json:14`、`apps/vis/server/package.json:4`）。
- web 产物拷贝机制：`apps/vis/scripts/copy-web-dist.mjs` 把 `web/dist/**` → `server/dist/public/`。
- dev 编排：`apps/vis/scripts/dev.mjs`（tsx watch API + Vite web，自动选空闲端口）。

### 硬约束

1. **「进程内 import vis-server」在发布场景不可行**：`apps/vis` private 不发布 → 发布的 `byf` 无法 `import '@byfriends/vis-server'`。
2. **`resolvePublicDir()` 的 `import.meta.dirname` 在 CLI 内联打包后失效**：路径会指向 `cli/dist`，找不到 web 产物。

→ 必须让 vis-server 成为发布包，且 web 产物随该包发布、定位逻辑可注入。

## Requirements

### 功能需求

- **F1**：`byf vis` 在进程内启动 vis HTTP 服务，服务 `$BYF_HOME/sessions` 下的本地会话。
- **F2**：`byf vis <sessionId>` 启动服务后，浏览器直接打开 `http://<host>:<port>/sessions/<sessionId>`。
- **F3**：`--port <n>` 覆盖默认端口（默认 `3001`）。
- **F4**：`--host <h>` 覆盖默认主机（默认 `127.0.0.1`）；绑定非回环主机时复用 `resolveVisAuthToken` 的 token 强制要求（无 token 则打印友好提示后退出，提示含 `openssl rand -hex 16` 生成示例）。
- **F5**：`--no-open` 启动服务但不自动打开浏览器；默认（不带该 flag）自动打开。
- **F6**：服务启动后打印 banner（复用 `formatStartupBanner`），含 URL、auth 状态、`BYF_HOME`。
- **F7**：端口被占用时快速失败，打印「端口被占用，请用 `byf vis --port <n>` 换一个」后非零退出（不自动探测空闲端口，遵循 `--port` 的显式契约）。
- **F8**：收到 `SIGINT`/`SIGTERM` 时优雅关闭（`server.close()` 后 `exit 0`）；浏览器进程用 `open()` 默认 `wait: false`，与 CLI 解耦，CLI 退出后浏览器保持打开。

### 非功能需求

- **N1**：发布的 `byf` CLI（npm 安装）必须能正常工作 —— web 产物随 vis-server 包发布。
- **N2**：monorepo 开发态（`pnpm vis`、`pnpm --filter @byfriends/vis-server dev/start`）行为不变。
- **N3**：`byf vis` 与现有 CLI 子命令一致的代码风格（Deps 注入、`registerXxxCommand` 模式、可测试）。
- **N4**：跨平台浏览器打开（macOS/win/linux/WSL）健壮。

## Out of Scope

- `kimi` 别名或独立二进制 —— 复用现有 `byf`。
- 开发场景回退（`BYF_VIS_WEB_DIR`、源码检出兜底）—— 开发态继续用 `pnpm vis`。
- query 参数深链 —— 沿用路径式 `/sessions/:id`。
- 会话存储逻辑改动。
- 鉴权 UI / token 下发流程 —— 仅复用现有 `VIS_AUTH_TOKEN` 环境变量语义。
- dev 编排（`dev.mjs` 双端口）集成进 `byf vis`。

## Acceptance Criteria

- **AC1**：`byf vis` 启动后，浏览器自动打开 `http://127.0.0.1:3001/`，页面渲染会话列表（从 `$BYF_HOME/sessions` 读取）。
- **AC2**：`byf vis <sessionId>` 启动后，浏览器打开 `http://127.0.0.1:3001/sessions/<sessionId>`，页面定位到该会话。
- **AC3**：`byf vis --port 4000 --host 127.0.0.1` 启动后服务监听 `127.0.0.1:4000`，banner 反映该地址。
- **AC4**：`byf vis --no-open` 启动服务但不打开浏览器，banner 仍打印 URL。
- **AC5**：`byf vis --host 0.0.0.0`（非回环，无 `VIS_AUTH_TOKEN`）以非零码退出，打印含 `openssl rand -hex 16` 生成示例的友好提示（非透传底层报错）。
- **AC6**：`byf vis --port <已占用端口>` 以非零码退出，打印「端口被占用，请换一个」提示。
- **AC7**：`byf vis` 运行中按 Ctrl-C（SIGINT）后服务关闭、进程以 0 退出，浏览器窗口保持打开。
- **AC8**：`byf vis --help` 展示 `--port`/`--host`/`--no-open` 及 `[sessionId]` 用法。
- **AC9**：`pnpm vis`（dev 编排）与 `pnpm --filter @byfriends/vis-server start` 行为与改动前一致（回归不变量）。
- **AC10**：在发布的 `byf`（模拟 npm 安装，依赖已发布的 vis-server 包）上 `byf vis` 能加载到 web 产物（`public/` 随包发布且被正确定位）。
- **AC11**：新增单元测试覆盖 `handleVis` 的核心分支（端口/主机解析、sessionId 拼接、`--no-open` 不调 opener、非回环无 token 报错、端口占用报错、信号关闭），通过 `Deps` 注入 mock。

## Technical Approach

### 架构：发布 vis-server 包 + CLI 内联

```
发布链路:
  vis-web build → vis-server build → copy web/dist → vis-server/dist/public
  → vis-server 发布(含 public/) → CLI dependency → tsdown 内联进 byf dist/main.mjs
```

### 改动清单

#### A. vis-server 拆出可复用启动 API

**问题**：`apps/vis/server/src/index.ts` 是副作用脚本（只有 `main()`，无 export），CLI 无法 import。

**做法**：新增 `apps/vis/server/src/server.ts`，导出纯函数：

```ts
export interface StartVisServerOptions {
  readonly host: string;
  readonly port: number;
  readonly authToken?: string; // 默认 resolveVisAuthToken(host)
  readonly publicDir?: string; // 默认 resolvePublicDir()（包内 public/）
}

export interface VisServerHandle {
  readonly port: number;
  readonly host: string;
  readonly url: string;
  close(): void;
}

export async function startVisServer(options: StartVisServerOptions): Promise<VisServerHandle>;
```

> **不设 `byfHome` 参数**（grill #1 决议）：`BYF_HOME` 在 vis-server 是模块级常量（`config.ts:54`），各路由直接 import，无法经参数覆盖；且 CLI 与 vis-server 都从 `process.env.BYF_HOME` 以同一逻辑解析（`~/.byf` 回退），环境变量已是唯一真相源，`byf vis` 自动继承。注入 `byfHome` 会是半成品参数。

`index.ts` 瘦身为薄入口：从环境变量解析配置后调用 `startVisServer`，保持 `tsx watch src/index.ts` 与 `node server/dist/server.mjs` 行为不变。

#### B. vis-server 改为发布包

`apps/vis/server/package.json`：

- 移除 `"private": true`。
- 新增 `"exports"`：`.` → `./dist/server.mjs`（指向新 `server.ts` 编译产物，供 CLI import）。
- 新增 `"files": ["dist"]`（含 `public/`，因 `copy-web-dist.mjs` 拷到 `dist/public`）。
- 新增 `"publishConfig": { "access": "public" }`。
- tsdown entry 调整：`{ server: 'src/server.ts', index: 'src/index.ts' }`，产出 `dist/server.mjs`（库）+ `dist/index.mjs`（可执行入口）。

#### C. `resolvePublicDir` 可注入

`apps/vis/server/src/app.ts`：

- `CreateAppOptions` 增加可选 `publicDir?: string`。
- `createApp()` 优先用传入 `publicDir`，否则 fallback 到现有 `import.meta.dirname/public`（dev 模式下返回 `null`，web 交由 Vite，行为不变 —— grill #2 验证）。
- `startVisServer` **复用现有 `resolvePublicDir()`** 作为 `publicDir` 默认值（不重写定位逻辑），仅在 CLI 内联打包后路径失效的场景由 CLI 显式注入正确位置。

#### D. `byf vis` 子命令

新增 `apps/cli/src/cli/sub/vis.ts`：

```ts
export interface VisDeps {
  readonly startServer: (opts: StartVisServerOptions) => Promise<VisServerHandle>;
  readonly openUrl: (url: string) => Promise<void>;
  readonly stdout: WritableLike;
  readonly stderr: WritableLike;
  readonly exit: (code: number) => never;
}

export async function handleVis(deps, sessionId?, opts: VisOptions): Promise<void>;
export function registerVisCommand(parent: Command, deps?: Partial<VisDeps>): void;
```

- `--port <n>`（默认 `3001`）、`--host <h>`（默认 `127.0.0.1`）、`--no-open`、`[sessionId]`。
- 在 `commands.ts:63` 后 `registerVisCommand(program)`。
- CLI 内 `open` 包（`^9`，新增 dependency）实现 `openUrl`，默认 `wait: false`。
- **错误处理**（grill #3/#4）：
  - 非回环无 token：`handleVis` 提前校验或捕获 `resolveVisAuthToken` 错误，打印含 `openssl rand -hex 16` 示例的友好提示后 `exit(1)`，不透传底层报错。
  - 端口占用（`EADDRINUSE`）：捕获后打印「端口被占用，请用 `byf vis --port <n>` 换一个」后 `exit(1)`，不自动探测空闲端口。
- **关闭语义**（grill #5）：监听 `SIGINT`/`SIGTERM` → 调 `VisServerHandle.close()` → `exit(0)`；浏览器进程与 CLI 解耦，CLI 退出后保持打开。
- 启动顺序：解析配置 →（前置 token 校验）→ `startVisServer`（捕获 EADDRINUSE）→ 打印 banner →（非 `--no-open`）`openUrl(url)` → 阻塞等待信号。

### 关键决策

> 经 `/grill` 复核：仅 D2 满足 ADR 三条件（难逆转 / 令人惊讶 / 真正权衡），已升格为 ADR-0021；其余决策记录于此，不单独建 ADR。

1. **复用 `byf` 二进制，不新增 `kimi`**（不升格 ADR）—— 仓库现状、零额外打包成本。
2. **发布 vis-server 包 + CLI 内联，而非 spawn 子进程** —— 👉 **见 ADR-0021**。spawn 要求用户机器存在 `vis-server/dist/server.mjs`，private 包不满足；发布+内联是唯一让发布版 `byf` 用上 vis 的路。
3. **web 产物随 vis-server 包发布（`public/`）**（不升格 ADR）—— 复用现有 `copy-web-dist.mjs` 机制。
4. **CLI 内用 `open` 包开浏览器**（不升格 ADR）—— 跨平台健壮（WSL/引号/后台启动），行业标准。
5. **深链走路径 `/sessions/:id`**（不升格 ADR）—— SPA 路由 + 服务端 fallback 今天就能用，零新增。
6. **只做发布场景**（不升格 ADR）—— 开发态继续用 `pnpm vis`，责任清晰、MVP 最小。
7. **`--host` 非回环 → 复用 token 强制要求**（`config.ts:46`），友好提示含 `openssl rand -hex 16` 示例，安全语义不破坏。
8. **`--port` 默认 `3001`**（与 `resolvePort` 默认一致），而非 dev 编排的 `5174`。
9. **端口占用快速失败**（不自动探测）—— 遵循 `--port` 显式契约，dev.mjs 的自动探测是开发态便利，不带入稳定命令。
10. **SIGINT/SIGTERM 优雅关闭，浏览器独立存活** —— 单一职责，进程边界清晰。
11. **删除 `byfHome` 覆盖参数** —— 模块常量无法经参数覆盖，环境变量已是唯一真相源。

## Implementation Plan (small PRs)

- **PR1 — vis-server 拆出启动 API + 可注入 publicDir**（A + C）
  - 新增 `src/server.ts`（`startVisServer` + `VisServerHandle`），`index.ts` 瘦身。
  - `createApp` 接受 `publicDir`。
  - 回归：`pnpm --filter @byfriends/vis-server dev/start` 行为不变；新增 `server.ts` 单测。
  - 不改发布配置，纯内部重构。

- **PR2 — vis-server 改为发布包**（B）
  - `package.json` 去 private、加 exports/files/publishConfig；tsdown 双 entry。
  - 验证 `dist/public/` 进发布产物（build 后检查 tarball）。
  - changeset: `@byfriends/vis-server` minor（首次公开发布）。

- **PR3 — `byf vis` 子命令**（D）
  - 新增 `apps/cli/src/cli/sub/vis.ts`，`registerVisCommand` 挂载，CLI 加 `open` 依赖。
  - 单测 `handleVis` 分支。
  - 手动验收 AC1–AC8、AC10。
  - changeset: `@byfriends/cli` minor。

## Domain Terms

> 已同步至根 `CONTEXT.md`（grill #8 决议）。「深链」为通用 Web 概念，不入术语表。

- **vis / 可视化工具** —— `apps/vis`，会话与 replay 的可视化调试工具（Hono API + React SPA）。
- **vis-server** —— `@byfriends/vis-server`，承载 API 与静态 web 产物的 HTTP 服务。

## Open Questions

- 无（全部已决议）。grill 阶段补充决议的 5 项（byfHome 删除、publicDir 复用、token 友好提示、端口占用快速失败、信号关闭语义）已并入 Requirements F4/F7/F8 与 Technical Approach D。

## Decision (ADR-lite)

> 经 `/grill` 评估：仅 D2 满足 ADR 三条件，已升格为 **ADR-0021**。D1/D3/D4/D5 不满足（可逆 / 不令人惊讶 / 无真正权衡），保留于此。

- **D1**：复用 `byf` 二进制，不新增 `kimi`。理由：仓库现状、零额外打包成本。
- **D2**：发布 vis-server 包 + CLI 内联，而非 spawn 子进程。👉 **见 ADR-0021**。
- **D3**：web 产物随 vis-server 包发布。理由：复用现有 `copy-web-dist.mjs` 机制。
- **D4**：用 `open` npm 包开浏览器。理由：跨平台健壮，行业标准。
- **D5**：只做发布场景，不兼顾源码检出开发态。理由：MVP 最小，开发态已有 `pnpm vis`。
