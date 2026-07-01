# [DONE] PRD-0012: WebSearch 多 Provider 支持

## 状态：Done

## 问题描述

WebSearchTool 目前只能通过一个远程 HTTP 搜索服务（`RemoteWebSearchProvider`）工作，当没有配置该服务时工具**完全不可用**。这导致几个问题：

1. **无配置则无搜索能力**——FetchURL 有本地 fallback，WebSearch 没有
2. **单一后端锁定**——用户无法选择或切换搜索 provider
3. **无容错**——单个搜索服务故障使工具不可用
4. **TOML key 不匹配**——代码用 `byfSearch`/`byfFetch`，但文档写的是 `web_search`/`web_fetch`，导致 Zod 静默丢弃配置

与此同时，现有的 `WebSearchProvider` 接口已经存在但只有一种实现。

## 解决方案

### 架构

```
LLM → WebSearchTool（不变，单一工具）
         └─ PriorityRouter（新增）— 按优先级尝试 provider，失败时回退
              ├─ ExaWebSearchProvider
              ├─ BraveWebSearchProvider
              ├─ FirecrawlWebSearchProvider
              └─ ...更多在 registry.ts
```

- **LLM 看到单一工具**：`WebSearch` 带简洁的输入模式（`query`、`limit`、`include_content`）
- **后端切换透明**：无需 MCP，无需额外工具定义
- **基于优先级的回退**：按顺序尝试 provider，自动故障转移
- **`api_keys` 始终为 `string[]`**：统一，心智模型最小化

### Provider 注册表

`providers/registry.ts` 中的静态映射——provider 类型 → 类 + 默认 URL 的唯一事实来源：

```typescript
export const webSearchProviderRegistry = {
  exa: {
    Provider: ExaWebSearchProvider,
    defaultBaseUrl: 'https://api.exa.ai/search',
  },
  brave: {
    Provider: BraveWebSearchProvider,
    defaultBaseUrl: 'https://api.search.brave.com/res/v1/web/search',
  },
  firecrawl: {
    Provider: FirecrawlWebSearchProvider,
    defaultBaseUrl: 'https://api.firecrawl.dev/v2/search',
  },
} as const;

export type ProviderType = keyof typeof webSearchProviderRegistry;
```

Zod `type` 枚举和 `DEFAULT_BASE_URLS` 从此注册表派生，确保添加新 provider 时的一致性。

## 用户故事

1. 作为用户，我可以在 `config.toml` 中配置多个搜索 provider，带基于优先级的回退。
2. 作为用户，我可以在同一个 provider 条目下使用多个 Exa API key。
3. 作为用户，我只需要知道 `WebSearch` 作为搜索工具——LLM 不需要知道每个 provider 的工具名。
4. 作为用户，当一个 provider 失败时（认证/限速/服务端错误/超时），WebSearch 自动回退到下一个优先级的 provider。
5. 作为用户，我可以覆盖任何 provider 的 `base_url`（例如使用代理或自托管端点）。

## 需求

### 功能

1. **多 Provider 配置**：支持 TOML 中的 `[[services.web_search.providers]]` 表数组，包含 `type`、`api_keys`、`priority`、可选 `base_url`。
2. **优先级排序**：按 `priority` 升序尝试 provider。
3. **回退逻辑**：provider 抛出的任何错误触发回退到下一个 provider（认证 401/403、限速 429、服务端 5xx、客户端 400、网络超时等）。空结果（`[]`）**不**触发回退——provider 确实没有找到结果是有效答案。
4. **全 provider 失败行为**：返回空结果并附最后错误描述。不抛出。
5. **Provider 签名**：
   - Exa：`POST { query, numResults }` → `results[].{ title, url, text }`
   - Brave：`GET ?q=&count=` → `web.results[].{ title, url, description, age }`
   - Firecrawl：`POST { query, limit }` → `data.web[].{ title, url, description }`
6. **配置 key 重命名**：`byfSearch` → `web_search`（TOML key，映射到代码中 `webSearch`）。 `byfFetch` → `fetch_url`（TOML key，映射到代码中 `fetchUrl`）。旧 key（`byfSearch`、`byfFetch`）从未公开可用（文档/代码不匹配），因此无需弃用路径——直接重命名。
7. **默认 Base URL**：每种内置类型有已知的默认 `base_url`。用户只需要 `type` + `api_keys` + `priority`。

### 非功能

1. **不要求零配置**：如果未配置 `[services.web_search]`，WebSearchTool 不注册（与当前行为一致）。
2. **Provider 隔离**：一个 provider 的 bug 不应影响其他 provider。
3. **无 MCP 依赖**：搜索完全通过直接 REST 调用工作，不需要 MCP 基础设施。
4. **无向后兼容问题**：旧 `byfSearch`/`byfFetch` key 从未与文档对齐，也不可能被成功使用；直接重命名，无需迁移路径。

## 验收标准

1. 加载带 2 个以上 provider 的 TOML 配置后，WebSearch 显示为可用工具。
2. 优先级 1 的 provider 返回结果时，优先级 2 的 provider 不被调用。
3. 优先级 1 的 provider 返回 503 时，优先级 2 的 provider 被自动调用。
4. 优先级 1 的 provider 返回 200 和空数组（无结果）时，优先级 2 的 provider **不**被调用。
5. 所有 provider 失败时，工具返回 `{ isError: true }` 并附带错误消息（PriorityRouter 抛 `AllProvidersFailedError`，WebSearchTool 捕获并格式化）。
6. 带多个 api_keys 的单个 provider 先轮转 key 再回退。
7. `base_url` 覆盖生效（用户指定的 URL 优先于默认）。
8. 旧配置 key（`byfSearch`/`byfFetch`）不存在于 schema 中——旧 key 从未实际可用（文档/代码不匹配阻止了真实使用），因此直接重命名。

## 完成定义

- Zod schema 更新为支持 `services.web_search`（含 `providers[]`）和 `services.fetch_url`
- `webSearchProviderRegistry` 创建为类型 → 类 + 默认 URL 映射的唯一事实来源
- `createRuntimeConfig()` 从配置构建 `PriorityRouter`
- `ExaWebSearchProvider` 实现字段映射（snippet = text 截断 300 字符，content = includeContent 时全量 text）
- `BraveWebSearchProvider` 实现字段映射（snippet = description，content 始终 undefined）
- `FirecrawlWebSearchProvider` 实现字段映射（snippet = description，content = 初始 undefined；无 scrape 调用）
- `PriorityRouter` 实现回退逻辑（所有错误触发回退，空结果不触发）
- 所有 provider 遵循错误约定：`Error('{ProviderName} search failed: HTTP {status} {statusText}')`
- `transformServiceData` 处理 `providers[]` 数组递归的 snakeToCamel
- `servicesToToml()` 将 `[[services.web_search.providers]]` 写为表数组，fetch 的 key 为 `fetch_url`
- `RemoteWebSearchProvider` 移除（由各类型 provider 取代）
- 中英文配置文档更新
- 生成 changeset（新功能 `minor` 升级）

## 非目标

| 项                                                     | 理由                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| Provider 特定高级参数进入工具模式（如 Exa `category`）  | 保持 LLM 接口简洁；未来可按需添加                                       |
| 多 provider 结果合并                                   | 复杂度不合理；基于优先级的首胜机制已足够                                 |
| 搜索结果缓存                                           | 独立关注点，可后续添加                                                   |
| `custom` provider 类型                                 | 零代码 API 适配器复杂且脆弱；使用小众 API 的用户可以用 Bash             |
| 本地搜索 provider（DDG/searxng）                       | 不需要，因为搜索总是用 provider API key 配置                            |
| 基于 MCP 的搜索 provider                               | 用户明确不希望搜索依赖 MCP                                              |

## 技术方案

### 配置 Schema 变更

```typescript
const WebSearchProviderConfigSchema = z.object({
  type: z.enum(['exa', 'brave', 'firecrawl']),
  api_keys: z.array(z.string().min(1)).nonempty(),
  base_url: z.string().optional(),
  priority: z.number().int().positive(),
});

const WebSearchConfigSchema = z.object({
  providers: z.array(WebSearchProviderConfigSchema).nonempty(),
});

const ServicesConfigSchema = z.object({
  webSearch: WebSearchConfigSchema.optional(),
  fetchUrl: ByfServiceConfigSchema.optional(),
});
```

同时接受旧 key（`byfSearch`、`byfFetch`），用 `.refine()` 记录弃用警告。

### 运行时配置

```typescript
const webSearchConfig = config.services?.webSearch;
const webSearcher = webSearchConfig
  ? new PriorityRouter(
      webSearchConfig.providers
        .sort((a, b) => a.priority - b.priority)
        .map((p) => createProvider(p)),
    )
  : undefined;
```

### Provider 接口

```typescript
interface WebSearchProvider {
  search(
    query: string,
    options?: { limit?: number; includeContent?: boolean; toolCallId?: string },
  ): Promise<WebSearchResult[]>;
}
```

### PriorityRouter

```typescript
class PriorityRouter implements WebSearchProvider {
  constructor(private readonly providers: WebSearchProvider[]) {}

  async search(query: string, options?: SearchOptions): Promise<WebSearchResult[]> {
    let lastError: string | undefined;
    for (const provider of this.providers) {
      try {
        const results = await provider.search(query, options);
        return results; // 首次成功——包括空数组（无结果）
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        continue;
      }
    }
    throw new AllProvidersFailedError(lastError);
  }
}
```

**错误流**：PriorityRouter 在所有 provider 失败时抛 `AllProvidersFailedError`。WebSearchTool 的现有 `catch` 块捕获它，`classifySearchError()` 将其分类为 `Search failed:`，向 LLM 返回 `{ isError: true }`。空结果（`[]`）作为正常成功通过，输出 "No search results found."

### Provider 错误约定

所有 provider 实现遵循简单约定：HTTP 错误时抛普通 `Error`，包含 provider 名称和 HTTP 状态：

```typescript
if (!response.ok) {
  throw new Error(`Exa search failed: HTTP ${response.status} ${response.statusText}`);
}
```

PriorityRouter 不区分错误类型——任何抛出的错误都触发回退。最后一条错误消息流入 `AllProvidersFailedError` 并通过 `classifySearchError` 展示给 LLM，因此错误消息应有意义。

### 字段映射：API 响应 → WebSearchResult

| WebSearchResult | Exa (`results[]`)                     | Brave (`web.results[]`)           | Firecrawl (`data.web[]`)                         |
| --------------- | ------------------------------------- | -------------------------------- | ------------------------------------------------ |
| `title`         | `title`                               | `title`                          | `title`                                          |
| `url`           | `url`                                 | `url`                            | `url`                                            |
| `snippet`       | `text` 截断至 300 字符                 | `description`                    | `description`                                    |
| `date`          | `publishedDate`                       | `age`                            | _(不可用)_                                       |
| `content`       | `text` 全文（仅当 `includeContent`）  | _(不可用)_                       | _(初始不可用；scrape 调用推迟)_                   |

原则：

- **诚实的能力边界**：Brave 没有全文，Firecrawl 没有日期——不造假。LLM 会适应。
- **`snippet` 始终存在**：在无需 `includeContent` 的情况下给 LLM 足够上下文判断相关性。
- **`content` 尽力而为**：仅在 `includeContent` 为 true 且 provider 支持时填充。

### 默认 base_urls

```typescript
const DEFAULT_BASE_URLS: Record<string, string> = {
  exa: 'https://api.exa.ai/search',
  brave: 'https://api.search.brave.com/res/v1/web/search',
  firecrawl: 'https://api.firecrawl.dev/v2/search',
};
```

## 实现计划

### 第一阶段（核心）

1. `config/schema.ts`——新的 WebSearch schema + fetchUrl 重命名
2. `config/toml.ts`——transformServiceData：递归进 `providers[]` 做 snakeToCamel
3. `config/toml.ts`——servicesToToml：将 `[[services.web_search.providers]]` 写为表数组
4. `providers/registry.ts`——webSearchProviderRegistry：静态 provider 类型 → { class, defaultBaseUrl } 映射（Zod enum + 默认值的唯一事实来源）
5. `providers/exa.ts`——ExaWebSearchProvider
6. `providers/brave.ts`——BraveWebSearchProvider
7. `providers/firecrawl.ts`——FirecrawlWebSearchProvider
8. `providers/router.ts`——PriorityRouter + AllProvidersFailedError
9. `providers/remote-web-search.ts`——删除（旧的单一实现）
10. `rpc/core-impl.ts`——从配置构建 PriorityRouter
11. `docs/*.md`——配置文件文档更新

### 第二阶段（打磨）

12. 错误处理优化
13. 测试（现有测试文件）

## 决策（ADR-lite）

| 决策                                                   | 理由                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 表数组（`[[providers]]`）而非嵌套表                     | TOML 原生、简单 Zod 校验、扁平的优先级排序                                                  |
| `api_keys` 始终为 `string[]`                           | 统一，心智模型最小化；单 key 是 `["sk-..."]`                                               |
| 基于优先级首胜而非结果合并                              | 延迟更低、逻辑更简单、对容错已足够                                                         |
| 静态 `webSearchProviderRegistry` 作为唯一事实来源        | 类型安全；Zod 枚举和默认 URL 从 registry key 派生；可预测，无需插件基础设施                 |
| Provider 特定参数排除在工具模式外                       | 保持 LLM 接口简洁；provider 内部处理默认值                                                  |
| `base_url` 可选带默认值                                 | 用户只需 `type` + `api_keys` + `priority` 即可开始                                         |
| 空结果不触发回退                                       | 防止误报；provider 说"无结果"是有效的                                                      |

## 领域术语

| 术语            | 定义                                                                                   |
| --------------- | -------------------------------------------------------------------------------------- |
| Search Provider | 单个搜索后端条目，由 `type` + `api_keys` + `priority` 定义。详见 CONTEXT.md。          |
| PriorityRouter  | 按 `priority` 升序尝试 Search Provider 的路由器，带自动回退                              |
| 回退条件         | 认证错误/限速/服务端错误/超时——触发下一个 Search Provider                               |
| Provider 类型   | 内置标识符（`exa`、`brave`、`firecrawl`），映射到 Search Provider 类的内置标识符        |

## 开放问题

- [x] 每次 provider 调用的精确超时——已解决：依赖 proxied-fetch 的 60s 超时
- [x] 单个 provider 内的重试策略——已解决：在一个 search() 调用内通过 api_keys 顺序回退，每次新调用重置到第一个 key

## 追踪

- Grill 讨论：2026-06-20（重新 grill：12 项已解决）
- ADR：`docs/adr/0018-websearch-multi-provider.md`
- CONTEXT.md：新增 "Search Provider" 术语
- **由 `/story` 切片** → 下方子 Issue
- **切片为**：
  - #171 — [PRD-0012] Exa Provider — 端到端跟踪弹 — Done
  - #172 — [PRD-0012] Brave Provider — Done
  - #173 — [PRD-0012] Firecrawl Provider — Done
  - #174 — [PRD-0012] 文档、Changeset 和 AC 验证 — Done
- **由 `/tdd` 实现**（issue #171、#172、#173、#174）——所有验收标准通过
- **由 `/improve-architecture` 架构审查**（2026-06-24）——子 issue 状态已核实（#171-#174 均 CLOSED）
