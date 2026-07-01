# ADR 0005: Thinking Effort 验证与 Provider 钳位

## 状态

已接受

## 背景

`effort` 参数控制跨 provider 的模型思考/推理强度。归一化类型为 `ThinkingEffort = 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'`。存在多个问题：

1. **无 schema 级验证**：`ThinkingConfigSchema` 将 `effort` 定义为 `z.string().optional()`，接受任何字符串。无效值在运行时静默回退到 `'high'`，用户无感知。
2. **UI/SDK 类型分裂**：CLI 模型选择器使用独立的 `ThinkingEffortLevel`，只有 4 个值（`off | low | medium | high`），缺少 `xhigh` 和 `max`。在 `config.toml` 中配置了 `xhigh`/`max` 的用户无法通过 UI 恢复这些级别。
3. **静默的 provider 钳位**：Anthropic 对非 Opus 模型将 `xhigh`/`max` 钳位到 `high`，而 OpenAI 兼容 provider 无论模型是否支持都发送 `xhigh`，两者均无日志记录。
4. **高 level 时 budget_tokens 崩溃**：`budgetTokensForEffort` 对 `xhigh` 和 `max` 抛出错误，阻止 Opus 4.7 通过 Anthropic 的扩展 thinking API 使用这些级别。

### 行业背景

三大主要 provider 都已经收敛到**分类 effort 级别**（而非数字 token 预算）：

| Provider          | 旧机制                           | 当前机制                                                 | 状态                                          |
| ----------------- | -------------------------------- | -------------------------------------------------------- | --------------------------------------------- |
| **Anthropic**     | `thinking.budget_tokens`（整数） | `output_config.effort`（low/medium/high/xhigh/max）      | budget_tokens 已废弃；Opus 4.7+ 返回 400 拒绝 |
| **OpenAI**        | 无                               | `reasoning_effort`（none/minimal/low/medium/high/xhigh） | 标准 API 参数                                 |
| **Google Gemini** | 2.5：`thinkingBudget`（整数）    | 3.x：`thinkingLevel`（minimal/low/medium/high）          | 正在过渡                                      |

BYF 现有的 `ThinkingEffort` 分类类型与此行业方向一致。问题是 Anthropic 适配器仍在使用已废弃的 `budget_tokens` 机制和硬编码的数字映射表。

## 决策

### 1. Schema 级枚举验证

将 `effort` 从 `z.string().optional()` 改为 `z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional()`。无效值在配置解析时失败，并显示清晰错误消息，而不是静默回退。

### 2. 在选择器 UI 中暴露 xhigh/max

将 `xhigh` 和 `max` 添加到 CLI 模型选择器的 effort 选项中，仅在所选模型的能力支持这些级别时显示（例如 Anthropic Opus 4.7）。这填补了配置和 UI 之间的差距。

### 3. 带 warn 日志的钳位

当 provider 钳位 effort 级别时（Anthropic 非 Opus：xhigh/max → high；不支持 xhigh/max 的 OpenAI 兼容：xhigh/max → high），发出 warn 级别日志消息，指明原始 effort、钳位后的 effort 和原因（模型名）。

### 4. 将 Anthropic 适配器从 budget_tokens 迁移到 effort 参数

将 `budgetTokensForEffort` 数字映射替换为到 Anthropic 的 `output_config.effort` 参数的直接分类映射：

| ThinkingEffort | Anthropic `output_config.effort` | OpenAI `reasoning_effort`              |
| -------------- | -------------------------------- | -------------------------------------- |
| off            | 禁用 thinking                    | undefined                              |
| low            | `low`                            | `low`                                  |
| medium         | `medium`                         | `medium`                               |
| high           | `high`                           | `high`                                 |
| xhigh          | `xhigh`（仅 Opus 4.7/4.8）       | `xhigh`（如果支持，否则钳位到 `high`） |
| max            | `max`（Opus 4.6+）               | 根据模型钳位到 `high` 或 `xhigh`       |

这完全消除了对硬编码 budget_tokens 映射表的需求。Effort 级别直接作为分类值传递给 API，由 provider 决定分配多少 token。

对于仍然需要 `budget_tokens` 的旧版 Anthropic 模型（Claude 3.7 Sonnet 等），回退到数字映射作为兼容性路径。

### 5. 为主流模型标记 `thinking_effort` 能力

能力注册表（`capability-registry.ts`）目前只给 Anthropic Claude 4.x 和 OpenAI o 系列模型分配 `thinking`，而非 `thinking_effort`。这意味着 UI 对这些模型只显示开/关切换，而不显示实际 effort 级别选择。

由于这些模型都通过各自的 API 支持分类 effort 控制，它们应该在注册表中标记 `thinking_effort`。这使得 UI 中所有支持的模型都能进行 effort 级别选择，而不仅仅是那些恰好从 API 响应返回 `supports_reasoning_effort: true` 的少数模型。

### 6. 在 ThinkingEffort 类型中保留 "off"

`'off'` 值被有意保留在 `ThinkingEffort` 中，尽管它不是 effort 级别。它作为切换 + effort 的联合哨兵，将下游 API 简化为单一值。这是显式的设计选择，而非意外的耦合。

### 7. 废弃 `defaultThinking` 布尔字段

顶层的 `defaultThinking = true/false` 配置字段与 `[thinking]` 部分重叠：`true` 等价于 `mode = "on"` 且 `effort = "high"`，`false` 等价于 `mode = "off"`。当两者都配置时，`[thinking]` 部分优先——先检查其 `mode` 和 `effort`，`defaultThinking` 仅在 `[thinking]` 值未覆盖该情况时作为回退应用（参见 `apps/cli/src/tui/byf-tui.ts:960-969`）。这是对原始措辞的修正——原始措辞称 `defaultThinking` 静默优先；而实际实现始终相反。

废弃 `defaultThinking`，改用 `[thinking]` 部分，后者提供对 mode 和 effort 的完全控制。当配置中存在 `defaultThinking` 时发出废弃警告。

### 8. Anthropic 支持范围：仅 Opus 4.7+

BYF 仅从 Opus 4.7 开始支持 Anthropic 模型。这意味着：

- `budget_tokens` 兼容性路径是不必要的——所有受支持的 Anthropic 模型都使用 `output_config.effort`。
- 可以从 Anthropic 适配器中完全移除 `budgetTokensForEffort` 函数及其数字映射表。
- Anthropic 适配器只需要处理 `off | low | medium | high | xhigh | max` → `output_config.effort`，对不支持 `xhigh`/`max` 的模型进行钳位。

### 9. Gemini 适配器：无需变更

现有的 Gemini 适配器已经实现了正确的双路径方法：Gemini 3.x 模型使用 `thinking_level`，2.5 模型使用 `thinking_budget`。钳位警告日志（决策 3）也适用于此处，但无需结构性变更。

## 结果

- 用户对配置中无效的 `effort` 值立即获得反馈，而非静默的行为变化。
- `xhigh` 和 `max` 是一等 effort 级别，在配置和 UI 中都可见。
- 钳位是透明的：用户可以在终端中看到配置的 effort 何时被调整为模型适配。
- 从 `budget_tokens` 迁移到 `output_config.effort` 使 BYF 兼容当前的 Anthropic 模型（Opus 4.7+ 以 400 错误拒绝 `budget_tokens`）并与 provider 推荐的 API 用法保持一致。
- Effort 到 API 的映射现在是一个直接的分类透传（带钳位），消除了维护数字预算表的必要，该表可能因提供商更改限制而过时。
- 为主流模型标记 `thinking_effort` 意味着大多数用户将在 UI 中看到 effort 级别选择，而不仅仅是开/关切换。
- 废弃 `defaultThinking` 将 thinking 配置整合到单一的 `[thinking]` 部分，减少混淆。
- 将 Anthropic 支持范围限定到 Opus 4.7+ 通过完全移除 `budget_tokens` 代码路径简化了适配器。
- 添加 effort 级别是一个破坏性变更（如果将来移除），因为用户可能在 `config.toml` 中配置了它们。
