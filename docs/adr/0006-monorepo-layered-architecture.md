# ADR 0006: Monorepo 分层架构

## 状态

已接受

## 背景

BYF 是一个包含多个包和应用的 TypeScript monorepo。我们需要记录有意的分层和依赖方向，以便未来的贡献者和 AI 代理理解什么可以依赖什么。

## 决策

代码库按四层组织，具有严格的依赖方向（上层依赖下层）：

```
apps/cli  ──→  packages/node-sdk  ──→  packages/agent-core  ──→  packages/kosong
                                                                          ──→  packages/kaos
apps/vis  ──→  （来自 agent-core 的类型 + wire-migration 运行时；仅类型来自 kosong）
```

### 层职责

| 层          | 包                   | 角色                                                                                                                                                               |
| ----------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 应用层      | `apps/cli`           | CLI / TUI。**仅**通过 `@byfriends/sdk` 消费核心能力。不得直接导入 `@byfriends/agent-core`。                                                                         |
| 应用层      | `apps/vis`           | 可视化调试。从文件系统读取会话数据。对 wire-record 迁移函数和 `AGENT_WIRE_PROTOCOL_VERSION` 常量从 `agent-core` 获取只读运行时依赖。仅从 `kosong` 获取类型。       |
| SDK 层      | `packages/node-sdk`  | 公开 TypeScript SDK。通过类型化 RPC 通道（`createRPC<CoreAPI, SDKAPI>`）桥接宿主应用和 agent-core。CLI 与引擎内部的隔离接缝。                                       |
| 引擎层      | `packages/agent-core` | 统一代理引擎：Agent、Session、Profile、Skill、Tool、Plan、Permission、Background、Records、Compaction、RPC、Config。依赖 kosong（LLM）和 kaos（执行环境）。         |
| LLM 层      | `packages/kosong`    | Provider 抽象层。`ChatProvider` 接口，带 OpenAI、Anthropic、Google GenAI 适配器。无状态的 `generate()` 循环处理流式传输、工具调用路由、中止。                       |
| 环境层      | `packages/kaos`      | 执行环境抽象。`Kaos` 接口，带 `LocalKaos` 和 `SSHKaos` 适配器。绑定到异步上下文。对代理或 LLM 一无所知。                                                             |
| 工具层      | `packages/oauth`     | OAuth 和认证工具。过渡期保留。                                                                                                                                     |
| 工具层      | `packages/telemetry` | 遥测基础设施。在 BYF 中已禁用。                                                                                                                                   |

### 关键不变式

- **禁止 CLI → agent-core 依赖。** SDK（`@byfriends/sdk`）是唯一的访问路径。通过约定和 `apps/cli/AGENTS.md` 强制执行。
- **agent-core 永远不直接触及 `fs` 或 `child_process`** 用于可能远程运行的操作。所有文件/进程操作通过 `Kaos` 进行。
- **kosong 和 kaos 互不知晓对方。** 两者都由 agent-core 独立消费。
- **vis 从文件系统读取，运行时不从 agent-core 读取（wire-migration helper 除外）。** 它只导入类型定义、`AGENT_WIRE_PROTOCOL_VERSION` 常量和 wire-record 迁移函数（`migrateWireRecord`、`resolveWireMigrations`）。agent-core 的代理循环、Session、Profile、Skill、Tool、RPC 和其他子系统从不加载。

### agent-core 的内部架构

Agent-core 有一个主要接缝：`Agent` 类是持有 14 个子系统的中央枢纽。`Session` 是外部容器，创建并拥有 `Agent` 实例。`Loop` 是无状态的——由 `TurnFlow` 调用，不跨 turn 持有状态。

`RPC` 模块定义了三层 API：`CoreAPI`（完整宿主机）、`SessionAPI`（每会话）、`AgentAPI`（每代理）。`SDKAPI` 是宿主机必须实现的回调接口。

### kosong 的内部架构

`ChatProvider` 接口是中央接缝。每个适配器（OpenAI Completions、OpenAI Responses、Anthropic、Google GenAI）实现返回 `StreamedMessage` 的 `generate()`。`createProvider()` 工厂根据 `ProviderConfig.type` 分发。

## 结果

- **正面：** 清晰的依赖方向防止循环耦合。SDK 接缝允许用替代宿主机替换 CLI。Kaos 接缝允许在本地或远程运行相同的代理逻辑。
- **正面：** vis 可以调试任何会话，而无需在运行时导入代理循环、Session、Profile、Skill、Tool、RPC 或其他 agent-core 子系统。唯一加载的 agent-core 表面是 wire-migration 层（一个薄而稳定的叶子依赖）。
- **负面：** node-sdk 增加了一层 RPC 间接。这个权衡是有意的——隔离接缝比调用开销更有价值。
