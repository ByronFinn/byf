# 本地服务安全边界与发布前可验证性（Security Boundary & Pre-publish Verifiability）

> **Status**: Implemented — R1–R6 已落地、已评审并完成评审修复；未发布 | **PRD**: PRD-0038 | **Created**: 2026-09-21 | **Last updated**: 2026-09-23

## Goal

把 byf 从"代码看起来对"推进到"改动能被机器证明对"。两件事：

1. **收紧本地服务与 headless 的安全边界**——消除已核实的跨站请求→本机命令执行路径、headless 无治理自动批准、配置原文编辑器的数据销毁与密钥错配路径。
2. **建立发布前的可验证性**——把业界共识的恢复语义、压缩行为、启动/体积/渲染性能从"靠人记"变成可重放的契约测试与环比门禁，并补齐当前完全缺失的 CI 门禁（密钥扫描、依赖审计、边界检查、changeset 存在性）。

判据来源：`.qoder/analysis/2026-09-20/` 下 6 份审计 + 综合报告，以及 `.qoder/analysis/2026-09-20/10-industry-benchmark.md`（deep-research，11 条存活 claim，含被否决项）。

## What I already know（本轮已逐条回读代码核实）

### 安全侧事实

| 事实                                                                                                                                                                                                                                         | 位置                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 仅当 `authToken` 非空才安装鉴权中间件；默认绑回环即**完全不鉴权**                                                                                                                                                                            | `apps/web/server/src/app.ts:127`、`apps/web/server/src/config.ts:6`                   |
| 全仓零 Origin/Host/CORS 校验；`c.req.json<T>()` 不校验 Content-Type → `text/plain` 简单请求无预检                                                                                                                                            | `apps/web/server/src/routes.ts`（18 处 `c.req.json`）                                 |
| `/api/mcp/test` 把请求体的 config 透传到 stdio spawn：`routes.ts:765` → `session-manager.ts:442` → `node-sdk/byf-harness.ts:289` → `agent-core/rpc/host-rpc.ts:290-302` → `mcp/client-stdio.ts:63-69`（`command/args/env/cwd` 全部来自入参） | 已核实全链路                                                                          |
| headless 恒批准：`installHeadlessHandlers` 无条件返回 approved、提问恒 `null`；同时 CLI 禁止 `--prompt` 与 `--yolo` 并用，制造"headless 受管控"的反向错觉                                                                                    | `apps/cli/src/cli/run-prompt.ts:253-254`、`apps/cli/src/cli/options.ts:39-41`         |
| 配置原文：解析失败时返回 `text: ''` + `revision: null`，保存即清空整个 config.toml（含全部密钥）。ADR-0039 对 mcp.json 已否决同一设计                                                                                                        | `apps/web/server/src/routes.ts:515-525`、`PUT /config/raw` 于 `:556`                  |
| 密钥掩码占位符按**行序**编号（`seq += 1`），还原按行内 `<n>` 取盘上同序密钥 → 重排 provider 块跨 provider 错配、删一行静默丢密钥                                                                                                             | `packages/agent-core/src/config/document.ts:134,142-157,173-196`                      |
| DNS rebinding 是"默认绑 127.0.0.1 即安全"这一假设的直接反例（浏览器可把 attacker 域名解析到回环）                                                                                                                                            | `mcpsec.dev/advisories/2026-06-08-mlflow-server-dns-rebinding/`（线索，未进对抗核验） |

### 引擎与契约事实

- **v2 引擎在生产代码零调用**：`resolveSessionEngine` / `assertEngineFormatCompatible` / `createV2EngineHarness` 在非测试代码中无任何引用，`AgentHarness`（1650 行）仅被自身 `:176` 实例化；`harness/engine.ts:17-19` 注释自认"装配层尚未接线"。而 `engine.ts:54` 的报错文案让用户"请使用 engine = `v2`"——那个开关不存在。落地计划已在 **#339**，本 PRD 不重复排期，只做**行为中性的止血**（文案更正 + 守卫真正可达）。
- **压缩已是两阶段**：`agent/compaction/full.ts:284`（prune 在前）+ `:291`（"Pass 4: LLM summarization (expensive, only when necessary)"）+ `:182/314-318`（超 `maxCompactionPerTurn` 停止并抛 `CONTEXT_OVERFLOW`）。阈值与业界一致，缺的是**把顺序与跨轮 refill 检测固化成可测行为**。
- **cache staking 按消息序号定位桩 3/4**：`agent/cache-staking/index.ts:31` 用 `previousTurnMessageCount - 1` 索引，turn 中途压缩重写历史长度后基线不失效 → 断点可能打错位置，静默多付 token。
- **孤儿 tool call 回填机制在位**（`synthesizeOrphanToolResults`，`harness/fork.ts:18` 注释与 agent-harness 工具批中途路径），缺 OpenHands 已有的**截断式故障注入契约测试**。
- **反向 RPC/展示载荷三套并行**：TUI 手写 10 个 `*DisplayBlock` 接口（`apps/cli/src/tui/reverse-rpc/types.ts:12-88`）+ `adapter.ts:224` 从 core `ToolInputDisplay` 转换；core 的 `ToolInputDisplay` 定义在 `agent-core/src/tools/display`；web client 用 `display: unknown` + `as Record<string, unknown>` + `['kind'] === 'diff'` 手工嗅探（`apps/web/client/src/components/chat/ToolCallView.tsx:62,98,112,116`）。三处都可静默降级。
- byf 的 `checkpoint` 是 **turn 内步骤边界**（`harness/agent-harness.ts:692-696`：应用 deferred writes、消费 steering，保护"上下文只在尾部增长"），**不是文件回滚**；仓内无文件内容快照能力，`rewind` 仅存在于 fork 到更早消息（`apps/cli/src/tui/commands/registry.ts:99`）。

### 工程与遗留事实

- `packages/storage`（`@byfriends/storage`）**全仓零消费者**：无任何包依赖、无源文件 import；但它非 private、无 `build`/`files`/`publishConfig`、`exports` 直指 `./src/index.ts`、`license: MIT`。`scripts/lib/list-publishable-packages.mjs:41` 只按 `private === true` 过滤 → 会被当裸 TS 入口发布。
- `@byfriends/agent-core` `publishConfig.access: public`（`package.json:92`）而 `src/index.ts:42` 注释自称 "not registry-published"，barrel `export *` 敞开 8 个顶层目录。
- `@byfriends/vis-server` 实际位于 **`apps/vis/server/package.json`**（不在 `packages/` 下），全仓零运行时消费者，却仍活在 5 条链路：root workspaces、`build:vis`、`vis` dev 脚本、`release.yml:48 Build vis`、attw/publint 校验面；`.changeset` 有 3 份条目给它派版本号；shim 只有注释级 `@deprecated`（"一个 minor 后删除"），无到期版本、无 issue 链接。
- CI（`.github/workflows/ci.yml`）只有 Lint / Format check / Sherif / Typecheck / Test / Build：**无密钥扫描、无依赖审计、无边界检查、无 changeset 存在性检查**。
- `typecheck:tests`（根 `package.json:35`）**当前无法作为门禁**：既有基线 1379 个类型错误，已开 **#306**。
- `apps/cli/package.json:49,53` 的 `package:native` / `test:native:smoke` 用 `node scripts/native/*.mjs`，`release.yml:177` 另有内联 `node -e` —— 与 ADR-0028「Bun only」冲突。
- 冒烟测试现状需更正：`release.yml:56-59` **确实**在打包上传前跑 `test:native:smoke`；真实缺口只是 post-publish 从公开 URL 走 `install.sh` 的清白环境首启验证。
- `apps/cli/scripts/compile/build.mjs:342-347` 的 release profile 只传 `--minify` + `--no-compile-autoload-dotenv`，**从不传 `--bytecode`**。
- `oxfmt` 以 `^0.55.0` 浮动版本引入格式漂移（提交 0214ef1 即在修 CI Format check 失败）。

### 业界对标（存活 claim，附强度）

| 结论                                                                                                                                                            | 强度                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 追加式本地 JSON 事件日志是持久化收敛点（Claude Code `*.jsonl` / OpenHands `base_state.json` + `event-*.json`）                                                  | 3-0 + 2-1，**共识**；byf 已领先    |
| resume（同 ID 追加）与 fork（新 ID 复制、原会话不变）必须是两种身份语义，且都不继承上一会话上下文窗口；该语义在 **SDK/harness 契约层**而非 TUI 层               | 3-0，**共识**                      |
| 崩溃重放 = 重放检查点之后的事件；必须为无 observation 的孤儿 tool call 回填合成 observation；OpenHands 有同名截断契约测试 `test_event_log_index_gaps_detection` | 2-1，**可验证契约**                |
| 压缩 = 先清旧工具输出、仍不够才总结；连续 3 次回填触顶即硬停抛错（**不要抄诊断文案**，其因果归因被 open issue 反证）                                            | 3-0，单厂商已落地                  |
| checkpoint/undo 能力边界须写成产品契约：只覆盖直接文件编辑、与 git 解耦、Bash/subagent/外部改动不追踪、远程副作用明确不可回滚                                   | 3-0，**契约表述要求**              |
| 流式渲染按固定间隔缓冲、静态内容不按固定 tick 重绘；开销来自每帧 buffer diff + 序列化                                                                           | 3-0+3-0，**方向共识 / 数值单厂商** |
| `--bytecode` 与 `--compile-jit-policy` 是 Bun 官方明示的启动杠杆；但 jit-policy 仅 canary 1.4.3，byf 版本门槛不满足                                             | 3-0+3-0，厂商声明，**必须自测**    |
| 体积门禁必须用 `delta_bytes = 二进制 − 同 pin 版本 hello-world floor`，绝对阈值会把运行时升级误判为代码回归                                                     | 3-0 + 2-1                          |
| hyperfine 为标准工具（默认 ≥10 runs 且 ≥3s、`-w` 热 / `-p` 每次前清缓存），但无 pass/fail 门禁、冷缓存配方 Linux-only                                           | 三票合并                           |

**被否决、不得当共识使用**：「OpenHands 主张 core 与所有前端解耦，故 byf 三处重复载荷违反业界原则」——1-2 被否。G6 的契约统一**只凭内部理由**（三处均可静默降级 + ADR-0006 分层）推进，不以业界背书为据。同理：Ink 动态区高度阈值、30–40% diff 交叉点、OpenHands Condenser 成本降 2x、Deno 58MB 地板，均为待测假设。

**研究缺口**（本 PRD 因此不声称业界背书）：发布管线的密钥扫描/依赖审计/遥测实践、终端兼容性专项、prompt cache 命中率度量，本轮零存活 claim。

## Assumptions (temporary)

- 本地 web 服务的可信调用者只有本机浏览器与本机 CLI；一旦引入 Origin/Host 校验，合法使用场景（`byf web` 打开 localhost SPA、LAN 模式带 token）不被破坏——**需在 G1 实施时实测 LAN 模式**。
- `--print` 的既有脚本化消费者依赖"永不交互"这一行为；把默认改为遵循 `defaultPermissionMode` 可能在 `manual` 配置下使既有脚本失败——因此采用**显式开关 + 保持既有默认放行**的保守方案（Q2 裁决），而非反转默认。
- byf 二进制体积与启动的当前基线未经测量，一切阈值的初值只能由实测 ratchet 得出，不预设数字。
- `#306`（1379 类型错误）不在本 PRD 修复范围，因此测试面类型门禁只能用"只减不增"的 ratchet 形态引入。

## Open Questions（本 PRD 内自决，理由随记）

- **Q1（裁决 2026-09-21）：回环是否也要 token？** 裁决：**要，但以"能力分级"而非"一律 401"落地**。理由：第一性原理上"绑回环"不构成威胁模型边界（DNS rebinding + 任意本机进程 + 浏览器无预检请求都能到达），最小可信修复是"任何写操作都必须证明调用者意图"。具体：写请求一律要求（1）Content-Type `application/json`（阻断无预检简单请求）+（2）`X-Byf-Requested-With` 或同源 Origin/Host 校验（阻断跨站）+（3）token（回环下由 server 首启生成、经启动日志与 CLI 打开的 URL query 交付）。纯只读 GET 在回环下可免 token，以免破坏静态 SPA 首屏。LAN 模式维持既有 `WEB_AUTH_TOKEN` 强制。
- **Q2（裁决 2026-09-21）：headless 审批默认值怎么改才不算破坏性？** 裁决：**新增显式 `--yolo`（`--approve-all`）与 `--deny-unapproved` 开关；未显式指定时沿用配置的 `defaultPermissionMode`，但把每次放行写进 session records 形成审计痕迹；`manual` 下遇到需审批工具不再静默批准，而是以专用退出码失败**。理由：现行为的"恒批准"没有任何一种配置可以关闭，属于治理缺失；而直接反转默认会破坏 ADR-0029 的脚本契约。变更语义走 minor，不声明 major（除非用户要求）。
- **Q3（裁决 2026-09-21）：`/api/mcp/test` 是否允许测未保存配置？** 裁决：**允许保存前测试，但 stdio `command` 必须是已在任一 scope 配置中出现过的命令名，或经显式 `--allow-unlisted-command` 之类的用户动作确认；在 web 表面上，未列出的 command 一律 403**。理由：测试"尚未保存的配置"是真实需求（表单里填完先测再存），完全禁止会把 UX 推坏；但请求体可任意指定 `command` 并落地的组合等价 RCE，必须把"命令来源"从请求体收窄到"本机已声明过的命令集合 + 用户在场确认"。
- **Q4（裁决 2026-09-21）：7 项研究行动清单与 3 个 P0 是否同一 PRD？** 裁决：**同一份（本文件）**。理由：两者是同一能力——"发布前可验证性"——的缺陷面与门禁面，拆开会导致 AC 互相引用、changeset 割裂。
- **Q5（裁决 2026-09-21）：AgentHarness（1650 行）与 `Agent`/`TurnFlow`（各 1081 行）的 God object 拆分是否进本 PRD？** 裁决：**不进本 PRD，另开子 Issue 挂 #339**。理由：该拆分是行为中性重构，其正确性判据依赖 #339 的 v2 接线完成；在双引擎未收敛前拆 `AgentHarness` 会与 #339 的施工面直接冲突、制造双份改动。本 PRD 只做能独立验证的部分（G6 的 staking 与压缩可测化）。
- **Q6（裁决 2026-09-21，2026-09-21 复核修正）：`@byfriends/storage` 是删除还是补 private？** 裁决：**补 `private: true` 并移出发布集合，保留源码与测试**。理由：它是 PRD-0037 C7（SQLite 后端 + leases + parity）的在建资产，删除会丢工作；而它现在既不在分层地图（ADR-0006）也不被任何包依赖，把它留在发布集合里是唯一真实风险。
  - **修正记录**：初始盘点称其为"零消费者死包"，该表述**只对"无包依赖它"成立**；复核发现 `packages/storage/test/{lease,parity}.test.ts` 是活跃且全绿的实现（`sqlite-storage.ts` + lease 语义），属 PRD-0037 Phase 3 在建资产。故动作从"摘除"改为"标 private，待其 `build`/`files`/`publishConfig` 配齐后随 #342 转正"。
- **Q7（裁决 2026-09-21）：`vis-server` 何时删？** 裁决：**本 PRD 内删除**（连同 `build:vis`、`vis` dev 脚本、`release.yml` 的 Build vis、attw 校验面与 3 份 changeset 条目）。理由：PRD-0035 承诺"一个 minor 后删"，其弃用窗口已在版本历史上跨过；继续留着会让每次 release 为一个零消费者 shim 派版本号。`byf vis` 别名按 PRD-0035 保留为 `byf web` 的别名，只删 shim 包本体。
- **Q8（裁决 2026-09-21，由 G1 测试阶段反馈导出的新增项）**：G1 的 Test Sub-Agent 核实到两件事——① AC-1.4 未规定损坏态 `revision` 的取值；② **真实 `ByfHarness` 在配置解析失败时构造即抛错**，因此"损坏后通过 web 修复"这条旅程在 server 启动层就已断裂，只修读写端点不闭环。裁决：损坏态 `revision` = 磁盘原文的内容哈希（与正常态同算法），并新增 **AC-1.7** 要求损坏配置下服务可启动。理由：安全修复的价值取决于修复路径真的可达；同时哈希 revision 让客户端无需为损坏态特例化跳过冲突检查的逻辑。测试实现上认可走 `HarnessLike` 注入面而非真实 `ByfHarness`（既有可测试性设计），但 AC-1.7 单独锁住"真实装配路径不因配置损坏而崩"。
- **Q9（裁决 2026-09-21）：headless 在 `manual` 下被挡时用什么退出码？** 裁决：**7**。理由：需要一个既可脚本判定、又不与既有码冲突的值；1 已被通用失败占用，3/6/129/130/143 在既有测试与信号约定中被使用（G1 测试已锁定不相交集合）。7 未被占用且语义独立，写进文档后成为 ADR-0029 完成协议的一部分。

## Requirements

### R1 本地服务与 headless 的安全边界（G1）

消除跨站请求到本机命令执行的路径，使配置原文编辑器不再可能销毁数据或错配密钥，并让 headless 的放行决策可治理、可审计。

### R2 架构与发布集合的机器门禁（G2）

把 AGENTS.md 已有的硬约束（apps 层只经 `@byfriends/sdk` 使用核心能力）与发布集合判据从散文变成 CI 可判定；对 v2 引擎死锁做行为中性止血。

### R3 恢复语义与压缩行为的可重放契约（G3）

resume/fork 身份语义成为 SDK 契约层的单一定义并被三个表面复用；崩溃重放有截断式故障注入测试；压缩的两阶段顺序、跨轮 refill 硬停、`toolReplaySafety` 边界成为可测行为与文档契约。

### R4 二进制启动、体积与渲染的环比门禁（G4）

建立三臂 hyperfine 基线（`bun src` / `bun dist` / 编译二进制）、冷/热两配方、RSS、体积 delta-over-hello-world-floor，并用 `/have-a-try` 对 `--bytecode` 与 `STREAMING_UI_FLUSH_MS` 做实证裁决后决定采纳与阈值。

### R5 CI 门禁与遗留清理（G5）

补密钥扫描、依赖审计、changeset 存在性、测试面类型 ratchet；`scripts/native/*` 迁 Bun；oxfmt pin；摘除 vis-server 与 storage 误发布；gen-changesets 包清单刷新；文档漂移修正（ADR-0006 vis 段、根 AGENTS.md、`apps/cli/AGENTS.md:44` 例外条款、`src/index.ts:42` 注释）。

### R6 契约与缓存经济学的可维护性（G6）

反向 RPC/展示载荷收敛到 zod 单一真源（`z.infer` 派生类型），三表面消除静默降级；修 cache staking 基线在压缩后失效的时序缺陷。

## Acceptance Criteria

组内为 Batch 单元；每组一次合并评审门（场景表 + 测试代码同场呈现）。

### R1

- **AC-1.1** 跨站简单请求被拒：对任一改变状态的端点（`POST`/`PUT`/`PATCH`/`DELETE`）发送 `Content-Type: text/plain` 的表单式请求，或携带跨源 `Origin`，得到 4xx 且**不产生任何副作用**（会话未被创建、配置未变、子进程未被 spawn）。回环免 token 的只读 GET 仍正常。
- **AC-1.2** 回环下写操作必须持有 token：未携带凭据的合法 JSON 写请求返回 401 且响应体不含内部状态；带 `?token=` 或 `Authorization: Bearer` 时成功；token 比对保持时序安全；server 启动日志与 CLI 打开的 URL 能交付 token；LAN 模式仍强制 `WEB_AUTH_TOKEN`。
- **AC-1.3** `/api/mcp/test` 不再接受任意命令：请求体指定的 stdio `command` 若未出现在任一 scope 的已保存配置中，返回 403 且未 spawn 任何进程；已列出的命令仍可正常测试（保存前测试体验保留）。
- **AC-1.4** 配置损坏不再销毁数据：`config.toml` 解析失败时，raw 读取端点返回**磁盘原文**与 `invalid: true`（不返回空串）；以空文本或与非空原文 revision 不匹配的方式保存被拒；拒后磁盘文件字节不变。损坏态下的 `revision` 取磁盘原文的内容哈希（与正常态同一算法），使客户端的乐观并发控制在"未改磁盘"时不误报冲突——理由（裁决 2026-09-21，补 Q8）：`revision: null` 会让"损坏后通过 web 修复"这条旅程要么强制客户端跳过冲突检查、要么必然冲突，两者都削弱 AC-1.4 想保护的字节不变式。
- **AC-1.7** 损坏配置下服务仍可启动并可修复：`config.toml` 非法时，web server 必须能启动并暴露原文读写端点，使 AC-1.4 的修复路径真实可达；不得在启动/装配阶段因配置解析失败而直接抛错退出。启动日志需明确告知配置处于损坏态。理由（补 Q8）：G1 测试阶段核实，现状 `ByfHarness` 构造即抛错 → "损坏后经 web 修复"这条用户旅程在服务启动层就已断裂，只修读写端点不足以闭环。
- **AC-1.5** 密钥占位符与行序解耦：重排 provider 块后保存，每个密钥仍回到其所属 provider（按键路径而非行序号还原）；删除一个含占位符的 provider 块只丢该块密钥；密钥总数变化时，写盘前给出可诊断错误或要求显式确认，绝不静默。
- **AC-1.6** headless 放行可治理可审计：`--print` 未指定开关时按配置 `defaultPermissionMode` 决定；`--yolo`/`--approve-all` 显式全放行；`manual` 下遇到需审批工具不静默批准而以**专用退出码 7** 失败（与既有 1 通用失败、3、6、129/130/143 信号类退出码不相交；裁决 2026-09-21，补 Q9），并在 stderr 给出可行动原因；每次自动放行在 session records 中留下可查询痕迹；`Cannot combine --prompt with --yolo` 这一反向错觉提示被移除或改写。
- **AC-1.8** 所有密钥形态都被掩码：点号键写法（`providers.x.api_key = "..."`）与其它非 table-header 形态的密钥，经 raw 读取端点外发时**同样被掩码**，不得以明文过线；无法归一化为键路径身份的密钥形态必须**拒绝外发并给出可诊断错误**，而不是静默放行明文。（实现阶段派生的新增项，2026-09-21）理由：AC-1.5 已确立"raw GET 响应是过线文本"这一威胁模型，而现状 `maskConfigSecrets` 只识别 table-header 与 `apiKeys` 数组两种形态，点号键写法从不被掩码——这是与 AC-1.5 同源、但后果更直接（明文密钥离开进程）的缺口，单列才不会漏。

### R2

- **AC-2.1** apps 层不得直引 `@byfriends/agent-core`：`apps/cli/src`、`apps/web/**/src` 中出现越界 import 时，`bun test` 与 CI 失败；既有例外（若有）必须在门禁内显式列出且逐条给出理由；违规样例被拒绝（负向自测）。
- **AC-2.2** 发布集合判据收紧：一个包必须同时具备 `publishConfig` 与非源码 `exports`（或有 `files`/`build`）才算可发布；`@byfriends/storage` 带裸 `./src/index.ts` 导出时不出现在发布清单；`@byfriends/agent-core` 的发布定位与其 barrel 注释一致（要么 private，要么导出面被策展）。
- **AC-2.3** v2 死锁不再误导：任何面向用户的错误文案不再指示使用尚不可达的 `engine = "v2"`；装配层若遇到无法打开的会话格式，产生**确实可达**的守卫并给出指向 #339 的可行动信息；`config.engine` 的注释与真实状态一致。
- **AC-2.4** `@byfriends/agent-core` 的公开面被策展（G2 实施阶段派生，2026-09-21）：barrel `export *` 目前覆盖 `src/` 16 个顶层目录中的 6 个（`agent` / `session` / `rpc` / `config` / `harness` / `errors`），而该包确实发布到 npm，故其内面一旦公开即不可撤回。要求：显式决定公开子集（或转 private，属 breaking，需用户裁决），并用与 SDK 同源的 apiReport 机制钉住基线。理由：AC-2.2 只修了"该不该进发布集合"，未修"进了发布集合之后公开了什么"；两者是不同判据，混在一条里会让 AC-2.2 被部分达成即视为完成。

### R3

- **AC-3.1** resume 与 fork 是两种可区分的身份：resume 保留原 session ID 并追加历史；fork 产生新 session ID 且原会话字节不变；两者都以**新上下文窗口**开始；该语义定义在 SDK/契约层并被 CLI、web、headless 共用（三表面各自有测试断言同一表格）。
- **AC-3.2** 截断式故障注入：把会话事件日志尾部截断使其停在某一轮中途，重开后（i）重建长度等于最长连续前缀；（ii）最后一条即最后持久化事件；（iii）日志中已存在的 action 不被再次执行；（iv）已发出但无 observation 的 tool call 被合成 observation 回填，后续 provider 请求不被拒绝。
- **AC-3.3** 压缩顺序与 refill 硬停可测：单个超大工具输出使上下文在总结后立即回填时，连续 3 次触顶即停止自动压缩并抛 `CONTEXT_OVERFLOW`（跨轮计数生效，而非仅 turn 内）；"先清旧工具输出、仍超限才做 LLM 总结"的顺序有可断言的观测行为；诊断文案不臆断根因。
- **AC-3.4** 重放安全边界被声明：工具的重放分类（只读 / 有副作用 / 远程不可逆）在契约层可查询，且面向用户的 durability 叙述明确"事件日志可重放 ≠ 工具副作用可回滚"，不暗示存在文件级事务回滚。

### R4

- **AC-4.1** 三臂启动基线：产出 `bun ./src/main.ts`、`bun dist/main.mjs`、编译二进制的冷/热启动与 RSS 数字，且指标可被脚本重复产出并写入仓库内基线文件；报告以"同 pin Bun 版本 hello-world floor 的 delta"呈现体积，不以绝对体积设阈值。
- **AC-4.2** `--bytecode` 有证据裁决：以 A/B 实测（含 clipboard native addon 与 SPA 资产内嵌路径）给出 TTI 与体积增量；据实测决定启用与否并留下裁决记录，不引用厂商数字作为依据。
- **AC-4.3** 环比判定可跑：存在一个可在 CI/nightly 跑的判定步骤，超出阈值即失败并输出前后差值；共享 runner 噪声不导致假红（明确多次运行与离群值处置策略）；macOS 冷缓存配方不依赖 Linux-only 手段或有显式降级说明。
- **AC-4.4** TUI 空闲不空转：`STREAMING_UI_FLUSH_MS` 为单一具名常量并受假定时器测试约束；给出 idle CPU% 与 draw-on-change 对照数据，并有节流取值裁决记录。

### R5

- **AC-5.1** 密钥扫描进门禁：仓库中出现凭据形态内容时 CI 失败；既有噪声（测试用假 key）经 allowlist 显式声明，不靠关闭检查。
- **AC-5.2** 依赖审计进门禁：已知漏洞或新增依赖的许可/来源风险在 CI 上有判定与可读报告。
- **AC-5.3** changeset 存在性检查：改动可发布包但无对应 changeset 时 CI 失败；纯 docs/内部脚本改动不误报。
- **AC-5.4** 测试面类型不劣化：CI 有测试面 typecheck 判定，采用与 #306 基线兼容的"错误数只减不增"ratchet；基线数字被记录。
- **AC-5.5** 无 `node` 调用残留：`package:native`、`test:native:smoke`、`release.yml` 内联 `node -e` 全部改为 Bun；`rg "node scripts"` 与 `rg "node -e"` 在 CI 脚本面为零命中。
- **AC-5.6** 零消费者 shim 退场：`@byfriends/vis-server` 及其在 workspaces/`build:vis`/dev 脚本/release/attw 校验面中的挂点全部移除，3 份无关 changeset 条目不再给它派版本；`byf vis` 仍作为 `byf web` 别名可用；文档中所有 vis-server 运行时例外条款同步更正。
- **AC-5.7** 工具链版本不再浮动：格式化器以精确版本 pin，本地与 CI 解析到同一版本。
- **AC-5.8** 文档与代码一致：ADR-0006 vis 段、根 `AGENTS.md` 的 vis/web 条目、`apps/cli/AGENTS.md` 的 vis-server 例外、`agent-core/src/index.ts:42` 的 "not registry-published" 注释、gen-changesets 的包清单（去已删的 vis-web、补 web-server/storage）均与代码事实一致。
- **AC-5.9** 套件级 flaky 归零：全量 `bun run test` 下稳定失败、单文件独立运行却通过的用例，必须被定位并修复，不得靠重跑掩盖。实测已复现一例：`apps/cli/test/utils/git/git-ls-files.test.ts` 在全量运行失败、单跑 5/5 通过，且在本次改动前的基线上同样复现（既有 flaky，非本轮回归）。理由：CI 的 Test step 跑的就是全量套件，一个并发串扰的既有用例等于随时可能误红。

### R6

- **AC-6.1** 载荷单一真源：审批/提问/展示块等跨表面载荷的 schema 定义在一处，三表面类型由其派生；新增一种 kind 时，未处理的表面在**编译期或测试期**报错，而不是落入 `default` 静默降级。
- **AC-6.2** staking 基线在压缩后失效：turn 中途发生压缩使历史长度变化时，依赖消息序号的缓存桩定位被重置或不应用，断点不落在错误位置；有可断言的观测（提示桩索引/数量）证明缺陷已消除。

## Technical Approach

- **R1** 以中间件形式集中施加（四层，顺序固定：Host 允许集合 → Content-Type → Origin/标记头 → token；实施修订见「续批」与 ADR-0042 D1），不在各 route 内散落判断；密钥占位符改造以**键路径**为身份，配 disk↔masked 的可逆映射，并在写盘前加不变式校验。
- **R2** 分层门禁仿仓内既有先例 `apps/cli/test/tui/printable-key-guard.test.ts`（纯 AST/正则扫描 + 显式例外表 + 负向自测），不引入新工具链。
- **R3** 契约表格落在 SDK 契约层（对齐"业界该语义出现在 SDK/harness 文档层"的对标结论），三表面各自消费同一断言夹具。
- **R4** 基准脚本放 `scripts/perf/`（与既有 `load.ts` 并存、职责区分：`load.ts` 测进程内分配/GC，新脚本测二进制启动/体积/RSS）；阈值来自首次实测并写成可再生成的基线文件。
- **R5** CI 复用现有单 job 结构，新增 step 而非新增 workflow（保持一次安装、一次构建）；`typecheck:tests` ratchet 用错误计数基线文件实现。
- **R6** 以 zod 为唯一真源、`z.infer` 派生类型（仓内已全线 zod）；拒绝"由 TS 类型生成 schema"路线（会造第二真源）。

## Out of Scope

- `AgentHarness` / `Agent` / `TurnFlow` 的 God object 拆分（→ Q5 裁决，子 Issue 挂 #339）。
- v2 引擎 host 面移植与默认切换（→ #339、#342）。
- SQLite 后端、leases、parity 套件（→ PRD-0037 C7 / #342）。
- `#306` 的测试面类型错误清零：本 PRD 只负责加"只减不增"的 ratchet（初始基线 1805，其中 210 是 #306 从未计量的 apps/web 与 packages/storage 面）。**实施后修订（2026-09-21）**：清零纳入本轮范围，ratchet 基线随之逐批下调。
- 遥测体系（现 noop telemetry，PRD-0037 C8）与 prompt cache 命中率度量（对标本轮零存活 claim）。
- post-publish 清白环境端到端安装冒烟（依赖真实 Release，只能作为后续独立项）。
- 逐符号的完整 API 报告（依赖 API Extractor `apiReport`，与 SDK 稳定性基线同一件事）。AC-2.4 本轮交付的是**不依赖构建产物的 barrel 形状钉**（star-export 集合 + 具名转发清单），堵住"评审时看不见"的那部分。
- 启动/体积基线的 macOS 侧数值。实施后修订：CI 新增 `macos-smoke` job（install / typecheck / 全量 test / 本机 compile darwin-arm64 / smoke），macOS 断链在 PR 阶段即暴露；**该 job 已实跑并全绿**，其价值立刻兑现——release 家族（release/bytecode）的 compile-entry 生成码缺陷与 5 个 spawn 类测试在共享 runner 上的计时预算问题都只在 darwin 上现形（见"续批"）。基准数值本身仍为 linux-x64 单平台。

## 实施后新增发现（release 阻断）

`apps/cli/scripts/compile/build.mjs` 生成的 compile-entry 曾把全局名直接接在括号断言之后（
`(globalThis as Record<string, unknown>).__BYF_WEB_EMBEDDED_ASSETS__ = …`），这不是合法语法。
该缺陷自 SPA 资产内嵌进 compile-entry 起存在，并在 R4 的 `--bytecode` A/B 实测中被正面撞上（`docs/perf/REPORT-0038.md` §4 前置 2：该轮全部测量是在"修复后的中间产物"上完成的）。
已修复并加纯函数级回归测试（含"生成码无语法诊断"的真解析断言）。同时满足 `--bytecode`
的顶层 await 前置，并新增 `--profile=bytecode` 档位（默认 release 不变）。

**严重度修订（2026-09-23，/review 裁决）**：本节初版把后果写成"只要会话携带 SPA 资产，官方 release 管线就产不出二进制"。该定性在官方管线的真实前置下**从未成立**：committed 的 `release.yml` `build-native` job 只跑 `bun run build:packages`（`packages/*`），从不构建 SPA，`apps/web/server/dist/public` 在 release runner 上不存在，`writeEmbeddedAssetsEntry` 直接返回 `null`（`build.mjs:215-226`），资产集恒空（`assetSets: [{ entryPath: null }]`，`build.mjs:379-390`）——坏生成码在官方路径上从不被产出，管线也不会因此断掉。codegen 缺陷本身是真的（本地跑过 `build:web` 再 compile 必然复现），修复正确、值得保留；但真正**活在发布物里的缺陷**是另一个：官方管线的前置决定了内嵌步骤永远找不到资产，**发布的二进制里没有工作台 UI**——`byf web` / `byf vis` 只有 API（`build.mjs:381-383` 在该路径打印 "web SPA assets not found … (byf web will be API-only)" 并成功退出），`@byfriends/cli@0.6.1` 及此前所有发布态皆如此，而 CI 全绿。把 SPA 构建接进 release 路径属于**与本节并行的发布管线修复**（`.github/workflows/release.yml` + compile 侧资产前置校验），不在本轮文档修正范围，由管线侧单独记账。

- 引入 OS 级沙箱（ADR-0033 立场不变：permission 层仍是 best-effort UX guard）。

## Traceability

- **Created by**: 主 agent（2026-09-21），依据 `.qoder/analysis/2026-09-20/` 六份审计 + 综合报告 + `10-industry-benchmark.md`（deep-research run `wf_44c46e23-34c`，11 条存活 claim）。
- **Grilled by**: 用户 2026-09-21 授权全程自主决策，Q1-Q7 由本 agent 依第一性原理 + 代码事实 + 对标强度裁决并随记理由。
- **Issue**: 未按 /story 切片实施（R1–R6 单轮落地，追溯靠 commit 范围 `a40b488^..HEAD` 与本 PRD 三节）；评审后新增的后续项已建 issue：#344、#345、#346。
- **Implemented by**: 主 agent + sub-agent（2026-09-21）— R1 安全边界（web 三层门与回环自动 token、`/api/mcp/test` 命令白名单、密钥掩码改键路径身份、点号键明文补口、损坏配置可读可修且服务可启动、headless 审批治理与审计痕迹）、R2（分层门禁扫描器 src 违规 0/test 域 budget 0、发布集合判据、agent-core barrel 错误注释更正）、R3（SDK 层身份表与三档重放分类深冻结、截断式故障注入、压缩 refill 跨轮累计、16 处对外文案 en/zh 同步）、R5（五道 CI 门禁接线且本地可同命令复现、flaky 真因修正、oxfmt 精确 pin、vis-server 退场、文档漂移清理）、R6（展示载荷 zod 单源 + never 哨兵、staking 基线失效）、R4（三臂启动/体积/空闲 CPU 基线与 gate、`--bytecode` 与 `STREAMING_UI_FLUSH_MS` 实测裁决）。
  - 实施中额外发现并修复：`resume` 复用 live 首跑的 attempt id 空间导致恢复时新结果被幂等追加静默吞掉、同一 action 重跑；CLI 的 JS 产物因 `--target node` 在 Bun 下 import 即崩（`dev:prod` 长期不可用）。
  - 未纳入本轮（见 Out of Scope）：逐符号完整 API 报告（API Extractor `apiReport`）、v2 引擎接线（#339 / #342）。

### 续批（2026-09-21 二批，用户指令"全部立刻修复"）

- **AC-2.4 落地**：barrel 形状钉（star-export 集合 + 具名转发清单 + 类型-only 源）进 CI，注释掉的 export 不计、别名按别名记、移除记为 breaking（commit cb6c32e）。
- **#306 清零**：`typecheck:tests` 1805 → **0**，ratchet 基线改记 0，AC-5.4 由"只减不增"变成**零容忍**。度量上的关键结论：1805 里只有约 190 是测试真错，其余是项目配置缺口（根 `tsconfig.test.json` 未声明浏览器 `lib`、缺 `*.md`/`*.yaml`/`*.module.css` 的 ambient 声明）——即"门禁用错了世界去检查被测代码"。详见 #306 关闭记录。
- **类型钉住行为的两处真缺陷**（是清零过程的副产品，非重写测试）：`Omit` 对联合不可分配，`LaneView.append` 与 `V2EventBus.emit` 两处入参/返回被压成公共键并由 cast 兜住，改成 `DistributiveOmit` 后立刻报出 `run_end` 的 `outcome` 少声明 `'suspended'`（commit 941a131）。教训与 AC-2.1/2.2 同源：**被 cast 兜住的类型等于没有类型**。
- **`--bytecode` 采纳落地**：新增 `--profile=bytecode` 档（默认 release 不变），且 release 家族（release/bytecode）此前必然失败的生成码缺陷已修（commit 36064cf）。
- **deps 门禁假红**：OSV 查询改为 3 次退避重试，4xx 不重试、耗尽仍计入 fail-closed 计数——"审计没跑完"依然不等于"没有已知漏洞"（`scripts/lib/dependency-audit-retry.test.ts` 覆盖三种结局）。
- **`macos-smoke` 首跑结论**：`Compile darwin-arm64 binary` 与 `Smoke darwin-arm64 binary` 首次真实通过（run 35555363429）。首跑曾报 5 个 spawn 类测试在 darwin 超时，按 `BYF_TEST_CONCURRENCY` 降并发后全绿，判定为**共享 runner 负载撞上测试内写死的真实计时预算**，而非产品缺陷（#343 关闭记录留了重开判据）。同一形态在 Linux 复现过一次并已按同一理由修正（turn 等待守卫 1s → 10s，外层 `it` timeout 必须大于内层守卫）。附带收益：type-aware lint 现在在 CI（lint 在 build 前）与本地（build 后）两种顺序下结论一致。

### 三批（2026-09-22/23，评审后修复）

三视角 `/review`（Test / Code / Impact）对 `a40b488^..eefb503` 全批给出一致 **Request Changes**：3 个阻断、10 个较大、10 个次要。逐条处置与实测证据：

1. **`941a131` 补测**（评审把它当样板提交，实际零测试，回退成 `Omit` 后全量仍绿）。新增 `packages/agent-core/tsconfig.type-negative.json` + `test/type-safety-negative.ts`：正向半边（payload 具名字面量必须被接受）本身就是回退探针——旧的压平 `Omit` 会因 excess-property 检查拒掉它。运行时在 `test/harness/hooks-events.test.ts` 补 `run_end.outcome === 'suspended'` 与"每一个发出事件都满足 `laneId`/`seq`/`at` 信封"的全集断言，并带 `guardedEvents > 0` 与必需事件类型到达性检查，防止守卫自己变成从不执行的死代码。
2. **零容忍门禁量对了世界**。`tsconfig.test.json` 的 include 扩到 `scripts/**/*.test.ts` 与 `build/*.ts`（`build/run-tests.mjs` 的 roots 含 `scripts`，此前"0 errors"描述的是比测试实际运行面更小的世界）。扩宽当场抓出 48 个活错（含 `dependency-audit-retry.test.ts` 三条 TS7006），全部修到 0，未删或放宽任何一条断言。`build/test-preload.ts`（316 行 shim）从此纳入类型面。新增 `scripts/lib/script-modules.d.ts` + `.test.ts` 做声明与运行时导出的双向配对。
3. **AC-2.4 barrel 钉的两个盲区已闭**：`export type { … }` 的具名并入比较、递归一层子 barrel（快照从根 74 条扩到 74 + 嵌套 81 条，覆盖 `./harness` 等 7 个模块）。两条 mutation 自测证明盲区真的会红。顺带修掉同处两处"承诺多于实现"：`readSnapshot()` 声明返回含 `unresolved: string[]` 而磁盘快照从未写过它；`compareSurface` 的 `missing`/`added` 只算根 star 目标，具名与 type-only 导出从不出现在机器可读差集里。
4. **R1 增第四层门**：`Host` 允许集合（回环字面量 ∪ 绑定主机 ∪ 非回环绑定的网卡地址，端口不参与），挂在根中间件、先于只读豁免与静态资产，于是 rebinding 的跨站**读**被闭合。评审自陈做不到的端到端复现由真 socket + 真 `Bun.serve` 做到并固化成用例（`Host` 是 forbidden header，`fetch` 设不了，故走 `node:net` 手写 HTTP/1.1）。施工中发现并修掉三个真实缺陷：`127.0.0.1.attacker.test` 前缀撞名（按 `startsWith('127.')` 分类会放行）、重复 `Host` 头被 Bun 拼成 `127.0.0.1:4100, evil.test` 后按首个冒号截断即被读成回环、`%2f` 逃过 URL 段规范化后静态路由可读到 `publicDir` 的兄弟目录。stdio 命令白名单从 route 下沉到 `host-rpc.ts` 的收口点，两 scope 皆空时默认拒绝；`args`/`env`/`cwd` 不约束这一残留按 ADR-0033 语域写进注释与 ADR-0042。
5. **退出码 7 钉住**：`run-prompt.test.ts` 两处由"是个数字且不在占用位表里"改成同时钉常量与字面 `7`（改常量必红），并补进 ADR-0029 与两语种用户文档。
6. **`vitest.d.ts` 的声明诚实化**：实测 `vi.unmock` / `advanceTimers` / `getSystemTime` 运行时无实现而声明有，已删并加声明↔运行时守卫测试；`resolves`/`rejects` 改 `Assertion<Awaited<T>>`。顺带记录一条只有实测才能得到的语义：Bun 的 `.resolves` 同步阻塞测试体（300ms 的 promise 在同一条用例体内可见 301ms 墙钟差），因此 97 处去掉的 `await` 不是噪音掩盖；这是 Bun 私有行为，迁回真 vitest 时必须整体加回。
7. **发布管线真正修好**（评审的第二个阻断，也是本 PRD 标题的后半）：`release.yml` 此前只跑 `build:packages`，其 filter 永不覆盖 `apps/`，SPA 目录因此不存在，`build.mjs` 打一行 "API-only" 后 **exit 0** —— 于是 `@byfriends/cli@0.6.1` 及之前每个发布二进制的 `byf web` 都没有工作台，而 CI 一直是绿的。现在 release 家族缺资产即失败、`test:native:smoke` 断言 SPA 经 HTTP 可取回、`macos-smoke` 的 Build 步骤与 release 用同一条命令，且新增 `scripts/lib/release-workflow-shape.test.ts` 把两套 workflow 的形状钉住（含 `apps/vis` 不得借合并复活、平台包名四处一致）。本节原先"只要携带 SPA 资产官方管线就产不出二进制"的定性按事实下调：官方管线那条路上 asset 集恒为 null，因此真正的缺陷是"发出去的产物没有界面"。
8. **#345 授权与来源分离**：审批的授权来源成为记录的必填入参并随 `permission.record_approval_result` 一起落 journal，纯 reducer 对 `audit-only` 不铸造会话级免问规则；`PermissionManager` 的 `set mode` 访问器删除（它就地改状态、不落记录、不进 replay），改由 `setMode` 唯一入口留痕。伪造测试覆盖"钩入文本声称已获得授权"与"伪造一条 origin=user 的队列记录"，后者经 JSONL 截断-恢复仍不能 mint 用户授权。
9. **#307 六项**：侧边栏元数据按 `session.meta.updated` 帧失效（带 400 帧只失效 1 次的防风暴断言）；发送/取消/切权限失败改为可见并回滚乐观条目；动效时长统一进 token；AA 对比度守护脚本 + CI 步骤；token 存储键统一到 `byf.` 命名空间并懒迁移。守护首跑实测出三组今日低于 AA 的字色，如实 WARN 不判红，交视觉裁决（#346）。
10. **文档与追溯**：新增 ADR-0042（四层门、能力分级、残余面）；ADR-0032 / ADR-0020 加"部分取代"精确注记并逐条声明未被推翻的部分；ADR-0034 / ADR-0036 的 D4 加被取代注记；SECURITY.md 增「本地 HTTP 服务」一节；`byf-command.md` 两语种纠正与代码相反的 `--yolo` / `--prompt` 叙述、补 `--deny-unapproved` / `--approve-all` / 退出码 7；`env-vars.md` 补 `WEB_AUTH_TOKEN`；CONTEXT.md 七个"目标态"括注逐行裁决后**全部保留**（依据同一条未接线事实）；AGENTS.md 按 ADR-0041 D4 自己规定的过渡语义，把 Q9 批准措辞作为目标条款与现行 `Agent` 条款并列落地。
11. **CI 第一个红是计时，不是内容**（`35765202338`，`quality/Test`）：`apps/cli/test/scripts/compile/compile-entry-source.test.ts` 的 4 条 tsc 用例跑在 Bun 的 5000ms 默认上限上——本机一次冷启动 ~2s，而并发 10 的 4 核 runner 实测 ~11s，于是要么被"idle 无信息超时"打断，要么留下 dangling process。修法是给每次 spawn 一个 20s 预算、给每条用例一个严格高于它的 55s 上限（`.github/workflows/ci.yml` 里记着的那条不变量），并把整个链排在 harness 的 120s 单文件杀进程之下（5 次 spawn × 20s = 100s），这样慢机器上先响的是"tsc 被预算杀了"这句话而不是一个无法归因的超时。顺带闭掉一个真实的假绿：Bun 在超时杀进程时仍报 `exitCode: 0`，而"没有语法诊断"这类**空断言**会把被杀的 tsc 读成通过，因此每次运行都先过 `assertTscRan`。
12. **CI 第二个红是这条 PRD 自己的用例在说谎**（`35767533205`，`packages/node-sdk/test/session-identity-contract.test.ts`）：`fork 之后原会话目录字节必须完全不变` 报失败，源会话 `agents/main/wire.jsonl` 从 6003 涨到 7073 字节而 `/state.json` 哈希不变。先分清两种可能——fork 真改写了源会话，还是源会话自己的记录在 fork 窗口里落盘。代码事实支持后者：`records/persistence.ts` 的 `append()` 是同步 void、只 `void ensureFlush()`，`prompt()` 从不等 fsync；而 `forkSession` 对仍活跃的源会话会先 `await active.flushMetadata()`（`core-impl.ts:390`），`SessionStore.fork` 的写入目标则**全部**是目标目录。也就是说增长是源会话自己的 turn 记录，且 fork 必须先 flush 才能复制出完整的副本——"字节全等"在活跃源这条路径上本就是个错命题。原用例的 `settledManifest` 靠"连续两次 25ms 采样相同"判落定，本机快所以看着稳，runner 争用即输。改成以 `harness.close()` 为确定性屏障（`close()` 里 `await flushMetadata()`，而 `wire.flush()` 是排空到 `pendingRecords` 为空的循环），另补一条用例按这条路径真正成立的不变量断言：源目录允许长出自己的记录，但已有行必须是前缀（append-only）——截断类缺陷（`truncateMainWireUpToMessage` 的目标若从 target 挪到 source）只有前缀断言抓得到。同一手法扫过全仓，`wire.jsonl` 的字节清单断言仅此一处，无兄弟用例。
13. **CI 第三个红暴露的是流程缝，不是代码缝**（`Format check`）：pre-commit 的 lint-staged glob 只覆盖 js/ts/mjs 等，**不含 markdown**，所以 `.md` 的格式只有 CI 会管。这次 CI 抓到的不是排版：`oxfmt` 会规范化有序列表编号，而编号对不上是因为我往「三批」清单加第 11 条时，Edit 的 new_string 只写了新条目、没把作为锚点的第 10 条一起留下——整条「文档与追溯」被替换掉而非追加。从 `8ef5bf0` 逐字取回并补齐编号。结论是两条：改 `.md` 后必须自己跑 `bun run fmt:check`（钩子不会替我做），以及用整段文本当 Edit 锚点时，new_string 必须把锚点原文一起写回去。

**本轮未做（不是遗漏，是前置未到）**：

- `--bytecode` 仍未成为 release 默认。原先缺的 darwin 半边证据**已经补上**：`macos-smoke` 新增的 `Compile darwin-arm64 binary (--bytecode profile)` 与 `Smoke darwin-arm64 bytecode binary` 两步在 `35765202338` 的真 macOS runner 上全绿（编得出、起得来、SPA 经 HTTP 取得回）。剩下的是前置 3——需要一次真实测量重录 `scripts/perf/baselines/linux-x64.json`，而本机度量与编译未被授权执行。
- AC-4.3 的环比门仍未接进任何 workflow：接进去就是一个"构造性红"的门（已提交基线含两条自测冒烟本就失败的死臂），因此让 `gate` 在变红时自己说明原因并给出重录命令，而不是伪造绿。基线重录后再接。
- 启动/体积基线仍只有 linux-x64 一个文件；prompt cache 命中率仍无跨轮汇总与对外可见面（`TokenUsage` 已有 `inputCacheRead`/`inputCacheCreation`，缺的是聚合）。
- `typecheck:negative` 仍不在 `scripts/ci-gates.mjs` 的门禁名单里，所以 `bun run gate` 不等于 CI 全部门禁。

**记账**：新建 #344（v2 装配地基，阻塞 #339/#340/#341）、#345（hook 授权边界，本轮已实现）、#346（AA 未达标字色）；#339/#340/#341 的 body 追加 Blocked by #344 与死开关证据；#342 记删除足迹、`lock.ts`/JSONL 单写者冲突与 barrel 口径；关闭与 PRD 状态矛盾的 #284 / #299 / #310。R1–R6 本轮按单轮实施落地，不回补"已完成"性质的 Issue——那只会给 tracker 增加六条没有信息量的记录。

- **Reviewed by**: 三视角 `/review`（Test / Code / Impact）于 2026-09-23 执行，一致 **Request Changes**；发现的处置与未处置项全部记录在「三批」。复审判据：同一批文件重跑一遍三视角，重点看「三批」里第 1/2/3/7 条的断言是否真的会红。
- **发布态势（2026-09-23）**: **未发布**。R1–R6 的实现与评审修复均已合入/正落入 `dev`，但 `.changeset/` 尚有 51 份未消费条目（其中 34 条 minor 派生、0 条 major），下一次版本派生为 **0.6.1 → 0.7.0**（当前最新 tag `@byfriends/cli@0.6.1`）。发布动作本身、以及上节的管线修复落地与验证，都在版本执行之前。
