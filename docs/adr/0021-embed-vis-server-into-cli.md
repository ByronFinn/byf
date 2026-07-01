# 0021 - 将 vis-server 作为已发布的运行时依赖提供给 CLI 用户

日期：2026-06-25

## 状态

已接受（2026-06-25 修订——原始的"打包器内联"方法被普通的运行时依赖取代；见修订）

## 背景

BYF 提供了一个会话可视化工具（`apps/vis`）用于调试会话和重放：一个 Hono API 服务器（`@byfriends/vis-server`）加一个 React/Vite SPA（`@byfriends/vis-web`）。目前只能在 monorepo 内部通过 npm 脚本启动（`pnpm vis`、`pnpm --filter @byfriends/vis-server start`）。

我们希望有一个内置的 `byf vis` 命令，这样从 npm 安装已发布的 `@byfriends/cli` 的用户就可以在浏览器中启动可视化工具，指向他们的本地会话。

驱动此决策的约束是：**`apps/vis` 是一个 `private` 包，不发布到 npm。** 已发布的 `byf` CLI 因此无法在运行时 `import '@byfriends/vis-server'`——这个依赖在用户机器上根本不存在。考虑了三种方法：

1. 在构建时将服务器内联到 CLI 中。
2. 将 `server.mjs` 作为子进程生成。
3. 发布单独的 `vis` 二进制/包。

（见替代方案。）

## 决策

**发布 `@byfriends/vis-server`，并从 `@byfriends/cli` 将其作为普通的运行时依赖消费。**

具体来说：

- `@byfriends/vis-server` 从 `private: true` 改为已发布的包（`access: public`），其构建后的 web 资源（`public/`）包含在已发布的 tarball 中。现有的 `copy-web-dist.mjs` 将 `web/dist/**` 放入 `server/dist/public/`；它作为 vis-server 自身 `build` 脚本的尾部步骤运行，在 `tsdown` 之后（见结果部分为何移至 `apps/vis` 构建链之外）。
- 服务器的仅副作用入口（`src/index.ts`）被重构为暴露可复用的编程 API（`startVisServer(...)`），以便 CLI 可以导入它。
- `@byfriends/cli` 将 `@byfriends/vis-server` 添加为**运行时依赖**，并在 `tsdown` 的 `neverBundle` 中列出。因此服务器**不**被内联到 `dist/main.mjs` 中；它在运行时从 `node_modules` 解析，因此其打包的 SPA 资源（`dist/public/`）与提供它们的代码保持在同一位置。（见下面的"修订"，了解为何放弃内联。）
- 运行时，`byf vis` 动态 `import('@byfriends/vis-server')`，相对于已安装包解析 `public/`，绑定一个端口，并打开一个浏览器。一个进程，一个端口。

## 修订：外部依赖而非内联（2026-06-25）

原始决策要求 `tsdown` 将服务器内联到 CLI 包中。实际落地时发现了两个缺口：

1. **半打包。** CLI 的 `alwaysBundle` 正则（`/^@byf\//`）不匹配 `@byfriends/vis-server`，因此 `tsdown` 将服务器入口拉入包中，同时将其内部的 `import './app'` 指向工作区的 `.ts` 源码——包在运行时崩溃。
2. **孤立的静态资源。** 即使完全打包，SPA 的 `public/` 资源不是 JavaScript，无法进入 JS 包。内联的服务器将没有可服务的 Web UI，除非单独的复制步骤将资源一同发布。

将 `@byfriends/vis-server` 视为普通的已发布运行时依赖解决了这两个问题：npm 安装它（及其 `public/`），CLI 导入它，服务器自身的 `resolvePublicDir()` 在其代码旁边找到资源。代价是安装图谱上增加了一个包，这是可接受的。

## 结果

### 正面

- 一次 `npm install -g @byfriends/cli` 就为用户提供了可视化工具——PATH 上无需单独的二进制文件，无需编排脚本。
- 一个进程，一个端口：比开发模式的双端口设置更简单的心智模型，除了 CLI 进程本身之外无需清理任何东西。
- Web 资源随服务器包一起提供，因此同一产物在 `node server/dist/server.mjs` 独立模式中和作为 CLI 运行时依赖都能工作。
- 现有的 `copy-web-dist.mjs` 脚本不加修改地重用。它现在作为 `@byfriends/vis-server` 自身 `build` 的尾部步骤运行（在 `tsdown` 之后），而 `@byfriends/vis-web` 被声明为 vis-server 的构建时工作区依赖。这使 vis-server 成为其 `dist/` 的唯一所有者，并消除了之前 `apps/vis` 构建链同时运行 `copy-web-dist.mjs` 和 vis-server 的 `tsdown clean` 时发生的 `pnpm -r` 构建竞争。

### 负面

- `@byfriends/vis-server` 成为已发布的包，有公开表面和 SemVer 义务；`startVisServer` 导出现在是消费者（至少是 CLI）依赖的 API。
- CLI 安装图谱增加了一个包（`@byfriends/vis-server`），后者依次依赖 `@byfriends/agent-core`。从不运行 `byf vis` 的用户仍然支付此成本。
- `resolvePublicDir()`（使用 `import.meta.dirname/public`）必须变得可注入，CLI 通过 `require.resolve('@byfriends/vis-server/package.json')` 相对于已安装包解析 `public/`。

## 考虑的替代方案

- **将 `@byfriends/vis-server/dist/server.mjs` 作为子进程生成。** 被拒绝：作为 `private` 包，它没有安装在用户机器上，因此没有 `server.mjs` 可生成。无论如何都需要发布该包，此时在进程中导入它严格更简单（无 IPC、无端口协商、无孤儿进程风险）。
- **发布单独的 `vis` 二进制/已发布包，具有自己的 bin。** 被拒绝：增加了需要安装和保持在 PATH 上的第二个东西、独立的发布管线和第二个要管理的进程。作为现有二进制文件的子命令的 `byf vis` 对已经拥有该工具的用户来说是更好的 UX。
- **在构建时将服务器打包到 CLI 中（原始决策）。** 在落地期间被拒绝：半打包崩溃且静态 web 资源无法进入 JS 包。见上面的修订。

## 参考

- PRD-0017 `byf vis` 命令（`docs/prd/PRD-0017-byf-vis-command.md`）
- `apps/vis/server/src/index.ts`、`apps/vis/server/src/app.ts`
- `apps/vis/scripts/copy-web-dist.mjs`
- `apps/cli/tsdown.config.ts`（`neverBundle: ['@byfriends/vis-server']`）
