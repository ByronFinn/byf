# PRD-0001: macOS Native GUI

**Status**: Draft
**Created**: 2026-06-18
**Author**: BYF
**Related**: ADR 0006 (monorepo layered architecture), ADR 0008 (remove plan mode)

## Problem

byf 的交互能力目前只有 `apps/cli`（pi-tui 终端 UI）。终端 UI 在长会话历史浏览、多 session 并行、工具调用可视化、文件审批审查上受限于终端原语。需要一个 **macOS 原生 GUI**，复用同一引擎（agent-core / node-sdk），提供桌面级体验，并为未来 Windows/Linux 原生实现铺路。

## Goal

构建 `apps/gui/macos/`（AppKit 原生）+ `packages/gui-core/`（stdio JSON-RPC 2.0 transport 包）+ `apps/gui/protocol/SPEC.md`（语言无关协议），通过 fork 一个 gui-core SEA 二进制子进程承载 `ByfHarness`，Swift 主程序以 JSON-RPC 双向 RPC 与之通信。

MVP 范围：**仅 macOS**。Windows/Linux 在仓库结构中预留（`apps/gui/windows/`、`apps/gui/linux/` 各放 README），不实现。

## Not Building (Out of Scope)

- `$技能` / `#关联` 新输入语法（v2 特性，需独立立项；MVP 复用 `/skill` 命令 + `activateSkill` RPC）。
- plan mode UI（ADR 0008 已彻底移除；`AgentAPI` 中 `enterPlan`/`cancelPlan`/`clearPlan` 抛 `NOT_IMPLEMENTED`，`getPlan` 返 `null`）。
- 远程/SSH/容器 kaos 实现（路径 A 在"Long-term Design"记录；本期仅落地其前置 Issue）。
- Windows / Linux 原生实现（仅预留目录 + README）。
- 把 byf 暴露为 MCP server（v2 评估）。
- SwiftUI 作为主框架（仅作 AppKit 的局部 interop）。

## What I Already Know (ground truth from code)

### 引擎层已有成熟 RPC 契约，缺的只是线传输
- `packages/agent-core/src/rpc/` 有完整契约层：`CoreAPI`（30+ 方法，`core-api.ts:277`）、`SDKAPI`（host 回调：`emitEvent`/`requestApproval`/`requestQuestion`/`toolCall`，`sdk-api.ts`）、`AgentEvent` 联合类型（33 种事件，`events.ts`）、`ByfErrorPayload`（JSON 可往返）。
- `createRPC`（`client.ts`）是 in-process 桥，用 `JSON.stringify` 模拟网络——证明契约本就是 JSON 可序列化。
- `agent-core` 已依赖 `@modelcontextprotocol/sdk ^1.29.0`（`package.json:78`），`StdioClientTransport`（`mcp/client-stdio.ts`）是现成的"JSON-RPC 2.0 over NDJSON"分帧参考。**零新增依赖**即可选 JSON-RPC。

### 嵌入入口已现成：`ByfHarness`
- `packages/node-sdk/src/byf-harness.ts`：`new ByfHarness({ homeDir, configPath, identity, uiMode, skillDirs })`。
- 内部 `SDKRpcClient`（`rpc.ts`）构造 `new ByfCore(coreRpc, { homeDir, configPath, skillDirs })`。
- Session 生命周期全托管：`createSession`/`resumeSession`/`forkSession`/`closeSession`/`listSessions`。
- `session.onEvent(listener)` 接收 `AgentEvent` 流；`session.setApprovalHandler`/`setQuestionHandler` 处理反向 RPC。
- **死代码**：`rpc.ts:248-262` 仍透传 `getPlan`/`clearPlan`（plan mode 已移除），需前置清理。

### SEA 流水线已成熟且可复用
- `apps/cli/scripts/native/`：配置驱动的通用脚本（`nativeDeps` 数组 + `targetTriple` + `paths` 函数），不绑定 CLI 业务。
- 流程：`01-bundle`(tsdown) → `02-sea-blob`(`node --experimental-sea-config`) → `03-inject`(postject 注入 `NODE_SEA_BLOB`) → `04-sign`(codesign) → `05-verify`。
- gui-core 的 native deps **远比 CLI 小**：无需 pi-tui/koffi/clipboard（那是 TUI 终端库）。SEA 比 CLI 更简。

### 持久化与恢复已现成
- `wire.jsonl`（NDJSON，每 agent 一份，`<sessionDir>/agents/<agentId>/wire.jsonl`）。
- `Agent.resume()` 重放 wire（按记录回放，未完成 turn 不会自动续跑）。
- `resumeSession` 返回 `ResumeSessionResult`，含 `agents[].replay`（紧凑摘要，UI 快速 hydrate，免解析 wire）+ `warning`（迁移/未完成提示）。

### 输入栏现状（对齐目标）
- `@file`：`apps/cli/src/tui/components/editor/file-mention-provider.ts`（pi-tui + git recency 排序）。
- `/command`：`apps/cli/src/tui/commands/parse.ts`（`parseSlashInput`）+ 命令注册表。
- 技能：`activateSkill` RPC（`CoreAPI.activateSkill`）；MVP 以 `/skill <name>` 命令触发。
- `$`/`#` 不是现有语法 → Out of Scope。

### 分层约束（ADR 0006）
- `apps/gui → gui-core → @byfriends/sdk → @byfriends/agent-core → {kosong, kaos}`。
- `apps/gui` 与 `apps/cli` 同规：**不得直接 import `@byfriends/agent-core`**。
- ADR 0006 原文："The SDK seam allows replacing the CLI with alternative hosts" + "The Kaos seam allows running the same agent logic locally or remotely"——GUI 是第一个替代 host。

## Technical Approach

### 架构总览

```
┌─────────────────────────────┐     JSON-RPC 2.0      ┌──────────────────────────────┐
│  apps/gui/macos (Swift)     │   over NDJSON/stdio   │  gui-core SEA 子进程 (Node)    │
│                             │  ←──────────────────→  │                              │
│  ByfEngineService           │     双向 RPC:          │  ByfHarness (in-process)      │
│   ├ fork + 崩溃恢复          │   • request/response   │   ├ createSession/...        │
│   └ 重启 → resumeSession    │   • notification       │   └ emitEvent → notification │
│  RpcClient (NDJSON 帧读写)   │   • reverse request    │  sdk-bridge                   │
│  SessionManager             │     (approval/question)│   ├ requestApproval → host    │
│  AppKit UI (NSSplitView...) │                        │   └ requestQuestion → host   │
└─────────────────────────────┘                        └──────────────────────────────┘
        共享 ~/.byf (config.toml, sessions/, auth)
```

### 决策 1：IPC 协议 = JSON-RPC 2.0（stdio + NDJSON 分帧）

**依据**：LSP 与 MCP 均选 JSON-RPC 2.0，明确把"消息格式"与"传输层"解耦；MCP stdio 即"每行一个 JSON"。`agent-core` 已依赖 MCP SDK，`StdioClientTransport` 是现成分帧参考。

**三种 JSON-RPC 消息形态映射**：
| byf 需求 | JSON-RPC 形态 |
|---|---|
| GUI→core 调 `prompt`/`createSession` 等 | `request`（id + method + params） |
| CoreAPI 返回值/异常 | `response`（同 id + result/error） |
| core→GUI 的 `AgentEvent` 流（`emitEvent`） | `notification`（无 id，method=`event`） |
| core→GUI 的 `requestApproval`/`requestQuestion`（反向 RPC） | `request`（core 发，带 id，GUI 必须回 response） |

**分帧格式约束（写死）**：
- **NDJSON（MCP 风格）**：每行一个完整 JSON 对象。
- **消息体单行 JSON，内部不得含裸 `\n`**——所有换行必须转义（`JSON.stringify` 已自动转义；Swift 端禁止手拼字符串，必须用 JSON encoder）。
- 选 NDJSON 而非 LSP 的 `Content-Length` 分帧：与 MCP 一致、可 `tail -f` 调试、byf 消息以文本为主无大块二进制。

**错误模型**：复用 `ByfErrorPayload`，直接映射到 JSON-RPC 的 `error: { code, message, data }`。

### 决策 2：传输层抽象 + backpressure

**Transport 接口**（gui-core `transport/`）：
```ts
interface Transport {
  onMessage(handler: (frame: Buffer | string) => void): void;
  send(frame: string): void;
  close(): void;
}
```
- **MVP：`StdioTransport`**（stdin 读、stdout 写，复用 MCP 同款模式）。
- **预留 `UnixDomainSocketTransport`**：当 stdio 污染成痛点或需多窗口共享引擎时切换，零协议改动。

**硬约束：子进程 stdout 只写协议帧**：
- gui-core 入口 `main.ts` 必须 `process.stdout` 仅写 JSON-RPC 帧。
- **所有日志强制走 stderr**（`getRootLogger()` 配置 sink → stderr）。
- 子进程 stderr 用 **BoundedTail** 有界缓冲（照搬 `client-stdio.ts:202` 的 `BoundedTail`，4KB tail），防子进程 stderr 爆炸阻塞。

**Backpressure**：
- stdout 写满管道（macOS 默认 64KB）会阻塞 agent 主循环——天然反压。
- **Swift 端读 stdin 必须及时消费**：`RpcClient` 用专门读线程 + 无界队列（内存换不阻塞），否则管道满反压 agent。
- 高频 `assistant.delta` 在 Swift 端 **coalesce 后 flush**（见决策 5）。

### 决策 3：gui-core = ByfHarness + transport（不重写引擎）

**包结构** `packages/gui-core/`：
```
src/
  index.ts
  transport/
    transport.ts            ← Transport 接口
    stdio-transport.ts      ← stdin/stdout NDJSON 读写 + BoundedTail stderr
    framed-stream.ts        ← 行解析
  protocol/
    frames.ts               ← 镜像 CoreAPI/SDKAPI/Event 的 frame 类型
    methods.ts              ← JSON-RPC method 名 → CoreAPI 方法分发表
  server.ts                 ← ByfHarness + Transport → JSON-RPC dispatcher
  sdk-bridge.ts             ← SDKAPI 反向 RPC: emitEvent(→notification) /
                              │ requestApproval/requestQuestion(→reverse request)
  errors.ts                 ← ByfErrorPayload ↔ JSON-RPC error 映射
package.json                ← @byfriends/gui-core, dep: workspace @byfriends/sdk
tsdown.config.ts
```

**关键**：
- **不自带 session-store**——`listSessions`/`readSessionDetail` 走 CoreAPI 透传（删除原方案的 `session-store.ts`）。
- **协议层不注册 plan 方法**（`getPlan`/`enterPlan`/`cancelPlan`/`clearPlan`），Swift 端永远看不到。
- method 命名：`core.createSession` / `session.prompt` / `session.cancel` / `session.setModel` 等，镜像 `CoreAPI` 分层（Core/Session/Agent）。

### 决策 4：SEA 二进制作为签名 sidecar（不内嵌 Resources/）

**修正原方案错误**：原方案"内嵌 gui-core SEA 进 `Resources/`"违反 macOS 最佳实践（codesign/notarization/Hardened Runtime entitlements 冲突，更新成本高）。

**采用业界惯例（VS Code/Cursor/Slack）**——sidecar 可执行文件：
```
byfDesktop.app/Contents/
  MacOS/byfDesktop                  ← Swift 主程序（签名 + notarized）
  Resources/
    gui-core-engine                 ← SEA 二进制（chmod +x，独立签名）
    app/...                         ← 资源
  _CodeSignature/
```

**构建**：
- 复用 `apps/cli/scripts/native/` 流水线（`01-bundle`→`05-verify`），新建 `apps/gui/scripts/native/`。
- gui-core 的 `nativeDeps` 清单：**空**（无 pi-tui/koffi/clipboard）——比 CLI 简单得多。
- 签名复用 `04-sign.mjs`（release profile 用 `APPLE_SIGNING_IDENTITY`）。
- Swift `ByfEngineService` 用 `Process` API spawn sidecar 二进制。

### 决策 5：macOS AppKit 主框架 + 流式聊天渲染

**UI 框架**（最佳实践印证）：AppKit（NSTextView 用 TextKit2 比 SwiftUI Text 更忠实渲染 markdown；SwiftUI List 在 macOS 大列表性能差）。仅 SwiftUI 作局部 interop。

**聊天流式渲染技术要点**（PRD 写明，避免 P4 Issue 颗粒度不清）：
- **每条消息独立 `NSTextView`**（独立 TextKit2 layout manager），避免长历史重排。
- **`NSTableView` 虚拟化**消息列表（非 `NSStackView`），复用 cell，支持万条历史。
- **流式 append 节流**：token 到达只 invalidate 末尾 run，`NSTextStorage` 增量 append，**coalesce 每 16ms（一帧）flush 一次**，避免每个 token 触发 layout。
- **markdown**：Apple `swift-markdown`（cmark）解析为 `AttributedString`，流式时只重解析最后一段。

### 决策 6：共享 ~/.byf + 单 session 单写者约束

`ByfHarness({ homeDir })` 默认 `~/.byf`，CLI 与 GUI 共享 config.toml / sessions / auth。

**并发约束（写明）**：
- **同 session 单写者**：`wire.jsonl` 是 append-only 单文件，`FileSystemAgentRecordPersistence` **无文件锁**（仅 fsync+dirsync）。CLI 与 GUI 同时打开**同一 session** 会互相撕裂 wire。
- **MVP**：session 在 GUI 打开后，检测到被占用即提示（读 `state.json` 的运行时标记）。
- **P7**：进程级 lease（启动写 PID + 心跳时间戳，退出清除），CLI/GUI 互斥感知。
- **不同 session 并行无冲突**（各自独立 wire.jsonl），正常多任务。

### 决策 7：崩溃恢复范围

**区分两种崩溃**：
| 崩溃类型 | 恢复 | 难度 |
|---|---|---|
| Node 子进程崩溃（SEA 挂掉） | Swift 重 fork + `resumeSession` 重放 wire | 现成，免费 |
| 正在流式输出的 turn 中途崩溃 | wire 里 `turn.prompt` 已记录，但未完成 turn 不会自动续跑 | 需 UX |

**UX**：崩溃恢复后，GUI 用 `ResumeSessionResult.warning` 提示"上一轮未完成，是否继续"，**不自动续传**（`Agent.resume()` 只恢复到 turn 开始前状态）。

### 决策 8：子进程粒度 = 一个 app 一个子进程

CoreAPI 原生多 session，崩溃后重放所有 wire.jsonl。比"每 session 一进程"省内存，且 CoreAPI 设计本就支持多 session。

## Domain Terms

- **gui-core**：`packages/gui-core`，stdio JSON-RPC 2.0 transport 包，包装 `ByfHarness`。
- **sidecar 引擎**：gui-core 的 SEA 二进制，作为 `.app` 内独立签名可执行文件 spawn。
- **反向 RPC**：core→host 的 `requestApproval`/`requestQuestion`，core 发带 id 的 request，GUI 弹窗后回带 id 的 response。
- **单 session 单写者**：同一 session 的 `wire.jsonl` 同一时刻只能被一个进程 append。

## Decision (ADR-lite)

1. **IPC = JSON-RPC 2.0 + NDJSON 分帧**。依据：LSP/MCP 行业标准；agent-core 已依赖 MCP SDK；契约本就 JSON 可序列化。
2. **传输层抽象 Transport 接口**，MVP `StdioTransport`，预留 UDS。子进程 stdout 仅协议帧，日志强制 stderr。
3. **gui-core = ByfHarness + transport**，不重写引擎，不自带 session-store（透传 CoreAPI）。
4. **SEA 二进制作为签名 sidecar**（非内嵌 Resources/），复用 CLI native 流水线；gui-core native deps 为空。
5. **AppKit 主框架**；每消息独立 NSTextView + TextKit2，流式 append 节流 16ms，NSTableView 虚拟化。
6. **共享 ~/.byf**；单 session 单写者；MVP 检测占用即提示，lease 列 P7。
7. **plan mode 协议层不暴露**（ADR 0008）；node-sdk 死代码前置清理。
8. **远程 kaos 本期仅落地前置 Issue**（node-sdk 透传 `runtime`），实现见 Long-term Design。

## Long-term Design: 远程 kaos

**事实**：
- `Kaos` 接口（`packages/kaos/src/kaos.ts`）是干净的执行环境抽象（path/dir/file/process ~30 方法）。
- 目前仅 `LocalKaos` 实现；ADR 0006 提及 `SSHKaos` 是愿景，代码不存在。
- `RuntimeConfig = { kaos, osEnv, urlFetcher?, webSearcher?, fetch? }`。
- **引擎侧已开闸**：`ByfCoreOptions.runtime?` 存在（`rpc/core-impl.ts:95`），未传时默认 `localKaos`。
- **瓶颈在 node-sdk**：`SDKRpcClient` 只透传 3 字段，无 `runtime` 通道（`rpc.ts:109`）；`ByfHarnessOptions`（`types.ts:55`）无 `runtime` 字段。
- `ssh2` 已在根 `package.json` `overrides` 块——SSH 原语已是已知依赖。

**本期落地（前置 Issue）**：node-sdk 增加 `runtime` 透传
- `ByfHarnessOptions` 增加 `runtime?: RuntimeConfig`。
- `SDKRpcClientOptions` 增加 `runtime?`，透传给 `new ByfCore(...)`。
- 引擎侧 `ByfCoreOptions.runtime` 已存在——打通最后一公里。
- changeset: minor（纯加可选字段，无破坏）。

**长远方案（路径 A，推荐）**：
- 新增 `packages/kaos-remote/`：`SshKaos`（ssh2 实现 Kaos 接口）+ `DockerKaos`（docker exec 透传，更远期）。
- gui-core 增加 `setRuntime` JSON-RPC 方法，启动参数指定 kaos 类型。
- GUI settings 增加"工作区连接"选择器（本地 / SSH 主机）；SSH 凭据从 macOS Keychain 读，通过启动参数注入子进程（不落盘）。
- 严格遵循 ADR 0006 不变量（agent-core 永不直接碰 fs/child_process）。

**备选（路径 B，仅记录不承诺）**：把 kaos 做成反向 RPC（复用 JSON-RPC 反向通道，Mac 端实现实际 I/O）。优点：架构纯；缺点：每个 fs/process 操作跨进程往返，延迟敏感，Kaos 30 方法都要协议化。仅作"未来 Mac 直接掌控远程 FS"的备选。

## Implementation Plan

| Phase | Scope | 关键交付 |
|---|---|---|
| **P0** | node-sdk 清理 plan 死代码（patch）+ `runtime` 透传（minor）；gui-core 包骨架（Transport 接口 + StdioTransport + framed-stream + errors）；JSON-RPC dispatcher + sdk-bridge；用 stub ByfHarness 单测 framing | `pnpm build` 产出 gui-core `dist/` |
| **P1** | `apps/gui/src/main.ts`（gui-core 入口，stdout 仅协议帧，日志→stderr）+ `apps/gui/scripts/native/`（复用 CLI SEA 流水线，native deps 空）→ darwin-arm64 SEA 二进制 | 可 fork，能响应 `core.getCoreInfo` RPC |
| **P2** | `apps/gui/protocol/SPEC.md`（语言无关 NDJSON 线协议，明确无裸 \n）+ Xcode 工程 + `ByfEngineService`（fork + 崩溃检测 + 重启）+ `RpcClient`（Swift NDJSON 帧读写 + 读线程 + 无界队列） | 窗口打开，跨进程完成一次 echo RPC |
| **P3** | `NSSplitView` + Sidebar（workspace → session 树，走 `core.listSessions`）+ `NSTabView`（多 session） | 左侧可导航多 session |
| **P4** | `ChatViewController`（每消息独立 NSTextView + TextKit2，`NSTableView` 虚拟化，流式 append 节流 16ms，swift-markdown）+ `InputBarView`（`@file` + `/command` + `/skill`） | 能对话、收流式回复 |
| **P5** | `ToolCallCardView`（折叠/展开）+ thinking 展示 + `tool.result` 渲染 | tool call 可视化 |
| **P6** | Approval 弹窗（`requestApproval` 反向 RPC）+ Question 弹窗 + model/permission/thinking 切换 | 完整 agent 交互 |
| **P7** | 欢迎页 + 启动 session 恢复（`resumeSession` + replay hydrate）+ 崩溃恢复验证（`warning` 提示续跑）+ session 单写者 lease + settings | 产品级体验 |

## Acceptance Criteria

- `packages/gui-core` 通过 `pnpm build`，有 framing/dispatcher 单测。
- gui-core SEA 二进制在 darwin-arm64 可独立运行，独立签名通过。
- Swift `RpcClient` 能完成双向 RPC：发 `core.createSession` 收 response、收 `event` notification、处理 `requestApproval` 反向 request。
- 能与现有 CLI session 共存（共享 ~/.byf），多 session 并行无冲突。
- 同 session 被两端打开时，GUI 给出占用提示。
- 子进程崩溃后，Swift 重 fork 并 `resumeSession` 恢复，UI 用 `warning` 提示未完成 turn。
- 聊天流式渲染在 1000+ 条历史下不卡顿（NSTableView 虚拟化 + 节流）。
- 协议层无任何 plan 相关方法暴露。

## Definition of Done

- P0–P7 全部交付。
- `docs/prd/PRD-0001` Status → Done。
- 新增 ADR `0016-gui-json-rpc-transport`（记录协议选型）。
- changesets 覆盖：node-sdk（patch 清理 + minor runtime 透传）、gui-core（minor 新包）、apps/gui（无 package 影响）。

## Open Questions

无（所有决策已收敛）。
