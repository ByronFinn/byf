# 工具系统演进路线图：调度图与权限图的统一

> **Created**: 2026-08-13
> **Source**: 基于《Agent 工具系统设计深度分析报告》（`agent-tools-design-report.md`，15 项目源码级横向分析）× 4 路针对 byf TS 代码库的文件级取证校验。
> **校验日期**: 2026-08-13
> **状态**: 活跃文档，作为后续每个子项 PRD 的战略依据。不取代任何单项 PRD 的验收标准。

---

## 0. 目的

本路线图是跨 PRD 的工具系统演进协调文档，作用：

1. **校准**：记录外部分析报告与 byf TS 代码事实之间的偏差，避免后续工作建立在错误前提上（对应 `docs/architecture-debt-roadmap.md` 的「扫描校准」纪律）。
2. **诊断**：从第一性原理定位 byf 当前最大的结构性缺口——**调度图与权限图的不对称**。
3. **排序**：给出按「先补正确性缺陷、再防漂移、后做差异化」分层的演进路线，标注每项与三条公理（A 可验证 / B 可授权 / C 有界）的对应关系。

**范围限定**：本文只覆盖 byf TS 主版本（`packages/agent-core` 等），不含 byf-python 与 byf-go（参考性建议见各 Tier 注脚）。

---

## 1. 第一性原理诊断：调度图与权限图的不对称

### 1.1 工具的第一性定义（复述基准）

LLM 推理核心有六个不可绕过的物理性局限（L1 无感官 / L2 无手 / L3 无状态 / L4 无外部事件 / L5 信息不对称 / L6 不可信输出），工具是「环境接口的符号化压缩」。由此导出三条公理：

- **公理 A（可验证性）**：工具结果必须能让模型区分成功/失败/空输出。
- **公理 B（可授权性）**：每个行动原语都必须能被拦截、审批、拒绝，且拒绝理由回传。
- **公理 C（有界性）**：工具输入靠 schema 校验，输出靠截断/持久化。

byf 在公理 A（`coerceToolResult` 信任边界）、公理 C（5 级上下文降级 + prompt-plan 缓存分块）上已是第一梯队。**结构性缺口集中在公理 B**。

### 1.2 不对称：byf 当前的核心张力

byf 在「并发安全」和「授权安全」两个维度上的抽象成熟度严重不匹配：

| 维度      | 调度图（ToolAccesses）           | 权限图（permission）               |
| --------- | -------------------------------- | ---------------------------------- |
| 粒度      | 文件路径级                       | 命令字符串级（picomatch）          |
| 建模      | `(kind, operation, path)` 二元组 | `toolName(argPattern)` 字面量/通配 |
| Bash 处理 | **不声明 accesses**（黑盒）      | **不解析命令**（裸字符串匹配）     |
| 沙箱      | —                                | **无**（零 OS 级隔离）             |
| 成熟度    | 世界级（报告评测第 5 级）        | 第 1 级（纯匹配）                  |

> **核心判断**：两个图本应是**同一份资源模型**——都是 `(resource, operation)` 二元组的消费者。byf 已经把这份模型在调度层建好了，但权限层没用上。**最高杠杆的演进，是让权限图复用调度图已有的资源感知能力，而不是另起炉灶造一个「Bash 安全子系统」。**

### 1.3 Bash 是公理 B 的当前破口

Bash 是唯一能绕过所有其他原语的工具（可读写文件、可联网、可跑代码）。byf 的 Bash：

- **零命令分析**：`resolveExecution`（`tools/builtin/shell/bash.ts:168-176`）不声明 `accesses`、不解析命令；执行（`bash.ts:178-203`）直接拼 `cd '<cwd>' && <command>` 交给 `LocalKaos.execWithEnv`（`packages/kaos/src/local.ts:521-537`）裸 `spawn`。
- **纯 picomatch 匹配**：权限层只对原始命令字符串跑 `picomatch.isMatch`（`agent/permission/matches-rule.ts:40-45`、`path-glob-match.ts:24-31`）。`Bash(!rm *)` → `{toolName, argPattern:'!rm *'}`（`parse-pattern.ts:12`），无法看到 `echo hi; rm -rf /` 里隐藏的 `rm`。
- **敏感文件防护被绕过**：`tools/policies/sensitive.ts` 的 `.env`/`id_rsa`/`credentials` 防护只作用于 Read/Write/Edit/Glob/Grep（经 `resolvePathAccess`，`path-access.ts:248-256`），**Bash 从不调用它**——`cat .env` 仅受 Bash 默认 `ask` 门控。
- **approve-for-session 过度授权**：审批通过后 `recordApprovalResult`（`agent/permission/index.ts:75-99`）对 Bash 记录的是**裸 `Bash` 规则**（`action-label.ts:96-97` → action `'run command'` → `action-label.ts:42-43` → pattern `'Bash'`），匹配**所有**后续 Bash 命令。连命令前缀都不记。（唯一例外是 `CronCreate`，它按 payload 收窄——`action-label.ts:56-73`。）
- **零沙箱**：全仓 `sandbox|seatbelt|bwrap|landlock|seccomp` 零生产代码命中。

**结论**：byf 的 Bash 当前不满足「每个行动原语都能被可靠拦截」（公理 B）。这是**正确性缺陷，不是优化项**，且是支持 goal mode / cron / AFK 自主模式的硬前提。

---

## 2. 分析报告校准

外部分析报告（`agent-tools-design-report.md`）整体准确度极高，但 §8.3 的「十条建议」中有 3 条基于对 TS 代码的不准确前提。后续工作必须以校准后的事实为准。

| #   | 报告说法                                   | 代码事实（文件级取证）                                                                                                                                                                                                                                                                                                                                     | 对路线图的影响                                         |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| R2  | 「把 Python 版敏感文件黑名单移植回 TS 版」 | TS **早已有** `tools/policies/sensitive.ts`：`.env`/`id_rsa`/`id_ecdsa`/`credentials` + 改名变体（`.bak/.pem/.key/.old` 等，`sensitive.ts:16-79`），覆盖 Read/Write/Edit/Glob/Grep。**真缺口是 Bash 绕过**（见 §1.3），不是「缺黑名单」。                                                                                                                  | 重新定性为「Bash 命令资源解析」的子问题，归入 Tier 0。 |
| R4  | 「byf 无类型化完成契约」                   | Goal 模式**已有**完整契约：`UpdateGoal(status:'complete')`（`goal/update-goal.ts:32-42`）→ `markComplete()`（`goal/index.ts:141-156`）→ `GoalChange{kind:'completion'}`（`goal/types.ts:54-56`），driver 在 turn 边界读状态停跑（`agent/turn/index.ts:381-454`）。**缺口是非 goal 模式**退化为「无工具调用 = `end_turn`」（`loop/turn-step.ts:255-275`）。 | 不是「没有」，是「未泛化」。优先级下调到 Tier 2。      |
| R8  | 「截断数值在描述与执行层可能不一致」       | Read 描述与执行**共享同一组常量**（`MAX_LINES=1000`/`MAX_LINE_LENGTH=2000`/`MAX_BYTES=100KB`，`read.ts:16-18` 经 `renderPrompt` 注入描述），无法漂移。上下文实际是 **5 级**（报告漏了 `applyPruning`，`context/index.ts:245-284`）。                                                                                                                       | 担忧对 TS 不成立，是 byf 的**强项**。从路线图删除。    |

**确认无误的部分**（作为后续 Tier 的依据）：

- Bash 纯字符串匹配、零语法分析、零沙箱 ✓（见 §1.3）
- approve-for-session 记录裸 `Bash` 规则（比报告说的更糟）✓
- MCP 全量平铺、无渐进披露、无 `notifications/tools/list_changed` 订阅 ✓
- 跨 step 去重只到 streak 3/5/8 的 advisory 提醒（`tool-dedup.ts:118-127,197-201`），**无 forbid/force-stop 阶梯** ✓
- ToolAccesses 资源冲突调度器（`loop/tool-scheduler.ts:28-98` + `loop/tool-access.ts:94-150`）、coerceToolResult 信任边界（`loop/tool-call.ts:600-618`）、zod v4→draft-7+AJV+`coerceToolArgs`（`input-schema.ts:26-33`、`args-validator.ts:90-169`）全部如述 ✓
- 工具输出 schema 仅 drift-guard，零运行时消费（`agent.ts:14-16` 显式注释 + 全仓搜索零命中）✓
- 空输出占位机制存在，但实际文本是 `"Tool output is empty."`（`loop/tool-call.ts:45`），非报告引用的 "completed with no output"。

---

## 3. 分层演进路线

按「先补正确性缺陷（公理 B）、再防漂移、后差异化」排序。每项标注公理对应与依赖关系。

### Tier 0 —— 安全地基：闭合公理 B 的缺口（不可外包底线）

支持「挂着跑」（goal / cron / AFK）的前提是可靠的动作边界。这是公理 B 的执行期保障，无法靠提示词或规则补全。

#### 0a. Bash 命令资源解析 —— 路线图枢纽

- **定位**：让权限图消费调度图已有的资源模型。把 Bash 命令解析成 `(path, op)` 序列，复用现有 `resolvePathAccess`，使敏感文件防护**自动覆盖 Bash**。
- **方案选择**（推荐）：先做 **shell-decompose**（按 `; && || |` 分解复合命令 + 剥离 `bash -c`/`sh -c` + 提取文件路径参数 + 间接执行黑名单 `eval/source/xargs/env/sudo/python -c/node -e`），覆盖 ~90% 场景，实现成本低。tree-sitter（opencode 方案，语法级 AST）作为后续强化，按需引入。
- **连带收益**：敏感文件 Bash 防护（解 R2）、为 0b 的 per-prefix 规则化提供解析输入。
- **公理**：B（可授权性）。

#### 0b. approve-for-session 规则化

- **定位**：把一次性审批沉淀为可复用、有界的规则，而非裸 `Bash`。
- **方案**：复用 0a 的解析。审批 `git push` 时生成 `Bash(git push*)` 而非裸 `Bash`；参考 codex 的「审批即写策略」（execpolicy 修正案）与 gemini 的 `ProceedAlways` 收窄到 argsPattern。
- **依赖**：0a。
- **公理**：B。

#### 0c. OS 沙箱

- **定位**：公理 B 的执行期兜底。规则匹配永远是黑名单（「下一个未被枚举的绕过永远存在」），沙箱是真边界。pi 的立场（「半沙箱易被误解为安全边界」）与 Reasonix/codex 的纵深（策略→语法分解→沙箱→LLM 法官）殊途同归：**规则 + 沙箱组合**。
- **方案**：macOS `sandbox-exec`（seatbelt）/ Linux `bwrap`（+ Landlock）。**fail-closed**：后端不可用时降级为强制审批，绝不裸跑。
- **工程量**：本 Tier 最大。是让 AFK 模式成立的硬前提，建议作为独立 Phase，排在 0a/0b 之后。
- **公理**：B。

### Tier 1 —— 巩固与防漂移（工程纪律，风险低）

这一层是「防止现状退化」，不解决根本问题，适合在 Tier 0 稳定后或顺势做。

#### 1a. 跨 step 去重 force-stop 阶梯

- **现状**：`tool-dedup.ts` 的跨 step 去重只到 streak 3/5/8 的 advisory 提醒，无 forbid/force-stop。
- **方案**：加一档「N 次后强制停止」（参考 kimi-cli 的 3/5/8/12 阶梯 → force-stop）。廉价且有效，防 goal 模式跑飞时烧 token。
- **公理**：A（防幻觉放大）。

#### 1b. 工具契约测试

- **现状**：无 Reasonix 式 `TOOL_CONTRACT` 约束。
- **方案**：每个工具的 name/description/schema/参数语义有可测试契约，防工具面演进时语义漂移。
- **公理**：C（有界性 / 一致性）。

#### 1c. MCP 渐进披露

- **现状**：MCP 工具全量平铺进顶层 tools（`agent/tool/index.ts:426-451`），无 `select_tools`、无 `list_changed` 订阅。
- **触发条件**：当用户连接多个 MCP server、工具数超过注意力阈值时，全量 schema 吃光上下文。
- **方案**：参考 kimi-code 的 `select_tools`（同血统，最易移植）+ `<tools_added>` 公告。借鉴 Reasonix 的稳定代理（`use_capability`）保住 byf 已有的 prompt-plan 缓存分块收益。
- **优先级**：不急（当前 MCP 生态接入有限），但应作为 MCP 扩张的前置准备，**按工具数阈值触发而非现在就做**。

### Tier 2 —— 差异化创新（看产品方向取舍）

#### 2a. 资源感知权限模型（0a 的极致推演）

- **定位**：把调度图与权限图彻底统一为一份 `(resource, operation)` 模型——Bash / 编辑 / 子代理共享同一授权语义。这是分析报告 §9.2 预言（「调度图与权限图终将共享同一份资源模型」）的落地，也是 byf 相对竞品的独特卖点。
- **依赖**：0a。

#### 2b. 完成语义泛化

- **定位**：把 goal 模式的 `completion` 契约（`GoalChange{kind:'completion'}`）推广到普通 turn。
- **方案**：可选的 `complete_task` 工具 + completion guard（提前收工时 nudge）。`shouldContinueAfterStop`（`agent/turn/index.ts:582-602`）已有一-shot 续跑，可作为 guard 基座。
- **公理**：A（完成可验证）。

#### 2c. 工具输出 schema 运行时校验

- **现状**：输出 schema 仅 drift-guard（`agent.ts:14-16`），零运行时消费。
- **定位**：byf 是少数「输入输出双 schema」的潜在实现（codex/grok 在做，Cline 明确不做）。价值取决于是否要做下游验证 / 子代理结果信任。
- **开放问题**：结构化输出对下游验证的价值 vs 对弱模型的约束成本，业界尚无定论。建议按需引入，不预设。

---

## 4. 显式不做（Out of Scope）

- **byf-python / byf-go 对比与移植**：本次演进只针对 TS 主版本。报告 R2（移植 Python 黑名单）、R6（移植 Python 去重）、R10（byf-go 8 工具基准）不纳入。其中 R2/R6 的 TS 等价物已存在或已重新定性（见 §2），R10 是跨语言产品决策，超出本文范围。
- **裁剪工具到极简**：报告 §7.1 的「极简 vs 完备」光谱上，byf 的 23 个 builtin 每个有独立清晰语义，符合「真正的分界线不是数量，而是每个工具是否有独立语义」的裁决。不追求 byf-go 式 8 工具封顶；工具数问题用 Tier 1c（渐进披露）解决，而非砍工具。
- **LLM 法官 / Guardian**：Reasonix/Claude Code 的次级模型裁决引入「谁来审审查者」的递归，且依赖额外模型成本。byf 当前选择「规则 + 沙箱」纵深而非「模型审模型」，本路线图不纳入 Guardian。

---

## 5. 后续 PRD 衔接

每个 Tier 0 子项应独立成 PRD。建议顺序与依赖：

```
0a (Bash 资源解析, 枢纽) ──┬─→ 0b (approve-for-session 规则化)
                          └─→ 2a (资源感知权限模型, 长期)

0c (OS 沙箱) ── 独立 Phase, 与 0a/0b 解耦, 工程量最大

1a / 1b / 1c ── 顺势做, 不阻塞 Tier 0
```

下一步：从 **0a（Bash 命令资源解析）** 开始立项。它是整个路线图的枢纽——投入产出比最高（复用现有 `ToolAccesses` / `resolvePathAccess` 基建），且同时解锁敏感文件 Bash 防护、为 0b 铺路。

---

_本文所有「代码事实」基于 2026-08-13 `packages/agent-core` 快照，经 4 路探索代理文件级取证。报告校准结论（§2）是后续任何子项 PRD 的前提，禁止在未经重新校验的情况下引用原报告的不准确前提。_
