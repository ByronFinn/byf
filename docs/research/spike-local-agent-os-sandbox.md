# Spike：本地编码 agent OS 沙箱四项对比 + byf 决策（不做沙箱）

> **关联**：路线图 `docs/roadmap/tool-system-evolution.md`（原 Tier 0c）｜分析报告 `agent-tools-design-report.md` §8.3 #1
> **调查日**：2026-08-13 ｜ **方法**：4 路并行源码级取证（codex / Claude Code / grok-build / opencode）
> **结论**：**byf 不做进程内 OS 沙箱，采用 opencode 立场——隔离是用户容器/VM 的责任。** 原路线图 Tier 0c 删除。

## TL;DR

四个项目收敛到同一组 OS 原语（macOS `sandbox-exec`/seatbelt、Linux `bwrap`/bubblewrap），差异在架构（exec-server / 包裹命令字符串 / 进程内 apply）与封多深（seccomp/Landlock/MITM 网络代理）。但对 byf（TS/Bun, macOS+Linux）而言，**可移植的只有两个 CLI 原语，seccomp/Landlock 全部需要 native addon**——工程量与维护成本远超收益。更关键的是 opencode 用一套**自洽的哲学**证明了「不做沙箱」是可辩护的产品选择：**承认进程内做不出真边界，把隔离整个外置给容器，权限层只做 UX 尽力而为，并用受限解释器（codemode）为纯工具编排提供不需要 bash 的路径。** byf 采纳此立场，把沙箱从路线图移除，转而把 0a/0b（权限层资源感知）定位为「唯一防线 + 诚实声明其非安全边界」，并补充威胁模型文档化。

## Question

byf（TS/Bun 编码 agent，macOS+Linux）是否应自建 OS 沙箱？若建，应参考 codex / Claude Code / grok-build / opencode 中哪一个？

## Approach

1. 4 路并行探索代理，每路深挖一个项目的沙箱源码，覆盖：平台覆盖、隔离机制、网络/文件策略、架构（进程内 vs exec-server）、fail-closed 行为、代码量、TS/Bun 可移植性。
2. 复核分析报告对四项目的既有定性（报告称 grok-build「弱 bwrap」、opencode「无沙箱」）——结论：grok-build 定性**错误**（实为 nono 库的 Landlock+Seatbelt 能力集模型），opencode「无沙箱」**确认无误且是成文政策**。
3. 追加调查 opencode V2 的整体设计逻辑，验证「不做沙箱」是否构成自洽哲学（而非半成品）。

## Findings

### 1. 四项沙箱对比矩阵

| 维度 | codex | Claude Code | grok-build | opencode |
|---|---|---|---|---|
| **有真沙箱?** | ✅ 最完备 | ✅ 真沙箱（核心代码在外部 npm 包） | ✅ 真·内核沙箱（报告定性错） | ❌ **无**（成文政策） |
| **平台** | macOS+Linux+Windows | macOS+Linux+WSL2 | macOS+Linux | — |
| **机制** | seatbelt / bwrap+seccomp+Landlock / 受限令牌+WFP | seatbelt / bwrap+seccomp+socat | nono 库：Landlock(Linux)+Seatbelt(macOS) | — |
| **架构** | **独立 exec-server**（每命令 RPC 进程 + fs 操作在沙箱 helper 内） | **包裹命令字符串**（`wrapWithSandbox(cmd)→string`，`spawn('/bin/sh','-c')`） | **进程内一次 apply**（nono） | — |
| **FS 模型** | deny-by-default 可写根 | 工作区=可写根 + 额外目录 | 能力集（default_read/RO/RW/deny/write_deny）+ TOML | — |
| **网络** | **MITM 代理**（TLS 拦截+CA，按域名） | localhost 代理 + 域名 allowlist + 交互式 per-host 询问 | 子进程 seccomp 全封（Linux）/ macOS **空 stub** | — |
| **Linux seccomp** | ✅ 网络+ptrace+namespace 锁 | ✅ 封 unix socket | ✅ 网络+namespace 逃逸锁 | — |
| **fail-closed** | 混合（exec-server fail-closed；bwrap 缺失回退捆绑二进制） | **默认 fail-open**，fail-closed opt-in | workspace/strict **fail-closed**（exit 1）；devbox/off fail-open | — |
| **代码量** | ~80k 行，深耦合 | ~1k adapter（核心在私有包 `@anthropic-ai/sandbox-runtime`） | ~5.3k 行，可分离 crate | 0 |

### 2. 报告定性校准

- **grok-build「弱 bwrap」——错误。** 实为 `nono` 库（`crates/codegen/xai-grok-sandbox`，~5.3k 行）的 Landlock+Seatbelt 能力集模型，含 `strict` 真 allowlist profile、namespace 逃逸 seccomp 锁、fail-closed 门禁（`xai-grok-shell/src/config/mod.rs:1534-1575`）。bwrap 只是 Linux 读-deny 子路径的辅助。**不是 codex 的移植**——两者共享内核原语但不共享代码。
- **opencode「无沙箱」——确认无误且成文。** `SECURITY.md`：「OpenCode does **not** sandbox the agent……如需隔离，自己在 Docker/VM 里跑。」全仓 `seatbelt|bwrap|landlock|seccomp` 零生产代码命中。

### 3. 对 byf（TS/Bun）的可移植性裁决

| 组件 | 可移植到 TS/Bun? | 说明 |
|---|---|---|
| macOS seatbelt | ✅ 易 | 纯字符串拼装 + `spawn('/usr/bin/sandbox-exec',['-p',profile,...])` |
| Linux bwrap (FS) | ✅ 基本可 | 同为 CLI 子进程（bind mount 参数） |
| Linux seccomp/Landlock | ❌ | 需 `seccomp`/`landlock_*` syscall，Bun 无内置绑定，需 native addon 或 helper 二进制 |
| 网络代理（MITM/域名） | ⚠️ 大 | codex 的 MITM ~17k 行；可降级为 SOCKS5/CONNECT 域名门控但仍重 |
| Windows | ❌（且不在 byf 平台范围） | 受限令牌+WFP，native only |

**结论**：即便做，可移植的只是 seatbelt+bwrap 两个 CLI 原语（纯 FS 隔离），seccomp/Landlock 硬化全部要 native addon。Claude Code 的 `@anthropic-ai/sandbox-runtime` 可 vendor，但绑定 `experimental` 外部包、不可控。

### 4. opencode「不做沙箱」是否自洽？（追加调查）

**自洽。** opencode V2 的三个反直觉决定构成同一哲学：

- **砍 tree-sitter**：不是哲学，是**依赖卫生欠债**——V2 的 `core` 同时是运行时 + V1 共享基建，分层规矩禁止 WASM/native（`CONTEXT.md:209`），故 tree-sitter 进不来（`packages/core/src/tool/bash.ts:62-77` 显式 TODO）。
- **加 codemode（JS 子集解释器）**：这是「不做沙箱」的**补集**。Bash 无法安全隔离 → 给全宿主权限 + 审批提示；但纯工具编排（调 MCP 工具、分支、并行、整形 JSON）不需要宿主权限 → 提供真·零 ambient 权限的受限执行路径。`README`：「A program cannot gain authority through prose or generated code.」
- **不做沙箱**：成文政策，权限层明确定性为「UX 特性，非安全边界」。

哲学内核：**不为 bash 假装安全（给全权限+提示），但为纯编排提供真·受限路径（解释器级零权限），真隔离外包给容器。**

## Verdict & Rationale

**byf 不做进程内 OS 沙箱，采用 opencode 立场。** 理由：

1. **工程经济性**：可移植的仅 seatbelt+bwrap 两 CLI 原语（纯 FS 隔离），seccomp/Landlock/网络代理全需 native addon 或重型实现。byf 是 TS/Bun 单二进制分发，引入 native helper 违背「零运行时预装」分发契约，维护成本高。
2. **哲学一致性**：opencode 已证明「不做沙箱 + 诚实声明 + 用户容器兜底」是可辩护的产品定位。进程内沙箱（黑名单+seatbelt/bwrap）本质仍是「下一个未被枚举的绕过永远存在」，与纯规则匹配一样不是真边界——只有容器/VM 才是。
3. **byf 已有自主模式（goal/cron/AFK）**：这些不依赖沙箱也能成立，前提是**诚实文档化**——byf 应像 opencode 一样声明权限层非安全边界，AFK 模式建议在容器内运行。

**对路线图的影响**（见 `docs/roadmap/tool-system-evolution.md` 更新）：
- Tier 0c（OS 沙箱）**删除**。
- Tier 0 收缩为 0a（Bash 资源解析）+ 0b（approve-for-session 规则化），重新定位为**唯一防线 + 明确其为 UX 尽力而为、非安全边界**。
- 新增「威胁模型文档化」要求：byf 需要一份 opencode SECURITY.md 式的威胁模型声明。

**可借鉴的非沙箱资产**：
- **codemode 思路**（受限解释器为纯工具编排提供零权限路径）：与沙箱正交，作为 byf 潜在 Tier 2 方向（「减少对 bash 的编排依赖」）记录，不在当前推进范围。

## Boundary Conditions

- 本结论限定 byf TS 主版本（macOS+Linux，Windows 非官方平台）。
- 若未来 byf 转型为「云端托管、多租户」形态，进程内沙箱的必要性需重评（届时容器/VM 由平台提供，结论仍可能不变）。
- 「不做沙箱」成立的前提是**威胁模型文档化 + AFK 模式容器建议**——若 byf 不补这两项，则决策不完整（会让用户误以为权限层是安全边界）。
- codex/Claude Code/grok-build 的源码结论基于 2026-08-13 `agents/` 目录快照。

## Sources

**Tier 1（项目官方源码，本地路径）**

- codex 沙箱：`/Users/baifan/Projects/ByronFinn/agents/codex/codex-rs/sandboxing/src/{manager,seatbelt,bwrap,landlock,denial}.rs`、`linux-sandbox/src/bwrap.rs`、`exec-server/src/{server,process_sandbox,fs_sandbox}.rs`、`network-proxy/src/{network_policy,connect_policy}.rs`
- Claude Code 沙箱 adapter：`/Users/baifan/Projects/ByronFinn/agents/Claude-code/src/utils/sandbox/sandbox-adapter.ts`、`src/utils/Shell.ts:209-345`、`src/entrypoints/sandboxTypes.ts`、`src/components/sandbox/SandboxDependenciesTab.tsx`（核心 OS 代码在外部包 `@anthropic-ai/sandbox-runtime`，仓库内不可读）
- grok-build 沙箱：`/Users/baifan/Projects/ByronFinn/agents/grok-build/crates/codegen/xai-grok-sandbox/src/{lib,profiles,deny/glob,child_net,network_policy}.rs`、`crates/codegen/xai-grok-shell/src/config/mod.rs:1534-1575`
- opencode 立场：`/Users/baifan/Projects/ByronFinn/agents/opencode/SECURITY.md`（"No Sandbox" / Out of Scope）、`packages/core/src/tool/bash.ts:62-149`、`packages/opencode/src/tool/shell.ts`（V1 tree-sitter）、`packages/codemode/README.md`（codemode 哲学）、`packages/opencode/src/tool/code-mode.ts`（execute 工具）

**Tier 2（分析报告，作交叉验证）**

- `agent-tools-design-report.md` §4.6/§4.7/§4.4/§4.11（codex/grok-build/Claude Code/opencode 逐案分析）、§5.1 矩阵、§9.2 趋势（其中 grok-build「弱 bwrap」定性已被本 spike 推翻）
