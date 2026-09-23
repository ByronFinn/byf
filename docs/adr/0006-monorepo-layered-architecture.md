# ADR 0006: Monorepo 分层架构

## 状态

已接受（2026-09-21 更新：应用层收缩为 `apps/cli` + `apps/web`，`apps/vis` 相关描述已失效，见文末「更新」）

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

| 层     | 包                    | 角色                                                                                                                                                          |
| ------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 应用层 | `apps/cli`            | CLI / TUI。**仅**通过 `@byfriends/sdk` 消费核心能力。不得直接导入 `@byfriends/agent-core`。                                                                   |
| 应用层 | `apps/vis`            | 可视化调试。从文件系统读取会话数据。对 wire-record 迁移函数和 `AGENT_WIRE_PROTOCOL_VERSION` 常量从 `agent-core` 获取只读运行时依赖。仅从 `kosong` 获取类型。  |
| SDK 层 | `packages/node-sdk`   | 公开 TypeScript SDK。通过类型化 RPC 通道（`createRPC<CoreAPI, SDKAPI>`）桥接宿主应用和 agent-core。CLI 与引擎内部的隔离接缝。                                 |
| 引擎层 | `packages/agent-core` | 统一代理引擎：Agent、Session、Profile、Skill、Tool、Plan、Permission、Background、Records、Compaction、RPC、Config。依赖 kosong（LLM）和 kaos（执行环境）。   |
| LLM 层 | `packages/kosong`     | Provider 抽象层。`ChatProvider` 接口，带 OpenAI、Anthropic、Google GenAI 适配器。无状态的 `generate()` 循环处理流式传输、工具调用路由、中止。                 |
| 环境层 | `packages/kaos`       | 执行环境抽象。`Kaos` 接口，目前仅带 `LocalKaos` 适配器；`SSHKaos`（SSH/SFTP 远程）按规划尚在设计中，代码中尚未实现。绑定到异步上下文。对代理或 LLM 一无所知。 |
| 工具层 | `packages/oauth`      | OAuth 和认证工具。过渡期保留。                                                                                                                                |

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

## 更新（2026-09-21，PRD-0038 R5 / AC-5.8）

上文关于 `apps/vis` 的描述（依赖图第 4 行、层职责表的 `apps/vis` 行、关键不变式第 4 条、以及「结果」里以 vis 为例的正面论据）已不再对应仓库中的任何代码：

- **`apps/vis` 整棵树已删除。** 只读 replay / session visualizer 并入统一工作台，由 `@byfriends/web-server` 单独提供服务（PRD-0035 R-B4/R-B5、ADR-0037 D1）；`byf vis` 退化为一个弃用期的别名子命令，启动的是同一个 web 工作台。`@byfriends/vis-server` 包随之消失，因此这条「从 agent-core 只读取 wire-migration 层」的例外失去了宿主——历史上 `apps/cli/AGENTS.md` 曾把它写成 CLI 的「窄例外」，而删除前的 `apps/vis/server/src/**` 只是 `@byfriends/web-server` 的 re-export、零 agent-core import，该条款本就是散文事实错误，已一并更正。
- **应用层现在是 `apps/cli` + `apps/web`（server / client / shared）**，两者受同一条不变式约束：只能通过 `@byfriends/sdk` 消费核心能力。
- **「禁止 → agent-core」从约定升级为门禁。** `scripts/lib/check-app-layering.mjs`（PRD-0038 AC-2.1，随 `bun run test` 执行）扫描 `apps/**` 下全部源文件，含经相对路径逃逸到 `packages/agent-core/src/**` 的写法；`src` 命中即红，测试域 ratchet 基线为 0，例外表 `LAYERING_EXCEPTIONS` 为空且拒绝目录级豁免。
