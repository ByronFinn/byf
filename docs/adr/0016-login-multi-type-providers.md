# ADR 0016: /login 多类型 Provider

日期：2026-06-18

## 状态

已接受

## 背景

ADR 0002 将 `/login` 确立为用户配置 provider 的入口，带有一个硬约束（决策点 #7）："Provider 类型始终为 `'openai-compat'`。"当时这已足够——通往非 OpenAI provider 的唯一路径是 `/connect`，它从 models.dev 目录推导线类型。

这个缺口在实践中暴露出来：想要通过自带 Base URL 连接到 Anthropic 原生端点（或自定义 Anthropic 兼容网关）的用户无法通过 `/login` 实现。他们要么伪装成 OpenAI 兼容（依赖代理转换线格式），要么放弃 `/login` 改用 `/connect`（需要目标 provider 在目录中）。两者都不符合 `/login` 存在的理由——"自定义 provider，自己的端点"工作流。

`/grill` 期间的代码审查揭示了一个约束第一个版本边界的额外因素：`google-genai` 和 `vertexai` provider 运行时不消费用户提供的 `baseUrl`——`runtime-provider.ts` 没有将 `baseUrl` 传入 google-genai 的 kosong 配置，且 `GoogleGenAIChatProvider` 忽略它。因此为这些类型暴露 base URL 字段会将一个运行时静默丢弃的值持久化到 TOML，违反"自定义 URL 必须生效"的承诺。这被推迟，而非设计上排除。

## 决策

`/login` 不再硬编码单一接口类型。流程在第一步获得类型选择步骤，提供 base URL 传播端到端可用的类型：

1. `openai-completions`——OpenAI Chat Completions 兼容（行为不变）
2. `openai_responses`——OpenAI Responses API（与 openai-completions 共享 `/models` 端点）
3. `anthropic`——Anthropic 原生端点

对每种类型：

- 使用原生模型列表拉取器（`@byfriends/oauth` 中的 `fetchModelsByType`），而非对所有类型使用 OpenAI 兼容形态。Anthropic 拉取器使用 `x-api-key` + `anthropic-version` 头部并处理 `has_more`/`last_id` 分页。
- 写入 TOML 的 provider `type` 字段与用户选择一致。
- Base URL 通过占位提示输入（该类型的官方默认值），留空 = 使用官方默认值。

`google-genai` 和 `vertexai` 被显式推迟，直到 base URL 传播到这些运行时 provider 的实现完成（单独工作）。这仅取代了 ADR 0002 决策点 #7；所有其他 ADR 0002 决策（多 provider、`/logout <name>`、目录 provider 的 `/connect`、拉取失败时手动输入模型）仍然有效。

目录增强（ADR 0012）继续统一应用于所有 `/login` 类型——模型 ID 与 models.dev 匹配，无论类型如何，因为 Claude 模型的目录元数据是权威的。

## 结果

### 正面

- 用户可以直接通过 `/login` 连接到 Anthropic 原生端点和 Anthropic 兼容网关，无需 OpenAI 兼容转换代理。
- TOML 中的 `type` 字段准确反映线协议，消除了 Anthropic 端点被误标为 `openai-completions` 的潜在不匹配。
- Base URL 承诺（"自定义 URL 生效"）对每个提供的类型都成立——无不静默丢弃，因为无法兑现该承诺的类型被排除。

### 负面

- `/login` 增加了一个步骤。连接到 OpenAI 兼容 provider 的用户（今天常见情况）多做一次选择。
- 每种类型的原生拉取器在 `@byfriends/oauth` 中增加了维护面（Anthropic 分页、OpenAI Responses 特殊性）。未来的 provider 类型需要自己的拉取器。
- `google-genai`/`vertexai` 用户仍然无法使用 `/login` 自带端点；他们必须使用 `/connect`（目录）或等待 base URL 传播工作。
- Base URL 约定（baseUrl 包含版本路径，如 `/v1`；拉取器追加 `/models`）是端到端的：不遵循此约定的自定义代理将在列表和运行时聊天中一致失败。

## 考虑的替代方案

- **保持 ADR 0002 原样（始终 openai-compat）**：被拒绝——残留原生端点工作流不支持，即原始问题。
- **现在实现包括 google-genai/vertexai 在内的所有五种类型**：被拒绝——google-genai 的运行时忽略 `baseUrl`（在 `runtime-provider.ts` + `GoogleGenAIChatProvider` 中已核实），因此发布它会持久化一个静默忽略的配置值，违反自定义 URL 承诺。最好等到传播修复落地。
- **从 Base URL 启发式推导类型**：被拒绝——脆弱（许多代理模拟多种线类型）且移除了用户对非明显网关显式声明的能力。
- **将所有非 OpenAI 类型仅通过 `/connect` 路由**：被拒绝——`/connect` 需要 provider 在目录中列出；自定义/私有 Anthropic 网关正是 `/login` 存在的原因。

## 参考

- [ADR 0002 — 通过 /login 自定义 Provider](0002-user-configurable-providers.md)（决策点 #7 被取代）
- [ADR 0012 — 登录时目录增强](0012-login-catalog-enrichment.md)（增强继续适用）
- `packages/agent-core/src/providers/runtime-provider.ts:280-285`（google-genai 省略 baseUrl——推迟触发点）
- `packages/oauth/src/provider-config.ts:183-227`（`applyProviderConfig` 今天硬编码类型）
