# PRD-0004: AgentRecords 恢复机制重构

## Problem Statement

当前 AgentRecords 的恢复机制存在架构不对称问题：

- **写路径（日志记录）**是分布式的 — 每个子系统（ContextMemory、ConfigState、TurnFlow 等）通过 `this.agent.records.logRecord()` 记录自己的状态变更
- **读路径（恢复）**是集中式的 — `restoreAgentRecord()` 函数包含 23 个 case 的 switch 语句，集中分发到各子系统

这种不对称导致以下问题：

1. **违反单一职责原则**：`restoreAgentRecord()` 函数必须了解所有 13 个子系统的内部 API
2. **强耦合**：添加新记录类型需要修改三个地方（类型定义、子系统日志、中心 switch 语句）
3. **维护负担**：所有恢复逻辑集中在 `records/index.ts` 中的 76 行函数
4. **架构脆弱**：switch 语句是维护瓶颈，任何修改都可能影响其他记录类型的恢复

## Solution

采用 **延迟注册的分布式恢复模式**，将恢复逻辑从 `AgentRecords` 移回各个子系统内部，实现写路径和读路径的架构对称。

### 核心设计

1. **定义恢复处理器接口**：创建 `RecordRestoreHandler` 接口，每个需要恢复的子系统实现此接口
2. **延迟注册**：Agent 构造完成后统一注册恢复处理器，避免循环依赖
3. **路由映射**：AgentRecords 使用映射表将记录类型路由到对应的处理器
4. **分层错误处理**：sub agent 恢复失败不阻塞主 agent

## User Stories

### 核心功能

1. 作为一名开发者，我希望恢复逻辑分布在各子系统中，以便每个子系统负责自己的状态恢复
2. 作为一名开发者，我希望添加新记录类型时只需修改对应的子系统，而不需要修改中心化的 switch 语句
3. 作为一名开发者，我希望恢复处理器接口提供类型安全保证，以便在编译时捕获错误
4. 作为一名开发者，我希望恢复操作是同步的，以便避免异步复杂性
5. 作为一名开发者，我希望恢复时不产生副作用（不记录日志、不发送事件），以便保持恢复的纯净性

### 可靠性

6. 作为一名用户，我希望主 agent 的恢复失败能立即停止会话，以便避免不一致状态
7. 作为一名用户，我希望 sub agent 的恢复失败不阻塞主 agent 的运行，以便主 agent 可以继续工作
8. 作为一名开发者，我希望恢复错误包含详细的上下文信息（记录类型、原始错误），以便快速定位问题
9. 作为一名开发者，我希望未注册的记录类型被静默跳过，以便支持纯日志记录

### 向后兼容

10. 作为一名用户，我希望旧版本的 wire.jsonl 文件能被正确恢复，以便我的会话不会丢失
11. 作为一名开发者，我希望迁移逻辑不受重构影响，以便现有的版本迁移机制继续工作
12. 作为一名开发者，我希望 wire 记录格式保持不变，以便新旧代码可以共存

### 可维护性

13. 作为一名开发者，我希望恢复逻辑与日志记录逻辑在同一类中，以便代码更易理解和维护
14. 作为一名开发者，我希望每个子系统的恢复逻辑是独立的，以便可以单独测试
15. 作为一名开发者，我希望接口定义在独立文件中，以便避免循环依赖

## Implementation Decisions

### 模块结构

#### 新增模块

1. **RecordRestoreHandler 接口** (`agent/restore-handler.ts`)
   - 定义恢复处理器接口
   - 包含契约文档（同步、无副作用、非幂等）
   - 被所有需要恢复的子系统实现

2. **类型映射表** (在 `AgentRecords` 内部)
   - 定义记录类型前缀到处理器 key 的映射
   - 处理命名不一致（如 `full_compaction` → `fullCompaction`）
   - 支持特殊类型（如 `metadata`）

#### 修改的模块

3. **AgentRecords** (`agent/records/index.ts`)
   - 移除 `restoreAgentRecord()` 中心函数
   - 添加 `registerHandlers()` 方法
   - 添加 `typePrefixToHandlerKey` 映射表
   - 修改 `restore()` 方法使用处理器分发
   - 修改错误处理逻辑

4. **Agent** (`agent/index.ts`)
   - 在构造函数末尾添加处理器注册调用
   - 修改 `resume()` 方法返回错误而非抛出

5. **各子系统** (ContextMemory, ConfigState, TurnFlow, PermissionManager, UsageRecorder, ToolManager, FullCompaction)
   - 实现 `RecordRestoreHandler` 接口
   - 添加 `restoreRecord()` 方法
   - 添加私有恢复方法（如 `restoreAppendMessage()`）

6. **Session** (`session/index.ts`)
   - 修改 `resume()` 方法收集失败的 agent
   - 区分主 agent 和 sub agent 的失败处理

### 接口定义

**RecordRestoreHandler 接口**：
- 输入：`AgentRecord`（已迁移的记录）
- 输出：无（同步操作）
- 契约：
  - 必须是同步的
  - 必须不产生副作用
  - 不需要保证幂等性
  - 假设每条记录只恢复一次

**AgentRecords.registerHandlers()**：
- 输入：`Record<string, RecordRestoreHandler>`
- 输出：无
- 行为：覆盖已注册的处理器

**Agent.resume()**：
- 输入：无
- 输出：`Promise<{ warning?: string; error?: Error }>`
- 行为：捕获恢复错误并返回，而非抛出

### 初始化顺序

1. AgentRecords 创建（不需要处理器）
2. 各子系统创建（可以使用 AgentRecords）
3. 处理器注册（Agent 构造函数末尾）
4. 恢复操作（Session.resume()）

### 记录类型路由

使用映射表将记录类型前缀路由到处理器：

```
context.*      → context
config.*       → config
turn.*         → turn
permission.*   → permission
tools.*        → tools
usage.*        → usage
background.*   → background
full_compaction.* → fullCompaction
metadata       → 特殊处理（直接返回）
其他           → 静默跳过
```

### 错误处理策略

**子系统恢复错误**：
- 包装错误信息，添加记录类型上下文
- 使用 `cause` 链接原始错误
- 返回错误而非抛出

**Session 级别**：
- 主 agent 失败：抛出异常，终止会话
- Sub agent 失败：记录日志，返回失败列表，继续运行

### 恢复方法与运行时方法的关系

- 恢复方法调用运行时方法（如 `appendMessage()`）是允许的
- 恢复方法必须使用恢复专用方法（如 `restorePrompt()`）避免副作用
- 运行时方法检查 `records.restoring` 标志作为防御性编程

### 向后兼容性

- Wire 记录格式不变
- 迁移逻辑（`records/migration/`）不受影响
- 迁移在恢复之前完成
- 新旧代码可以通过 wire 格式共存

## Testing Decisions

### 测试原则

- **只测试外部行为**：测试恢复后的状态是否正确，不测试内部实现细节
- **测试恢复顺序**：确保记录按正确顺序恢复
- **测试错误处理**：确保错误被正确包装和报告

### 测试模块

1. **单元测试**：
   - `AgentRecords.restore()`：路由逻辑、静默跳过、错误包装
   - 各子系统的 `restoreRecord()`：状态恢复正确性
   - 类型映射表：路由正确性

2. **集成测试**：
   - `Agent.resume()`：完整恢复流程
   - `Session.resume()`：主 agent 和 sub agent 的恢复
   - Wire 记录恢复：从文件读取并恢复

3. **回归测试**：
   - 现有的 `agent/records` 测试套件
   - 确保旧版本 wire.jsonl 能正确恢复

### 先例

- 现有的 `agent/records/index.test.ts` 测试恢复流程
- 现有的 `session/lifecycle-hooks.test.ts` 测试 agent 生命周期

## Out of Scope

以下内容不在本 PRD 范围内：

1. **Wire 记录格式变更**：记录类型和格式保持不变
2. **迁移逻辑重构**：现有的版本迁移机制不需要修改
3. **AgentRecords 的其他功能**：如日志记录、持久化、重写等不变
4. **性能优化**：重构的主要目标是架构清晰，非性能提升
5. **UI/CLI 变更**：此重构对用户界面无影响

## Further Notes

### 迁移路径

1. 先创建 `RecordRestoreHandler` 接口
2. 修改 `AgentRecords` 添加注册和路由逻辑
3. 逐步迁移各子系统实现接口（可以并行）
4. 修改 `Agent` 和 `Session` 的错误处理
5. 删除旧的 `restoreAgentRecord()` 函数
6. 更新测试

### 风险

1. **循环依赖**：通过延迟注册避免
2. **类型不一致**：通过接口约束和 TypeScript 检查
3. **测试覆盖**：需要确保所有恢复路径都有测试

### 相关 ADR

- [ADR 0010: AgentRecords 恢复机制重构](/docs/adr/0010-agent-records-restoration-refactoring.md)
