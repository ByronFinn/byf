# [DONE] PRD-0006: Prompt Cache 优化 — 三层改造

## 问题陈述

### 背景

BYF 的 prompt cache 架构（ADR 0009 + ADR 0011）已实现多层级缓存策略：
- **PromptPlan**：system prompt 静态分块 + `cacheScope` 标记
- **CacheStakingStrategy**：基于 turn boundary 的 `CacheHint`（`isLastTurnEnd` / `isSuddenLargeContext`）
- **Provider 适配**：Anthropic 显式 `cache_control` 断点；OpenAI 兼容 provider（含智谱 GLM）靠自动前缀匹配 + `prompt_cache_key`

### 核心问题

存在三类可控的缓存效率问题：

1. **目录树注入导致缓存断裂**：`DirectoryTreeInjector` 通过 `DynamicInjector.inject()` → `context.appendSystemReminder()` 将目录树和时间戳**永久写入 `_history`**。对于前缀匹配型 provider（GLM、OpenAI、DeepSeek 等），消息数组前缀的任何变化都会导致缓存失效。实测在 GLM-5.2 上，一次注入导致 ~19,712 tokens 的缓存丢失。

2. **全局缓存块不纯净**：System prompt 的 Block 0（`base`，scope `global`）原本包含 `# Working Environment` 段落，其中有 `BYF_OS`、`BYF_SHELL`、`BYF_WORK_DIR` 等因 session 而异的变量。这导致 Block 0 在 OpenAI 的 `prompt_cache_key`（Block 0 文本的 SHA256）上并非真正跨 session 稳定，在 Anthropic 的全局缓存断点上也不纯净。

3. **动态内容破坏缓存前缀**：时间戳、权限模式状态等每步变化的动态内容，如果放在 system prompt 或持久化注入到 history 中，都会破坏缓存。

### 根因分析

在 4 个缓存断裂点中，只有 1 个是由 system-reminder 注入引起的（Step 50→51 的隐式断裂），其余 3 个是 provider 侧 TTL 过期（不可控）。解决这 1 个可控断裂点即可消除所有可优化的注入相关缓存损失。

## 目标

1. **Tier 1 — 消除目录树注入**：移除 `DirectoryTreeInjector`，不再将目录树注入 `_history`。模型通过工具按需发现项目结构。
2. **Tier 2 — 重构 system prompt 分块**：将 `# Working Environment` 从全局块中分离为独立 session 级块，使 Block 0（全局）真正纯净——不包含任何 per-session 变量。
3. **Tier 3 — 激活 ephemeral injection 管线**：将时间戳和权限模式等动态内容从持久注入/system prompt 迁移到 ephemeral injection（每步在 `before_user` 位置渲染，追加在 history 末尾），对缓存前缀零影响。

## 非目标 (Out of Scope)

- Provider 侧 TTL 过期问题（不可控）
- 缓存可观测性增强（`inputCacheCreation` 估算 / Vis 展示）— 后续 follow-up
- Skill 激活和 `/init` 的注入路径改造（一次性事件，持久化合理）
- Tool-dedup 内联注入改造（已是内联模式，不产生独立消息）

## 技术方案

### 最终架构：三层缓存优化

最终架构遵循 prompt-cache 最佳实践的分层模型：

```
CACHE ZONE (稳定前缀):
  Block 0 (global): 纯 Agent 规则（身份、原则、安全）— 无 per-session 变量
  Block 1 (project): AGENTS.md
  Block 2 (session): Working Environment（OS、shell、cwd）
  Block 3 (session): Skills 列表
  Tool Specs (独立 API 参数)
CONVERSATION HISTORY (干净，无 system 注入):
  user / assistant / tool 消息
DYNAMIC ZONE (每步请求，在末尾，零缓存影响):
  Current Time（每步刷新）
  Permission Mode（当前状态）
```

### Tier 1: 删除 DirectoryTreeInjector

```
改造前:
  InjectionManager:
    [PermissionModeInjector, DirectoryTreeInjector]

改造后:
  DirectoryTreeInjector 彻底删除 → 不再有目录树注入 → 缓存不断裂
```

**删除文件**：`packages/agent-core/src/agent/injection/directory-tree.ts` 及其测试

移除 `DirectoryTreeInjector` 类及其全部依赖（`buildTree()`、`collectEntries()`、`EXCLUDED_DIRS`、`HIDDEN_DIR_WHITELIST`、`Entry` 接口、辅助函数），并从 `InjectionManager` 的 injector 列表中移除。

项目结构的发现从"注入式"变为"渐进式"：
- **AGENTS.md Project Map**：许多项目的 AGENTS.md 包含 `## Project Map` 段落（如本仓库），为模型提供高层结构概览。
- **工具发现**：模型通过 Glob、Bash ls、Read 等工具按需发现文件级结构。
- **用户 prompt 引导**：用户的任务描述通常指明了目标文件或模块。

这与 BYF 已有的 Progressive Disclosure 理念一致（Skills 只注入名称和描述，完整内容按需加载）。

### Tier 2: System Prompt 分块重构

**核心变更**：在 `system.md` 中，`# Project Information` 现在位于 `# Working Environment` **之前**。在 `builder.ts` 中，`# Working Environment` 加入 `IMPLICIT_BOUNDARY_HEADERS`。

**改造前**（3 个缓存块）：
- Block 0 (global): Agent 规则 **+ Working Environment（含 BYF_OS 等变量）**
- Block 1 (project): AGENTS.md
- Block 2 (session): Skills

Block 0 虽标记为 `global`，但实际包含 per-session 变量，导致 OpenAI 的 `prompt_cache_key`（Block 0 文本的 SHA256）并非真正跨 session 稳定。

**改造后**（4 个缓存块）：
- Block 0 (global): 纯 Agent 规则（身份、原则、安全）— **无任何 per-session 变量**
- Block 1 (project): AGENTS.md
- Block 2 (session): Working Environment（OS、shell、cwd）
- Block 3 (session): Skills 列表

**关键收益**：
- 对 OpenAI 型 provider：`prompt_cache_key = SHA256(global blocks)` 现在真正跨 session 稳定（不含 per-session cwd/OS）。
- 对 Anthropic：全局缓存断点只覆盖稳定的 agent 规则。

**涉及的 `IMPLICIT_BOUNDARY_HEADERS`**：

```typescript
const IMPLICIT_BOUNDARY_HEADERS = ['# Project Information', '# Working Environment', '# Skills'] as const;
```

### Tier 3: 激活 Ephemeral Injection 管线

此前 `EphemeralInjection` 接口存在但从未被使用。本层将其激活，用于承载每步变化的动态内容。

**1. `projector.ts` — 实现 `before_user` 位置**

`before_user` 注入追加在所有 history 之后（末尾），而非前插。这意味着它们不破坏缓存前缀：

```typescript
// after_system (默认): 前插，属于缓存前缀的一部分
// before_user: 后插，属于 per-request 动态内容
return [...afterSystemMsgs, ...merged, ...beforeUserMsgs];
```

**2. `injector.ts` — 添加 `getEphemeral?()` 方法**

`DynamicInjector` 基类新增可选方法：

```typescript
getEphemeral?(): readonly EphemeralInjection[];
```

**3. `manager.ts` — 添加 `getEphemeralInjections()` 方法**

收集所有 injector 的 ephemeral 注入：

```typescript
getEphemeralInjections(): readonly EphemeralInjection[] {
  return this.injectors.flatMap((injector) => injector.getEphemeral?.() ?? []);
}
```

**4. 新增 `timestamp.ts` — `TimestampInjector`**

每步在 `before_user` 位置生成新鲜的 ISO 时间戳：

```typescript
override getEphemeral() {
  return [{
    kind: 'system_reminder',
    content: `The current date and time in ISO format is \`${new Date().toISOString()}\`. ...`,
    position: 'before_user',
  }];
}
```

**5. `permission-mode.ts` — 从持久注入转为 ephemeral**

改造前：基于 transition（权限切换事件），持久写入 history。
改造后：基于 state（当前模式状态），通过 `getEphemeral()` 每步反映当前状态。仅在 auto 模式激活时产生注入。

**6. `context/index.ts` — 新增 `getMessages(ephemeral?)` 方法**

```typescript
getMessages(ephemeral?: readonly EphemeralInjection[]): Message[] {
  return project(this.history, ephemeral);
}
// messages getter 委托至 getMessages() (无 ephemeral)
get messages(): Message[] { return this.getMessages(); }
```

**7. `turn/index.ts` — `buildMessages` 回调集成**

```typescript
buildMessages: () => {
  const ephemeral = this.agent.injection.getEphemeralInjections();
  const messages = this.agent.context.getMessages(ephemeral);
  return applyCacheStaking(messages, { ... });
}
```

### InjectionManager 最终状态

```typescript
// 改造前:
this.injectors = [new PermissionModeInjector(agent), new DirectoryTreeInjector(agent)];

// 改造后:
this.injectors = [new PermissionModeInjector(agent), new TimestampInjector(agent)];
// 两者均通过 getEphemeral() 提供 ephemeral 注入，不再持久写入 _history
```

## 验收标准

### 功能正确性

1. **`InjectionManager`** 包含 `PermissionModeInjector` 和 `TimestampInjector`，不包含 `DirectoryTreeInjector`
2. **`directory-tree.ts`** 及其测试文件已删除
3. **system prompt** 中 `# Project Information` 位于 `# Working Environment` 之前
4. **`builder.ts`** 的 `IMPLICIT_BOUNDARY_HEADERS` 包含 `# Working Environment`，生成 4 个缓存块
5. **Block 0 (global)** 不包含任何 per-session 变量（无 `BYF_OS`、`BYF_WORK_DIR` 等）
6. **`PermissionModeInjector`** 和 **`TimestampInjector`** 均通过 `getEphemeral()` 提供 ephemeral 注入，不通过 `inject()` 持久写入 `_history`
7. **`projector.ts`** 中 `before_user` 注入追加在 history 末尾（`[...afterSystemMsgs, ...merged, ...beforeUserMsgs]`）
8. **`context/index.ts`** 的 `getMessages(ephemeral?)` 接受可选 ephemeral 参数；`messages` getter 无 ephemeral
9. **`turn/index.ts`** 的 `buildMessages` 回调调用 `injection.getEphemeralInjections()` 并传递给 `context.getMessages(ephemeral)`
10. **`_history`** 中不再出现目录树或时间戳相关的 `<system-reminder>` 消息

### 缓存效果

11. **Block 0 (global)** 跨 session 不变 → OpenAI `prompt_cache_key` 真正跨 session 稳定
12. **同 turn 内连续 step**：`_history` 不因注入而变化 → cache_read token 数不下降（排除 provider TTL 过期因素）
13. **ephemeral 注入**（时间戳、权限模式）追加在 history 末尾，不影响消息数组前缀 → 零缓存影响

### 不回归

14. **Skill 激活**仍通过 `appendSystemReminder()` 持久化注入（不改动）
15. **`/init` 完成**仍通过 `appendSystemReminder()` 持久化注入（不改动）
16. **Tool-dedup 内联注入**不受影响（已是内联模式）
17. **Anthropic provider** 的 `cache_control` 断点行为不受影响（`CacheHint` 逻辑不变）
18. **`mergeAdjacentUserMessages`** 的注入检测逻辑不受影响（持久注入仍以 `<system-reminder>` 开头）

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 模型在会话开始时不知道项目文件级结构 | 可能需要额外的工具调用来发现结构 | AGENTS.md Project Map 提供高层概览；模型可通过 Glob/Bash 按需发现；用户 prompt 通常指明目标 |
| 外部进程改变目录结构后模型不感知 | 模型可能基于过时假设做决策 | 模型通过工具调用结果发现自己创建/修改的文件；如需确认当前状态可主动调用 Glob |
| 时间戳每步变化 | 不影响缓存前缀（ephemeral，在 history 末尾） | 设计如此——每步新鲜时间戳对模型决策有利 |
| 权限模式注入不再持久化 | compaction 后权限提醒不会被历史消息保留 | ephemeral 注入每步反映当前状态，compaction 无影响——这正是从 transition 改为 state 的优势 |

## 实现计划

| 阶段 | 任务 | 依赖 |
|---|---|---|
| 1 | 在 `system.md` 中将 `# Project Information` 移到 `# Working Environment` 之前 | 无 |
| 2 | 在 `builder.ts` 的 `IMPLICIT_BOUNDARY_HEADERS` 加入 `# Working Environment` | 阶段 1 |
| 3 | 在 `projector.ts` 实现 `before_user` 位置（追加在 history 末尾） | 无 |
| 4 | 在 `injector.ts` 的 `DynamicInjector` 添加 `getEphemeral?()` 方法 | 阶段 3 |
| 5 | 在 `manager.ts` 添加 `getEphemeralInjections()` 方法 | 阶段 4 |
| 6 | 新增 `timestamp.ts`（`TimestampInjector`，ephemeral 时间戳） | 阶段 4 |
| 7 | 改造 `permission-mode.ts`（从持久注入转为 ephemeral） | 阶段 4 |
| 8 | 在 `context/index.ts` 添加 `getMessages(ephemeral?)` 方法 | 阶段 3 |
| 9 | 在 `turn/index.ts` 集成 `buildMessages` 回调 | 阶段 5、8 |
| 10 | 删除 `directory-tree.ts` 及其测试，从 `InjectionManager` 移除引用 | 无 |
| 11 | 更新或清理受影响的测试 | 全部 |
