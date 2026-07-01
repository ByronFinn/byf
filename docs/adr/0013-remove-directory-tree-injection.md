# ADR 0013: 提示缓存优化 — 三层改造

## 状态

已接受

## 背景

`DirectoryTreeInjector`（在 `agent-core/src/agent/injection/directory-tree.ts`）通过 `appendSystemReminder()` 将项目目录结构和会话时间戳注入对话历史。这会在 `_history` 中创建持久的 `user` 角色消息。

对于前缀匹配缓存的 provider（OpenAI 兼容：GLM、DeepSeek、Kimi 等），消息数组前缀的任何变化都会使缓存失效。目录树注入在两种情况下导致缓存前缀破坏：

1. **初始注入**（会话开始）：向 `_history` 追加新消息。
2. **树变化**（文件被创建/删除）：追加新消息，前一次注入在前缀中的位置发生变化。

在 GLM-5.2 上的生产缓存分析测量到一次注入事件导致约 19,712 token 的缓存丢失。在包含 3 次树变化的 50 步会话中，这累计造成约 300K token 的不必要重新计费。

同时，目录树注入的价值在递减：

- 许多项目在 AGENTS.md 中包含高层项目地图（如 `## Project Map`）。
- 模型需要时通过工具（Glob、Bash、Read）发现文件级结构。
- 注入的树随会话进行而变得过时——仅在注入器检测到变化时刷新。
- 用户的任务提示通常指明目标文件或模块。

还发现了另外两个缓存低效问题：

- **不纯的全局缓存块**：系统提示的 Block 0（`base`，scope `global`）包含 `# Working Environment` 部分，其中有会话特定变量（`BYF_OS`、`BYF_SHELL`、`BYF_WORK_DIR`）。这意味着 Block 0 并非真正跨会话稳定——对于 OpenAI，`prompt_cache_key`（全局块文本的 SHA256）每会话变化；对于 Anthropic，全局缓存断点覆盖了不稳定的内容。
- **动态内容污染缓存前缀**：会话时间戳（之前与目录树注入器捆绑在一起）和权限模式提醒每步或每事件变化，却被持久化到 `_history` 或嵌入系统提示中，在它们出现的地方破坏缓存。

## 决策

本 ADR 涵盖了一同实施的三层缓存优化。

### 第一层：完全移除 DirectoryTreeInjector

删除 `DirectoryTreeInjector` 类及其所有依赖（`buildTree`、`collectEntries`、排除集、路径工具）。将其从 `InjectionManager` 的注入器列表中移除。

**理由**：目录树是唯一一个在内容变更时于会话中期触发的动态注入器。移除它消除了 `_history` 中注入引起缓存破坏的唯一可控源头。模型可以通过工具按需发现项目结构——这与现有的渐进式披露原则一致。

### 第二层：将系统提示重组为纯净的 4 块缓存架构

重新排序 `system.md`，使 `# Project Information`（AGENTS.md）位于 `# Working Environment` **之前**。将 `# Working Environment` 添加到 `builder.ts` 的 `IMPLICIT_BOUNDARY_HEADERS` 中。这将原本的 Block 0 拆分为两个块：

- **Block 0（global）**：纯代理规则（身份、第一性原理、工具使用、协议、安全）——无 per-session 变量。
- **Block 2（session）**：工作环境（OS、shell、cwd）——现在位于自己的会话范围块中。

产生的 4 块结构：

| 块  | 名称                  | 范围      | 内容                                      |
| --- | --------------------- | --------- | ----------------------------------------- |
| 0   | `base`                | `global`  | 代理身份、原则、安全——零 per-session 变量 |
| 1   | `projectInstructions` | `project` | AGENTS.md                                 |
| 2   | `workingEnvironment`  | `session` | OS、shell、工作目录                       |
| 3   | `sessionContext`      | `session` | 技能列表                                  |

**理由**：Block 0 现在真正跨会话稳定。对于 OpenAI 兼容 provider，`prompt_cache_key = SHA256(global blocks)` 对同一项目中的每个会话都相同。对于 Anthropic，全局缓存断点只覆盖稳定的代理规则。这最大化跨会话缓存复用，不受任何 per-session 污染。

### 第三层：为动态内容激活临时注入管线

`EphemeralInjection` 接口和 `project()` 的第二个参数存在但属于死代码。本层激活完整管线：

1. **`projector.ts`**：实现 `before_user` 位置。`before_user` 注入追加在**所有**历史之后（末尾），而非前插。这意味着它们从不破坏缓存前缀。
2. **`injector.ts`**：向 `DynamicInjector` 基类添加可选的 `getEphemeral?(): readonly EphemeralInjection[]`。
3. **`manager.ts`**：添加 `getEphemeralInjections()`，通过 `flatMap` 从所有注入器收集。
4. **`timestamp.ts`**（新增）：`TimestampInjector` 每步在 `before_user` 生成新鲜 ISO 时间戳。
5. **`permission-mode.ts`**：从持久（基于事件转换，写入 `_history`）改为临时（基于状态，通过 `getEphemeral()` 始终反映当前模式）。仅在 auto 模式激活时触发。
6. **`context/index.ts`**：添加 `getMessages(ephemeral?)` 方法；`messages` getter 委托给它，不传 ephemeral。
7. **`turn/index.ts`**：`buildMessages` 回调调用 `injection.getEphemeralInjections()` 并将其传递给 `context.getMessages(ephemeral)`。

**理由**：动态的每步内容（时间戳、权限模式状态）属于消息数组的末尾，而非系统提示或 `_history` 中。`before_user` 位置使此内容完全处于缓存前缀之外——零缓存影响，始终新鲜。

### 最终架构

提示缓存最佳实践的分层模型：

```
缓存区（稳定前缀）：
  Block 0（global）：代理规则——无 per-session 变量
  Block 1（project）：项目知识（AGENTS.md）
  Block 2（session）：工作环境 + 技能
  工具规格（独立 API 参数）
对话历史（干净，无系统注入）：
  user / assistant / tool 消息
动态区（每请求，在末尾，零缓存影响）：
  当前时间（始终新鲜）
  权限模式（始终当前状态）
```

## 考虑的替代方案

### A. 仅移除 DirectoryTreeInjector，将时间戳移到系统提示（PRD 原始范围）

保持 `PermissionModeInjector` 持久；将 `BYF_TIMESTAMP` 作为模板变量嵌入系统提示的 `# Working Environment` 部分。**部分采纳后被取代**：第一层（移除）被保留，但时间戳入系统提示的方法被第三层的临时注入取代。系统提示中冻结的会话时间戳不如新鲜的每步时间戳有用，且临时方法零缓存影响。

### B. 首次持久 + 其余临时混合用于目录树

首次注入写入历史（可缓存）；后续变更是临时注入。**被拒绝**：模型在临时步骤过期后仍然看不到树变更的可视信息，且当工具发现工作良好时，复杂度与价值不成比例。

### C. 内联注入到工具结果

将目录树文本追加到前一个工具结果的输出中（类似 `tool-dedup.ts`）。**被拒绝**：仅在工具结果前于注入步骤时有效；在 turn 开始时（用户提示 → LLM 响应，无前一个工具结果）不适用。

### D. 保持 DirectoryTreeInjector 持久（现状）

接受缓存破坏作为前置项目意识的权衡。**被拒绝**：生产缓存分析显示显著的 token 浪费（每 50 步会话约 300K token），且注入的树的价值可被 AGENTS.md 项目地图和按需工具发现替代。

## 结果

- **正面：** 消除注入引起缓存破坏的唯一可控源头。前缀匹配 provider（GLM、OpenAI、DeepSeek 等）不再因目录树变化而丢失缓存。
- **正面：** Block 0（global）真正跨会话稳定。`prompt_cache_key` 现在对同一项目的所有会话相同，最大化 OpenAI 兼容的缓存复用。
- **正面：** 时间戳每步都新鲜（非冻结在会话开始），改善模型的时间感知决策。
- **正面：** 权限模式注入现在基于状态——它能在压缩后存活（始终反映当前状态）而非压缩可能擦除的一次性转换事件。
- **正面：** 更简单的 `InjectionManager`——`DirectoryTreeInjector` 已移除，所有动态注入器都是临时的（无 `_history` 污染）。
- **正面：** 对话历史干净——无来自动态注入器的 system-reminder 消息。
- **负面：** 模型在每个会话开始时没有文件级目录树。可能在部分任务开始时需要一个额外的工具调用（Glob/ls）来定位。通过 AGENTS.md 项目地图和用户提示上下文缓解。
- **负面：** 模型不会自动检测外部的目录结构变化（如 git pull）。模型在相关时可以通过工具发现变化。
