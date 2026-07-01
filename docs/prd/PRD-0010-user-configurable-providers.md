# [DONE] PRD-0010: 通过 /login 自定义 Provider

## 问题描述

BYF 从上游 fork 继承了一套硬编码的 API 平台定义（`byf-cn`、`byf-ai`），URL 是占位符。用户无法连接到任意的 OpenAI 兼容服务。`/login` 和 `/logout` 命令是禁用的空壳。用户只能用 `/connect` 连接 models.dev 目录中的知名 provider。

## 解决方案

用可自定义的 provider 取代硬编码的平台系统。恢复 `/login` 命令，用户指定名称、Base URL 和 API key 来添加自定义 OpenAI 兼容 provider。恢复 `/logout` 命令删除指定 provider。模型从 provider 的 `/models` 端点自动拉取，带手动输入 fallback。首次运行引导用户选择 `/login`（自定义）或 `/connect`（目录）。

## 用户故事

1. 作为 BYF 用户，我想运行 `/login` 添加自定义 OpenAI 兼容 provider，以便使用我能访问的任何 LLM API
2. 作为 BYF 用户，我想在 `/login` 时给 provider 命名，以便区分多个 provider
3. 作为 BYF 用户，我想在 `/login` 时输入 `base_url`，以便连接到任意 OpenAI 兼容端点
4. 作为 BYF 用户，我想在 `/login` 时输入 `api_key`，以便我的请求能通过认证
5. 作为 BYF 用户，我想 `/login` 后 BYF 自动拉取可用模型列表，以便选择正确的模型，无需手动配置
6. 作为 BYF 用户，我想在自动拉取失败时手动输入模型名，以免被不兼容或不可达的 `/models` 端点阻塞
7. 作为 BYF 用户，我想通过多次 `/login` 配置多个 provider，以便同时使用不同的 LLM 服务
8. 作为 BYF 用户，我想通过 `/model` 在不同 provider 的模型间切换，以便为每个任务选择最佳模型
9. 作为 BYF 用户，我想运行 `/logout <name>` 删除某个 provider，以便清理不再使用的 provider
10. 作为 BYF 用户，我想 `/logout` 同时删除该 provider 的所有模型，以免过期模型弄乱配置
11. 作为 BYF 用户，我想 `/logout` 在删除的 provider 是默认模型时清除默认设置，以免引用不存在的 provider
12. 作为新 BYF 用户，我希望首次运行引导让我在 `/login`（自定义 provider）和 `/connect`（目录 provider）之间选择
13. 作为 BYF 用户，我希望 `/connect` 对知名 provider 继续可用，以便快速配置 OpenAI、Anthropic 等
14. 作为 BYF 用户，我希望 `/model` 显示所有 provider（自定义和目录）的模型并标明所属 provider
15. 作为高级 BYF 用户，我想在配置文件中设置 `allowedPrefixes` 来过滤模型列表，以便只看到与我相关的模型
16. 作为 BYF 用户，我希望 provider 配置以 `openai-compat` 类型存储，以便系统无论来源都统一处理

## 实现决策

### 模块 1：Provider 配置函数（packages/oauth）

重构 `open-platform.ts`，移除所有硬编码平台概念：

- **删除**：`OpenPlatformDefinition` 类型、`OPEN_PLATFORMS` 常量、`getOpenPlatformById`、`isOpenPlatformId`
- **重命名** `fetchOpenPlatformModels` → `fetchModels`：参数改为 `(baseUrl, apiKey, fetchImpl, signal?)` 而非 platform 对象。返回 `ModelInfo[]`。HTTP 错误时抛 `ProviderApiError`
- **重命名** `applyOpenPlatformConfig` → `applyProviderConfig`：参数改为 `(config, { name, baseUrl, apiKey, models, selectedModel, thinking })`。`name` 参数作为配置中的 provider key。写入 provider 为 `type: 'openai-compat'`
- **重命名** `removeOpenPlatformConfig` → `removeProviderConfig`：参数改为 `(config, providerName)`。删除 provider 条目及其所有模型，如果 `defaultModel` 属于该 provider 则清除
- **简化** `filterModelsByPrefix`：参数改为 `(models, prefixes)`，移出 platform 对象，行为不变
- **保留** `OpenPlatformApiError` 类——重命名为 `ProviderApiError` 以匹配新术语
- **保留** `ModelInfo`、`ModelAlias`、`ConfigShape`、`capabilitiesForModel` 类型不变
- **更新** `packages/oauth/src/index.ts` 导出以反映新名称
- **删除** `packages/oauth/test/open-platform.test.ts`，重写为 `packages/oauth/test/provider-config.test.ts`，覆盖所有重构后的函数

### 模块 2：/login 命令处理（apps/cli）

在 `byf-tui.ts` 中新建 TUI 流程，注册到斜杠命令注册表：

1. **名称输入**：输入 provider 名称（如 "deepseek"），非空、无空格、不与现有 provider 冲突
2. **Base URL 输入**：带默认建议 `https://api.openai.com/v1` 的文本输入
3. **API key 输入**：文本输入（终端支持时掩码显示）
4. **模型拉取**：调用 `fetchModels(baseUrl, apiKey)`。成功时显示模型选择器。失败时（网络错误、非标准响应、认证失败）显示错误并提示手动输入模型名
5. **手动模型输入**：输入模型 ID（如 "gpt-4o"），提示 `maxContextSize` 默认值 128000
6. **应用**：调用 `applyProviderConfig()` 写入配置，打印确认信息（provider 名和模型）

该命令替换当前的空壳提示 "Use /connect to configure a provider。"

### 模块 3：/logout 命令处理（apps/cli）

恢复 `byf-tui.ts` 中的空壳：

- 接受一个参数：provider 名称（必填）
- 验证 provider 存在于配置中
- 调用 `removeProviderConfig(config, providerName)`
- 打印确认信息
- 如果被删除的 provider 是当前活跃模型，提示运行 `/login` 或 `/connect` 配置新的

### 模块 4：首次运行引导（apps/cli）

- **欢迎面板**（`welcome.ts`）：将提示从 "Run /connect to configure a provider" 改为同时提供两个选项："/login for a custom provider" 和 "/connect for a known provider"
- **错误消息**（`byf-tui.ts`）：将所有 "Use /connect to configure a provider" 更新为 "Use /login or /connect to configure a provider"
- **平台选择器**（`platform-selector.ts`）：此文件当前未使用，删除。首次运行选择由欢迎面板文字处理，无需选择器组件

### 数据格式

`/login` 写入的 provider 配置：

```
providers:
  deepseek:
    type: openai-compat
    baseUrl: https://api.deepseek.com/v1
    apiKey: sk-xxx
models:
  deepseek/deepseek-chat:
    provider: deepseek
    model: deepseek-chat
    maxContextSize: 65536
    capabilities: [thinking, tool_use]
defaultModel: deepseek/deepseek-chat
```

与今天 `applyOpenPlatformConfig` 生成的格式一致，只是用用户选择的名称代替了硬编码的平台 ID。

## 测试决策

### 模块 1：Provider 配置函数（oauth 包）

- **单元测试** 在 `test/provider-config.test.ts` 中替换 `test/open-platform.test.ts`
- 测试 `fetchModels`：mock fetch 的成功、HTTP 错误、响应格式错误、网络错误
- 测试 `applyProviderConfig`：向空配置添加 provider 和模型、替换同一 provider 的现有模型、保留其他 provider 的模型
- 测试 `removeProviderConfig`：删除 provider 及其模型、清除属于被删 provider 的 defaultModel、保留其他 provider
- 测试 `filterModelsByPrefix`：有前缀、无前缀（返回全部）、空列表
- 已有先例：现有的 `open-platform.test.ts` 用旧签名覆盖了相同场景

### 模块 2：/login 命令处理

- **集成测试** 使用 `apps/cli/test/` 中现有的 TUI 测试模式
- 测试完整流程：mock fetch 返回模型→验证配置正确写入
- 测试 fallback 流程：mock fetch 失败→手动模型输入→验证配置正确写入
- 测试校验：空名称、名称冲突、空 base_url、空 api_key

### 模块 3：/logout 命令处理

- **单元测试**：验证 `removeProviderConfig` 被正确调用
- 测试错误情况：不存在的 provider 名称
- 测试删除 provider 后清除活跃模型

### 模块 4：首次运行引导

- **快照测试**：验证欢迎面板同时提到 `/login` 和 `/connect`
- Grep 测试：确保没有残留的 "Use /connect to configure" 消息而不提 `/login`

## 非目标

- **`/connect` 重构**：目录 provider 流程保持不变
- **`/model` 命令**：无需改动——它已显示 provider 名称并支持切换
- **配置迁移**：旧 `byf-cn`/`byf-ai` 条目不做自动迁移。使用现有配置的用户需要重新运行 `/login`
- **`allowedPrefixes` UI**：仍为手动配置文件设定，不在命令中暴露
- **API key 加密**：API key 以明文存储在配置文件中，与当前一致
- **Provider 健康检查**：不做定期验证 provider 可达性
- **非 OpenAI 兼容 provider**：`/login` 仅支持 OpenAI 兼容 API。其他协议（如 Anthropic 原生）使用 `/connect`

## 补充说明

- 决策记录见 ADR 0002（`docs/adr/0002-user-configurable-providers.md`）
- Provider、Catalog Provider、`/login`、`/connect`、`/logout` 的定义见 `CONTEXT.md` 术语表
- oauth 包中的 `no-oauth-references.test.ts` 应更新以反映新的导出（重命名的函数、删除的 `OPEN_PLATFORMS` 常量）
