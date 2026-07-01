# [DONE] PRD-0011: Turn 边界缓存桩 (Turn-Boundary Cache Staking)

## 问题描述

BYF 的提示缓存当前只覆盖系统提示和工具定义。对话历史——在多轮 CLI 会话中占 token 消耗大头——发送时没有任何缓存断点。在 10 轮会话中，随着工具结果（文件内容、测试输出）不断累积，每轮都以全价重新传输整个历史。

Anthropic 的 API 每个请求最多支持 4 个 `cache_control` 断点。BYF 目前只用 2 个（系统提示 + 工具），剩余容量被浪费。

此外，工具定义没有按稳定性排序。MCP 工具（在会话中可能连接/断开）可能出现在工具列表的任何位置，即使内置工具没变，工具缓存桩也可能失效。

最后，`DirectoryTreeInjector` 包含 `new Date().toISOString()`，每次注入都会重新生成，给临时注入内容增加了不必要的变异性。

## 解决方案

引入 **CacheStakingStrategy** 模块，对对话历史消息应用 provider 无关的逻辑缓存提示。Provider 适配器消费这些提示并翻译成各自的缓存控制格式。

缓存桩模型使用 3 个固定 + 1 个条件断点：

```
[桩 1] 系统提示末尾           (已有, 通过 PromptPlan)
[桩 2] 工具数组末尾            (已有, 加稳定性排序修复)
[桩 3] 上一轮的最后一条助手消息 (新增)
[桩 4] 当前轮的最大内容块      (新增, 条件性, 基于大小阈值)
```

桩 3 是价值最高的新增项：它把整个前序对话（包括昂贵的工具结果）冻结到缓存中，当前轮只有新输入支付全价。

桩 4 在当前轮包含大量上下文（用户粘贴的日志、大文件读取）时优化流式 TTFT/TPS。

## 用户故事

1. 作为 **Anthropic 上的 CLI 用户**，我希望多轮对话历史被缓存，这样随着会话进行，每轮的 token 成本会降低。

2. 作为 **Anthropic 上的 CLI 用户**，我希望系统能缓存前几轮的大文件读取和工具结果，这样我就不用每轮都为重复发送相同内容支付全价。

3. 作为 **CLI 用户**，我希望系统在我粘贴或接收到大内容后自动放置额外的缓存断点，这样模型处理大上下文时流式输出更快。

4. 作为 **开发者**，我希望缓存桩逻辑与 provider 细节解耦，这样添加新 provider 不需要修改缓存桩策略。

5. 作为 **开发者**，我希望缓存提示作为消息的标准字段一起传递，这样标记语义在消息数组操作（slice、copy、splice）后仍能保留。

6. 作为 **开发者**，我希望策略直接从 TurnFlow 接收 turn 边界信息，这样我就不必从消息角色反推 turn 边界了。

7. 作为 **系统管理员**，我希望内置工具始终排在 MCP 工具之前，这样在 MCP 服务器连接或断开时工具缓存前缀保持稳定。

8. 作为 **系统管理员**，我希望有一个哨兵标记来锚定工具缓存端点，这样当所有 MCP 工具都不存在时缓存断点不会坍缩。

9. 作为 **开发者**，我希望目录树注入的时间戳在首次注入时捕获一次，这样未变更的树的重复注入不会引入不必要的内容变异。

10. 作为 **非 Anthropic provider 的开发者**，我希望消息上的缓存提示被我的适配器静默忽略，这样我能获得稳定的排序收益而无需改动代码。

11. 作为 **开发者**，我希望无需构造完整 provider 请求就能编写缓存桩的单元测试，使测试更聚焦、更快速。

12. 作为 **系统管理员**，我希望在日志中看到哪些消息被标记了缓存提示，以便调试缓存桩行为。

13. 作为 **开发者**，我希望未来的运行时状态（token 预算、视口状态、终端尺寸）遵循清晰的放置规则，以免这些变量意外破坏缓存。

## 实现决策

### CacheHint 类型扩展（在 kosong 中）

扩展共享的 `Message` 类型，增加可选的 `cacheHint` 字段。这是一个高层语义标记，表达消息的时间性缓存意义——不是 provider 特定的 API 参数。

```
CacheHint {
  isLastTurnEnd?: boolean        // 上一轮的最后一条消息
  isSuddenLargeContext?: boolean  // 当前轮最大的内容块
}
```

所有 provider 都能看到它。Anthropic 读取它，其他 provider 在序列化时忽略。

### CacheStakingStrategy 模块（在 agent-core 中）

新模块，接收消息数组和上下文对象，返回带有 `cacheHint` 标记的同一数组。它不知道 provider 类型。

上下文对象包含：

- `previousTurnMessageCount`：上一轮结束时的消息计数，由 TurnFlow 提供
- `currentTurnStartIndex`：从 `previousTurnMessageCount` 推导
- 动态锚点的大小阈值（默认约 2000 字符）

缓存桩逻辑：

1. 在索引 `previousTurnMessageCount - 1` 的消息上标记 `isLastTurnEnd`（如果它是助手消息）
2. 扫描当前轮消息中超过阈值的内容，在最大的块上标记 `isSuddenLargeContext`

### Turn 边界信息流

TurnFlow 将 `previousTurnMessageCount`（当前轮之前已提交的历史消息数）传递给生成管线。CacheStakingStrategy 使用该值——不需要从消息角色或内容反向推断。

### Anthropic 适配器的 CacheHint 消费

Anthropic 适配器在将消息转换为 Anthropic 的 `MessageParam` 格式时检查每个消息的 `cacheHint`。当 `isLastTurnEnd` 或 `isSuddenLargeContext` 为 true 时，在该消息的最后一个内容块上注入 `cache_control: { type: 'ephemeral' }`。

这是独立于现有 PromptPlan 消费的代码路径——PromptPlan 处理系统提示块，CacheHint 处理历史消息。

### 工具稳定性排序

组装 generate 调用的工具列表时，按稳定性排序：

1. 内置工具（按字母排序，永不变化）
2. MCP 工具（按服务器分组，按首次连接顺序）

在所有工具之后追加一个固定哨兵标记，确保即使没有 MCP 工具时缓存端点也有稳定的物理位置。

### 时间戳会话范围化

`DirectoryTreeInjector.getInjection()` 在首次成功注入时捕获时间戳。后续注入重用相同的时间戳值，即使树已变化。

### 两个并行机制

PromptPlan 和 CacheStakingStrategy 作为并行机制共存：

- **PromptPlan**：管理非数组结构（系统提示文本、工具模式）。通过 `GenerateOptions.promptPlan` 传递。
- **CacheStakingStrategy**：管理数组结构的对话历史。通过 `Message.cacheHint` 内联传递。

两者不冗余——它们处理不同的物理数据模型。

## 测试决策

### 测试接缝

| 接缝                              | 类型               | 模块       | 测试内容                                                                                                                         |
| --------------------------------- | ------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `CacheStakingStrategy` 单元测试   | 单元测试（新增）   | agent-core | 消息标记：`isLastTurnEnd` 位置正确、`isSuddenLargeContext` 阈值和选择、边界情况（空历史、单轮、无大块）                          |
| `kosong-llm-integration.test.ts`  | 集成测试（已有）   | agent-core | 完整流程：消息上的 CacheHint→provider 接收到正确的缓存指令                                                                       |
| `anthropic.test.ts`               | 单元测试（已有）   | kosong     | Anthropic 适配器将 `isLastTurnEnd` 翻译为历史消息块上的 `cache_control`                                                          |
| `directory-tree.test.ts`          | 单元测试（已有）   | agent-core | 时间戳在首次注入时固定，后续调用不变                                                                                             |
| 工具排序测试                       | 单元测试（新增）   | agent-core | `loopTools` 返回：内置工具在前、MCP 在后、哨兵存在                                                                               |

### 测试特征

- 测试验证外部行为（输出：哪些消息有哪些缓存提示），不测试内部实现细节
- Anthropic 适配器测试使用现有的 mock provider 模式验证 `cache_control` 注入，无需真实 API 调用
- CacheStakingStrategy 测试使用纯消息数组——无 provider、无 LLM、无网络
- 边界情况：空历史、单轮会话、所有块低于阈值、多个大块（最大的胜出）

### 先例

现有的 `kosong-llm-integration.test.ts` 提供了用 mock provider 测试端到端缓存流的模式。`anthropic.test.ts` 演示了如何验证系统块上的 `cache_control` 注入——相同模式可扩展到历史消息块。

## 非目标

- PromptPlan 构建器改动（它已正确处理系统提示缓存）
- OpenAI 或 Google GenAI 适配器改动（它们无需代码改动即可受益于稳定排序）
- 在最后一条用户消息中实现运行时状态警告（token 预算、视口状态）——这是 ADR 0011 中记录的后续关注点，现在不实现
- 用户可配置的缓存桩行为——这是一个内部优化
- 子代理缓存行为改动——子代理生命周期更短，缓存桩需求不同

## 补充说明

此实现由 ADR 0011（Turn-Boundary Cache Staking Strategy）指导，该文档详细记录了架构决策，包括计算-消费解耦的论证、CacheHint 协议以及两个并行机制的设计。

3+1 缓存桩模型在最大化利用 Anthropic 的 4 断点配额的同时保留一个条件断点。固定桩（系统、工具、上一轮）提供确定性缓存行为。动态锚点（桩 4）只在缓存大内容块有明显收益时激活。
