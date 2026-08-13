# deepseek: API 格式契约（Chat Completions vs Responses）

> **Stack**: deepseek@4 | **Major**: 4 | **Verified**: 2026-08-13 | **Status**: verified

## TL;DR

DeepSeek 两条 API 各自遵循对应的 OpenAI 标准，**reasoning 与 cache usage 字段形态在两条路径上不同**：Chat Completions 用 `reasoning_content`（与 content 同级）+ 顶层 `prompt_cache_hit_tokens`/`prompt_cache_miss_tokens`；Responses 用 `reasoning` 对象（`output[].content[]{type:"reasoning_text"}`）+ 嵌套 `input_tokens_details.cached_tokens`。byf 两条 provider 路径分别兼容这两套形态，缓存命中率显示正确。唯一已知缺口：Responses 的 reasoning 文本在 `content`，而 byf responses 路径读 `summary`，会漏读 reasoning 文本（不影响缓存命中与工具调用）。

## Question

DeepSeek v4（v4-flash / v4-pro）在 Chat Completions 与 Responses 两条 API 下，reasoning 与 cache usage 的返回字段格式分别是什么？byf 两条 provider 路径是否都正确解析？

## Approach

1. 读官方文档 Tier 1：Chat Completions API reference、Responses API reference、上下文硬盘缓存指南、思考模式指南——逐字确认字段名与嵌套层级。
2. 实测验证（2026-08-13，DEEPSEEK_API_KEY 真实调用）：对 {Chat Completions, Responses} × {deepseek-v4-flash, deepseek-v4-pro} 4 个组合各发一个非流式请求（固定 system prompt + "Shanghai 天气?" + 一个 `get_weather` 工具，诱导 reasoning + tool_call），打印完整返回 JSON，与文档逐字段对照。
3. 对照 byf 代码：`openai-completions.ts` 的 `extractUsage` / reasoningKey、`openai-responses.ts` 的 `_extractUsage` / reasoning 解析，确认兼容性。

## Findings

| 维度                      | Chat Completions (`/chat/completions`)                                                                                        | Responses (`/responses`)                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **reasoning 输出**        | `message.reasoning_content`（字符串，与 `content` 同级）                                                                      | `output[]` 里 `{type:"reasoning", content:[{type:"reasoning_text", text}], summary:[]}` 对象              |
| **cache usage 字段**      | 顶层 `prompt_cache_hit_tokens` + `prompt_cache_miss_tokens`；**同时**带嵌套 `prompt_tokens_details.cached_tokens`（= hit 值） | 仅嵌套 `input_tokens_details.cached_tokens`；**无**顶层 hit/miss                                          |
| **token 字段名**          | `prompt_tokens` / `completion_tokens`                                                                                         | `input_tokens` / `output_tokens`                                                                          |
| **reasoning 计费**        | `completion_tokens_details.reasoning_tokens`                                                                                  | `output_tokens_details.reasoning_tokens`                                                                  |
| **thinking 开启**         | 顶层 `reasoning_effort:"high"` + `extra_body.thinking:{type:"enabled"}`（展开进 body）                                        | 顶层 `reasoning:{effort:"high", summary:"auto"}` 被接受                                                   |
| **工具定义格式**          | 嵌套 `{type:"function", function:{name, parameters}}`                                                                         | 扁平 `{type:"function", name, description, parameters}`（用 completions 格式会 400 `missing field name`） |
| **prompt_cache_key 字段** | 文档未提；body 可带但不被消费（缓存全自动）                                                                                   | 响应**含** `prompt_cache_key:null` 字段（请求未带时为 null），说明 API 认识该字段                         |
| **缓存命中实测**          | cold：hit=0, miss=377（首请求）                                                                                               | 部分命中：`cached_tokens=256`（input=377）                                                                |

**两条路径的 reasoning 形态不可互换**：Completions 永远用 `reasoning_content` 字符串；Responses 永远用 `reasoning` 对象（且文本在 `content[].text`，`summary` 为空数组）。

## Verdict & Rationale

byf 对 DeepSeek 两条路径的**缓存与 reasoning 格式均已正确处理**，现状符合官方最佳实践：

- **Completions 路径**（byf `OpenAICompletionsChatProvider`）：`extractUsage` 已读顶层 `prompt_cache_hit_tokens`（PRD-0029 #269）；`reasoningKey` 默认 `reasoning_content` 与 DeepSeek 一致。✅
- **Responses 路径**（byf `OpenAIResponsesChatProvider`）：`_extractUsage` 读嵌套 `input_tokens_details.cached_tokens`（与 DeepSeek Responses 一致）；reasoning 走 OpenAI 标准 `reasoning` 对象解析（与 DeepSeek Responses 一致）。✅
- **缓存机制**：DeepSeek 缓存全自动（"对所有用户默认开启，用户无需修改代码"），靠请求前缀完整匹配命中；byf 的前缀稳定性措施（timestamp/goal/permission 注入在 `before_user`、tools 字母序）保证前缀稳定，实测 Responses 路径 `cached_tokens=256` 确认命中生效。

**唯一已知缺口（非缓存）**：Responses 路径的 reasoning 文本在 `output[].content[]`（`type:"reasoning_text"`），而 byf `openai-responses.ts` 解析 reasoning 时遍历 `outputItem.summary`（实测 `summary` 为空数组）→ DeepSeek Responses 的 reasoning 文本会被漏读。不影响缓存命中（看 usage）、不影响工具调用（`function_call` 独立解析），仅影响 reasoning 文本的展示与多轮回传。

## Boundary Conditions

- 适用范围：deepseek-v4-flash / deepseek-v4-pro，2026-08-13 实测。deepseek-chat / deepseek-reasoner 等更早模型未实测，但文档描述的字段形态应一致。
- 经 OpenRouter 等代理转发的 DeepSeek（modelName 非 `deepseek-` 前缀）：代理可能改写字段，本记录不覆盖。
- reasoning 文本缺口（summary vs content）仅在 Responses 路径 + 需要 reasoning 文本展示/回传时才有影响；纯工具调用场景不阻塞。
- DeepSeek 缓存"尽力而为，不保证 100% 命中"（官方原话）；`prompt_cache_key` 在 Responses 响应里出现为 null，但官方缓存文档未将其列为客户端可控参数，应视为路由层内部字段，不建议客户端依赖。
- 缓存对 minor 变化敏感（DeepSeek 服务侧 `system_fingerprint` 含 `kvcache` 版本标记，可能随服务更新变化命中行为）。

## Sources

**Tier 1（maintainer-authored, required）**

- [DeepSeek 官方 API reference: Chat Completions (create-chat-completion)](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion) — usage 字段定义（`prompt_tokens` = `prompt_cache_hit_tokens` + `prompt_cache_miss_tokens`）、顶层 hit/miss 字段
- [DeepSeek 官方 API reference: Responses (create-response)](https://api-docs.deepseek.com/zh-cn/api/create-response) — usage 嵌套 `input_tokens_details.cached_tokens`、`input_tokens`/`output_tokens` 字段
- [DeepSeek 官方指南: 上下文硬盘缓存 (kv_cache)](https://api-docs.deepseek.com/zh-cn/guides/kv_cache) — "对所有用户默认开启，用户无需修改代码即可享用"、完整前缀匹配、尽力而为；未提 `prompt_cache_key`
- [DeepSeek 官方指南: 思考模式 (thinking_mode)](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode) — `reasoning_content` 与 content 同级、多轮有工具调用必须完整回传 reasoning_content、`reasoning_effort` + `extra_body.thinking`

**实测验证（2026-08-13）**

- 4 组合真实调用（deepseek-v4-flash / v4-pro × Chat Completions / Responses），返回 JSON 与上述文档逐字段一致；Responses reasoning 文本位于 `output[].content[]`（`reasoning_text`）而非 `summary` 为本记录新增发现，文档未明示此层级。
