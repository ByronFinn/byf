# Security Policy

## Supported Versions

Currently, BYF only provides security support for the latest released version.

## Reporting a Vulnerability

We take security seriously. **Please do not open a public issue containing vulnerability details.**

Preferred channel:

- GitHub Security Advisories — https://github.com/ByronFinn/byf/security/advisories/new
  (private disclosure, tracked with the codebase)

Repository contact:

- ByronFinn — https://github.com/ByronFinn/byf/issues
  (use this for non-sensitive follow-up questions only)

## What to Include

- Affected version (output of `byf --version`)
- Reproduction steps
- Impact assessment
- Any suggested mitigation

## Our Response

We will acknowledge your report and provide an initial assessment as soon as we can.

## Public Disclosure

We will coordinate with you on disclosure timing once a fix is ready.

## Threat Model（威胁模型）

> 本文档是 ADR-0033（不做进程内 OS 沙箱）的诚实补全：byf 的权限层是
> **UX 尽力而为，不是安全边界**。请勿把下文的任何保护机制当作安全保证。

### 定位声明

byf **不做进程内 OS 沙箱**（ADR-0033，采纳 opencode 立场——进程内做不出真边界，
隔离归用户容器/VM）。权限层（permission 规则、审批、命令解析、敏感文件拦截）的
全部价值是**减少打断、降低危害**：它拦截常见误操作，但**不提供安全保证**。

**处理不可信任务（陌生仓库、第三方脚本、提示注入来源）时，请在容器或虚拟机内
运行 byf。** 自主模式（goal / cron / AFK）下 byf 可以长时间自行执行命令，容器隔离
是这类场景唯一可靠的边界。

### Bash 可达的破坏面

Bash 是唯一能绕过所有其他原语（可读写文件、可联网、可跑代码）的工具。即使权限层
拦截了 Read/Write/Edit 的敏感路径，Bash 仍然可以：

- 读写任意路径（`cat ~/.ssh/id_rsa`、`dd if=/dev/zero of=/dev/sda`）
- 联网（`curl`、`ssh`、`rsync`，可外传数据）
- 执行任意代码（`python -c`、`node -e`、`eval`、脚本文件）

### 权限层提供什么（尽力而为）

- **敏感文件读 = 审批事件**：读取命中 `.env*` / SSH 私钥 / `credentials` 等模式的
  路径时强制审批（manual/yolo 均生效，审批面板点名文件；同路径会话内批准后免问），
  包括藏在复合命令里的（`sh -c "cat .env"`、`cd ~/.ssh && cat id_rsa`）。
- **敏感文件写硬拒**：写入敏感文件（`rm .env`、`git add .env`、`echo x > .env`）硬拒
  （`PATH_SENSITIVE`，与 Read/Write/Edit 一致）——写配置/密钥文件是代码执行与外泄载体。
- **逐子命令权限匹配**：复合命令（`; && || |`）的每个子命令独立过规则，
  `Bash(rm *)` deny 对 `echo hi; rm x` 生效，防整串匹配绕过。
- **精细会话审批**：approve-for-session 生成 per-prefix 规则
  （`Bash(git push*)`）或精确规则（`Bash(curl https://x.com)`），而非裸 `Bash`。

### 本地 HTTP 服务（`byf web` / `byf vis`）

web-server 的 `/api/*` 写请求要过四层门（顺序固定，ADR-0042）：`Host` 的主机名必须在允许
集合内（`localhost`、`127/8` 字面量、`::1`，加绑定主机本身；非回环绑定时再加本机网卡地址；
端口不参与判定）→ Content-Type 必须是 `application/json`（挡无预检的表单式简单请求）→
Origin 必须同源、无 Origin 的非浏览器调用者必须自带 `x-byf-requested-with` 标记头 → 最后
才要求 token（`Authorization: Bearer` 或 `?token=`）。`Host` 门挂在根中间件、先于其余三层
与 SPA 静态回退，所以只读路径同样受它约束。`/api/mcp/test` 另有 stdio `command` 白名单，
强制点在 `host-rpc.ts` 的收口处而不是某条 route：命令未出现在任一 scope 的已保存 MCP 配置
中即拒绝、不 spawn。这些门的作用是**证明调用者意图**（挡「别人借你的浏览器写本机」），
不是身份认证：本机进程可轻易伪造 `Host` 与标记头，也从来不在威胁模型里。

免凭证路径：未显式配置 `WEB_AUTH_TOKEN` 时（回环默认，server 每次启动自动生成一次性
token），只读 GET/HEAD 与 SPA 静态资产免凭证；显式配置 token（LAN 模式）后读写一律
要求凭证。写操作在任何模式下都要求 token。

不闭合的面（显式声明）：

- **本机端口转发等于把免凭证只读交给对端机器**。`ssh -L 4100:127.0.0.1:4100` 之后，对端
  浏览器发出的 `Host` 就是 `localhost:4100`，落在允许集合内，于是回环免 token 的读面对那
  台机器敞开。这归入「本机进程与转发等同本机信任」的既有前提，不是这一面能解决的；写仍
  需要 token。
- token 会进入启动 URL、终端回滚缓冲与浏览器历史；非回环绑定的 LAN 横幅会
  提示用后轮换 `WEB_AUTH_TOKEN`。
- 白名单只约束可执行文件名，`args` / `env` / `cwd` 不约束：已保存配置里存在 `node`、
  `python`、`sh` 时，配任意 `args` 依旧是本机代码执行。收紧到 `args` 需要先改 PRD-0038
  的 AC-1.3（它明确要求保住"保存前测试"这条旅程）。
- 反向代理与自定义主机名（mDNS、`/etc/hosts` 条目）会被 `Host` 门**拒绝**——这是功能代价
  而非绕过口；解法是把服务绑到那个名字上，或改用横幅里的 IP URL。

与上文同一纪律：这几层门**不是安全边界**（ADR-0033），「本地服务有鉴权门」不等于
「可以处理不受信任务」——不受信任务请连同 web 面一起放进容器 / VM。

### 已知绕过面（显式声明，不隐藏）

以下情况权限层**无法静态拦截**，属于「UX 尽力而为」的固有边界：

- **变量展开**：`cat $HOME/.env`、`$VAR` 拼接的命令无法静态解析（命令解析层看不到
  运行时展开后的值）。
- **解释器内层代码**：`python -c "os.system('rm -rf /')"`、`node -e "..."` 的内层
  命令对解析器不可见——此类调用按设计转强制审批，但审批通过后无法再拦截。
- **间接执行**：`eval`、`source`、`xargs`、`bash script.sh` 等转强制审批，但审批
  通过后的行为不可静态分析。
- **glob 通配**：`rm *.env` 等无法静态展开到具体文件，敏感检查跳过。
- **heredoc / 进程替换**：`cat <<EOF`、`cat <(cmd)` 无法静态解析，转强制审批。
- **新型混淆**：命令解析是尽力而为的非语法级启发式，总存在「下一个未被枚举的
  绕过」。

**结论**：以上边界不是缺陷，而是「不做沙箱」决策的组成部分（ADR-0033）。
如需真正的隔离，请把 byf 放进容器 / VM 运行。

### 与「沙箱」相关的表述纪律

任何「byf 有沙箱保护」「权限层是安全边界」的论述均为错误。本文件与 ADR-0033
明确否定该说法；发现此类表述请修正为本文档的定位。

### 与「可回滚」相关的表述纪律

任何「事件日志可重放 ⇒ 工具副作用可回滚」「恢复会撤销崩溃前的改动」「存在文件级事务回滚」的论述均为错误（与上面的沙箱表述纪律同源：诚实声明边界，不承诺没有的能力）。恢复（resume / restore）重放的是事件日志，它只重建对话上下文，并不会重放、也不会撤销已经发生的工具调用副作用：本机文件可能停在半改动状态，远端效果（发消息、下单、改远端状态）可能已经发生且不可逆。工具的重放分类（只读 / 本机副作用 / 远程不可逆）是产品契约的一部分，定义在 SDK 契约层（`TOOL_REPLAY_SAFETY_CLASSES`，PRD-0038 AC-3.4）；不可重放档的悬空工具调用在恢复时以一条合成观察收尾——合成观察只是把这条边界说给模型，不代表任何回滚能力。
