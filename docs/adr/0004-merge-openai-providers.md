# 将 `openai` 和 `openai-compat` 合并为 `openai-completions`

代码库中有两个几乎相同的 OpenAI Chat Completions API provider 类型：`openai`（硬编码到 OpenAI 官方）和 `openai-compat`（灵活的，适用于任何兼容端点）。两者使用相同的 OpenAI SDK、相同的流式协议、相同的消息格式。差异虽小但分散在各处：reasoning key 扫描、工具消息处理、max_tokens 归一化、文件上传等。我们将它们合并为单一的 `openai-completions` 类型，取两种实现的最佳部分。

## 状态

已接受

## 考虑的方案

1. **保持分离** — 维护两个 provider，各自处理边缘情况
2. **合并到 `openai-compat`** — 保留 compat 名称，合并 `openai` 功能
3. **合并到 `openai-completions`** — 新名称反映所使用的 API 协议（Chat Completions）

## 决策

方案 3。单一 `openai-completions` provider，设计选择如下：

- **默认 Base URL**：空字符串，用户必须显式配置。无硬编码 OpenAI 默认值。
- **Reasoning 提取**：多 key 扫描（`reasoning_content` > `reasoning_details` > `reasoning`），通过 `reasoningKey` 可配置
- **工具消息**：保留多模态保护（对非文本内容强制 `extract_text`）
- **空内容省略**：对带 tool_calls 且文本仅含空白字符的助手消息跳过 `content` 字段
- **模型能力**：基于注册表查找已知模型，`UNKNOWN_CAPABILITY` 回退
- **文件上传**：包含 `OpenAICompatFiles`，通过 `/files` 端点支持视频上传
- **工具 schema**：通过 `normalizeOpenAICompatToolSchema` 归一化，支持 `$` 前缀的内置函数
- **思考**：`reasoning_effort` 参数 + `extra_body.thinking` 的双重配置
- **思考 effort key**：通过 `thinkingEffortKey` 可配置，默认 `reasoning_effort`
- **最大 token**：在线上将 `max_tokens` 归一化为 `max_completion_tokens`
- **用量提取**：同时读取顶层 `usage` 和 `choices[0].usage`
- **工具调用 extras**：保留工具调用上的 `extras` 字段
- **自动 reasoning_effort**：当 history 中检测到 ThinkParts 但没有显式 reasoning_effort 时，自动设置为 `high`

无需向后兼容别名——项目处于开发阶段，没有外部用户。

## 结果

- **正面**：一份需要维护的实现，一套适用于所有 OpenAI 兼容 API 的功能集。代码更少，分歧性 bug 修复更少。
- **负面**：即使用于 OpenAI 官方，用户也必须显式设置 `base_url`（无默认快捷方式）。
