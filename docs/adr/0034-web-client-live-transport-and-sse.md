# 0034 - Web 客户端：经 SDK 驱动 live agent，传输用 SSE + POST

日期：2026-08-13

## 状态

已接受

## 背景

byf 此前**没有任何 live agent 传输**：agent 经 `ByfHarness → SDKRpcClient → createByfCore` 完全在进程内运行（`packages/agent-core/src/rpc/client.ts` 用 `setTimeout` + `JSON.stringify` 模拟网络）。`apps/vis` 是只读 replay（读磁盘，不驱动 agent）。`byf web`（PRD-0032）需要把浏览器接到一个**正在运行**的 agent 上：发消息、流式收事件、做审批/问答反向 RPC。

由此引出一组互相关联的决策：用什么传输、server 如何驱动 agent、包结构如何拆、v1 边界划在哪、反向 RPC 怎么在无状态 HTTP 上落地、bundle 如何在 Bun 下不崩。本文记录这些决策。

约束：ADR-0006 分层（host 经 `@byfriends/sdk`）；ADR-0028 仅 Bun 工具链；`byf` 的真实运行态是 Bun 原生编译二进制（`bin/byf.cjs`），不是 `dist/main.mjs`。

## 决策

### D1：传输用 SSE（服务端→浏览器事件）+ POST（浏览器→服务端命令），不用 WebSocket

- 命令（prompt/steer/cancel/permission/approval/question）走普通 POST，立即返回（`prompt` 返回 202，事件经 SSE 推送）。
- 事件走 `GET /api/sessions/:id/events` 的 `text/event-stream`（`hono/streaming` 的 `streamSSE`，内部 `AsyncQueue` 串行化写出，20s 心跳）。

### D2：web-server 经 `@byfriends/sdk` 驱动 live agent（byf 首个 live 传输面）

`apps/web/server` 构造一个 `ByfHarness`，`WebSessionManager` 包它：创建/恢复会话时挂 `session.onEvent`（广播为 `agent.event` 帧）与审批/问答 handler（发起反向 RPC）。这是 byf 第一个让 agent 可经网络驱动的面，严格遵守 ADR-0006（host 只依赖 sdk，类型可取 agent-core）。

### D3：三包拆分镜像 `apps/vis`

`apps/web/{shared,server,client}` + umbrella `apps/web`，包名 `@byfriends/web{,-server,-client,-shared}`。复用 vis 的 dev 编排、copy-web-dist、SPA 静态三模式（disk `public/` / 内嵌 `__BYF_WEB_EMBEDDED_ASSETS__` / dev 仅 API）、`byf vis` 子命令与原生编译资产内嵌模式。

### D4：v1 live-only、单用户回环

不做历史回放/重连补帧（live-only；页面刷新丢内存 transcript）；不做多用户/并发隔离；鉴权依赖已配置的 BYF_HOME（web 客户端不实现登录流）。回环默认无 token，非回环强制 `WEB_AUTH_TOKEN`（复用 vis 的安全语义）。

### D5：反向 RPC = SSE 广播请求 + POST 回传决议 + 重连重放

审批/问答 handler 生成 `requestId`，广播 `approval.requested`/`question.requested` 帧并返回一个 pending Promise；浏览器 `POST /approvals/:requestId`、`POST /questions/:requestId` 裁决，resolve 该 Promise 并广播 `*.settled`。服务端持有 pending 表；**SSE（重）连时 `replayPending` 重放当前待裁决请求**，使刷新页面/重连能恢复一个被阻塞的 turn（断连期间错过的实时事件不补，v1 接受）。

### D6：web-server bundle 以 `--target bun` 构建

agent-core 经 `proxied-fetch.ts` `import { ProxyAgent } from 'undici'`，默认 `--target node` 会把 undici 整体（含顶层 `$caches = new CacheStorage(kConstruct)` → `webidl.util.markAsUncloneable`，后者来自 `node:worker_threads`）打进包；该 polyfill 在 Bun 下 `import` 即崩（`markAsUncloneable is not a function`）。`--target bun` 让 Bun 的打包器不内联 Node 兼容 polyfill（Bun 原生提供 fetch/caches/WebSocket），bundle 在 Bun 下正常加载。

## 结果

### 正面

- **SSE** 单向事件扇出天然契合 agent 事件流，Bun 原生 `ReadableStream` 支持好，无 `ws` 依赖、无子协议鉴权复杂度；`EventSource` 自动重连。
- **sdk 驱动** 让 web 客户端与 CLI 共用同一 agent 引擎与同一套事件/反向 RPC 契约，行为一致；SessionManager 的 harness 注入使单测可用 fake harness。
- **三包镜像 vis** 复用全部既有模式（dev/start/资产内嵌/子命令），认知成本与维护成本最低。
- **重连重放 pending** 用很小代价解决了"刷新页面丢审批"的真实坏体验。
- **`--target bun`** 与 byf 的 Bun 原生编译运行态一致，bundle 更小（不内联 undici）。

### 负面

- live-only：页面刷新丢内存 transcript（历史回放显式划在 v1 之外，留待后续，可复用 vis 的磁盘 wire 读取）。
- 反向 RPC 用"无状态 server 持 pending 表 + 重放"，多实例/多进程部署下 pending 不共享——v1 单进程单用户，可接受。
- SSE 经某些反向代理需显式禁用缓冲；本地回环与 `byf web` 直连不受影响。

## 考虑的替代方案

- **WebSocket（双向）**。被拒：事件是单向扇出，命令用 POST 足够且更易调试/穿代理；WS 引入 `ws` 依赖、连接级鉴权子协议、自建重连退避，收益不抵成本。kimi-code 的 `kap-server` 用 WS，但其调试面是双向 RPC 反射，需求不同。
- **让 web-server 像 vis 那样只读磁盘**。被拒：需求是 live 驱动 agent（发消息、审批），不是 replay；只读磁盘无法满足。
- **不拆三包，server+client 合一**。被拒：镜像 vis 的三包拆分能复用全部既有模式，且 server（发布）与 client（私有 SPA）发布策略不同，分开更清晰。
- **v1 即做多用户隔离/历史回放**。被拒：复杂度与 MVP 不匹配；live-only 单用户回环足以验证方案与可用性，复杂项显式留待后续。
- **反向 RPC 用长轮询或 WS**。被拒：已有 SSE 通道，复用之广播请求帧 + POST 回传决议最简；重连重放 pending 解决了无状态下的恢复问题。
- **web-server 以默认 `--target node` 构建**。被拒：bundle 在 Bun 下 `import` 即崩（undici `markAsUncloneable`）；web-server 永远在 Bun 下运行（ADR-0028 + 原生编译二进制），`--target bun` 是正确且更优的选择。
