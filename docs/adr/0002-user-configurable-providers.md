# ADR 0002: 通过 /login 自定义 Provider

## 状态

已接受 — **被 [ADR 0016](0016-login-multi-type-providers.md) 部分取代**："Provider 类型始终为 `'openai-compat'`"（下方决策点 #7）已被推翻；`/login` 现在支持多种接口类型。本 ADR 中的其他决策仍然有效。

## 背景

BYF 从上游继承了一套硬编码的平台系统：`OPEN_PLATFORMS` 包含 `byf-cn` 和 `byf-ai`，各有固定的 `baseUrl` 和 `allowedPrefixes`。这使 BYF 绑定到了不存在的特定 API 端点（占位符 `.invalid` 域名）。

用户需要连接到任何 OpenAI 兼容的 API（OpenAI、DeepSeek、本地 Ollama 等），而非仅限于预定义的平台。现有的 `/login` 命令是一个重定向到 `/connect` 的空壳。

考虑的方案：

1. **保留硬编码平台** — 用真实 URL 替换占位符，随时间推移添加更多平台
2. **用户可自定义 provider** — 完全移除硬编码平台，让用户通过 `/login` 自行定义

## 决策

我们选择方案 2。移除 `OPEN_PLATFORMS` 和 `OpenPlatformDefinition`。`/login` 命令成为添加自定义 provider 的入口：名称 → base_url → api_key → 选择模型。每个 provider 以用户选择的名称存储在配置中。

关键设计决策：

- `/login` 支持多个 provider
- `/logout <name>` 删除指定 provider
- `/connect` 保留用于目录 provider（models.dev）
- 首次运行提示同时提供 `/login` 和 `/connect`
- 通过 `allowedPrefixes` 过滤模型是手动配置文件设定，不在 `/login` 中暴露
- Provider 类型始终为 `'openai-compat'`
- 如果模型拉取失败，用户可以手动输入模型名

## 结果

- **正面：** 用户可以连接到任何 OpenAI 兼容服务。无需维护硬编码端点。自定义 provider（`/login`）和目录 provider（`/connect`）之间清晰分离。
- **负面：** 用户必须知道自己的 `base_url`——自定义 provider 无自动发现。步骤比预配置平台略多。
- **中性：** oauth 包的 `open-platform.ts` 被重构——`fetchOpenPlatformModels` 等函数变为签名更简洁的 `fetchModels(baseUrl, apiKey)`。捆绑类型 `OpenPlatformDefinition` 被移除。
