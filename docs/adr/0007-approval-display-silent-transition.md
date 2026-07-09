# ADR 0007: 静默审批过渡 — 无独立审批通知

## 状态

已接受

## 背景

当用户批准或拒绝工具执行（如 Bash 命令）时，TUI 当前会发出独立的 transcript 通知：

```
Approved: run command
```

这个通知有三个问题：

1. **信息贫乏。** `action` 字段是一个粗略的标签（"run command"），设计用于针对会话的匹配，不用于展示。实际命令文本未显示。
2. **冗余。** ToolCall 组件已经渲染了 `• Using Bash (command)` → `• Used Bash (command)` 带结果输出。审批通知夹在这两个状态之间，没有任何添加。
3. **视觉上薄弱。** 单行 `NoticeMessageComponent`，无图标，批准/拒绝/取消之间无颜色区分。

对 OpenAI Codex CLI 的研究显示它渲染了丰富的独立审批通知（"✔ You approved codex to run `<command>` this time"）。Claude Code 采用相反的方式：没有独立通知——ToolCall 组件从进行中静默过渡到完成/拒绝。

## 决策

遵循 Claude Code 模式：**完全移除独立的审批通知。** ToolCall 组件已经拥有表达所有结果的数据和视觉机制：

- **批准：** `• Using Bash (command)` → `• Used Bash (command) · 12 lines` + 输出内容
- **拒绝：** `✗ Rejected Bash (command)`（无内容——用户选择了这个）
- **取消：** `✗ Cancelled Bash (command)`（无内容）
- **执行失败：** `✗ Used Bash (command) · exit 1, 5 lines` + 错误输出

为了区分"审批被拒"和"执行失败"而不对 `output` 文本做字符串匹配，我们在工具结果管道中添加结构化的 `blockedReason?: 'rejected' | 'cancelled'` 字段：

```
PermissionManager (block: true, decision)
  → ExecutableToolErrorResult.blockedReason
    → ToolResultEvent.blockedReason
      → ToolResultBlockData.blockedReason
        → ToolCallComponent (header verb: Rejected / Cancelled)
```

### Bash chip

为 Bash 工具添加 chip 渲染器，显示输出行数（成功）或退出码 + 行数（失败）：

- 成功：`· 12 lines`
- 失败：`· exit 1, 5 lines`

退出码通过正则表达式从结果输出文本中提取（由 Bash 工具嵌入，非结构化形式）。这可以接受，因为 chip 是装饰性细节，不是控制信号。

### 重放路径

重放路径也会发出 approval_result 通知。这些也被移除——重放有匹配的 tool_call + tool_result 记录，通过 ToolCallComponent 渲染相同的信息。

## 结果

- **正面：** 视觉噪声更少。对话流更紧凑：命令 → 执行 → 结果，中间不插入重复 ToolCall 已显示信息的通知。
- **正面：** 结构化的 `blockedReason` 字段对权限层的文本变更具有鲁棒性。无需脆弱的字符串匹配。
- **负面：** 在工具调用密集的会话中，移除审批通知使扫描 transcript 寻找"我在哪里批准/拒绝了什么"稍显困难。ToolCall 头部中的 `Rejected`/`Cancelled` 动词部分弥补了这一点。
- **负面：** `blockedReason` 跨越 agent-core → SDK → CLI 边界。这是一个可选字段，默认 `undefined`，因此现有消费者不受影响。
