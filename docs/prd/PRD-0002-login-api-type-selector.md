# PRD-0002: /login API Type Selector

**Status**: Sliced
**Created**: 2026-06-18
**Author**: BYF
**Related**: ADR 0006 (monorepo layered architecture), ADR 0012 (login-time catalog enrichment), ADR 0016 (supersedes ADR 0002 decision point #7)

## Problem

`/login` 命令把 provider 的接口类型硬编码为 `openai-completions`：`apps/cli/src/tui/flows/login-flow.ts` 调用 `applyProviderConfig`（`packages/oauth/src/provider-config.ts:197-202`），后者始终写入 `type: 'openai-completions'`；Base URL 提示语也写死为 "The OpenAI-compatible API endpoint"。Schema 里其实已经支持 5 种类型（`anthropic` / `openai-completions` / `google-genai` / `openai_responses` / `vertexai`，见 `packages/agent-core/src/config/schema.ts:6-12`），但 `/login` 流程没有让用户选。

`/connect` 走的是 models.dev 目录路线，靠 `inferWireType` 自动推断类型；`/login` 是手填 URL 的 BYO 路线，两者分工不同。问题只存在于 `/login`：用户无法通过 `/login` 接入 Anthropic / Google 原生端点，只能被迫伪装成 OpenAI 兼容（依赖代理转换）或改用 `/connect`（但目录未必收录目标 provider）。

## Goal

为 `/login` 在流程最前面新增「接口类型选择」步骤，并按所选类型：

1. **预填 Base URL 提示**：placeholder 显示该类型的官方默认值作为格式提示（用户初始输入框为空，不改 = 用官方默认）。
2. **原生拉取模型列表**：对 `openai-completions` / `openai_responses` / `anthropic` 各自实现正确的模型列举端点调用，而非统一走 OpenAI 兼容形态。
3. **写入正确的 `type`**：生成的 `config.toml` 中 provider 的 `type` 字段与用户选择一致。

> **范围收缩（grill 决议）**：第一版只支持 3 种类型。`google-genai` 和 `vertexai` 被排除——`google-genai` 的运行时不消费 `baseUrl`（`packages/agent-core/src/providers/runtime-provider.ts:280-285` 不传 baseUrl，`GoogleGenAIChatProvider` 忽略它），暴露 base URL 字段会持久化一个被运行时静默丢弃的值，违反"自定义 URL 要能生效"的核心诉求。详见 ADR 0016。

## Not Building (Out of Scope)

- **`google-genai` 支持**：运行时不消费 `baseUrl`（已验证）。待 base-URL 传递链路（runtime-provider + kosong GoogleGenAIChatProvider）补齐后再加。**Deferred，非永久排除。**
- **`vertexai` 支持**：依赖 GCP OAuth/ADC（服务账号或 `gcloud auth application-default login`），不是 API key 手填流程。**Deferred。**
- **改动 `/connect`**：它已有 `inferWireType` 走 catalog 路线，与 `/login` 分工明确，不合并。
- **更深的认证/校验**：只做"拉模型列表"这一步的原生化，不做各 provider 的额外能力探测或健康检查。
- **Anthropic 的 chat 请求路径改造**：kosong 里 `AnthropicChatProvider` 的 chat 实现已存在且消费 baseUrl，本期只动 login 时的模型列举和 type 写入，不动运行时 chat。

## What I Already Know (ground truth from code)

### `/login` 流程现状
- `LoginFlow.run()`（`login-flow.ts:53-135`）顺序：provider 名 → Base URL → API key → fetchModels → catalog enrichment → 模型选择 → `applyConfig`。
- `LoginFlowDeps.fetchModels(baseUrl, apiKey)`（`login-flow.ts:40`）是 ByfTUI 注入的双参数函数，统一返回 OpenAI 兼容形态的 `OAuthModelInfo[]`。
- 失败路径：`login-flow.ts:87-95` catch 后 fallback 到 `handleManualModelEntry`；空模型列表（`login-flow.ts:97-100`）也走手填。降级路径健全，新 fetcher 失败时零行为回归。

### `applyProviderConfig` 现状
- `packages/oauth/src/provider-config.ts:183-227`：写入 `config.providers[name] = { type: 'openai-completions', baseUrl, apiKey, thinkingEffortKey }`。
- 已被 SDK 导出（`packages/node-sdk/src/index.ts:56`），是公共 API，签名变更需谨慎。

### `fetchModels` 现状（唯一存在的 fetcher）
- `provider-config.ts:117-144`：`{baseUrl}/models` + `Authorization: Bearer` + 解析 `{ data: [{id, context_length, ...}] }`。
- 拼接约定：`${baseUrl.replace(/\/+$/, '')}/models` —— **baseUrl 含版本路径**（`/v1`），fetcher 只追加 `/models`。

### 各原生 API 的形态差异（需新增 fetcher）

| 类型 | 端点 | 认证头 | 响应形态 |
|---|---|---|---|
| `openai-completions` / `openai_responses` | `{baseUrl}/models` | `Authorization: Bearer {key}` | `{ data: [{id, context_length, ...}] }` |
| `anthropic` | `{baseUrl}/models` | `x-api-key: {key}` + `anthropic-version: 2023-06-01` | `{ data: [{id, type, display_name}], has_more, last_id }` — **分页** |

> `google-genai` 行已移除：见上方范围收缩说明。

### 现成 UI 原语
- `ChoicePickerComponent` + `promptProviderSelection`（`dialog-prompts.ts:96-135`）已是 catalog 路径的类型选择范式，可直接照搬。
- `promptTextInput` 已支持 `initialValue` 和 `placeholder`（`dialog-prompts.ts:13-37`），后者用于本 PRD 的 Base URL 占位提示。
- `ChoiceOption` 带 `value` / `label` / `description`（`choice-picker.ts:24-31`），可在类型项下展示官方默认 URL 作为说明。

### 分层约束（ADR 0006）
- `apps/cli` 只能通过 `@byfriends/sdk` 用核心能力（`apps/cli/AGENTS.md:43`），不得直接 import `@byfriends/agent-core`。
- 新 fetcher 落在 `@byfriends/oauth` → 经 `@byfriends/sdk` 导出 → `/login` 注入调用，符合现有 `fetchModels` 的分层。

## Requirements

1. **R1 — 类型选择步骤**：`/login` 流程第一步为类型选择器，含 3 个选项：`openai-completions`（OpenAI Chat Completions 兼容）、`openai_responses`（OpenAI Responses API）、`anthropic`（Anthropic 原生）。
2. **R2 — Base URL 占位提示**：选完类型后，Base URL 输入框初始为空，placeholder 显示该类型的官方默认值作为格式提示。
3. **R3 — 留空回退默认**：用户留空 Base URL 时，自动使用该类型的官方默认值（等同"不改就用官方"）。
   - `openai-completions` / `openai_responses` → `https://api.openai.com/v1`
   - `anthropic` → `https://api.anthropic.com/v1`
4. **R4 — 原生模型拉取**：按所选类型调用对应的原生 fetcher；失败时仍 fallback 到 `handleManualModelEntry`。
5. **R5 — 正确写入 type**：生成的 provider 配置 `type` 字段与所选一致。
6. **R6 — 回归**：选 `openai-completions` 时行为与现状完全一致。

## Acceptance Criteria

- **AC1**：运行 `/login`，第一步出现类型选择器，含 3 个选项，每项 description 显示官方默认 URL。
- **AC2**：选 `anthropic`，Base URL 框为空且 placeholder = `https://api.anthropic.com/v1`；填 key 后能从官方端点原生拉到 claude 模型列表（不走 OpenAI 兼容 Bearer 头）。
- **AC3**：选 `openai_responses`，能拉到模型列表（与 openai-completions 共享 `/models` 端点）。
- **AC4**：Base URL 留空时，请求实际打到该类型的官方默认端点（留空 = 用默认）。
- **AC5**：Base URL 填自定义值时，按「版本路径 + `/models`」拼接，请求打到自定义端点；运行时 chat 同样打到该自定义端点（端到端一致）。
- **AC6**：生成的 `config.toml` 中 provider `type` 与所选一致（非全部 `openai-completions`）。
- **AC7**：原生拉取失败时，仍能走手填 fallback（context size 提示等不变）。
- **AC8**：选 `openai-completions` 端到端行为与改造前一致（现有测试回归通过）。

## Definition of Done

- 所有实现切片合并，`pnpm test` 在 `packages/oauth`、`packages/node-sdk`、`apps/cli` 相关模块通过。
- 按 `AGENTS.md` 跑 `gen-changesets` 生成 changeset：**`minor`**（grill 已定）。理由：`fetchModels(baseUrl,apiKey)` 是 `LoginFlowDeps` 注入字段，仅 `apps/cli` 内部，非 SDK 公共 API；`applyProviderConfig` 新增的 `type` 参数默认 `openai-completions`，旧调用方零改动；`fetchModelsByType` 是纯新增。均非破坏性。
- PR 标题遵循 Conventional Commit（如 `feat(login): add API type selector with native model fetching`）。
- PR 描述按 `.github/pull_request_template.md` 填写，链接本 PRD。

## Technical Approach

### 切片 1 — `@byfriends/oauth`：新增 `fetchModelsByType`
- 新增 `fetchModelsByType(type, baseUrl, apiKey, fetchImpl?, signal?)`：按 `type` 分派。
- 抽出 `fetchOpenAICompatModels`（现 `fetchModels` 的实现复用，openai-completions / openai_responses 共用）。
- 新增 `fetchAnthropicModels`：`{baseUrl}/models` + `x-api-key` + `anthropic-version: 2023-06-01`；分页处理（见下方约定）；映射 `display_name` → `displayName`。
- 统一返回 `ModelInfo[]`（现有类型，`provider-config.ts:8-18`），保持 `fetchModels` 原样不动作为别名/向后兼容。
- **baseUrl 拼接约定**：统一 `${baseUrl.replace(/\/+$/, '')}/models`，baseUrl 含版本路径（`/v1`），fetcher 只追加 `/models`。两种类型共用同一段逻辑。
- **Anthropic 分页约定**：以 `has_more === true && last_id` 非空为继续循环条件；设防御性上限（最多 10 页 / 1000 个模型）防止死循环；若某页 `has_more === true` 但 `last_id` 为空/缺失，视为异常，停止分页并返回已收集模型（不抛错，走降级）。
- 经 `packages/node-sdk/src/index.ts` 导出 `fetchModelsByType`。

### 切片 2 — `@byfriends/oauth`：`applyProviderConfig` 增加 `type` 参数
- `applyProviderConfig`（`provider-config.ts:183-227`）options 新增 `type: ProviderType`，默认 `'openai-completions'`（兼容现有调用方）。
- 写入 `config.providers[name].type = options.type`。
- 经 SDK 导出类型无变化（`ProviderType` 已在 kosong 导出）。

### 切片 3 — `apps/cli`：新增 `promptApiTypeSelection`
- `dialog-prompts.ts` 新增 `promptApiTypeSelection(host, colors)`：返回所选 `ProviderType | undefined`。
- 基于 `ChoicePickerComponent`，3 个 `ChoiceOption`：
  - `openai-completions` / "OpenAI Chat Completions 兼容" / desc 含 `https://api.openai.com/v1`
  - `openai_responses` / "OpenAI Responses API" / desc 含 `https://api.openai.com/v1`
  - `anthropic` / "Anthropic 原生" / desc 含 `https://api.anthropic.com/v1`

### 切片 4 — `apps/cli`：`login-flow.ts` 改造
- `LoginFlowDeps.fetchModels` 签名改为 `fetchModels(type, baseUrl, apiKey)`（感知类型），ByfTUI 注入处改为传 `fetchModelsByType`。
- `run()` 第一步调用 `promptApiTypeSelection`，返回 `undefined` 则中止。
- 每类型配一个 `DEFAULT_BASE_URL` 常量（`apps/cli/src/tui/flows/login-flow.ts` 内或同目录常量文件）。
- Base URL 步骤：placeholder = 所选类型默认 URL，**不传 initialValue**；留空时回退 `DEFAULT_BASE_URL[type]`。
- 提示语按类型调整（不再是写死的 "OpenAI-compatible"）。
- `applyConfig` 透传所选 `type` 到 `applyProviderConfig`。
- `handleManualModelEntry` 同步透传 `type`。

### 切片 5 — 测试
- `packages/oauth/test/provider-config.test.ts`：
  - `fetchModelsByType` 各类型的 HTTP 请求头/响应解析用例（mock fetch）。
  - `applyProviderConfig` 透传 `type` 用例。
- `apps/cli/test/tui/flows/login-flow.test.ts`：
  - 新增"先选类型 → 再走后续步骤"的驱动（FakeDialogHost 驱动 ChoicePicker）。
  - Base URL 留空回退默认值的用例。
  - `openai-completions` 路径回归用例。

## Decision (ADR-lite)

1. **类型选择放最前面（第一步）**：选完类型才能预填 Base URL 提示和调整后续提示语，流程最顺，避免回填。
2. **3 种类型（grill 收缩）**：`openai-completions` / `openai_responses` / `anthropic`。`google-genai` 和 `vertexai` 被排除——`google-genai` 运行时不消费 baseUrl（已验证 `runtime-provider.ts:280-285` + `GoogleGenAIChatProvider`），暴露会持久化被静默丢弃的值，违反"自定义 URL 要能生效"。详见 ADR 0016。
3. **Base URL 用 placeholder 而非 initialValue**：避免用户改 URL 时需先清空已填内容；placeholder 仅作格式提示，输入框初始为空。
4. **留空回退默认**：placeholder 已标明默认，留空 = "接受默认"是自然表达，避免强制重复输入。
5. **fetcher 扩展在 `@byfriends/oauth`**：沿用现有 `fetchModels` 的分层（oauth 包 → SDK 导出 → app 注入），最小改动符合现有边界。
6. **`applyProviderConfig` 的 `type` 默认 `openai-completions`**：兼容任何未更新的现有调用方与公共 API。
7. **保留 catalog enrichment + 手填 fallback**：原生拉取失败时降级路径不变，零行为回归。enrichment（ADR 0012）对 anthropic 自动生效，无需特殊处理——claude 模型 ID 在 catalog 中权威，displayName 仍取 provider 值。
8. **baseUrl 拼接约定统一且端到端**：两种类型共用「去尾斜杠 + `/models`」，baseUrl 含版本路径。此约定与运行时 SDK 一致（anthropic `baseURL` 也含 `/v1`），故自定义代理若不遵循，listing 与 chat 会**一致地**失败，行为自洽。

## Consequences

- 用户可经 `/login` 直连 Anthropic 原生端点及 Anthropic 兼容网关，无需 OpenAI 兼容转换代理。
- TOML 中 `type` 字段准确反映 wire 协议，消除过去 Anthropic 端点被误标 `openai-completions` 的隐患。
- "自定义 URL 生效"承诺对每个支持的类型都成立——不支持的类型（google-genai/vertexai）被显式排除，不会出现静默丢弃。
- **baseUrl 版本路径约定是端到端的**：自定义代理必须遵循「版本路径 + `/models`」，否则 listing 和 chat 一致失败。
- `google-genai` / `vertexai` 用户仍只能用 `/connect`（catalog）或等待 base-URL 传递链路补齐。

## Open Questions

无。所有决策已在 brainstorm + grill 阶段解决（grill 决议见下方 Traceability）。

## Traceability

- **Grilled by**: `/grill` (completed 2026-06-18) — 9 items resolved: 3 代码矛盾验证（google-genai baseUrl 静默丢弃→范围收缩至 3 类型；anthropic/openai_responses baseUrl 已验证端到端生效）；1 术语冲突（CONTEXT.md `/login` 定义过时→已同步）；1 分页边界（anthropic has_more/last_id 防御性处理）；1 降级体验（自定义代理版本路径约定写入 Consequences）；1 changeset 级别（定为 minor，代码可答）；1 ADR 关系（新建 ADR-0016，ADR-0002 决策 #7 标记部分被取代）；1 enrichment 交互（对 anthropic 自动生效）。
- **Sliced by**: `/story` → Child Issues below
- **Sliced into**:
  - #145 — [PRD-0002] 类型选择步骤 + openai-completions 端到端贯通 (AFK) — Done (#153)
  - #146 — [PRD-0002] Anthropic 原生类型支持 (AFK, blocked by #145) — Done (#154)
  - #149 — [PRD-0002] OpenAI Responses 类型支持 (AFK, blocked by #145) — Done (#155)
  - #152 — [PRD-0002] Catalog enrichment 与手填 fallback 跨类型回归 (AFK, blocked by #145, #146)

## Domain Terms

- **接口类型（API type / wire type）**：provider 与 LLM 服务通信的协议形态，对应 `ProviderType`（`packages/agent-core/src/config/schema.ts:6-12`）。决定请求头、端点路径、响应解析方式。
- **原生模型拉取（native model fetching）**：按 provider 的官方文档端点和认证方式列举可用模型，而非统一伪装成 OpenAI 兼容形态。
- **Base URL 占位提示（placeholder default）**：输入框为空时显示的格式提示，非实际值；留空时由代码回退到该类型的官方默认值。
