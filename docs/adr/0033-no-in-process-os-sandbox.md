# 0033 - 不做进程内 OS 沙箱（采纳 opencode 立场）

Date: 2026-08-13

## 状态

Accepted。

逆转《Agent 工具系统设计深度分析报告》（`agent-tools-design-report.md`）§8.3 的 #1 建议（「补上 Bash 语法级分析 + 沙箱」中的沙箱部分）与该报告 §9.1 的共识（「沙箱是不可外包的底线」）。Bash 语法级分析（路线图 0a）仍推进，本 ADR 仅排除进程内 OS 沙箱。

## 背景

byf 的 Bash 是公理 B（可授权性）的当前破口（见路线图 `docs/roadmap/tool-system-evolution.md` §1.3）：零命令分析、纯 picomatch 字符串匹配、敏感文件防护被 Bash 绕过、approve-for-session 记录裸 `Bash` 规则。分析报告据此把「OS 沙箱」列为 #1 最高优先级建议。

为判断是否自建沙箱、参考哪个实现，对四个候选做了源码级对比（research `spike-local-agent-os-sandbox`）：

- **codex**：最完备（seatbelt/bwrap/seccomp/Landlock + Windows 受限令牌/WFP + 独立 exec-server + MITM 网络代理），~80k 行、深耦合。
- **Claude Code**：真沙箱，但核心 OS 代码在私有 npm 包 `@anthropic-ai/sandbox-runtime`（仓库内只有 ~1k 行 adapter）；架构是「包裹命令字符串 + `spawn('/bin/sh','-c')`」。
- **grok-build**：报告「弱 bwrap」定性**错误**——实为 `nono` 库的 Landlock+Seatbelt 能力集模型，~5.3k 行、fail-closed。
- **opencode**：**无沙箱**，且是成文政策（`SECURITY.md`：「OpenCode does not sandbox the agent……如需隔离，自己在 Docker/VM 里跑」）。

四项收敛到同一组 OS 原语（macOS `sandbox-exec`/seatbelt、Linux `bwrap`/bubblewrap），但可移植性裁决是决定性的：

| 组件                                       | 可移植到 TS/Bun?                      |
| ------------------------------------------ | ------------------------------------- |
| macOS seatbelt / Linux bwrap（纯 FS 隔离） | ✅（CLI 子进程）                      |
| Linux seccomp / Landlock（syscall 硬化）   | ❌（需 native addon / helper 二进制） |
| 网络代理（MITM / 域名门控）                | ⚠️ 重（codex MITM ~17k 行）           |

且 opencode 用一套**自洽哲学**证明了「不做沙箱」可辩护：承认进程内做不出真边界 → 隔离整个外置给容器 → 权限层只做 UX 尽力而为 → 用受限解释器（codemode）为纯工具编排提供不需要 bash 的路径。

## 决策

**byf 不做进程内 OS 沙箱，采纳 opencode 立场——隔离是用户容器/VM 的责任。** 权限层（含 0a 命令解析、0b 规则化）明确定性为 **UX 尽力而为、非安全边界**。

具体：

1. **删除路线图原 Tier 0c（OS 沙箱）**。
2. **Tier 0c 替换为「威胁模型文档化 + 容器建议」**——不做沙箱的诚实补全：byf 需一份 opencode `SECURITY.md` 式声明，明确权限层非安全边界、列出 Bash 可达破坏面、建议处理不可信任务时在容器内运行。
3. **0a/0b 成为无沙箱兜底下的唯一防线**，但定位为「降低 Bash 危害 + 减少打断」的 UX 层，不承诺安全保证。
4. 自主模式（goal/cron/AFK）的安全由**用户容器**保障；byf 可选地在非容器环境下进入 AFK 时给一次提示（增强项，不阻塞）。

## 理由

按权重排序：

1. **工程经济性**：可移植到 TS/Bun 的只有 seatbelt + bwrap 两个 CLI 原语（纯 FS 隔离），seccomp/Landlock/网络代理全部需要 native addon 或重型实现。byf 是 `bun compile` 单二进制分发（CLI 分发契约：零运行时预装），引入 native helper 违背该契约，维护成本远超收益。即便 vendor `@anthropic-ai/sandbox-runtime`，也绑定一个 `experimental` 外部包、不可控。

2. **哲学一致性**：进程内沙箱（黑名单 + seatbelt/bwrap）本质仍是「下一个未被枚举的绕过永远存在」——与纯规则匹配一样不是真边界。只有容器/VM 才是真隔离边界。与其在进程内做一个会被误解为安全边界的「半沙箱」（pi 的立场：「半沙箱易被误解为安全边界」），不如诚实外置。

3. **opencode 已验证可行性**：一个已发布、用户基数可观的产品，靠「无沙箱 + 成文威胁模型 + 用户容器」运行良好。这证明该立场不是妥协，而是可辩护的产品定位。

4. **byf 的自主模式不依赖沙箱**：goal/cron/AFK 的「挂着跑」能力成立的前提是「用户在可信环境或容器内运行」，而非「byf 自己隔离」。这与 opencode 一致。

## 后果

**正面**：

- 省去 ~数月级的沙箱工程（跨平台、seccomp helper、网络代理、fail-closed 灰度），聚焦 0a/0b 等高 ROI 项。
- 分发管线不变（无需 native addon / 平台特定 helper 二进制）。
- 权限层定位诚实，不制造「假安全」错觉。

**负面 / 风险**：

- 公理 B（每个行动原语都能被可靠拦截）**不被完全闭合**——byf 依赖用户在容器内运行来获得真隔离。若用户在宿主机裸跑 + 处理不可信任务，Bash 危害面完整暴露（读写任意路径、联网、跑代码）。
- 0a/0b 成为唯一防线，其**有效性与模型配合度相关**（命令解析是尽力而为，新混淆可绕），不能等同于安全保证。
- 需要配套 0c（威胁模型文档化），否则用户会误以为权限层是安全边界。

**约束**：

- 任何后续「我们已经有沙箱保护」的论述均为错误——本文档与路线图明确否定。
- 若未来 byf 转型为「云端托管、多租户」形态，需重评（届时容器/VM 由平台提供，结论仍可能不变，但需重新论证）。

## 参考

- research：`docs/research/spike-local-agent-os-sandbox.md`（四项沙箱源码对比 + 可移植性裁决 + opencode 哲学验证）
- 路线图：`docs/roadmap/tool-system-evolution.md`（§1.3 Bash 破口、§3 Tier 0、§4 显式不做）
- 分析报告：`agent-tools-design-report.md` §8.3 #1（被本 ADR 逆转的建议）、§9.1（被逆转的共识）、§9.2.4（可信执行环境下沉趋势）
- 外部参考：opencode `SECURITY.md`（无沙箱立场成文）、pi `docs/security.md`（「半沙箱易被误解为安全边界」）
