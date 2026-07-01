# ADR 0015: BaseChatProvider 抽象基类

## 状态

已接受

## 背景

`packages/kosong` 有四个 LLM provider 适配器——`anthropic.ts`（1042 行）、`openai-responses.ts`（1006）、`google-genai.ts`（899）、`openai-completions.ts`（669）。每个都 `implements ChatProvider`（接口，无基类）。

`improve-architecture` 扫描（2026-06-17，发现项 H4）在这些适配器中识别出 **14 个重复模式**。最普遍的四个是 4 路近乎相同的副本：

1. **`StreamedMessage` 类骨架**——字段、getter、`[Symbol.asyncIterator]`、构造函数分支（`anthropic.ts:525-584`、`openai-responses.ts:496-529`、`google-genai.ts:453-493`、`openai-completions.ts:282-325`）。
2. **`_clone()` + `withGenerationKwargs`**——`Object.assign(Object.create(proto), this)` + 深拷贝 `_generationKwargs`（4 份副本）。
3. **`_createClient(auth)` 包装器** + getter 四件套（`modelName`/`modelParameters`/`getCapability`）——各 4 份副本。
4. **`normalizeXxxFinishReason`**——结构相同的空值守卫 → switch → 返回，仅在 case 标签上不同（4 份副本）。

现有的共享模块 `openai-common.ts` 只服务于 4 个适配器中的 2 个（OpenAI 家族）。Anthropic 和 Google 完全独立——它们完全不使用它。

### 起源（为什么设计开始如此）

Git 历史（`git log --diff-filter=A`）确认所有四个 provider 都在上游代码库的初始提交 `f4a0872` 中。上游设计是继承的，非 BYF 选择的。三个真正的原因解释上游结构：

1. 每个适配器包装了一个**不同的官方 SDK**（`@anthropic-ai/sdk`、`openai`、`@google/genai`），具有不兼容的客户端类型和构造函数。
2. 上游代码库本身是 OpenAI 兼容的，因此 `openai-common.ts` 是 OpenAI 家族内部的工具包，从未是跨 provider 的抽象。
3. 后续工作（缓存、可观测性）通过跨 4 个文件复制粘贴添加字段，因为每次变更的成本低于重构成本——债务悄悄累积。

### 为何现在行动

重复不是静态的——它在增长。`cache-observability-cli.md` PRD 通过独立编辑每个适配器的 `_extractUsage` 添加了 `inputCacheRead`/`inputCacheCreation` 解析。ADR 0011 的陈述目标（"添加新 provider 只需新适配器"）被削弱：今天的新 provider 必须复制粘贴所有 14 个模式。

一个关键的 grill 见解：重复干净地分为两类——**SDK 无关样板**（`_clone`、accessor、`StreamedMessage` 骨架——与包装哪个 SDK 无关）和**协议特定逻辑**（`generate()`、消息映射、流式解析、缓存控制注入——每个 provider 真正不同）。只有前者应该共享。

## 决策

引入 `abstract class BaseChatProvider implements ChatProvider` 和 `abstract class BaseStreamedMessage implements StreamedMessage`。将 SDK 无关样板上移；将协议特定逻辑留在子类中。

### 上移到基类的内容

- `_clone()` / `withGenerationKwargs()`——纯样板，SDK 无关。
- Accessor：`modelName`、`modelParameters`、`getCapability`——返回存储字段。
- `StreamedMessage` 骨架：字段、`[Symbol.asyncIterator]` 转发、getter 四件套。
- `_createClient(auth)`外壳——将实际的 SDK 构造委托给新的抽象 `createRawClient(auth, defaultHeaders)`。

### 保留在子类的内容

- `generate()`——流式/分发循环，协议特定。
- 消息映射（`convertMessage`、内容部分展平）——协议特定。
- `createRawClient()`——`new OpenAI(...)` vs `new Anthropic(...)` vs `new GoogleGenAI(...)`。
- `thinkingEffort` getter——每个 provider 的映射逻辑不同。

### 归一化：配置驱动，在新的 `provider-common.ts` 中

结构相同但字段名不同的逻辑变为配置驱动，放置在新的 `provider-common.ts` 中（与 `openai-common.ts` 分离，后者保留 OpenAI 家族线格式转换）：

- `makeFinishReasonNormalizer(mapping)`——共享 switch 骨架，每个 provider 的 case 标签表。
- `extractCacheUsage(total, cached, output)`——`inputOther = input - cached` 公式（缓存可观测性解析）。
- `convertProviderError(error, opts?)`——错误分类阶梯（`NETWORK_RE`/`TIMEOUT_RE` + 状态归一化）。

**Google 的 fetch 处理不是纯重复**（grill 修正）：`google-genai.ts:637` 添加了 `| fetch failed` 且 `:655` 检查 `error instanceof TypeError && msg.includes('fetch')`，因为 Google SDK 在网络失败时抛出 `TypeError`。`convertProviderError` 接受可选的 `extraNetworkMatchers` 钩子，因此 Google 提供其 fetch 特定的匹配器，而非分化整个函数。

### 迁移顺序（grill 决策 6）

1. 同时迁移 `openai-completions`（确立基类骨架）**和** `anthropic`（验证基类跨协议工作，不仅限于 OpenAI 家族）作为跟踪弹。
2. 然后批量迁移 `openai-responses` 和 `google-genai`。

这确保基类设计在最不相似的消费者上得到验证后再传播，而非在第三个 provider 上发现设计缺陷。

## 考虑的替代方案

### A. 纯函数共享模块（扩展 `openai-common.ts`）

无基类；将重复代码提取为共享模块中的纯函数。Provider 保持 `implements ChatProvider` 并调用这些函数。

**被拒绝**：样板（`_clone`、accessor、`StreamedMessage` 骨架）是有状态的，并绑定到实例字段（`_model`、`_generationKwargs`、`_client`）。纯函数共享仍然会使每个 provider 声明相同的实例字段并将它们接入共享函数——大部分复制粘贴保留，只是重定向。新 provider 仍然复制字段/样板表面。基类使"扩展并免费获得样板"成为现实。

### B. 仅提取核心三项（StreamedMessage + finish-reason + usage + error）

不碰 `_clone`/`_createClient`（它们耦合到每个 SDK 的客户端类型）。

**被拒绝**：`_clone` 是纯 `Object.assign(Object.create(proto), this)` + 深拷贝 `_generationKwargs`——SDK 客户端类型与克隆机制无关。`_createClient` 的外壳（`resolveAuthBackedClient` + `mergeRequestHeaders`）相同；只有内部的 `new XxxSDK(...)` 不同，这正是 `createRawClient()` 抽象的内容。停在"核心三项"会使副本计数最高的模式（各 4 份）保持原状。

## 结果

- **正面：** 添加 provider（Mistral、Cohere 等）现在意味着 `extends BaseChatProvider` + 实现 `generate()`/`createRawClient()`/`thinkingEffort`——样板被继承。这终于实现了 ADR 0011 的"新 provider = 只需新适配器"目标。
- **正面：** `_clone`、accessor、`StreamedMessage` 骨架和三个归一化函数各只有一个实现。对这些的跨 provider 漂移成为不可能。
- **正面：** `createProvider` 工厂和 `ProviderConfig` 联合不变——无外部 API 影响。
- **正面：** `google-genai` 的 fetch 特定错误处理通过 `extraNetworkMatchers` 钩子保留，而非静默丢弃。
- **负面：** 引入了继承层。每个 provider 现在继承基类而不是直接实现接口。回滚需要将所有四个 provider 改回来——中等难以逆转（ADR 的三个条件之一）。
- **负面：** 子类特定的克隆清理（如 `openai-completions` 的 `clone._files = undefined`）需要覆盖或 `_resetCloneState` 钩子——每个子类少量样板。
- **负面：** Anthropic 的 `StreamedMessage._usage` 初始化为非空默认，而其他三个使用 `undefined`；基类统一为 `undefined`，Anthropic 在其构造函数中覆盖——小的行为对齐。

## 关联

- PRD：`docs/prd/design-debt-cleanup-high-priority.md`（H4）
- 源码扫描：`improve-architecture` 报告（2026-06-17），发现项 H4
- 无取代，互补：ADR 0011（turn 边界缓存桩——受益于一致的跨 provider 归一化）
