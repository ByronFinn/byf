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
