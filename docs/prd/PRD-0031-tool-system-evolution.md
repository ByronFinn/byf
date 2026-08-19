# 工具系统演进：调度图与权限图的统一

> **Status**: Done | **PRD**: PRD-0031 | **Created**: 2026-08-13 | **Last updated**: 2026-08-13

## Goal

把 byf 的权限层从「命令字符串匹配」升级为「资源感知 + 精细审批 + 诚实声明」，复用调度层（`ToolAccesses`）已有的 `(资源, 操作, 路径)` 资源模型，使调度图与权限图最终统一为同一份资源抽象；同时推进防漂移纪律（跨 step 去重 force-stop、工具契约测试、MCP 渐进披露）与差异化创新（资源感知权限模型、完成语义泛化、输出 schema 校验）。**一句话：让 byf 的权限层达到与调度层同级的资源感知成熟度——在明确「不做沙箱」的前提下（ADR-0033），把权限层做到最好的 UX 尽力而为，并诚实声明其非安全边界。**

本 PRD 是**整体规划**：覆盖路线图 `docs/roadmap/tool-system-evolution.md` 全部 Tier，按 Phase 分期（Phase 1 = Tier 0，Phase 2 = Tier 1，Phase 3 = Tier 2），不再按子项拆分 PRD。各 Phase 独立成 PR 序列，Acceptance Criteria 按 Phase 验收。

## What I already know

（本会话 4 路源码取证 + 4 项沙箱源码对比，全部 file:line 已验证）

**权限层现状（破口）**：

- Bash 零命令分析：`resolveExecution` 不声明 `accesses`（`tools/builtin/shell/bash.ts:168-176`），执行是裸 `spawn`（`packages/kaos/src/local.ts:521-537`）。
- 权限匹配纯 picomatch 字符串（`agent/permission/matches-rule.ts:40-45`、`path-glob-match.ts:24-31`），看不到 `echo hi; rm x` 里的 `rm`。
- 敏感文件防护（`tools/policies/sensitive.ts`，覆盖 `.env`/`id_rsa`/`credentials` + 改名变体）只经 `resolvePathAccess` 作用于 Read/Write/Edit/Glob/Grep，**Bash 从不调用**（`path-access.ts:248-256`）。
- approve-for-session 对 Bash 记录**裸 `Bash` 规则**（`agent/permission/action-label.ts:42-43,96-97` → `agent/permission/index.ts:90-95`），匹配所有后续命令。
- **无进程内沙箱**：既定决策（ADR-0033），采纳 opencode 立场（隔离归用户容器/VM）。

**调度层现状（世界级）**：

- ToolAccesses 资源冲突调度器（`loop/tool-scheduler.ts:28-98` + `loop/tool-access.ts:94-150`），每工具声明 `(kind, operation, path)`，读读并行、读写串行、路径重叠排队；未声明者默认全局互斥（`tool-call.ts:333`）。

**其余现状**：

- 跨 step 去重：streak 3/5/8 仅 advisory 提醒（`agent/turn/tool-dedup.ts:118-127,197-201`），无 forbid/force-stop；同 step 去重已完整（共享结果，`tool-dedup.ts:139-153`）。
- 工具输出 schema：仅 drift-guard（`tools/builtin/collaboration/agent.ts:14-16` 显式注释），全仓零运行时消费。
- MCP：全量平铺进顶层 tools（`agent/tool/index.ts:426-451`），无 `select_tools`、无 `notifications/tools/list_changed` 订阅；命名 `mcp__server__tool` + FNV-1a 哈希截断已有（`mcp/tool-naming.ts`）。
- 完成语义：goal 模式已有类型化契约（`UpdateGoal(status:'complete')` → `goal/index.ts:141-156` `markComplete` → `GoalChange{kind:'completion'}`）；普通 turn 退化为「无工具调用 = end_turn」（`loop/turn-step.ts:255-275`）。
- 上下文管理 5 级（截断/卸载/masking/pruning/compaction），Read 描述与执行共享常量（`read.ts:16-18`），空输出占位存在（`loop/tool-call.ts:45`）。
- 沙箱对比结论：四项（codex/Claude Code/grok-build/opencode）收敛到 seatbelt+bwrap 两 CLI 原语；可移植到 TS/Bun 的仅这两个（纯 FS 隔离），seccomp/Landlock 全需 native addon；opencode「无沙箱」是成文自洽哲学（research spike 已落盘）。

## Assumptions (temporary)

- ~~0a 的 shell-decompose 覆盖率足够高~~ → **已转化为验收门禁**（grill Q5）：基准命令集 ≥80% 可完整解析 → GO；<80% 重新评估。
- 用户把 byf 当作交互式/自主编码 agent 使用，非托管多租户形态——「不做沙箱」的前提（ADR-0033 边界条件）→ **已由无沙箱决策验证**。
- 权限层重新定位为「UX 尽力而为、非安全边界」后，用户接受「处理不可信任务时自备容器/VM」→ **已验证**（Q2 硬拒 + 0c 威胁模型文档）。
- ~~0a 完全不触碰静态前缀~~ → **已修正**（grill Q6）：Bash 描述改动是一次性、经 PRD-0029 流程标注的 cache-impact 变更；其余运行期行为零 churn。

## Open Questions

（已全部解决）

## Requirements

### Phase 1 — Tier 0：权限层尽力而为 + 诚实声明

- **0a. Bash 命令资源解析（枢纽）**：把 Bash 命令解析成 `(path, op)` 序列，复用现有 `resolvePathAccess` 使敏感文件防护自动覆盖 Bash；识别复合命令中的独立子命令（`; && || |`、`bash -c` 剥离、间接执行检测）。
- **0b. approve-for-session 规则化**：审批生成 per-prefix 有界规则（如 `Bash(git push*)`）而非裸 `Bash`；依赖 0a 的解析输入。
- **0c. 威胁模型文档化 + 容器建议**：**扩展现有 `SECURITY.md` 加「Threat Model」章节**（grill Q4 已定）：权限层非安全边界 + Bash 破坏面 + 容器建议 + **已知绕过面**（`$HOME/.env` 等变量展开不可静态解析、`python -c "os.system(...)"` 内层命令不可见、heredoc 嵌套解析失败转强制审批等——与「UX 尽力而为」定位一致，显式文档化而非隐藏）。README/AGENTS 引用。**只做文档**（D2 已定：不做容器检测提示）。

### Phase 2 — Tier 1：防漂移（顺势做）

- **1a. 跨 step 去重 force-stop 阶梯**：在现有 3/5/8 advisory 之上加 force-stop 档。
- **1b. 工具契约测试**：每个 builtin 工具的 name/description/schema/语义有可测试契约。
- **1c. MCP 渐进披露**：MCP 工具数超阈值时按需加载 + 公告（参考 kimi-code `select_tools`）。

### Phase 3 — Tier 2：差异化（看产品方向取舍）

- **2a. 资源感知权限模型**：调度图与权限图彻底统一为一份 `(resource, operation)` 模型（0a 极致推演）。
- **2b. 完成语义泛化**：goal 的 completion 契约推广到普通 turn（`complete_task` + completion guard）。
- **2c. 工具输出 schema 运行时校验**：输出 schema 从 drift-guard 升级为运行时校验（按需，开放问题）。

## Acceptance Criteria

### Phase 1

- [x] `cat .env` / `cat ~/.ssh/id_rsa` 经 Bash 被敏感文件层**硬拒**（解析出读 `.env` → 命中 `sensitive.ts` → `PATH_SENSITIVE`，错误作为数据回传）
- [x] `echo hi; rm x` 中 `rm` 被识别为独立子命令并受规则约束（逐子命令匹配，grill Q1）
- [x] 动词分类表生效（grill Q3）：审批 `git status` 生成 `Bash(git status*)`（`git status --short` 放行、`git log` 仍需审批）；审批 `curl <url>` 生成精确规则（其他 curl URL 仍需审批）
- [x] 0b 后新审批生成 per-prefix 规则；旧裸 `Bash` 规则不迁移、随会话失效（grill Q7）
- [x] Bash 工具描述已更新告知敏感文件拦截（grill Q6），改动按 PRD-0029 cache-impact 流程标注（一次性 churn，落地后前缀恢复稳定）
- [x] **缓存稳定**：0a/0b 的运行期行为（解析、规则生成、拦截）零 churn；唯一允许的 churn 是 Bash 描述的一次性 cache-impact 变更
- [x] 0a spike：基准命令集（~30 条）中可完整解析出 `(path, op)` 比例 **≥80% → GO**（grill Q5）；<80% 重新评估（tree-sitter 或接受局限 + 文档化）
- [x] 威胁模型文档（SECURITY.md「Threat Model」章节）存在，明确「权限层非安全边界」+ 已知绕过面，被 README/AGENTS 引用

### Phase 2

- [x] 重复调用达 N 次后被强制停止（不再执行该调用）
- [x] 每个 builtin 工具都有契约测试且 CI 强制同步
- [x] MCP 工具数超阈值时，渐进披露生效（模型先见名字/描述，schema 按需注入 + `<tools_added>` 公告）

### Phase 3

- [x] 权限规则与调度声明共享同一 `(resource, operation)` 抽象（单一类型、单一来源）
- [x] 普通 turn 可通过声明式完成契约结束（非「无工具调用」启发式）
- [x] 工具输出过运行时 schema 校验，畸形输出转为结构化错误（`coerceToolResult` 前置）

## Definition of Done

- 每 Phase 的 Acceptance Criteria 全部满足（以代码为唯一事实源）
- 测试覆盖：单元 + 集成（含 FakeLLM/回放 Provider 路径）
- Lint / typecheck / CI green（Bun 工具链）
- 文档更新：威胁模型文档（0c）、CONTEXT.md 术语（如有新术语）、工具描述（如 0a 改动描述）
- 缓存稳定门禁：0a/0b 的 PR 必须证明无 cache churn（PRD-0029 破坏侧归因）
- 无 `[TEMPORARY]` / `TODO(prd-0031)` 残留

## Out of Scope

- **进程内 OS 沙箱**（ADR-0033：不做，隔离归用户容器/VM）
- byf-python / byf-go 对比与移植（R2/R6/R10 均不纳入；R2/R6 的 TS 等价物已存在或已重新定性）
- 裁剪工具到极简（不追求 byf-go 式 8 工具封顶）
- LLM 法官 / Guardian（「谁来审审查者」递归 + 额外模型成本）
- codemode 式受限 JS 解释器（记入 Tier 3 候选，不排期）
- 网络代理/MITM（沙箱关联项，随沙箱一起排除）

## Technical Approach

**Phase 1（0a → 0b → 0c，顺序依赖 0a→0b，0c 并行）**：

- 0a：新建**命令→路径提取层**（Bash 命令多文件参数：相对路径需 cwd 解析、flag 后未必是路径、glob、heredoc/process substitution——与现有单一显式 `path` 参数的 `resolvePathAccess` 形状不同）；解析输出 `(path, op)` 序列过 `resolvePathAccess`；间接执行（`eval`/变量拼接）才强制审批，`python -c`/`node -e` 走正常解析。方案选型见 Feasible Approaches（D1）。
- **0a 规则匹配语义（grill Q1 已定）**：权限规则改为**逐子命令匹配**——对解析出的每个子命令逐条过规则，聚合遵循现有优先级（`check-rules.ts:19-44`）：任一子命令命中 deny → 整条 deny；任一命中 ask（且无 deny）→ ask；全部 allow（或无规则命中 → 默认表）→ allow；`yolo`/`auto` 模式覆盖仍有效。`!` 否定语义从「整串不匹配」变为「无子命令匹配」。**属行为变更**：`Bash(!rm *)` 现在对 `echo hi; rm x` 生效（修掉现有整串匹配绕过）。
- **0a 敏感文件拦截（grill Q2 已定）**：**硬拒**——经解析出的 `(path, op)` 过 `resolvePathAccess`，命中 `sensitive.ts` 直接抛 `PATH_SENSITIVE`，与现有 Read/Write/Edit 行为一致；错误作为结构化数据回传（公理 A），附修复指引。用户可经权限 DSL 显式配置规则放行。
- 0b：审批动作 → 规则模式映射表（grill Q3 已定：**动词分类表**——扩展现有 `action-label.ts` 的 `ACTION_TO_PATTERN` 机制）。构建类动词（git/npm/bun/pnpm/cargo/make/npx/go/uv…）→ 前缀规则（前 2 token，如 `Bash(git push*)`）；网络/破坏/解释器类（curl/wget/rm/mv/sudo/chmod/ssh/scp/rsync/python/node…）→ 精确匹配（payload-scoped，CronCreate 先例）；未知动词默认精确。参考 codex execpolicy / gemini ProceedAlways 收窄。
- 0c：扩展现有 `SECURITY.md` 加「Threat Model」章节（grill Q4），纯文档交付（D2 已定，不做容器检测）。
- **Bash 工具描述（grill Q6 已定）**：v1 **改描述**告知模型敏感文件拦截。属 cache-impact 变更——按 PRD-0029 流程标注（一次性 churn），不得静默改；改动落地后前缀恢复稳定。
- **旧规则兼容（grill Q7 已定）**：不迁移——0b 前的裸 `Bash` session-runtime 规则随会话结束自然失效；0b 后新审批生成 per-prefix/精确规则。

**横切约束（缓存稳定）**：0a/0b 必须为运行期行为——不改静态 tool schema、不向 prompt-plan 前缀注入新块（PRD-0029 门禁）。

**Phase 2/3 技术要点见路线图对应节**（`docs/roadmap/tool-system-evolution.md` §3 Tier 1/2）。

## Research References

- [本地 agent OS 沙箱四项对比 + 不做沙箱决策](docs/research/spike-local-agent-os-sandbox.md) — codex/Claude Code/grok-build/opencode 收敛到 seatbelt+bwrap 原语；可移植的仅这两个 CLI 原语；opencode「无沙箱」是成文自洽哲学；byf 采纳其立场（ADR-0033）。

## Feasible Approaches

**Approach A: shell-decompose 先行（推荐）**

- How: 按 `; && || |` 分解复合命令 + 剥离 `bash -c`/`sh -c` + 提取文件路径参数 + 间接执行检测（`eval/source/xargs/env/sudo`）。不引入 WASM/native 依赖。
- Pros: 实现成本低；纯字符串逻辑可测；覆盖常见编码场景（~九成直觉，待 spike 实测）；不破坏「core 无 WASM/native」的依赖卫生。
- Cons: 非语法级，复杂 shell（heredoc 嵌套、过程替换、别名展开）可能解析不全；「下一个未被解析的绕过」存在。

**Approach B: tree-sitter 直接上**

- How: 引入 `web-tree-sitter` + `tree-sitter-bash.wasm`（opencode V1 方案），语法级 AST 解析。
- Pros: 语法级准确；opencode V1 有现成实现参考（`packages/opencode/src/tool/shell.ts`）。
- Cons: WASM 依赖违反 byf 分层卫生（opencode V2 正是因此推迟移植）；bundle 体积与加载成本；实现周期长。

**Approach C: 混合——decompose 先行 + tree-sitter 预留接口**

- How: A 的实现，但解析层抽象出接口（`BashCommandParser`），tree-sitter 作为后续强化按需替换。
- Pros: 兼得 A 的低成本与 B 的演进路径。
- Cons: 抽象接口本身是成本（YAGNI 风险）；若永远不升级则白设计。

## Decision (ADR-lite)

**Context**: 需要决定 0a 的命令解析技术方案；「不做沙箱」已由 ADR-0033 锁定。
**Decision**: **0a 采用 shell-decompose 先行（Approach A）**——按 `; && || |` 分解复合命令 + 剥离 `bash -c`/`sh -c` + 提取文件路径参数 + 间接执行检测（`eval/source/xargs/env/sudo`）。不引入 WASM/native。覆盖率由 PR1-0a-spike 用基准命令集实测，不预设数字。tree-sitter 明确列为**后续强化候选**，但本次不预留抽象接口（避免 YAGNI；若未来需要，在工具内替换实现即可）。
**Consequences**: 复杂 shell 语法（heredoc 嵌套、过程替换、别名展开）可能解析不全——接受为已知局限，由「无法静态解析时强制审批」兜底；「下一个未被解析的绕过」存在——与不做沙箱的定位一致（权限层是 UX 尽力而为，非安全边界）。

## Implementation Plan (small PRs)

**Phase 1（Tier 0）**：

- PR1-0a-spike：基准命令集 + shell-decompose 覆盖率 spike（先于实现，验证假设）
- PR2-0a-parse：命令→路径提取层 + 敏感文件 Bash 防护（含缓存稳定门禁）
- PR3-0b-rules：approve-for-session per-prefix 规则化（依赖 PR2）
- PR4-0c-threat：威胁模型文档 + README/AGENTS 引用（可与 PR2/PR3 并行）

**Phase 2（Tier 1）**：PR5-1a-dedup-stop → PR6-1b-contracts → PR7-1c-mcp-disclosure

**Phase 3（Tier 2）**：PR8-2a-resource-perm → PR9-2b-completion → PR10-2c-output-schema

## Technical Notes

- 已验证代码事实清单见 `docs/roadmap/tool-system-evolution.md` §1.3/§2（4 路取证 file:line）。
- 分析报告校准（R2 敏感文件已存在、R4 完成契约已存在于 goal 模式、R8 截断一致）——后续子项不得引用原报告的错误前提。
- 路线图状态：`docs/roadmap/tool-system-evolution.md` 2026-08-13 版（含不做沙箱更新）。
- 决策证据层：`docs/adr/0033-no-in-process-os-sandbox.md`、`docs/research/spike-local-agent-os-sandbox.md`。
- 0a 解析方案：D1 已选 Approach A（shell-decompose 先行），**不做接口预留**（Decision 已记录；tree-sitter 为后续强化候选，届时在工具内替换实现）。

## Traceability

- **Created by**: `/think`（2026-08-13）
- **Prototyped by**: `/have-a-try`（2026-08-13）— PR1-0a-spike：shell-decompose 基准 44 条命令 **100% 覆盖**（33 narrow / 7 broad / 4 force-approval / 0 missed）→ **GO**（门禁 ≥80%）；`cat .env`/`cat ~/.ssh/id_rsa` 敏感命中、`echo hi; rm x` 逐子命令、`bash -c` 剥壳、eval/interpreter 转强制审批全部按设计成立
- **Debugged by**: `/debug`（2026-08-14）— 敏感文件读无合法路径的根因：敏感检查位于权限审批之后（工具层 resolveExecution），审批无法放行；跟进 #298 将读改为权限层审批事件（写保持硬拒）+ 错误信息引导
- **Grilled by**: `/grill`（2026-08-13）— 7 项决策解析（Q1 逐子命令匹配语义、Q2 敏感文件硬拒、Q3 动词分类表、Q4 SECURITY.md 扩展、Q5 spike ≥80% 门禁、Q6 Bash 描述 cache-impact 变更、Q7 旧规则不迁移）；2 术语入 CONTEXT.md；ADR-0033 已在 think 阶段建立
- **Sliced into**:
  - PR1-0a-spike — shell-decompose 覆盖率 spike — **Done**（2026-08-13，/have-a-try 100% → GO，见 `Prototyped by`）
  - #287 — 0a-parse：Bash 命令资源解析层 + 敏感文件 Bash 防护（AFK，枢纽） — **Done**（2026-08-13，见对应提交）
  - #288 — 0b-rules：approve-for-session per-prefix 规则化（AFK，blocked by #287） — **Done**（2026-08-13，见对应提交）
  - #289 — 0c-threat：威胁模型文档化（AFK，并行） — **Done**（2026-08-13，见对应提交）
  - #290 — 1a-dedup-stop：跨 step 去重 force-stop 阶梯（AFK） — **Done**（2026-08-13，见对应提交）
  - #291 — 1b-contracts：builtin 工具契约测试（AFK） — **Done**（2026-08-13，见对应提交）
  - #292 — 1c-mcp-disclosure：MCP 渐进披露（AFK） — **Done**（2026-08-13，见对应提交）
  - #293 — 2a-resource-perm：资源感知权限模型（AFK，blocked by #287） — **Done**（2026-08-13，见对应提交）
  - #294 — 2b-completion：完成语义泛化（AFK） — **Done**（2026-08-13，见对应提交）
  - #295 — 2c-output-schema：输出 schema 运行时校验（AFK） — **Done**（2026-08-13，见对应提交）
- **New terms**: 资源感知权限模型（resource-aware permission）、shell-decompose、威胁模型文档化（draft，待 `/grill` 提炼）
- **New decisions**: 不做进程内 OS 沙箱（已落 ADR-0033）；0a 解析方案 = shell-decompose 先行（D1，已记入 Decision）

## Issue

- **父 Issue**: [#286](https://github.com/ByronFinn/byf/issues/286)（计划已批准，Sliced 状态）
- 子 Issue: #287–#295（见 Traceability Sliced into）
