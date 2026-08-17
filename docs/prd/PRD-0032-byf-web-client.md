# PRD-0032: byf Web 客户端（`byf web`）

- **Status**: Done
- **Date**: 2026-08-13
- **Last updated**: 2026-08-17（状态对齐：PRD-0033/0034 已在其传输骨架上实现并合入 dev）
- **Owner**: fan.bai
- **Complexity**: Large
- **Related**: ADR-0034、ADR-0006、ADR-0021

## Goal

为 byf 增加浏览器 Web 客户端：内置子命令 `byf web` 在进程内启动一个 HTTP 服务器，**实时驱动 agent**（发消息、流式渲染回复、工具调用展示、审批/问答反向 RPC、取消、切权限），并在浏览器打开聊天 UI。这是 byf 的首个 live agent 传输面——与只读 replay 的 `byf vis`（PRD-0017）互补。

支持：

- `byf web` —— 启动服务并在默认浏览器打开会话列表。
- `byf web <sessionId>` —— 深度链接，直接打开指定会话。
- `byf web --port <n>` / `byf web --host <h>` —— 自定义端口/主机。
- `byf web --no-open` —— 启动服务但不自动打开浏览器。

## Background / Motivation

byf 当前只有 CLI/TUI。`apps/vis` 是**只读**会话可视化（Hono server 读 `$BYF_HOME` 磁盘做 replay），不驱动 agent。仓库内**没有任何 live agent 传输**：agent 经 `ByfHarness → SDKRpcClient → createByfCore` 完全在进程内运行（`packages/agent-core/src/rpc/client.ts` 用 `setTimeout` + `JSON.stringify` 模拟网络），无 HTTP/WS 对外暴露。

参考 kimi-code（`/Users/baifan/Projects/ByronFinn/agents/kimi-code`）：其 `kap-server`（Fastify）跑 live engine，`vis-web` 是干净的 Vite+React19+Tailwind4+react-query SPA 模板；全功能 "Kimi Code Web" 由 kap-server 承载。byf 的 `apps/vis/{server,web,shared}` 三包拆分是仓库内现成可复制的脚手架。

需求：让用户在浏览器里**用** byf（live 对话），而非只看历史。

## What I already know (code facts)

### SDK 编程入口（`packages/node-sdk`）

- `ByfHarness`（`src/byf-harness.ts`）：`createSession/resumeSession/forkSession/listSessions({workDir})/getConfig/setConfig/close`；属性 `homeDir/auth/sessions`。
- `Session`（`src/session.ts`）：`prompt/steer/askSide/cancel/setModel/setThinking/setPermission/getStatus/onEvent(listener)/setApprovalHandler/setQuestionHandler/close` 等。
- 事件流：`session.onEvent` 推类型化 `Event` union（`packages/agent-core/src/rpc/events.ts`）：`turn.started/turn.ended`、`assistant.delta/thinking.delta`、`tool.call.started/tool.call.delta/tool.progress/tool.result`、`agent.status.updated`、`error/warning`、`subagent.*`/`compaction.*`/`btw.*`/`background.*`/`goal.*` 等。**无显式 idle/busy 字段**——busy 由 `turn.started→true`、`turn.ended→false` 派生。
- 反向 RPC：`ApprovalHandler = (ApprovalRequest) => MaybePromise<ApprovalResponse>`；`QuestionHandler = (QuestionRequest) => MaybePromise<QuestionResult>`。
  - `ApprovalRequest{toolCallId,toolName,action,display:ToolInputDisplay}`；`ApprovalResponse{decision:'approved'|'rejected'|'cancelled', scope?:'session', feedback?, selectedLabel?}`。
  - `QuestionRequest{questions:QuestionItem[]}`；`QuestionResult = null | QuestionAnswers | QuestionResponse`。CLI 侧 `QuestionAnswers` 按**问题下标**取键，多选以逗号拼接（见 `apps/cli/src/tui/components/dialogs/question-dialog.ts`）。
- SDK 经 API Extractor 把公开面打成**单一 bundled `.d.ts`**（`packages/node-sdk/dist/index.d.mts`），消费方以项目引用引用 SDK 时不会拉入 agent-core 源码（含 `.md` raw import）——见 Technical Approach「类型解析」。

### vis 模板（`apps/vis`）

- `@byfriends/vis-server`（Hono + `Bun.serve`）：`createApp`/`startVisServer`、bearer 鉴权（回环可选、非回环必填 `VIS_AUTH_TOKEN`）、SPA 静态回退（disk `public/` / 内嵌 `__BYF_VIS_EMBEDDED_ASSETS__` / 三模式）。
- `@byfriends/vis-web`（React 19 + Vite 6 + Tailwind v4 + @tanstack/react-query + react-router 7）：`src/api.ts` 单 `fetch` 客户端、token 经 `?token=`/`#token=`→localStorage。
- `byf vis` 子命令（`apps/cli/src/cli/sub/vis.ts` + `commands.ts`）：`Deps` 注入、`handleVis`/`registerVisCommand`、动态 `import('@byfriends/vis-server')`、`--never-bundle` 外置、`compile/build.mjs` 内嵌 SPA 资产。

### 构建与 CI

- 构建助手 `build/bun-lib-build.mjs`（`--bundle-workspace` 内联工作区包、`--target bun|node`、手写 dts）。
- `@byfriends/cli` 的真实运行态是 **Bun 原生编译二进制**（`bin/byf.cjs` 是 Node trampoline→平台 optionalDependency 的编译产物），而非 `dist/main.mjs`。因此**所有在 Bun 下加载的 bundle 必须以 `--target bun` 构建**——否则会把 undici 的 Node polyfill（`new CacheStorage` → `webidl.util.markAsUncloneable`）打进包，在 Bun 下 `import` 即崩。
- CI（`.github/workflows/ci.yml`）：lint(oxlint --type-aware) / fmt:check(oxfmt) / sherif / typecheck / test / build，ubuntu，Bun 1.3.14，frozen-lockfile。
- ADR-0006 分层：web-server 作为 host 应消费 `@byfriends/sdk`（如 cli），仅取类型可直引 agent-core（如 vis）。

## Requirements

### 功能需求

- **F1** `byf web` 进程内启动 web-server（驱动 live agent）+ 打开浏览器；`byf web <sessionId>` 深链 `/sessions/:id`。
- **F2** 会话管理：列会话（按 workDir）、新建（workDir/model?/permission?）、resume、close。
- **F3** 实时对话：发 prompt → SSE 流式事件 → 渲染 assistant 文本（markdown，react-markdown+remark-gfm）、thinking（可折叠）、工具调用（名称 + display 摘要 + 结果）。
- **F4** 反向 RPC：审批卡片（工具/display 摘要 + 批准/拒绝/本次会话放行）、问答卡片（单选/多选/Other，按下标键）。
- **F5** cancel 当前 turn；切换 permission（yolo/manual/auto）。
- **F6** 状态栏：model、context 用量%、permission、busy/idle、live 连接态。
- **F7** `--port`(默认 4100)/`--host`(默认回环)/`--no-open`；非回环强制 `WEB_AUTH_TOKEN`（复用 vis 语义）；端口占用快速失败；SIGINT/SIGTERM 优雅关闭。

### 非功能需求

- **N1** 发布版 `byf web` 可用：web 产物随 `@byfriends/web-server` 发布，原生编译二进制内嵌 web SPA 资产。
- **N2** 开发态 `bun run --filter '@byfriends/web' dev`（server+client 双端口自动选空闲）。
- **N3** 与 vis 一致的代码风格（`Deps` 注入、`registerXxxCommand`、可测试）。
- **N4** 所有 CI 门禁绿；web-server 单测覆盖 SessionManager（fake harness）。

## Out of Scope（v1）

历史回放/重连补帧（live-only；页面刷新丢内存 transcript）；goal/cron/MCP/skills/background 管理 UI；代码语法高亮；多用户/并发隔离与移动端；鉴权登录流（依赖已配置的 BYF_HOME）；`/btw` 侧问 UI；steer UI。

## Acceptance Criteria

- **AC1** `byf web` 启动并打开浏览器会话列表；输入 workDir 后列出该目录会话。
- **AC2** 新建会话后发消息，assistant 回复以 SSE 流式增量渲染（markdown、代码块、列表）。
- **AC3** 工具调用渲染为可展开卡片（名称 + 摘要 + 结果），审批/问答卡片可交互并回传决议。
- **AC4** cancel 中断当前 turn；permission 切换即时生效（状态栏反映）。
- **AC5** `byf web --host 0.0.0.0`（无 token）非零退出并打印 `openssl rand -hex 16` 示例；`--port <占用>` 快速失败；Ctrl-C 优雅退出。
- **AC6** 发布产物可用：构建后的 web-server `GET /` 返回 SPA `index.html`，`GET /api/sessions/:id/events` 以 `text/event-stream` 推送 `sys.connected` 首帧。
- **AC7** web-server bundle 以 `--target bun` 构建，不含 undici 的 `markAsUncloneable`/`new CacheStorage`，在 Bun 下加载不崩。
- **AC8** web-server 单测覆盖：事件广播、审批/问答反向 RPC（含重连重放 pending）、closeSession reject pending、prompt 失败转 `sys.error`、HTTP 路由（create/list/status/prompt/permission/400/鉴权 401）。
- **AC9** CI 全绿：lint/fmt/sherif/typecheck/test/build。

## Technical Approach

### 架构：三包拆分镜像 vis + sdk 驱动 live server + SSE

```
apps/web/
  shared/   @byfriends/web-shared   线路 DTO(type-only,经 sdk 再导出)
  server/   @byfriends/web-server  Hono+Bun.serve,ByfHarness 驱动 live agent
  client/   @byfriends/web-client  React 19 SPA(Vite+Tailwind4+react-query)
  (umbrella @byfriends/web)        dev 编排 + copy-web-dist
```

发布链路：`web-client build → web-server build(--target bun + copy web/dist → server/dist/public) → web-server 发布(含 public/) → CLI dependency(--never-bundle) → 原生编译二进制内嵌 SPA 资产(__BYF_WEB_EMBEDDED_ASSETS__)`。

### 传输：POST 命令 + SSE 事件（详见 ADR-0034）

- 命令：`POST/GET/DELETE/PATCH /api/sessions...`（create/list/status/resume/close/prompt/steer/cancel/permission/approvals/questions）。
- 事件：`GET /api/sessions/:id/events`（`hono/streaming` 的 `streamSSE`，内部 `AsyncQueue` 串行化写入，20s 心跳）。`prompt` 为 fire-and-forget（202），turn 经 SSE 流式推送，错误转 `sys.error`。
- 反向 RPC：handler 生成 requestId，广播 `approval.requested`/`question.requested` 帧并返回 pending Promise；`POST /approvals/:requestId`、`POST /questions/:requestId` 裁决；**SSE 重连时重放当前 pending**，使刷新页面能恢复被阻塞的 turn。

### 线路帧（`apps/web/shared/types.ts`）

SSE `event:` = `frame.type`，`data:` = JSON：`sys.connected`/`sys.heartbeat`/`sys.error`/`agent.event`(透传 agent Event 信封)/`approval.requested|settled`/`question.requested|settled`。

### 类型解析（避免拉入 agent-core 源码）

agent-core 的 dev exports 指向**源码**（含 `.md` raw import）。直接 `tsc --noEmit` 会传递编译 agent-core/kaos 源码并报错。解法（同 cli/server）：web-shared、web-server、web-client 均 composite + `tsc --build`，**项目引用 `@byfriends/sdk`**，消费 SDK 经 API Extractor 打成的单一 bundled `.d.ts`，从不拉入 agent-core 源码；并在 tsconfig `include` 加 `agent-core/src/prompt-modules.d.ts`（防御性，同 cli）。

### `byf web` 子命令

镜像 `byf vis`：`apps/cli/src/cli/sub/web.ts`（`WebDeps` 注入、`handleWeb`/`registerWebCommand`），`commands.ts` 挂载；`build.mjs` 加 `--never-bundle @byfriends/web-server`；`compile/build.mjs` 泛化为嵌入**多组** SPA 资产（vis + web，全局 `__BYF_VIS_EMBEDDED_ASSETS__` / `__BYF_WEB_EMBEDDED_ASSETS__`）。

### 关键决策

> 全部已决议，详见 ADR-0034。D1 SSE over WebSocket；D2 web-server 经 sdk 跑 live agent（首个 live 传输，守 ADR-0006）；D3 三包拆分镜像 vis；D4 v1 live-only 单用户回环；D5 反向 RPC = SSE 广播请求 + POST 决议 + 重连重放。

## Implementation Plan

单 PR 落地（本 PR）：

- **三包 + umbrella**：`apps/web/{shared,server,client}` + umbrella，注册进根 workspaces；根 `build:web` + `build`/`typecheck` 链。
- **web-server**：config / AsyncQueue / WebSessionManager(harness 注入) / routes(SSE) / app(鉴权+资产三模式) / server(startWebServer) / banner / index / build-dts。
- **web-client**：api(token+EventSource URL) / useEventStream / chat reducer(纯函数) / Transcript/Markdown/ToolCallView/ApprovalCard/QuestionCard/Composer/StatusBar / SessionListPage/ChatPage。
- **CLI**：`byf web` 子命令 + 注册 + build.mjs never-bundle + compile/build.mjs 多资产内嵌。
- **测试**：web-server 单测（fake harness）。
- **构建修复**：web-server `--target bun`（避免 undici polyfill 在 Bun 下崩）。

## Domain Terms

- **web 客户端 / web-client** —— `apps/web`，浏览器中实时驱动 agent 的 Web UI（Hono+SSE server + React SPA）。
- **web-server** —— `@byfriends/web-server`，承载 live agent API 与 SSE 事件流、并提供 SPA 静态资产的 HTTP 服务。

## Open Questions

无（全部已决议，见 ADR-0034）。

## Decision (ADR-lite)

详见 **ADR-0034**。要点：SSE+POST（非 WS）；sdk 驱动 live（守 ADR-0006）；三包镜像 vis；v1 live-only 单用户回环；反向 RPC 经 SSE 广播 + POST + 重连重放；`--target bun` 构建。
