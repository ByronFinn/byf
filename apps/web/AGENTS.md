# apps/web — Browser Web Client

浏览器 Web 客户端：在浏览器里**实时驱动** agent（区别于只读 replay 的 `apps/vis`）。详见 PRD-0032 / ADR-0034。

## 结构（三包 + umbrella，镜像 `apps/vis`）

- `server/` `@byfriends/web-server`（**发布**）：Hono + `Bun.serve`，构造一个 `ByfHarness`（`@byfriends/sdk`）驱动 live agent，暴露 `/api/*` + SSE 事件流 + SPA 静态资产。
- `client/` `@byfriends/web-client`（私有）：React 19 + Vite + Tailwind v4 + react-query SPA。
- `shared/` `@byfriends/web-shared`（私有）：线路 DTO（type-only）。
- umbrella `@byfriends/web`：dev 编排（`scripts/dev.mjs`）+ `scripts/copy-web-dist.mjs`。

## 硬约束

- **分层（ADR-0006）**：`web-server` 是 host，运行时只依赖 `@byfriends/sdk`（如 `apps/cli`）；类型可经 `@byfriends/web-shared`（再经 sdk）取，不要在 `web-server`/`web-client` 运行时直引 `@byfriends/agent-core`。
- **构建目标**：`web-server` 必须 `--target bun` 构建（`package.json` build 脚本）。默认 `node` 会把 undici（经 agent-core 的 `ProxyAgent` import）的 Node polyfill 打进包，在 Bun 下 `import` 即崩（`markAsUncloneable is not a function`）。byf 永远在 Bun 下运行（ADR-0028）。
- **类型解析**：三个包均 composite + `tsc --build`，**项目引用 `@byfriends/sdk`**——SDK 经 API Extractor 打成单一 bundled `.d.ts`，消费它不会拉入 agent-core 源码（含 `.md` raw import，会让裸 `tsc --noEmit` 报错）。tsconfig 已含 `agent-core/src/prompt-modules.d.ts`（防御性）。
- **传输**：命令走 POST 等常规方法；事件走 `GET /api/sessions/:id/events` 的 SSE（`hono/streaming` `streamSSE` + `AsyncQueue` 串行化写出）。反向 RPC = 广播 `*.requested` 帧 + `POST .../:requestId` 裁决 + 重连 `replayPending` 重放。见 `server/src/session-manager.ts`、`server/src/routes.ts`。
- **可测试**：`WebSessionManager` 经 `HarnessLike` 注入 harness（生产 `ByfHarness`，测试 fake），见 `server/src/web-server.test.ts`。
