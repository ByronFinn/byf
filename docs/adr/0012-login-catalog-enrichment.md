# ADR 0012: 登录时目录增强

## 状态

已接受

## 背景

当用户通过 `/login` 配置第三方兼容 provider 时，provider 的 `/models` API 通常不返回丰富的能力元数据（如 `supports_reasoning_effort`）。这导致 `/model` UI 降级——只显示 thinking 的开关切换而非 effort 级别选择——即使底层模型（如 `gpt-5.5`、`claude-opus-4-7`）完全支持分类 effort 控制。

models.dev 目录维护主流模型的权威元数据（能力、上下文限制、reasoning key）。通过第三方 provider 配置的模型通常有一个匹配目录条目的 ID。

## 决策

### 1. 从目录增强 `/login` 模型元数据

在 `/login` 期间，从 provider API 获取模型后，尝试将每个模型 ID 与目录条目匹配。找到匹配项时，使用目录的元数据填充 provider API 未提供的字段。

### 2. 目录来源优先级

1. 远程目录（`https://models.dev/api.json`）——最新数据，需要网络
2. 内置目录（`__BYF_CODE_BUILT_IN_CATALOG__`）——随 byf 发布，离线回退
3. Provider API 数据——无目录匹配时的最终回退

### 3. 匹配规则：前缀 + 分隔符边界

当目录 ID 是 provider ID 的前缀，且下一个字符（如果有）是 `-` 时，provider 模型 ID 匹配目录条目。示例：

| Provider ID                | Catalog ID        | 匹配                  |
| -------------------------- | ----------------- | --------------------- |
| `gpt-5.5`                  | `gpt-5.5`         | 是（精确匹配）        |
| `gpt-5.5-2025-06-01`       | `gpt-5.5`         | 是（前缀 + `-` 边界） |
| `claude-opus-4-7-20250605` | `claude-opus-4-7` | 是（前缀 + `-` 边界） |
| `gpt-5.5-turbo`            | `gpt-5`           | 否（`.` 不是 `-`）    |

### 4. 合并策略：目录优先，provider 回退

找到匹配项时，目录元数据对其提供的所有字段优先。目录缺失的字段保留 provider API 的值。具体来说：

- `capabilities` ——来自目录（主要动机）
- `maxContextSize` ——来自目录
- `maxOutputSize` ——来自目录
- `displayName` ——来自 provider（用户选择了此 provider，保留其命名）
- `reasoningKey` ——来自目录

### 5. 时机：登录时一次，持久化到 TOML

增强在 `/login` 期间发生一次。结果写入 TOML 配置文件。后续 byf 启动直接从 TOML 读取，不重新查询目录。想要更新元数据的用户应重新运行 `/login`。

### 6. 错误处理

- 远程目录获取失败 → 回退到内置目录
- 内置目录不可用 → 使用 provider API 数据原样
- 模型 ID 无目录匹配 → 使用 provider API 数据原样
- 目录数据导致运行时错误（如第三方拒绝目录建议的参数）→ 现有的 provider 错误处理将错误展示给用户

## 结果

- 第三方兼容 provider 的用户在其模型 ID 匹配目录条目时，在 `/model` UI 中获得正确的 thinking effort 控制。
- `/login` 现在需要网络访问以获得最佳增强。离线 `/login` 仍然有效，但元数据降级。
- 增强是尽力而为的改进。当目录数据对特定第三方 provider 错误时（如 provider 实际上不支持目录列出的能力），用户看到运行时错误——这比静默降级 UI 更好。
- 这对没有目录条目的模型没有帮助（如 `glm-5.1`、`kimi-k2.6`）。这些模型继续依赖 provider API 返回的任何数据或手动 TOML 配置 `capabilities` 数组。
- 相关 bug 修复：`packages/node-sdk/src/catalog.ts` 中的 `capabilityToStrings()` 缺失了 `thinking_effort`、`thinking_xhigh` 和 `thinking_max` 映射（ADR 0005 决策 5 的实现缺口）。与此变更一起修复。
