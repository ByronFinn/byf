# PRD-0009: macOS Native GUI

**Status**: Sliced
**Created**: 2026-06-18
**Author**: BYF
**Related**: ADR 0006 (monorepo layered architecture), ADR 0008 (remove plan mode), ADR 0018 (gui-core JSON-RPC transport), ADR 0019 (gui session isolation)

## Problem

byf 的交互能力目前只有 `apps/cli`（pi-tui 终端 UI）。终端 UI 在长会话历史浏览、多 session 并行、工具调用可视化、文件审批审查上受限于终端原语。需要一个 **macOS 原生 GUI**，复用同一引擎（agent-core / node-sdk），提供桌面级体验，并为未来 Windows/Linux 原生实现铺路。

## Goal

构建 `apps/gui/macos/`（AppKit 原生）+ `packages/gui-core/`（stdio JSON-RPC 2.0 transport 包）+ `apps/gui/protocol/SPEC.md`（语言无关协议），通过 fork 一个 gui-core SEA 二进制子进程承载 `ByfHarness`，Swift 主程序以 JSON-RPC 双向 RPC 与之通信。

MVP 范围：**仅 macOS**。Windows/Linux 在仓库结构中预留（`apps/gui/windows/`、`apps/gui/linux/` 各放 README），不实现。

## Not Building (Out of Scope)

- `$技能` / `#关联` 新输入语法（v2 特性，需独立立项；MVP 复用 `/skill:<name>` 动态命令 + `activateSkill` RPC）。
- plan mode UI（ADR 0008 已彻底移除；gui-core 协议层不注册 `getPlan`/`enterPlan`/`cancelPlan`/`clearPlan`）。
- **node-sdk plan 死代码的物理删除**（`getPlan`/`clearPlan` + `SessionPlan`/`PlanInfo` 类型）—— **回归 ADR 0008 既定策略**（P0 物理删除，changeset major）。第一轮的 `@deprecated` 方案被否决，因其违背 ADR 0008。
- 远程/SSH/容器 kaos 实现（路径 A 在"Long-term Design"记录；本期仅落地其前置 Issue）。
- Windows / Linux 原生实现（仅预留目录 + README）。
- **跨 workspace 全局 session 视图**（`CoreAPI.listSessions` 强制按单个 workDir 过滤，无"列全部"API；MVP Sidebar 只显示当前工作区的 session）。
- **GUI 内 OAuth 配置流**（`/login` 是交互式 + TTY，管道模式子进程跑不了；MVP 复用 CLI 配好的 `~/.byf/config.toml`，GUI 原生 OAuth 留待 v2）。
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
- 技能：`activateSkill` RPC（`CoreAPI.activateSkill`）。CLI 用 **`/skill:<name>`**（每技能一个动态命令，`buildSkillSlashCommands` 在 `apps/cli/src/tui/commands/skills.ts` 从 `listSkills()` 生成），**不是** `/skill <name>`。
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
│   ├ fork + 崩溃检测/重启     │   • request/response   │   ├ createSession/...        │
│   └ 反向RPC崩溃→reject      │   • notification       │   └ emitEvent → notification │
│  RpcClient (NDJSON 帧读写)   │   • reverse request    │  sdk-bridge                   │
│  SessionManager             │     (approval/question)│   ├ requestApproval → host    │
│  AppKit UI (NSSplitView...) │                        │   └ requestQuestion → host   │
└─────────────────────────────┘                        └──────────────────────────────┘
   session: ~/Library/Application Support/byfDesktop/   config: ~/.byf/config.toml (共享)
       (GUI 隔离)                                       (provider/auth 与 CLI 共享)
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
- **管道模式约束（非 PTY）**：子进程 stdin/stdout 是管道，`isTTY === false`。引擎代码不得有 TTY-only 路径（如交互 prompt、OAuth 交互流）；P0 验证启动无卡死。OAuth 配置 MVP 推后（config 共享，CLI 配好 GUI 用）。

**Backpressure**：
- ⚠️ stdout 写满管道（macOS 默认 64KB）会**同步阻塞 Node 事件循环**（非"天然反压"——若 Swift 端不读，会连累 LLM fetch 的 chunk 处理，极端下 provider 连接超时）。
- 因此 **Swift 端必须及时读 stdout**：`RpcClient` 用专门读线程 + 无界队列吸收突发（内存换不阻塞 stdout 管道）。
- 无界队列设**软上限告警**（如 10000 帧积压时打 stderr log），不做硬反压（硬反压会回流 stdout 阻塞事件循环，更糟）。
- 高频 `assistant.delta` 在 Swift 端 **coalesce 后 flush**（见决策 5），削峰。
- 不做显式 `cork/uncork` 或批量 flush——16ms coalesce 足够。

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
- **host identity 注入**：`main.ts` 入口构造 `ByfHarness` 时传 `uiMode: 'gui'`（与 CLI 的 `'shell'`/`'print'` 并列，作 SessionStart hook 的 source 标签；若 agent-core 侧对 source 有枚举约束需加 `'gui'` 值）+ `identity: createByfHostIdentity(version)`（复用 CLI 工厂，传 GUI 自己的 version）+ `autoLoadConfig: true`。

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

### 决策 6：GUI session 与 CLI session 隔离，config/auth 共享

**隔离 session，共享 config**（见 ADR 0019）：
- `resolveByfHome` 和 `resolveConfigPath` 是两个独立函数（`agent-core/src/config/path.ts`），`ByfHarnessOptions` 同时暴露 `homeDir` 和 `configPath`——可分别指定。
- **GUI `homeDir`** = `~/Library/Application Support/byfDesktop/`（macOS 应用数据规范）——GUI 的 `sessions/`、`session_index.jsonl`、`wire.jsonl` 全部在此，与 CLI 的 `~/.byf/sessions/` 完全隔离。
- **GUI `configPath`** = `~/.byf/config.toml`（共享）——provider/auth/model 与 CLI 共享，用户只配一次。

**这彻底消除了并发撕裂问题**（原方案的核心担忧）：GUI 与 CLI 永不触碰同一 `wire.jsonl`。因此**整条删除**原方案的 lock/lease/占用检测机制——问题不存在，不是推迟。

**取舍**：CLI 创建的 session 在 GUI 不可见（反之亦然）。可接受：session 是 surface 专属的工作流。跨 host 打开（如"在 GUI 打开这个 CLI session"）可未来用 `exportSession`/`forkSession` 实现，默认隔离。

### 决策 7：崩溃恢复范围

**区分四种崩溃**：
| 崩溃类型 | 恢复 | 难度 |
|---|---|---|
| Node 子进程崩溃（SEA 挂掉） | Swift 重 fork + `resumeSession` 重放 wire | 现成，免费 |
| 正在流式输出的 turn 中途崩溃 | wire 里 `turn.prompt` 已记录，但未完成 turn 不会自动续跑 | 需 UX |
| **反向 RPC 进行中崩溃**（approval/question 弹窗已开） | Swift 监听 `terminationHandler`，立即 reject 全部 pending 反向 request（`transport: peer-terminated`），关闭弹窗 + 提示"引擎已断开，正在重启"，再走崩溃恢复 | 需 UX（P6） |
| **含后台任务的崩溃** | resume 后 `BackgroundManager` 把非终态任务 reconcile 为 `'lost'`；GUI 任务面板显示 lost 任务，用户可清理或重启 | 需 UX（P5） |

**UX**：崩溃恢复后，GUI 用 `ResumeSessionResult.warning` 提示"上一轮未完成，是否继续"，**不自动续传**（`Agent.resume()` 只恢复到 turn 开始前状态）。反向 RPC 崩溃的弹窗处理并入 P6（交互闭环），不等到 P7。

### 决策 9：session 关闭语义 + 后台任务生命周期

PRD 原方案完全缺失"关 session"。补全（`core-impl.ts:216` `closeSession` + `session/index.ts:198-220` `keepAliveOnExit`）：

| 场景 | 处理 |
|---|---|
| 用户关 tab | 调 `core.closeSession`。若 session 有 running background task，弹窗确认"有 N 个后台任务在运行：[继续后台（keepAlive）/ 一并停止]"。 |
| 用户退出 app | 逐个 `closeSession`，尊重 `config.background?.keepAliveOnExit`。 |
| 后台任务事件 | `background.task.started/updated/terminated` 是 AgentEvent 一部分，GUI P5 渲染后台任务卡片。 |

### 决策 8：子进程粒度 = 一个 app 一个子进程

CoreAPI 原生多 session，崩溃后重放所有 wire.jsonl。比"每 session 一进程"省内存，且 CoreAPI 设计本就支持多 session。

## Domain Terms

- **gui-core**：`packages/gui-core`，stdio JSON-RPC 2.0 transport 包，包装 `ByfHarness`（见 ADR 0018）。
- **sidecar 引擎**：gui-core 的 SEA 二进制，作为 `.app` 内独立签名可执行文件 spawn。
- **反向 RPC**：core→host 的 `requestApproval`/`requestQuestion`，core 发带 id 的 request，GUI 弹窗后回带 id 的 response。
- **GUI session 隔离**：GUI 用独立 `homeDir`（`~/Library/Application Support/byfDesktop/`）存 session，与 CLI 的 `~/.byf/sessions/` 分离；但共享 `configPath`（`~/.byf/config.toml`）。见 ADR 0019。

## Decision (ADR-lite)

1. **IPC = JSON-RPC 2.0 + NDJSON 分帧**（ADR 0018）。依据：LSP/MCP 行业标准；agent-core 已依赖 MCP SDK；契约本就 JSON 可序列化；反向 RPC 的 id 关联由协议原生解决。
2. **传输层抽象 Transport 接口**，MVP `StdioTransport`，预留 UDS。子进程 stdout 仅协议帧，日志强制 stderr。stdout 满会阻塞事件循环（非"天然反压"），故 Swift 端及时读 + 无界队列吸收突发 + 软上限告警。**管道模式（`isTTY===false`）**：引擎不得有 TTY-only 路径；OAuth 配置 MVP 推后。
3. **gui-core = ByfHarness + transport**，不重写引擎，不自带 session-store（透传 CoreAPI）。`main.ts` 注入 `uiMode: 'gui'` + `identity: createByfHostIdentity(version)` + `autoLoadConfig: true`。method 清单从 `CoreAPI` 类型派生（见 ADR 0018）。
4. **SEA 二进制作为签名 sidecar**（非内嵌 Resources/），复用 CLI native 流水线；gui-core native deps 为空。P1 就绪探针用 `core.listSessions({ workDir })`（`getCoreInfo` 只返 version，无法验证引擎就绪）。
5. **AppKit 主框架**；每消息独立 NSTextView + TextKit2，流式 append 节流 16ms，NSTableView 虚拟化。事件按 `event.sessionId` 路由到对应 tab。
6. **GUI session 与 CLI session 隔离**（ADR 0019）：GUI `homeDir` = `~/Library/Application Support/byfDesktop/`，`configPath` 共享 `~/.byf/config.toml`。**删除**原 lock/lease/占用检测机制（隔离使问题不存在）。
7. **plan mode 协议层不暴露**（ADR 0008）。node-sdk 的 `getPlan`/`clearPlan` + `SessionPlan`/`PlanInfo` 类型 **P0 物理删除**（回归 ADR 0008 既定策略，changeset **major**）。第一轮的 `@deprecated` 方案被否决，因违背 ADR 0008。
8. **Sidebar 仅当前工作区 session**（`listSessions` 强制 workDir 过滤，无"列全部"API）；跨 workspace 全局视图 Out of Scope。
9. **技能命令为 `/skill:<name>`**（每技能一个动态命令，从 `listSkills()` 生成），非 `/skill <name>`。
10. **`@file` 补全新做（不"复用"）**：CLI 的 `file-mention-provider` 绑死 pi-tui，GUI 无法跨 UI 框架复用。补全逻辑下沉到子进程，新增 `workspace.suggestFiles({ query })` JSON-RPC 方法（走 kaos glob + git recency），Swift 只做 UI。避免跨 host 排序逻辑漂移。
11. **远程 kaos 本期仅落地前置 Issue**（node-sdk 透传 `runtime`），实现见 Long-term Design。
12. **session 关闭语义**：关 tab / 退出 app 走 `core.closeSession`，尊重 `keepAliveOnExit`；含 running background task 时弹窗确认；后台任务事件（`background.task.*`）在 P5 渲染。

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
| **P0** | node-sdk **物理删除** `getPlan`/`clearPlan` + `SessionPlan`/`PlanInfo` 类型（回归 ADR 0008，changeset **major**）+ `runtime` 透传（minor）；agent-core 若对 SessionStart source 有枚举约束则加 `'gui'` 值；gui-core 包骨架（Transport 接口 + StdioTransport + framed-stream + errors）；JSON-RPC dispatcher + sdk-bridge；用 stub ByfHarness 单测 framing；**验证管道模式启动无 TTY-only 卡死** | `pnpm build` 产出 gui-core `dist/` |
| **P1** | `apps/gui/src/main.ts`（gui-core 入口，stdout 仅协议帧，日志→stderr，注入 `uiMode:'gui'`+identity，homeDir=`~/Library/Application Support/byfDesktop/`，configPath 共享 `~/.byf/config.toml`）+ `apps/gui/scripts/native/`（复用 CLI SEA 流水线，native deps 空）→ darwin-arm64 SEA 二进制 | 可 fork，**`core.listSessions({ workDir })` 返回非异常**（就绪探针） |
| **P2** | `apps/gui/protocol/SPEC.md`（语言无关 NDJSON 线协议，明确无裸 \n）+ Xcode 工程 + `ByfEngineService`（fork + 崩溃检测 + 重启 + 反向RPC崩溃→reject pending）+ `RpcClient`（Swift NDJSON 帧读写 + 读线程 + 无界队列 + 软上限告警 + 按 `event.sessionId` 路由） | 窗口打开，跨进程完成一次 echo RPC |
| **P3** | `NSSplitView` + Sidebar（**当前工作区**的 session 列表，走 `core.listSessions({ workDir })`）+ `NSTabView`（多 session）+ workspace 切换（重 fork 子进程换 cwd 或触发新 listSessions） | 左侧可导航当前工作区的 session |
| **P4** | `ChatViewController`（每消息独立 NSTextView + TextKit2，`NSTableView` 虚拟化，流式 append 节流 16ms，swift-markdown）+ `InputBarView`（**`@file` 走新 `workspace.suggestFiles` RPC**（含 git recency）+ `/command` + **`/skill:<name>` 动态命令**，从 `listSkills()` 生成补全菜单） | 能对话、收流式回复 |
| **P5** | `ToolCallCardView`（折叠/展开）+ thinking 展示 + `tool.result` 渲染 + **后台任务卡片**（`background.task.started/updated/terminated` 事件 + lost 任务 reconcile 显示） | tool call 与后台任务可视化 |
| **P6** | Approval 弹窗（`requestApproval` 反向 RPC）+ Question 弹窗 + model/permission/thinking 切换 + **反向 RPC 进行中崩溃的弹窗清理**（reject pending + 关闭 + 提示）+ **含后台任务 session 关闭弹窗**（keepAlive / 停止） | 完整 agent 交互 |
| **P7** | 欢迎页 + 启动 session 恢复（`resumeSession` + replay hydrate）+ 崩溃恢复验证（`warning` 提示续跑）+ settings | 产品级体验 |

## Acceptance Criteria

- `packages/gui-core` 通过 `pnpm build`，有 framing/dispatcher 单测。
- gui-core SEA 二进制在 darwin-arm64 可独立运行，独立签名通过。
- 就绪探针：fork 后 `core.listSessions({ workDir })` 返回非异常结果（验证 homeDir 解析 + SessionStore 就绪）。
- Swift `RpcClient` 能完成双向 RPC：发 `core.createSession` 收 response、收 `event` notification、处理 `requestApproval` 反向 request。
- GUI session 存于 `~/Library/Application Support/byfDesktop/`，与 CLI 的 `~/.byf/sessions/` 隔离；config/auth 共享 `~/.byf/config.toml`（用户 `/login` 配的 provider 在 GUI 可用）。
- 子进程崩溃后，Swift 重 fork 并 `resumeSession` 恢复，UI 用 `warning` 提示未完成 turn。
- **反向 RPC 进行中崩溃**（approval 弹窗打开时）：弹窗自动关闭 + 提示，无残留僵尸弹窗。
- 聊天流式渲染在 1000+ 条历史下不卡顿（NSTableView 虚拟化 + 节流）。
- 输入 `/` 补全菜单含动态生成的 `/skill:<name>` 命令（从 `listSkills()` 生成）。
- **`@file` 补全走 `workspace.suggestFiles` RPC**，含 git recency 排序（非复用 pi-tui provider）。
- **含后台任务的 session 关闭时弹窗确认**（keepAlive / 停止）；后台任务卡片在 P5 渲染。
- **管道模式启动无卡死**：子进程 `isTTY===false`，无交互 prompt 阻塞，无 TTY-only 代码路径报错。
- 协议层无任何 plan 相关方法暴露；node-sdk 的 `getPlan`/`clearPlan` + `SessionPlan`/`PlanInfo` 类型已物理删除。

## Definition of Done

- P0–P7 全部交付。
- `docs/prd/PRD-0009` Status → Done。
- changesets 覆盖：node-sdk（**major**：物理删 plan 透传 + 类型；**minor**：runtime 透传）、agent-core（若加 `'gui'` source 枚举值则 patch）、gui-core（minor 新包）、apps/gui（无 package 影响）。

## Open Questions

无（所有决策已收敛并经 `/grill` 验证）。

## Traceability

- **Grilled by**: `/grill` round 1 (completed 2026-06-18) — 9 项解决：3 个 code 矛盾修正（getCoreInfo 假阳性、listSessions 强制 workDir 过滤、`/skill:<name>` 语法）、1 个架构决策反转（session 隔离替代共享+锁，见 ADR 0019）、4 个边缘/技术补强（反向RPC崩溃、stdout 反压措辞、identity/uiMode 注入、plan 死代码降级为 @deprecated）、1 个 CONTEXT.md 事实修正（SSHKaos 未实现）。新增 ADR 0018（JSON-RPC transport）+ ADR 0019（session 隔离）。CONTEXT.md 修正 Kaos 词条 + 新增 uiMode 词条 + 扩充 ByfHarness 词条。
- **Double-grilled by**: `/grill` round 2 (completed 2026-06-18) — 6 项解决：1 个第一轮引入的决策矛盾（`@deprecated` 违背 ADR 0008，改回物理删除 + major bump）、1 个"复用"假设被推翻（`@file` provider 绑死 pi-tui，改为子进程 `workspace.suggestFiles` 新 RPC）、1 个完全缺失的生命周期（closeSession + 后台任务 keepAlive + lost reconcile，新增决策 12）、1 个静默隐患显式化（管道模式 isTTY + OAuth 推后）、1 个实现细节（event.sessionId 路由）、1 个 ADR 补强（ADR 0018 method 清单来源）。
- **Sliced by**: `/story` (completed 2026-06-18) → Child Issues below
- **Sliced into**:
  - #157 — [PRD-0009] node-sdk plan 死代码物理删除 — 回归 ADR 0008 (AFK)
  - #158 — [PRD-0009] node-sdk runtime 透传 + agent-core 'gui' source — 打通自定义 kaos 最后一公里 (AFK, blocked by #157)
  - #159 — [PRD-0009] gui-core 包骨架 + JSON-RPC dispatcher — 子进程可响应 RPC (AFK, blocked by #158)
  - #160 — [PRD-0009] gui-core SEA 二进制 + main.ts 入口 — darwin-arm64 可 fork 子进程 (AFK, blocked by #159)
  - #161 — [PRD-0009] 协议 SPEC + Xcode 工程 + ByfEngineService + RpcClient — 跨进程双向 RPC 闭环 (HITL, blocked by #160)
  - #162 — [PRD-0009] NSSplitView + Sidebar 当前工作区 session 列表 + TabView 多 session (HITL, blocked by #161)
  - #163 — [PRD-0009] ChatViewController 流式消息渲染 — 收 assistant.delta 节流渲染 (HITL, blocked by #162)
  - #164 — [PRD-0009] InputBarView @file 补全 — workspace.suggestFiles RPC + git recency (HITL, blocked by #163)
  - #165 — [PRD-0009] InputBarView /command + /skill:<name> 动态命令补全 (AFK, blocked by #164)
  - #166 — [PRD-0009] ToolCallCardView + 后台任务卡片 — tool call 与 background.task 可视化 (HITL, blocked by #165)
  - #167 — [PRD-0009] Approval + Question 弹窗（反向 RPC）+ 含后台任务 session 关闭 (HITL, blocked by #166)
  - #168 — [PRD-0009] model/permission/thinking 运行时切换 (AFK, blocked by #167)
  - #169 — [PRD-0009] 欢迎页 + session 恢复 + 崩溃恢复验证 + settings (HITL, blocked by #168)
