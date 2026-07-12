# 上下文：BYF (Be Your Friend)

在终端中运行的 AI 编码代理。

## 术语表

### BYF

产品名，全称「Be Your Friend」。在终端中运行的 AI 编码代理。

### vis

BYF 的会话与 replay 可视化调试工具（Hono API server + React/Vite SPA）。运行在本地，读取 `$BYF_HOME/sessions` 下的会话记录并渲染为可浏览的时间线/树形视图。开发态通过 monorepo 的 `vis` 脚本（API + Vite web 双端口）启动；发布态通过 `byf vis`（进程内单端口服务）启动。工具链迁移后开发入口以 Bun 为准（见「开发工具链契约」）。

### vis-server

承载 vis 的 HTTP 服务（`@byfriends/vis-server`）。提供 `/api/sessions/*` 接口并托管 web SPA 静态产物（构建后的 `public/`）。可通过 `byf vis` 子命令在进程内启动（导入 `startVisServer`），也可独立启动服务入口（库入口供程序化导入）。端口、主机、BYF_HOME 走环境变量（`PORT` 默认 3001、`VIS_HOST` 默认 127.0.0.1、非回环绑定时 `VIS_AUTH_TOKEN` 必填）。独立启动的解释器与库运行时契约一致（Bun，不再以 Node 为官方路径）。

### 开发工具链契约

贡献 BYF monorepo 与运行官方 CI 时，**仅支持 Bun** 作为包管理与脚本/测试执行入口（不再以 pnpm 或 Node 为官方开发路径）。官方基线为 **Bun 1.3.14**（`engines.bun` ≥1.3.14；CI pin 同版本）；有新稳定版时通过显式 bump 抬升。与「终端用户如何安装 CLI」无关。

### 库运行时契约

发布到 npm 的 `@byfriends/*` **库包**（如 `@byfriends/sdk`、`@byfriends/agent-core` 等）仅支持在 **Bun** 中 import 与运行；不官方支持用 Node 解释执行这些包。

### CLI 分发契约

终端用户使用 **BYF CLI** 时，官方支持路径是 **compile 单二进制**（GitHub Release 与 npm 上「主包 + 分平台 optionalDependencies」同源产物）。用户**无需**预装 Bun 或 Node。这与库运行时契约不同：CLI 装的是可执行文件，不是依赖用户本机 JS 运行时的库。

### bun compile 路径

用 `bun build --compile` 生成嵌入 Bun runtime 的平台可执行文件，用于实现 CLI 分发契约；取代历史上的 Node SEA 单二进制管线。

### 发布协议改写

在 publish 到 npm 之前，将工作区 manifest 中的 `workspace:` / `catalog:` 等协议变为 registry 可识别的具体版本，且不得泄漏未改写协议。在 Bun 工具链下，**优先依赖 `bun pm pack` / `bun publish` 的内置改写**；仓库以 **pubcheck** 做硬门禁；仅对内置未覆盖的变换（如部分 `publishConfig` 展开、与 changesets 的衔接）使用额外脚本。

## 许可条款

- 可复制和重新分发未修改的 BYF 软件
- 允许个人本地修改
- 禁止分发修改版
- 禁止商业使用
- 源代码在 GitHub 上公开可见（源码可用，非开源）

## 术语表

### 侧查询 (Side Query, /btw)

从当前会话上下文的快照中回答的一次性、只读问题，不进入主 Turn 流程。通过 `/btw <question>` 调用。答案不调用工具，不写入主历史或 wire records，仅显示在可关闭的浮层中。当主 turn 处于工具调用中间（未完成的 tool_call 没有 tool_result，提供商会拒绝）时，快照会截断回最近已完成的步骤。与 Claude Code 的 `/btw` 一致。

### 浮层 (Overlay, /btw)

显示侧查询问题和流式答案的可关闭面板，通过与其他全屏对话框相同的编辑器替换机制挂载。关闭浮层会中止任何正在进行的侧查询。与主 transcript 不同：侧查询的问答从不出现在对话历史中。

### Provider

用户配置的具名 API 端点。每个 provider 有用户选择的名称（如 "deepseek"）、`type`（如 `openai-completions`、`anthropic`、`google-genai`）、`base_url`、`api_key` 以及可选的 `allowedPrefixes`（用于模型过滤）。存储在配置的 `providers[name]` 下。实现为 `packages/kosong` 中的 `ChatProvider` 适配器（通过 `createProvider` 创建）。与 Search Provider（网页搜索后端，不同的包和抽象）无关。

### openai-completions

兼容 OpenAI Chat Completions 接口的统一 provider 类型（OpenAI、DeepSeek、Ollama 等）。取代了之前的 `openai` 和 `openai-compat` 类型。避免使用：openai（已废弃）、openai-compat（已废弃）。

### 目录 Provider (Catalog Provider)

通过 `/connect` 配置的知名 provider（OpenAI、Anthropic 等），从 models.dev 目录获取元数据。区别于用户通过 `/login` 自行配置的 provider。

### /login

通过自带 API key + base URL 添加自定义 provider 的 CLI 命令。支持三种接口类型：`openai-completions`（兼容 OpenAI Chat Completions）、`openai_responses`（OpenAI Responses API）和 `anthropic`（Anthropic 原生）。`google-genai` 和 `vertexai` 在 base URL 传播到运行时 provider 的实现完成前暂缓。流程：类型 → 名称 → base_url → api_key → 选择模型。支持多个 provider。目录增强（ADR 0012）适用于所有类型。

### /connect

从 models.dev 配置目录 provider 的 CLI 命令。与 `/login` 互补。

### /logout

打开交互式选择器以移除已配置 provider 的 CLI 命令。`defaultModel` 对应的 provider 默认高亮。别名 `/disconnect` 行为相同。

### update-config

一个内置技能（`/skill:update-config`），用于审计和重写 `~/.byf/config.toml`。与确定性命令不同，代理会读取配置，应用技能本身嵌入的治理规则（废弃字段表、`default_thinking` 迁移、raw-passthrough 清理）以及 `schema.ts`/`runtime-provider.ts` 作为字段值的事实来源，标记废弃字段，清除经过读→写往返后残留的 `config.raw` 中的过期键，并指出语义冲突（如一个 provider 同时有 `api_key` 和 `oauth`）。代理直接通过 Write/Edit 应用编辑，由权限提示门控（无备份/回滚）。可选的 `$ARGUMENTS` 可覆盖配置路径。规则随 BYF 发布，每个版本演进。参见 ADR-0019。

### Agent

`agent-core` 中的核心类。持有子系统引用（ContextMemory、ConfigState、ToolManager、PermissionManager、FullCompaction、BackgroundManager、AgentRecords、TurnFlow、InjectionManager、UsageRecorder、SkillManager、HookEngine、ReplayBuilder）。必须可独立使用——构造函数不能强制调用者创建 Session 实例，也不能要求 `agentId` 或 `session`。

### Session

`agent-core` 中的外层生命周期容器。拥有 `SkillRegistry`、`McpConnectionManager` 和 `Agent` 实例映射（主代理 + 子代理）。创建代理、加载技能和 MCP 服务器、管理元数据、触发 hooks。

### Turn

单个对话周期：用户提示 → LLM 循环 → 工具调用 → 响应。由 `TurnFlow` 编排，驱动无状态的 `loop/runTurn()`。一个会话包含多个 turns。每个 turn 的开始通过 `turn.prompt`（或 `turn.steer`）记录锚定在 wire records 中；turnId 本身是内存计数器（不持久化到 wire），在 fork 时重置，因此 wire 锚点是定位 turn 的唯一稳定方式。参见 ADR-0020。

### Fork（会话 Fork）

从现有会话创建新会话，原会话不变。实现为完整目录复制 + `state.json` 重写，可选择在用户选定的消息处截断（`upToMessage`）。与 git 分支不同——操作的是会话记录，而非工作树文件。

### upToMessage

可选的 fork 参数：用户消息的从 1 开始的序号（`origin.kind === 'user'` 的 `turn.prompt`/`turn.steer` 记录）。设置后，fork 后的会话的 `wire.jsonl` 会在该记录之前截断——选定的消息及其之后的内容全部丢弃，新会话从该消息之前的位置继续，用户可以重新输入。省略则完整复制（向后兼容）。

### Fork Rewind

`/fork` 命令的可选回退能力：从用户选定的历史消息处分叉新会话，丢弃该消息及之后所有内容（包括它产生的子代理）。编辑消息语义（类似 Claude Code 的编辑消息 fork），而非检查点语义。选定的消息通过序号识别，而非 turnId（turnId 在 fork 后不稳定）。

### Wire Records

事件溯源持久化层（`AgentRecords`）。将所有状态变更操作以 JSONL 格式记录到 `wire.jsonl`。支持协议版本迁移。用于会话恢复（回放记录以重建内存状态）和 vis 调试。

### ChatProvider

`kosong` 中的 LLM provider 接口。定义 `generate()` 返回 `StreamedMessage`（`TextPart`、`ThinkPart`、`ToolCall`、`ToolCallPart` 的异步迭代器）。适配器：`openai-completions`、`openai_responses`、`anthropic`、`google-genai`、`vertexai`。通过 `createProvider(config)` 工厂创建。

### Kaos

执行环境抽象。`Kaos` 接口通过 `AsyncLocalStorage` 绑定到异步上下文——代码调用 `readText()`、`exec()` 时无需知道是在本地还是远程运行。目前仅实现了 `LocalKaos`（本地文件系统）；`SSHKaos`（通过 SSH/SFTP 远程）按 ADR 0006 尚在规划中，代码中尚未实现。`RuntimeConfig` 携带当前活跃的 `Kaos` 实例；`ByfCoreOptions.runtime?` 允许注入自定义实例（`node-sdk` harness 尚未转发）。

### ByfHarness

`node-sdk` 中的顶层 SDK 入口。管理会话生命周期和配置。CLI 创建 `ByfHarness`，然后调用 `createSession()` / `resumeSession()` 获取 `Session` 对象。宿主分别传入 `homeDir`（会话存储位置）和 `configPath`（config.toml 位置）——它们相互独立。

### uiMode

`ByfHarnessOptions` 上的自由字符串标签（默认 `'shell'`），用作 `SessionStart` hook 的 `source`。区分会话启动方式：`'shell'`（交互式 TUI）、`'print'`（无头 `--print`）。

### MCP（模型上下文协议，Model Context Protocol）

外部工具集成。`agent-core` 中的 `McpConnectionManager` 管理 MCP 服务器连接（stdio/HTTP/SSE）、工具发现、OAuth 和重连。SSE 是传统的 HTTP 传输方式（长连接 GET 流 + POST），在 MCP 规范中已被 Streamable HTTP（`http` 配置字面量）取代，但为了向后兼容仍受支持。

### 压缩 (Compaction)

对旧的对话历史进行摘要，以保持在上下文限制内。手动触发或在上下文溢出时自动触发。压缩事件记录在 wire records 中，并在 vis 中显示为 ribbon。

### 思考 (Thinking)

模型的扩展思考/推理。通过 `ThinkingEffort`（`off | low | medium | high | xhigh | max`）控制。每个 provider 适配器将 effort 级别映射到其原生 API 参数。

### 审批 (Approval)

工具执行前的权限门控。代理向用户展示工具调用（包含命令、diff 或文件操作详情），用户选择批准、拒绝或取消。审批结果作为 `blockedReason`（`'rejected'` | `'cancelled'`）流入工具结果，表示工具未执行。通过审批的工具正常执行。

### 子代理活动追踪 (Sub-agent Activity Trace)

向用户展示子代理工作期间的活动记录：生命周期状态、可见的助手输出、工具活动、审批等待、错误和最终结果。不是模型的私有思考链。

### 前台子代理 (Foreground Sub-agent)

通过 Agent 工具调用生成的子代理，会阻塞父代理。其事件通过 `routeSubagentEvent` 路由到父 `ToolCallComponent`。运行时存在于 `pendingToolComponents` 中；完成后组件保留在 `transcriptContainer` 中（单独或在 `AgentGroupComponent` 内）。与后台代理不同（后台通过 `/tasks` 和 `listBackgroundTasks()` 管理）。

### 实时查看器 (Live Viewer)

前台子代理活动的全屏、可滚动实时查看器，通过 `/agent` 打开。订阅父 `ToolCallComponent` 的实时状态（非一次性快照）。是子代理活动追踪的渲染载体。

### /agent

打开前台子代理列表和实时查看器的 CLI 命令。单数形式，与 Codex 的 `/agent`（单会话子代理线程）一致。区别于 Claude Code 的复数 `/agents`（跨会话独立会话）。

### 上下文最小化 (Context Minimization)

代理引擎中的一级工程关注点。目标是精选最小的高信号 token 集合，以最大化期望结果的概率。涵盖系统提示大小、工具定义 token、对话历史、工具输出和提示缓存。

### 观察掩码 (Observation Masking)

一种基于规则的压缩策略，将对话历史中的旧工具结果替换为紧凑的结构化摘要，外加一小段头/尾片段。无需 LLM 调用——纯字符串变换。以极低的成本超越 LLM 摘要（据 JetBrains 研究）。按重要性排序（Write/Edit 保留最久，Read/Grep/Glob 最先掩码）。

### 重要性掩码 (Importance-Based Masking)

BYF 使用的特定观察掩码变体。工具结果按优先级分类：高持久结果（Write/Edit、用户可见输出）保留最久；低持久结果（Glob/Grep 搜索结果）最先掩码。由 token 压力阈值（60-85%）触发，而非 turn 计数。

### 缓存边界 (Cache Boundary)

一个哨兵标记（`__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` 模式），将提示分为静态可缓存前缀和动态每会话后缀。启用 Anthropic 的提示缓存 API。边界前的静态内容全局缓存；边界后的动态内容每 turn 重新计算。

### 缓存提示 (Cache Hint)

`Message` 上的 provider 无关逻辑标签（`cacheHint`），表示该消息的时间性缓存意义（如 `isLastTurnEnd` 标记上一 turn 的最后一条助手消息）。由 `CacheStakingStrategy` 生成，由 provider 适配器消费。不是 provider 特定的 API 参数。

### CacheStakingStrategy

`agent-core` 中的一个模块，分析对话历史并根据 turn 边界和内容大小为消息附加 `CacheHint` 标签。与 provider 细节解耦——它决定缓存什么，适配器决定如何缓存。与 `PromptPlan`（处理系统提示和工具）互补。

### PromptPlan

系统提示的结构化表示，按有序的具名块（`PromptBlock[]`）组织，每块有 `CacheScope`。由 `agent-core` 中的构建器生成，由 provider 适配器通过 `GenerateOptions.promptPlan` 消费。管理静态的非数组内容（系统指令、AGENTS.md、工具模式）。

### 搜索 Provider (Search Provider)

已配置的网页搜索后端（exa、brave、firecrawl 等），包含 API key 和优先级。WebSearch 工具维护一组 Search Provider，按优先级顺序尝试，失败时自动回退。与 Provider（LLM API 端点）不同：Search Provider 位于 `packages/agent-core`（PriorityRouter + 静态 `webSearchProviderRegistry`），且**有意不**实现为 kosong 的 `ChatProvider` 实例——两者的生命周期不兼容（流式聊天生成 vs 带回退的一次性排序搜索），因此不共享抽象。

### Turn 边界 (Turn Boundary)

对话历史中连续 Turn 之间的分界点。通过 `TurnFlow` 的 `previousTurnMessageCount` 识别。`CacheStakingStrategy` 使用它在前一个 turn 的最后一条助手消息处放置历史缓存桩，确保整个前序对话（包括工具结果）被缓存。

### 动态上下文锚点 (Dynamic Context Anchor)

可选的第四个缓存桩点，置于当前 turn 中最大的内容块之后（阈值约 2000 字符）。在当前 turn 包含大量上下文（用户粘贴的日志、大文件读取）时优化流式 TTFT/TPS。仅当存在符合条件的块时才会放置。

### 工具稳定性排序 (Tool Stability Ordering)

工具在缓存前按稳定性排序：内置工具（从不变化）在前，MCP 工具（可能连接/断开）在后。固定的哨兵标记确保当没有 MCP 工具时，工具缓存端点不会坍缩到系统提示缓存端点。

### 渐进式披露 (Progressive Disclosure)

启动时仅加载名称和简要描述，按需获取完整内容。应用于技能（系统提示中的名称/描述，完整 SKILL.md 通过 `Skill` 工具获取）和目录结构（不注入；模型需要时通过工具发现）。

### 动态注入 (Dynamic Injection)

代理系统在用户和模型产生的对话之外添加上下文到对话中的机制。由 `agent-core` 中的 `InjectionManager` 管理，在 `beforeStep` hook 中运行已注册的 `DynamicInjector` 实例。注入器可产生两种类型：**持久注入**（通过 `inject()` → `appendSystemReminder()`，写入 `_history` 为 `user` 角色消息）和**临时注入**（通过 `getEphemeral()`，每一步在请求时重新渲染，从不存入历史）。当前注入器：`PermissionModeInjector`（临时——反映当前权限模式状态，仅在 auto 模式激活时触发）和 `TimestampInjector`（临时——每一步在 `before_user` 位置注入新的 ISO 时间戳）。之前有 `DirectoryTreeInjector`（已移除——目录结构现在通过工具渐进式披露）。持久注入仍用于一次性事件（技能激活、`/init` 完成）。

### 临时注入 (Ephemeral Injection)

在投影时（`projector.ts`）重新渲染的每请求注入，从不持久化到 `_history`。放置在 `before_user` 位置——追加在**所有**对话历史之后——因此对缓存前缀无影响。携带每步变化的动态内容（时间戳、权限模式状态）。与持久注入（`appendSystemReminder()`）相对，持久注入会写入 `_history` 并留在缓存前缀中。参见 ADR 0013。

### 缓存范围 (Cache Scope)

分配给 `PromptPlan` 中每个 `PromptBlock` 的稳定性分类：`'global'`（所有会话相同——纯代理规则）、`'project'`（项目内稳定——AGENTS.md）、`'session'`（每会话变化——OS、cwd、技能）、`'none'`（不缓存）。Provider 适配器根据范围决定缓存断点位置。参见 ADR 0013，了解将纯全局规则与会话级环境分离的四块架构。

### 动态区 (Dynamic Zone)

投影消息数组的尾部，临时注入（时间戳、权限模式）在 `before_user` 位置追加。此处的内请求之间变化，从不参与缓存前缀。属于三区提示布局的一部分：缓存区（稳定的系统提示块 + 工具规格）、对话历史（清晰的 user/assistant/tool 消息）、动态区（逐请求临时内容）。

### 缓存命中率 (Cache Hit Rate)

从提供商的提示缓存中提供的输入 token 占总输入 token 的比例：`inputCacheRead / (inputOther + inputCacheRead + inputCacheCreation)`。提示缓存效率的关键指标。存在两个不同的范围：**逐 turn**（仅从当前 turn 的 `TokenUsage` 计算，反映"刚发生了什么"）和**会话累积**（从所有 turn 的汇总 `TokenUsage` 计算，反映"整体缓存健康状况"）。逐 turn 值通常在第一个 turn 之后更高，因为它排除了会永久降低会话累积均值的初始缓存创建开销。

### Input token 分项 (Input Token Breakdown)

按来源类别拆分的输入 token 估算占比，用于回答"上下文被什么占满"。六个互斥类别：System prompt（核心规则块）、Meta context（项目指令 + 工作环境块）、Skills（技能列表块）、MCP tools / System tools（按工具名前缀拆分的工具 schema）、Messages（历史消息）。**估算值**（char 启发式，provider 不返回按类别的精确 token）。百分比分母为模型 `max_context_tokens`（即 `/usage` 面板 "Context window" 行的 max 值，同口径），每项 = 该类估算 token / `max_context_tokens`，一位小数；六项之和 = 估算 input 占窗口比例，通常远小于 100%。无 model 配置（`max_context_tokens` 缺失或为 0）时百分比全为 `undefined`，面板仅显示估算绝对值。仅在 `/usage` 面板按需展示。

### 结构化摘要 (Structured Summary)

掩码工具结果使用的紧凑表示。示例：`[Bash: 'npm test', exit=0, 127 lines, stderr: none]`。保留工具调用元数据和小段头/尾片段，以便代理判断是否需要重新读取完整输出。

### 输出卸载 (Output Offloading)

将超过阈值（约 8000 token）的完整工具输出写入临时文件，将工具结果替换为预览（1000 字符）加文件引用。代理可按需重新读取。临时文件按大小/时间限制管理，防止无限制增长。

### AGENTS.md 预算 (AGENTS.md Budget)

一个软限制（4000 token），当合并的 AGENTS.md 内容超出时触发警告。鼓励简洁的项目指令。AGENTS.md 始终加载到系统提示中（不移动到消息区），以保持指令遵循。

### Goal（目标）

用户给出的、有可验证终态的自主任务目标。通过 `/goal <objective>` 启动。每个 agent 至多持有一个 current goal，作为 agent 的持久化结构状态（由 `GoalMode` 子系统拥有，从 wire records 重建），而非对话中的文本约定。状态机：`active`（推进中）/ `paused`（用户或中断暂停，可 resume）/ `blocked`（系统判定无法推进，可 resume）/ `complete`（瞬态，宣告即清空）。终态决策权三权分立：模型经 `UpdateGoal` 工具判定完成/阻塞，用户经 slash 命令暂停/取消，runtime 经预算/中断判定停止。

### Goal Mode（目标模式）

agent 自主多轮推进一个 active goal 的运行模式。`driveGoal` 在 turn 边界读 goal 状态决定续跑或停止——把"用户敲 continue"自动化。每个 continuation turn 是 goal driver 自动发起的 turn，origin 为 `{kind:'system_trigger', name:'goal_continuation'}`。goal reminder 走 ephemeral injection（ADR-0022），不进 wire。fork 总是清空 goal（ADR-0023）。终态停止靠 driver 边界读状态，不改 loop 层（ADR-0024）。`complete`（模型经 `UpdateGoal` 声明）是成功终态，渲染 completion 卡片；`cancel`（用户经 slash 主动丢弃）不是成功终态，只渲染低存在感 lifecycle marker，不渲染 completion 卡片。参见 PRD-0019。

### Goal Reminder（目标提醒）

注入到 context 的 goal 上下文提示，告知模型当前存在 goal 及其状态/预算。三档强度：active（完整 reminder + budget 指引）、blocked（轻提示 + objective）、paused（守卫提示）。走 ephemeral injection 的 `before_user` 位置（ADR-0022），每 step 重新生成，不进 wire records，不破坏 cache prefix。

### Headless drain（无头完成协议）

`byf -p`（print / `uiMode: 'print'`）在进程退出前必须满足的完成条件协议，而非「首个 turn 结束即退」。判定顺序：goal 仍 `active` 则 hold → 会话内 Cron 仍有未来 `nextFireAt` 则无限 hold → 否则等待后台任务（受 Print wait ceiling 约束）再退出。详见 ADR-0029、PRD-0023。

### Print wait ceiling

print 模式下等待后台任务结束的最长秒数（配置语义 `printWaitCeilingS`，默认 3600）。超时后结束等待并以非 0 退出。**不**限制 goal hold 或 cron hold。与 `background.keepAliveOnExit`（仅控制 session close 时是否 stopAll）是不同概念。

### ImageLimits

每 Agent/core 实例持有的图片摄入预算（最长边、字节上限等），可由 config/env 配置。`ReadMediaFile`、TUI 粘贴等所有把图像送入模型的入口共用同一 limits 实例，避免「工具压了粘贴没压」。

### media-degraded 投影 / media-stripped 投影

请求侧（不改写持久 history）的一次性降级投影：provider 因请求体过大（request-too-large / 典型 HTTP 413 body-size）拒绝时，将较旧 media 换成 text marker 并保留最近媒体后重发一次（media-degraded）；因不支持/不可解码图片拒绝时，将全部 media 换成 marker 后重发一次（media-stripped）。与 context overflow（token 超限）恢复路径分离。

### 会话内 Cron（Session Cron）

绑定**当前会话**的本地定时任务：标准 5 段 cron（本地时区）、one-shot 或 recurring、idle 时 `steer` 注入 prompt、persist 在 session 目录、同 session resume 恢复。不是系统 crontab，也不按工作目录跨 session 共享。Recurring 有 7 日 stale 自动删除等契约（见 PRD-0023）。触发时 TUI 以 notice 展示。

### Additional dir（额外工作目录）

主 `workspaceDir` 之外、工具路径策略允许访问的额外根目录列表（`WorkspaceConfig.additionalDirs`）。可通过 `/add-dir`、`--add-dir` 在会话中追加；可选「记住到项目」写入项目根 `.byf/local.toml` 的 `workspace.additional_dir`。

### 项目本地配置（`.byf/local.toml`）

位于项目根下的工作区本地配置文件，与用户级 `~/.byf/config.toml` 分离。当前用途：`workspace.additional_dir` 数组（`/add-dir` 记住的额外根）。可按团队需要加入 `.gitignore`。
