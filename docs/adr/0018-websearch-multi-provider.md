# ADR 0018: WebSearch 多 Provider 架构

## 状态

已接受

## 背景

WebSearch 之前只有单一实现（`RemoteWebSearchProvider`），仅适用于 BYF 私有的远程搜索服务。当没有配置服务时，工具完全不可用。用户无法选择或切换搜索后端（Exa、Brave、Firecrawl 等）。

同时，现有的 `WebSearchProvider` 接口已经存在，但只有一种实现。TOML 配置 key（`byfSearch`/`byfFetch`）也与文档显示的内容（`web_search`/`web_fetch`）不匹配。

一个关键的用户需求浮现：LLM 应该只了解一个搜索工具（`WebSearch`），无论配置了多少后端。这节省了 token（无需向提示注入每个 provider 的工具定义），并在后端变更时保持工具接口稳定。

## 决策

### 1. 直接 REST provider，非 MCP

WebSearch provider（Exa、Brave、Firecrawl）通过直接 REST API 调用通信，而非 MCP 基础设施。理由：

- **Token 效率**：MCP 将每个 provider 展示为单独的工具（`mcp__exa__search`、`mcp__brave__web_search` 等），增加了工具定义 token。单一 `WebSearch` 工具配合简洁的模式更经济。
- **简单性**：搜索无需 MCP 服务器生命周期、连接管理或 OAuth 流程。
- **用户控制**：用户直接在 `config.toml` 中配置搜索后端，使用 API key，无需单独的 `mcp.json` 条目。

### 2. 基于优先级的首胜回退

多个 provider 按 `priority` 升序尝试。第一个返回结果（包括空结果）的 provider 胜出。回退由**任何抛出的错误**触发（认证失败、限速、服务端错误、超时、错误请求）。空结果不触发回退——provider 确实没有找到匹配项是有效答案。

这被选为多 provider 结果合并的替代方案，因为：

- 延迟更低（不等待最慢的 provider）
- 逻辑更简单（无去重、排名或冲突解决）
- 对主要用例已足够：跨 provider 的容错

### 3. `api_keys` 作为 `string[]` 带调用内顺序回退

每个 provider 条目支持多个 API key（`api_keys = ["sk-1", "sk-2"]`）。在单个 `search()` 调用内，key 按顺序尝试——第一个 key 失败，尝试第二个 key。每次新的 `search()` 调用重置到第一个 key。这是无状态且简单的：恢复的 key 自动被重用。

### 4. 静态 `webSearchProviderRegistry` 作为唯一事实来源

Provider 类型（`exa`、`brave`、`firecrawl`）映射到其类 AND 默认 URL，在单个静态注册表对象中。Zod `type` 枚举和 `DEFAULT_BASE_URLS` 从此注册表派生，而非单独维护。添加新 provider = 一个注册表条目；类型安全保证跨 Zod schema、默认值和工厂函数的一致性。

### 5. 配置 key 重命名（无需弃用路径）

`byfSearch` → `web_search`（代码：`webSearch`），`byfFetch` → `fetch_url`（代码：`fetchUrl`）。旧 key（`byfSearch`/`byfFetch`）无弃用路径直接移除：代码和文档从未对齐（文档记录 `web_search`/`web_fetch`，代码接受 `byfSearch`/`byfFetch`），因此没有用户能成功配置旧 key。旧的 `RemoteWebSearchProvider`（BYF 私有协议）被删除——它从未公开发布，配置 key 不匹配意味着没有用户能成功配置它。

### 6. AllProvidersFailedError 传播

当所有 provider 失败时，`PriorityRouter` 抛出 `AllProvidersFailedError`。这流经 `WebSearchTool` 的现有 `catch` 块 → `classifySearchError()` → 向 LLM 返回 `{ isError: true }`。这使错误路径与工具的现有设计保持一致，避免将错误消息伪装为搜索结果。

## 结果

- **添加搜索后端**：创建实现 `WebSearchProvider` 的新 provider 类，添加到注册表，将类型添加到 Zod 枚举。无需更改 `WebSearchTool` 本身。
- **Provider 特定能力**（如 Exa 的 `category`、Brave 的 `freshness`）：不暴露给 LLM。每个 provider 内部使用合理的默认值。未来如果需要，可以提升到工具模式。
- **`include_content` 不对称性**：Exa 和 Firecrawl 原生返回完整页面内容；Brave 只返回摘要。这是可接受的——LLM 将 `content` 视为每个结果上的可选字段，无论哪种方式都正确运行。
- **超时**：无每个 provider 的超时配置。每个 HTTP 请求继承 `proxied-fetch` 的 60s 超时。如果 provider 超时，错误触发回退到下一个 provider。
