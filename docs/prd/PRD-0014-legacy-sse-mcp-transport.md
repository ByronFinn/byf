# PRD-0014: 旧版 SSE MCP 传输支持

**状态**：Done
**创建日期**：2026-06-22
**作者**：BYF
**关联**：CONTEXT.md（MCP 术语表）、docs/zh/customization/mcp.md（用户配置指南）

## 问题

BYF 目前支持两种 MCP 传输类型：**stdio**（本地子进程）和 **streamable HTTP**（MCP 规范的现代 HTTP 传输，`StreamableHTTPClientTransport`）。部分 MCP 服务器——特别是 2025-03-26 规范修订之前发布的旧服务器——只支持**旧版 SSE 传输**（服务端→客户端的长期 GET SSE 流 + 客户端→服务端的 POST）。今天连接到这些服务器的用户会看到令人困惑的连接失败，因为 BYF 没有 `SSEClientTransport` 代码路径。

SDK（`@modelcontextprotocol/sdk`）已经提供了 `SSEClientTransport`，并明确认可将其作为旧版服务器的向后兼容措施（"在迁移期间，客户端可能需要同时支持两种传输"）。代码库的传输架构（判别联合配置 + 工厂模式 `createClient`）使添加第三种传输成为一个范围明确的扩展——唯一不平凡的设计点是终端错误检测，因为 `SSEClientTransport` 的错误语义与 `StreamableHTTPClientTransport` 不同。

## 目标

添加第三种 MCP 传输选项 `transport: "sse"`，通过 SDK 的 `SSEClientTransport` 连接到旧版 SSE-only MCP 服务器。它与 `stdio` 和 `http`（streamable HTTP）作为平等成员共存于判别联合配置和 `createClient` 工厂中。使用旧版 SSE 服务器的用户可以在 `mcp.json` 中显式声明。

## 非目标

- **HTTP→SSE 自动回退**：SDK 推荐的"先试 streamable HTTP，回退到 SSE"模式不包含在 MVP 中。MVP 要求显式 `transport: "sse"`。工厂结构不排除后续添加回退，但推迟以保持范围最小。
- **SSE 的配置简写推断**：裸 `url` 条目继续默认使用 `transport: "http"`。SSE 要求显式 `transport: "sse"`。这是有意为之——SSE 和 HTTP 的配置字段完全相同，推断无法区分。
- **SSE 的挂墙时钟/重试上限健康监控**：`eventsource` 库在瞬时错误上无限重连。MVP 使用最小终端检测（仅 Unauthorized + 服务端强制关闭）。更积极的存活探测推迟到有实际需求时。
- **SSE 特有的用户文档（超出配置指南）**：没有单独的指南页面；现有的配置指南仅更新传输选项。

## 代码已知事实

### 传输架构（3 层）

1. **配置 Schema**（`packages/agent-core/src/config/schema.ts:155-203`）：
   - `transport: 'stdio' | 'http'` 的 Zod 判别联合
   - `McpServerCommonFields` 所有传输共享（enabled、startupTimeoutMs、toolTimeoutMs、enabledTools、disabledTools）
   - `z.preprocess` 从简写推断传输：裸 `command` → `stdio`，裸 `url` → `http`
   - HTTP 配置：`url` + `headers` + `bearerTokenEnvVar`

2. **传输客户端**（`packages/agent-core/src/mcp/client-*.ts`）：
   - `StdioMcpClient` 封装 SDK `StdioClientTransport`；`HttpMcpClient` 封装 `StreamableHTTPClientTransport`
   - 两者都实现 `MCPClient` 接口（listTools/callTool）**加上** `onUnexpectedClose(listener)`（连接管理器使用的运行时约定）
   - 两者都遵循相同的握手前钩子模式：在 `client.connect()` 之前安装 `onclose`/`onerror` 钩子，使用 `ready`/`closed` 锁存器区分握手阶段失败（调用者通过 `connect()` 抛出看到）和就绪后断开（触发 `onUnexpectedClose`）
   - `buildMcpHttpHeaders(config, envLookup)` 在 `client-http.ts` 中——传输无关的头部构建器；可被 SSE 重用

3. **连接管理器**（`packages/agent-core/src/mcp/connection-manager.ts`）：
   - `createClient()` 工厂（第 291-302 行）：根据 `config.transport` 切换
   - `RuntimeMcpClient = StdioMcpClient | HttpMcpClient`（第 40 行）——`entry.client` 的类型
   - `McpServerEntry.transport: 'stdio' | 'http'`（第 19 行）——公开状态标识
   - `resolveOAuthProvider()`（第 304-318 行）：仅对 `transport === 'http'` + 无静态 bearer + 有 token 时附加 OAuth provider
   - `shouldMarkNeedsAuth()`（第 320-330 行）：相同的 `transport === 'http'` 门控

### SDK SSEClientTransport（来自 `@modelcontextprotocol/sdk@1.29.0`）

- **导入**：`import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'`（深路径，非 barrel 导出——与 stdio/streamableHttp 相同模式）
- **构造函数**：`new SSEClientTransport(url: URL, opts?: SSEClientTransportOptions)`
- **与 StreamableHTTP 的重叠选项**：`authProvider`、`requestInit`、`fetch`——都以相同语义接受。SSE 独占：`eventSourceInit`
- **实现 `Transport` 接口**：相同的 `start()`、`send()`、`close()`、`onclose`/`onerror`/`onmessage` 契约。SDK `Client.connect(transport)` 与两者都兼容。
- **标记为 `@deprecated`**："尽可能使用 StreamableHTTPClientTransport。注意，由于部分服务器仍在使用 SSE，客户端可能需要在迁移期间同时支持两种传输。"

### ⚠️ 关键差异：终端错误语义

| 方面                              | `StreamableHTTPClientTransport`                                              | `SSEClientTransport`                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 重连预算                          | 内置（`maxRetries: 2`）；耗尽后 → `"Maximum reconnection attempts exceeded"` | **无**。底层 `eventsource` 库在瞬时错误上**无限**重连                                |
| 终端信号                          | `UnauthorizedError` + 重连耗尽消息                                           | `UnauthorizedError` + `SseError` with `code === 204`（服务器通过 HTTP 204 强制关闭） |
| 现有 `isTerminalTransportError()` | ✅ 可用（匹配 UnauthorizedError + 重连消息）                                 | ❌ **不适用**——SSE 从不发出 "Maximum reconnection attempts"                          |

**影响**：`SseMcpClient` 需要自己的终端错误谓词。重用 `client-http.ts` 的 `isTerminalTransportError` 意味着 SSE 的波动永远不会被解析为终端（除 Unauthorized 外）。

### 可重用辅助函数（`client-shared.ts`）

所有传输无关，可在 `client-sse.ts` 中安全重用：

- `BYF_MCP_CLIENT_NAME`、`BYF_MCP_CLIENT_VERSION`
- `buildRequestOptions(toolCallTimeoutMs, signal)`
- `toMcpToolDefinition(tool)`、`toMcpToolResult(result)`
- `UnexpectedCloseReason`、`UnexpectedCloseListener`

## 需求

1. **新配置 schema** `McpServerSseConfigSchema`：`transport: z.literal('sse')` + `url` + `headers` + `bearerTokenEnvVar` + `McpServerCommonFields`。字段与 HTTP schema 完全相同，只是 `transport` 字面量不同。添加到 `McpServerConfigDiscriminatedSchema`。
2. **新客户端** `SseMcpClient` 在 `packages/agent-core/src/mcp/client-sse.ts`：封装 SDK `SSEClientTransport`，实现 `MCPClient` + `onUnexpectedClose()`，结构上镜像 `HttpMcpClient`（握手前钩子、ready/closed 锁存器、缓冲的 unexpectedClose 重放）。
3. **SSE 专用终端错误谓词** `isTerminalSseError(error)`：使用 `error instanceof SseError`（从 `@modelcontextprotocol/sdk/client/sse.js` 导入）+ `error.code === 204` 对应服务端强制关闭，加上消息嗅探 `/unauthorized/i` 对应认证失败。位于 `client-sse.ts` 中（不共享——传输专用）。**注意**：SDK 的 `SseError` 和 `UnauthorizedError` 类从不设置 `this.name`（默认为 `'Error'`），因此 `error.name` 检查不起作用——必须使用 `instanceof` 或消息嗅探。
4. **连接管理器更新**：`createClient()` 增加 `'sse'` 分支；`RuntimeMcpClient` 联合类型增加 `SseMcpClient`；`McpServerEntry.transport` 扩展为 `'stdio' | 'http' | 'sse'`；`resolveOAuthProvider()` 和 `shouldMarkNeedsAuth()` 门控扩展到 `'http' | 'sse'`（SSE 支持相同的 `authProvider` 选项和 OAuth 流程）。
5. **配置预处理不变**：裸 `url` 仍默认 `'http'`。SSE 需要显式 `transport: "sse"`。
6. **索引再导出**：`packages/agent-core/src/mcp/index.ts` 导出新客户端 + 配置类型。
7. **用户文档更新**：`docs/zh/customization/mcp.md` 添加 `sse` 作为传输选项，附带旧版 SSE 服务器的简要说明。
8. **Changeset**：`@byfriends/agent-core` 的 `minor` 升级（新传输选项，对现有配置无破坏性变更）。

## 验收标准

- [ ] `mcp.json` 条目带 `"transport": "sse"` + `"url": "..."` 能解析、连接、列出工具并对旧版 SSE MCP 服务器调用工具
- [ ] `McpServerSseConfigSchema` 接受与 HTTP 相同的可选字段（headers、bearerTokenEnvVar、enabled、startupTimeoutMs、toolTimeoutMs、enabledTools、disabledTools）
- [ ] 带 `bearerTokenEnvVar` 的 SSE 服务器在连接时从环境变量解析 token（与 HTTP 相同）
- [ ] 返回 401 的 SSE 服务器（无静态 bearer、无预存 OAuth token）翻转为 `needs-auth` 状态，与 HTTP 相同
- [ ] `SseMcpClient` 通过 `isTerminalSseError` 检测终端错误（Unauthorized + code 204）并触发 `onUnexpectedClose`；瞬时错误不触发（eventsource 自动重连）
- [ ] `McpServerEntry.transport` 对 SSE 条目报告 `'sse'`
- [ ] 裸 `url` 条目（无 transport 字段）仍默认 `'http'`，而非 `'sse'`
- [ ] `createClient()` 工厂对 `transport === 'sse'` 选择 `SseMcpClient`
- [ ] `SSEClientTransport` 导入无需特殊抑制——项目的 tsconfig（`deprecation` 未设置）和 oxlint（`typescript/no-deprecated: "off"`）不会标记 `@deprecated` SDK 导入
- [ ] 现有 stdio 和 HTTP 传输测试保持不变且通过
- [ ] 用户文档列出 `sse` 为传输选项
- [ ] 在 `.changeset/` 下生成 `@byfriends/agent-core` 的 `minor` 升级 changeset

## 技术方案

### 决策（ADR-lite）

**D1 — 显式 `transport: "sse"`（无简写推断）**

- SSE 和 HTTP 配置字段完全相同（`url`/`headers`/`bearerTokenEnvVar`）。简写推断无法区分。
- 要求显式 `transport: "sse"` 与判别联合模式一致，使用户意图明确无误。
- 连接到旧版 SSE 服务器的用户知道自己需要 SSE；显式声明有助于调试。

**D2 — 最小终端检测（无挂墙时钟/重试上限）**

- 只有 `UnauthorizedError` 和 `SseError(code===204)` 被视为终端故障。
- 瞬时错误依赖 `eventsource` 库的内置自动重连。
- 权衡：永久离线的服务器（非 204）可能使条目卡在 `connected` 状态，持续重连。MVP 接受此权衡——添加存活探测会增加复杂性和配置面，且无实际需求支撑。工厂结构不排除后续添加存活探测。

**D3 — SSE 专用 `isTerminalSseError`，非共享谓词**

- SSE 和 streamable-HTTP 的终端错误信号根本不同。共享函数加传输条件逻辑不如两个聚焦的谓词清晰。
- `isTerminalTransportError` 留在 `client-http.ts` 中；`isTerminalSseError` 位于 `client-sse.ts` 中。

**D4 — OAuth 流程扩展到 SSE**

- `SSEClientTransport` 接受相同的 `authProvider` 选项。`resolveOAuthProvider()` 和 `shouldMarkNeedsAuth()` 的门控从 `transport === 'http'` 扩展到 `transport === 'http' || transport === 'sse'`。
- 需要 OAuth 的 SSE 服务器获得与 HTTP 相同的 `needs-auth` → 合成认证工具 → 浏览器流程 → 重连路径。

**D5 — `client-sse.ts` 结构上镜像 `client-http.ts`**

- 相同的类结构：构造函数构建 SDK 传输 + `Client`，`connect()` 在握手前安装钩子，`onUnexpectedClose()` 带缓冲重放，`listTools()`/`callTool()` 委托给 SDK 客户端。
- 重用 `buildMcpHttpHeaders` 构建头部。**注意**：`buildMcpHttpHeaders` 的参数类型必须从 `McpServerHttpConfig` 缩小到 `Pick<McpServerHttpConfig, 'headers' | 'bearerTokenEnvVar'>`，以便 SSE 配置可以传入——完整的 `McpServerHttpConfig` 类型有必需的 `transport: 'http'` 字面量，结构上会阻塞 `'sse'`（代码已验证：TypeScript 拒绝 `transport: 'sse'` → `transport: 'http'`）。

### 实现触点（4 个代码文件 + 1 个新增 + 2 个文档）

**新增文件：**

- `packages/agent-core/src/mcp/client-sse.ts`——`SseMcpClient` 类 + `isTerminalSseError()`

**编辑 — `packages/agent-core/src/mcp/client-http.ts`：**

- 将 `buildMcpHttpHeaders` 参数类型从 `McpServerHttpConfig` 缩小到 `Pick<McpServerHttpConfig, 'headers' | 'bearerTokenEnvVar'>`，以便 SSE 配置可以传入而不出现 `transport: 'http'` 字面量不匹配

**编辑 — `packages/agent-core/src/config/schema.ts`：**

- 添加 `McpServerSseConfigSchema`（z.object 带 `transport: z.literal('sse')`，与 HTTP 相同字段）
- 添加到 `McpServerConfigDiscriminatedSchema` 判别联合数组
- 导出 `McpServerSseConfig` 类型
- 预处理：**不变**（裸 `url` → `'http'` 保持不变；SSE 必须显式声明）

**编辑 — `packages/agent-core/src/mcp/connection-manager.ts`：**

- `RuntimeMcpClient` 类型：添加 `| SseMcpClient`
- `McpServerEntry.transport`：扩展到 `'stdio' | 'http' | 'sse'`
- `createClient()`：添加 `if (config.transport === 'sse')` 分支 → `new SseMcpClient(config, {...})`
- `resolveOAuthProvider()`：门控 `config.transport !== 'http'` → `config.transport !== 'http' && config.transport !== 'sse'`
- `shouldMarkNeedsAuth()`：门控 `entry.config.transport !== 'http'` → 相同扩展
- `getHttpServerUrl()`：扩展传输门控以包含 `'sse'`（合成认证工具用于针对服务器 URL 的 OAuth 发现；参与 OAuth 的 SSE 服务器需要相同的 URL 解析）

**编辑 — `packages/agent-core/src/mcp/index.ts`：**

- 重新导出 `SseMcpClient` 和 `McpServerSseConfig`

**编辑 — `docs/zh/customization/mcp.md`：**

- 将 `sse` 添加到传输选项，附带旧版 SSE 服务器的说明，并注明 `http`（streamable HTTP）是新服务器的首选

### 测试（在现有测试文件中）

- 新增 `packages/agent-core/test/mcp/client-sse.test.ts`：SSE 客户端 connect/listTools/callTool、终端错误检测（SseError code 204）、瞬时错误容忍（不触发 unexpected-close）。镜像 `client-http.test.ts` 结构，使用 fake-fetch。
- `packages/agent-core/test/mcp/connection-manager.test.ts`：SSE 条目连接、列工具、调用工具；SSE 401 → needs-auth；终端错误 → failed；`McpServerEntry.transport` 报告 `'sse'`
- 配置 schema 测试：SSE schema 解析 + 拒绝无效配置；裸 `url` 仍默认 `'http'`

## 领域术语

- **旧版 SSE 传输**：原始的 MCP HTTP 传输（2025-03-26 规范修订前）。使用长期 GET Server-Sent Events 流处理服务端→客户端消息，POST 处理客户端→服务端。在规范中已被 Streamable HTTP 取代，但部分服务器仍在使用。SDK 类：`SSEClientTransport`（标记为 `@deprecated`）
- **Streamable HTTP 传输**：MCP 规范的现代 HTTP 传输。支持会话管理、可恢复流和可选的 SSE 流式响应。SDK 类：`StreamableHTTPClientTransport`。BYF 配置传输字面量：`'http'`

## 开放问题

无。所有设计决策已解决（显式 `'sse'` 传输 + 最小终端检测 + SSE 专属错误谓词 + OAuth 扩展到 SSE）。

## 实现计划（小型 PR）

1. **PR1 — SSE 配置 schema + 客户端骨架**：在 `schema.ts` 中添加 `McpServerSseConfigSchema`，创建带 `SseMcpClient` + `isTerminalSseError` 的 `client-sse.ts`，接入 `connection-manager.ts`（工厂 + 类型 + OAuth 门控），更新 `index.ts` 导出。客户端和 schema 的单元测试。
2. **PR2 — 集成测试 + 文档**：端到端 SSE 连接测试（fake-fetch 模式），更新用户文档，生成 changeset。

## 追踪

**思考讨论**：2026-06-22。**Grill**：2026-06-23。代码交叉核对：`config/schema.ts`、`connection-manager.ts`、`client-http.ts`、`client-shared.ts`、`types.ts`、SDK `client/sse.d.ts` + `sse.js`、SDK `client/auth.js`、`tsconfig.json`、`.oxlintrc.json`。

**Grill 已解决项：**

- G1（buildMcpHttpHeaders 类型）：PRD 声称"结构类型可用"实际**不成立**——`transport: 'http'` 字面量阻塞 `'sse'`。修复：将参数缩小到 `Pick<McpServerHttpConfig, 'headers' | 'bearerTokenEnvVar'>`
- G2（缺失触点）：connection-manager 中的 `getHttpServerUrl()` 门控在 `transport !== 'http'`——必须扩展以包含 `'sse'` 用于 OAuth 发现。已添加到实现触点
- G3（isTerminalSseError 检测）：SDK 的 `SseError` 和 `UnauthorizedError` 从不设置 `this.name`（始终为 `'Error'`）。必须使用 `error instanceof SseError` + `error.code === 204`，而非 `error.name` 检查
- G4（弃用 AC 已无关）：项目在 tsconfig 中没有 `deprecation: true`，oxlint 中有 `typescript/no-deprecated: "off"`。导入 `SSEClientTransport` 不会破坏任何构建/检查。AC 已简化
- G5（SSE 401 的 isUnauthorizedLikeError）：现有函数检查错误的 `.code === 401`——`SseError` 携带 `code` 属性。在 D4 的传输门控扩展之外无需修改即可工作
- G6/G7（CONTEXT.md 术语表）：MCP 条目已从 "stdio/HTTP" 更新为 "stdio/HTTP/SSE"，并附有区分 SSE（旧版）和 Streamable HTTP 的说明
- G8（ADR 评估）：没有决策满足所有 3 个条件（难以逆转 + 令人意外 + 真实权衡）。D2（最小终端检测）最接近但未达到"难以逆转"——存活探测是增量添加。未创建 ADR
- G9/G10（测试文件结构）：实际路径是 `packages/agent-core/test/mcp/{client-http,client-stdio,connection-manager,tool-manager-mcp}.test.ts`。新增测试：`client-sse.test.ts`（新文件，镜像 `client-http.test.ts`）。PRD 已更新

**切片为：**

- #182 — [PRD-0014] SSE 传输核心 — 配置 + 客户端 + 管理器接入（AFK，开放）— In Progress
- #183 — [PRD-0014] SSE 文档 + changeset — 发布就绪（AFK，阻塞于 #182，开放）— In Progress

- **Arch reviewed by**: `/improve-architecture` (2026-07-03) — 代码已包含 `client-sse.ts`，但 PRD 状态为 Done 且子 issue 仍标 In Progress，追踪状态不一致为 Medium。
- **Arch reviewed by**: `/improve-architecture` (2026-07-10) — `client-sse.ts` + connection-manager `transport: 'sse'` 已落地；文档/issue 关闭状态建议再核对（Medium 流程债）。

**由以下实现：**

- #182：`packages/agent-core/src/mcp/client-sse.ts`、`packages/agent-core/src/config/schema.ts`、`packages/agent-core/src/mcp/connection-manager.ts`、`packages/agent-core/src/mcp/client-http.ts`、`packages/agent-core/src/mcp/index.ts`、`packages/agent-core/src/rpc/core-api.ts`、`packages/agent-core/src/rpc/events.ts`
- #183：`docs/zh/customization/mcp.md`、`.changeset/sse-mcp-transport-support.md`
