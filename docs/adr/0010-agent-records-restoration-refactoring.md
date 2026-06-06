# ADR 0010: AgentRecords 恢复机制重构

## Status

Accepted

## Context

当前 AgentRecords 的恢复机制存在架构不对称问题：

- **写路径（日志记录）**：分布式 — 每个子系统通过 `this.agent.records.logRecord()` 记录自己的状态变更
- **读路径（恢复）**：集中式 — `restoreAgentRecord()` 函数包含 23 个 case 的 switch 语句，集中分发到各子系统

这种不对称导致以下问题：

1. **违反单一职责**：`restoreAgentRecord()` 必须了解所有 13 个子系统的内部 API
2. **强耦合**：添加新记录类型需要修改三个地方（类型定义、子系统日志、中心 switch）
3. **维护负担**：所有恢复逻辑集中在 `records/index.ts` 中的 76 行函数
4. **架构脆弱**：switch 语句是维护瓶颈

## Decision

采用 **延迟注册的分布式恢复模式**：

### 1. 接口定义

创建 `agent/restore-handler.ts` 定义恢复处理器接口：

```typescript
import type { AgentRecord } from './records/types';

/**
 * 记录恢复处理器接口。
 *
 * 契约：
 * - restoreRecord() 必须是同步的
 * - restoreRecord() 必须不产生副作用（不记录日志、不发送事件、不调用 LLM）
 * - restoreRecord() 会被每条记录调用一次，不需要保证幂等性
 * - 实现时假设每条记录只会被恢复一次
 */
export interface RecordRestoreHandler {
  restoreRecord(record: AgentRecord): void;
}
```

### 2. 延迟注册

Agent 构造完成后统一注册处理器，避免循环依赖：

```typescript
export class Agent {
  constructor(config: AgentConfig) {
    // 先创建 records 和子系统
    this.records = new AgentRecords(persistence);
    this.context = new ContextMemory(this);
    this.config = new ConfigState(this);
    // ...

    // 最后统一注册
    this.records.registerHandlers({
      context: this.context,
      config: this.config,
      turn: this.turn,
      permission: this.permission,
      fullCompaction: this.fullCompaction,
      usage: this.usage,
    });
  }
}
```

### 3. AgentRecords 路由

AgentRecords 使用映射表路由到对应处理器：

```typescript
class AgentRecords {
  private handlers: Partial<Record<string, RecordRestoreHandler>> = {};

  registerHandlers(handlers: Record<string, RecordRestoreHandler>): void {
    Object.assign(this.handlers, handlers);
  }

  restore(record: AgentRecord): void {
    if (record.type === 'metadata') return;

    const handlerKey = this.typePrefixToHandlerKey[record.type.split('.')[0]];
    if (!handlerKey) return;  // 未注册的处理器静默跳过（纯日志记录）

    const handler = this.handlers[handlerKey];
    handler?.restoreRecord(record);
  }

  private readonly typePrefixToHandlerKey: Record<string, string> = {
    'context': 'context',
    'config': 'config',
    'turn': 'turn',
    'permission': 'permission',
    'tools': 'tools',
    'usage': 'usage',
    'background': 'background',
    'full_compaction': 'fullCompaction',
  };
}
```

### 4. 子系统实现

各子系统实现 `RecordRestoreHandler` 接口：

```typescript
class ContextMemory implements RecordRestoreHandler {
  restoreRecord(record: AgentRecord): void {
    switch (record.type) {
      case 'context.append_message':
        return this.restoreAppendMessage(record);
      case 'context.clear':
        return this.restoreClear();
      case 'context.append_loop_event':
        return this.restoreAppendLoopEvent(record);
      // ...
    }
  }

  private restoreAppendMessage(record: AgentRecordOf<'context.append_message'>): void {
    this.appendMessage(record.message);
  }

  // 其他恢复方法...
}
```

### 5. 恢复方法与运行时方法分离

恢复时调用专门的恢复方法或同步版本：

```typescript
class TurnFlow implements RecordRestoreHandler {
  restoreRecord(record: AgentRecord): void {
    switch (record.type) {
      case 'turn.prompt':
        this.restorePrompt();  // 专门的恢复方法
        break;
      case 'turn.cancel':
        this.cancel(record.turnId);  // 幂等方法，可直接调用
        break;
    }
  }

  restorePrompt(): void {
    if (this.activeTurn) return;
    this.turnId += 1;
    this.activeTurn = 'resuming';
  }

  // 运行时方法 - 有副作用
  prompt(input, origin) {
    if (this.agent.records.restoring) return;
    this.agent.records.logRecord(...);
    // ...
  }
}
```

### 6. 错误处理

分层错误处理，sub agent 失败不阻塞主 agent：

```typescript
class Agent {
  async resume(): Promise<{ warning?: string; error?: Error }> {
    try {
      const result = await this.records.replay();
      await this.background.loadFromDisk();
      await this.background.reconcile();
      this.turn.finishResume();
      return { warning: result.warning };
    } catch (error) {
      return { error: error as Error };  // 返回错误而不是抛出
    }
  }
}

class Session {
  async resume(): Promise<{ warning?: string; failedAgents?: string[] }> {
    const results = await Promise.all(/* ... */);

    const failedAgents: string[] = [];

    for (const { id, result } of results) {
      if (result.error) {
        failedAgents.push(id);
        this.log.error('Agent resume failed', { agentId: id, error: result.error });
      }
    }

    // 只有主 agent 失败才抛出异常
    if (failedAgents.includes('main')) {
      throw new Error('Main agent resume failed');
    }

    return { warning, failedAgents };
  }
}
```

## Consequences

### 正面影响

1. ✅ **架构对称**：日志记录和恢复都是分布式的
2. ✅ **职责清晰**：每个子系统负责自己的恢复逻辑
3. ✅ **易于扩展**：添加新子系统只需实现接口并注册
4. ✅ **类型安全**：通过接口约束和 TypeScript 类型检查
5. ✅ **鲁棒性**：sub agent 失败不阻塞主 agent

### 负面影响

1. ❌ **文件增加**：新增 `agent/restore-handler.ts`
2. ❌ **样板代码**：每个子系统需要实现 `restoreRecord` 方法
3. ❌ **内部 switch**：子系统内部仍有 switch 语句（但更局部化）

### 无影响

- ❌ **迁移逻辑**：完全不受影响，迁移在恢复之前完成
- ❌ **wire 格式**：记录类型和格式不变，完全向后兼容
