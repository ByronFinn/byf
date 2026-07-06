# 目标模式（Goal Mode）

目标模式让你把一个**有可验证终态**的长任务交给 agent 自主多轮推进——重构、迁移、批量修复这类天然跨多轮的任务，不再需要你每轮手动「继续」。

## 什么时候用

- 把一个明确目标拆成多步执行（例如「给 `auth` 模块加单元测试并把覆盖率提到 80%」）。
- 希望跑到模型判定完成、被阻塞、或触及预算上限为止。
- 中途可能需要暂停、查看进度、再继续。

不适合目标模式的场景：单轮能答完的问答、没有清晰终态的开放式探索——这类用普通对话即可。

## 创建目标

在空闲会话里输入：

```text
/goal 把 README 的安装步骤补全并校对所有命令
```

创建后：

- 目标进入 `active`，footer 出现 ▶ 状态徽标与用量摘要（轮数 / token / 已耗时）。
- 当前 turn 结束时，driver 自动接管，跨多轮持续推进目标。
- 每个续跑 turn 开始时，会注入一条系统提醒，复述目标与剩余预算，让模型保持一致上下文。

::: tip 提示
推进期间只允许 steer（往当前 turn 追加输入）。要发新消息必须先暂停或取消目标，避免用户消息与续跑 turn 交错。
:::

## 带预算的目标

预算给目标设一个**硬上限**，任意一个维度耗尽即停止。三个维度可任意组合，省略的维度保持无上限：

```text
/goal --max-turns 10 <目标>           # 最多跑 10 轮
/goal --max-tokens 50000 <目标>        # 最多累计 50000 input+output token
/goal --max-seconds 600 <目标>         # active 区间最多 10 分钟
/goal --max-turns 10 --max-tokens 50000 <目标>
```

- `--max-turns`：续跑轮数（含首个 turn + 每个 continuation turn）。
- `--max-tokens`：driver 每轮累加的本轮 input+output token。
- `--max-seconds`：active 区间累加的墙钟秒数，paused 期间不计。

预算耗尽时，目标自动变为 `blocked`（徽标变 ⚠），可用 `/goal resume` 继续。

## 暂停、恢复、取消

```text
/goal pause     # 软停：当前 turn 自然跑完，driver 在下一个边界停止续跑
/goal resume    # 把 paused/blocked 的目标恢复为 active
/goal cancel    # 硬停：立即中止当前 turn（等价 Esc）并清空目标
/goal status    # 在 transcript 输出一行当前快照（目标、状态、剩余预算）
```

- **暂停**是软停，不中止进行中的工具调用，保护原子性；流式输出期间也可用。
- **取消**是硬停，立即中止当前 turn——半成品工具调用状态需自行承担。
- `pause` / `cancel` / `status` 在流式输出期间始终可用。

## 替换目标

已有目标时，直接创建会报 `GOAL_ALREADY_EXISTS`。用 `replace` 原子替换（cancel 旧目标 + create 新目标）：

```text
/goal replace <新目标>
/goal replace --max-turns 5 <新目标>   # budget flag 作用于新目标
```

替换不渲染 completion 卡片——旧目标只是被丢弃，不是「完成」。

## 完成判定

只有模型判定目标达成（调用 `UpdateGoal('complete')`）时，transcript 才出现 completion 卡片，显示目标、可选原因和最终用量。`cancel` 不渲染卡片，只渲染一条低存在感 marker。

## 恢复会话后

进程重启后用 `byf --continue` 恢复同一会话：active 的目标会自动降级为 `paused`（reason：`Paused after agent resume`），用 `/goal resume` 即可继续。

## fork 会话

`/fork` 后的新会话**不含目标**——fork 总是清空目标（无徽标、无提醒）。如需在新会话继续，重新创建即可。
