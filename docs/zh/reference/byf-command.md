# byf 命令

`byf` 是 BYF 的主命令，用于在终端中启动一次交互式会话。不带任何参数运行时，它会在当前工作目录下开启一个新会话；配合不同的 flag，可以续上历史会话、跳过审批，或者指定自定义的 Skills 目录。

```sh
byf [options]
byf <subcommand> [options]
```

## 主命令选项

下表列出 `byf` 主命令支持的全部选项。所有 flag 都是可选的，直接运行 `byf` 即可进入交互式会话。

| 选项                       | 简写 | 说明                                                                                                                                                                   |
| -------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--version`                | `-V` | 打印版本号并退出。                                                                                                                                                     |
| `--help`                   | `-h` | 显示帮助信息并退出。                                                                                                                                                   |
| `--session [id]`           | `-S` | 恢复一个会话。带 ID 时直接打开指定会话；不带 ID 时进入交互式选择器，从历史会话中挑选。                                                                                 |
| `--continue`               | `-C` | 继续当前工作目录下最近一次的会话，无需手动指定 ID。                                                                                                                    |
| `--model <model>`          | `-m` | 为本次启动指定模型别名。省略时，新会话使用配置文件中的 `default_model`，恢复会话使用会话当前模型。                                                                     |
| `--prompt <prompt>`        | `-p` | 非交互执行单次 prompt，并把 Assistant 输出流式写到 stdout。该模式会使用 `auto` 权限处理工具调用，不会打开 TUI。退出条件与 headless goal 见 [非交互执行](#非交互执行)。 |
| `--output-format <format>` |      | 设置非交互输出格式，支持 `text` 与 `stream-json`。仅可与 `--prompt` 一起使用，默认 `text`。                                                                            |
| `--add-dir <dir>`          |      | 追加额外工作区根目录（Read/Grep/Glob/Write/Edit 等路径策略允许访问）。可重复传入；相对路径相对当前工作目录解析。项目 `.byf/local.toml` 中的配置也会自动加载。          |
| `--yolo`                   | `-y` | 自动批准普通工具调用，跳过审批请求。                                                                                                                                   |
| `--skills-dir <dir>`       |      | 从指定目录加载 Skills，替换自动发现的用户和项目目录。可重复传入以叠加多个目录。详见下文 [自定义 Skills 目录](#自定义-skills-目录)。                                    |

`-r` / `--resume` 是 `--session` 的隐藏别名；`--yes` 和 `--auto-approve` 是 `--yolo` 的隐藏别名。它们在帮助信息中不会显示，行为与对应的官方 flag 完全一致。

::: warning 注意
`--yolo` 会跳过普通工具调用的人工确认，包括文件写入和 Shell 命令执行。请只在受信任的工作目录下使用。
:::

### flag 冲突规则

以下组合会在启动时被拒绝：

- `--continue` 与 `--session` 互斥：两者都表示"恢复历史会话"，含义重叠。
- `--yolo` 不能与 `--continue` 或 `--session` 同时使用：恢复会话时会沿用原会话的审批设置。此规则仅适用于交互式模式；在 `--prompt` 模式下，`--yolo` 已因与 `--prompt` 互斥而被更早拦截。
- `--prompt` 不能与 `--yolo` 同时使用：非交互模式固定使用 `auto` 权限。
- `--prompt` 可以与 `--continue` 或带 ID 的 `--session <id>` 一起使用；不带 ID 的 `--session` 会尝试打开选择器，因此不能用于非交互模式。
- `--output-format` 只能与 `--prompt` 一起使用；交互式 TUI 不支持把完整事件流写成 stdout JSONL。

如果需要在恢复会话时强制使用 YOLO 模式，请改在交互式会话内通过斜杠命令切换。

## 典型用法

最常见的入口是直接运行 `byf`，在当前目录开启一次全新的会话：

```sh
byf
```

如果上一次会话被打断（关闭终端、网络断开等），想从断点继续，使用 `--continue`：

```sh
byf --continue
```

它会自动找到当前工作目录下时间最近的那个会话并恢复。若想挑选其他历史会话，运行 `byf --session` 进入交互式选择器，或者直接传入已知的 session ID：

```sh
byf --session 01HZ...XYZ
```

当任务比较琐碎，不希望被频繁的审批请求打断时，可以加上 `--yolo`：

```sh
byf --yolo
```

希望让 AI 先阅读代码、产出实现计划，而不是立刻动手修改文件时，直接告诉它先做调研再做实现即可：

```
先帮我梳理这个仓库的整体架构，然后提出一个实现计划。
```

### 自定义 Skills 目录

如果需要加载自定义的 Skills 目录，可以通过两种方式指定：

- **CLI flag `--skills-dir <dir>`**：可重复传入，会**替换**自动发现的用户和项目目录，适合临时切换或在脚本中使用。例如同时挂载两个目录：

  ```sh
  byf --skills-dir /path/to/team-skills --skills-dir ./local-skills
  ```

- **`config.toml` 的 `extra_skill_dirs`**：在配置文件中追加额外目录，与自动发现的目录**叠加**生效，适合长期配置团队共享 Skills（详见 [Agent Skills](../customization/skills.md)）。

## 非交互执行

需要在脚本或 CI 中运行单次 prompt 时，使用 `-p`：

```sh
byf -p "Summarize the current repository status"
```

输出采用 transcript 样式：thinking 内容和 Assistant 正文都会以 `• ` 开头，换行后使用两个空格缩进。Assistant 正文会输出到 stdout；thinking、工具进度和 `To resume this session: byf -r <id>` 提示输出到 stderr。`-p` 模式不会请求人工审批，普通工具调用、Plan 审批和 Agent 提问都会按 `auto` 权限策略处理。静态 deny 规则仍然会阻止匹配的工具调用。

### `-p` 何时退出

print 模式**不会**在第一次 `turn.ended` 就立刻退出。进程会一直保持，直到同时满足：

1. 主 agent 没有仍为 **active** 的自主目标（或目标已进入终态）；
2. 会话内没有带未来 `nextFireAt` 的 Cron 任务；
3. 后台任务已结束，或已达到 print 等待上限（默认 **3600** 秒，配置项 `printWaitCeilingS` / 环境变量 `BYF_PRINT_WAIT_CEILING_S`）。若超时后仍有活跃后台任务，进程以**非 0** 退出，且不会主动 kill 任务。

::: warning 周期性 Cron 会让 `-p` 一直不退出
若模型在 `-p` 运行期间创建了**周期性**（或其它仍有未来 fire）的会话内 Cron 任务，进程会**无限保持 event loop**，直到这些任务都没有未来 fire，或被外部 kill。脚本 / CI 中请优先使用 one-shot Cron，或避免在 `-p` 里创建 Cron。
:::

### Headless goal 模式

不打开 TUI 也可以创建并跑完 goal：

```sh
byf -p "/goal 修掉 packages/agent-core 里所有 lint 报错"
```

只有 `/goal` 的 **create** 形态会走 headless 专用路径。malformed create（例如 `/goal replace` 后目标为空）会在调用模型**之前**失败并以非 0 退出。其它子命令（`status`、`pause` 等）不走 create 路径，会当作普通 prompt。

goal 终态后的进程退出码：

| Goal 状态  | 退出码 |
| ---------- | ------ |
| `complete` | `0`    |
| `blocked`  | `3`    |
| `paused`   | `6`    |

`--output-format stream-json` 时会在 stdout 写出 `goal.summary` JSON；text 模式则在 stderr 打印一行摘要。

### 额外工作区根目录

允许工具访问会话工作目录以外的路径时：

```sh
byf --add-dir ../shared --add-dir /tmp/fixtures -p "比较两棵目录树"
```

`--add-dir` 可重复。交互会话里也可用 [`/add-dir`](./slash-commands.md#工作区根目录)。项目级记忆写在 `.byf/local.toml` 的 `workspace.additional_dir`；若路径因机器而异，建议把该文件加入 `.gitignore`。

需要临时切换模型时，加上 `-m`：

```sh
byf -m byf/byf-default -p "Explain the latest diff"
```

如果脚本需要结构化读取输出，可以使用 JSONL：

```sh
byf -p "List changed files" --output-format stream-json
```

`stream-json` 模式下，stdout 每行都是一个 JSON 对象。普通回复会输出 Assistant 消息；如果模型调用工具，会先输出带 `tool_calls` 的 Assistant 消息，再输出对应的 Tool 消息，最后继续输出后续 Assistant 消息。thinking 内容不会写入 JSONL；工具进度和恢复会话提示仍然写到 stderr。

## 子命令

### `byf export`

把一个会话打包成 ZIP 文件，便于分享、归档或者提交问题反馈。导出的压缩包包含会话目录下的所有文件，例如上下文记录、状态文件和会话诊断日志（如果该会话已经产生 `logs/byf.log`）。

```sh
byf export [sessionId] [options]
```

| 参数 / 选项               | 简写 | 说明                                                                        |
| ------------------------- | ---- | --------------------------------------------------------------------------- |
| `sessionId`               |      | 要导出的会话 ID。省略时会自动选择当前工作目录下最近一次的会话，并要求确认。 |
| `--output <path>`         | `-o` | 输出 ZIP 文件路径。省略时写入当前目录下的默认文件名。                       |
| `--yes`                   | `-y` | 跳过默认会话的确认提示，直接导出。                                          |
| `--no-include-global-log` |      | 不打包当前活动的全局诊断日志，即 `~/.byf/logs/byf.log`。默认包含。          |

默认导出包含目标会话目录内的文件；如果会话目录里有 `logs/byf.log`，会一并出现在 ZIP 的 `logs/byf.log`。全局诊断日志 `~/.byf/logs/byf.log` 默认也会打包，因为它可能包含其它会话或其它项目的事件，如果不想分享可以加 `--no-include-global-log`。加上后，ZIP 内路径是 `logs/global/byf.log`，不会包含轮转出来的 `byf.log.1` 等旧文件。

省略 `sessionId` 时，命令会先打印待导出的会话信息并请求确认；用 `-y` 可以跳过确认，适合在脚本里使用：

```sh
# 导出当前工作目录最近一次会话，跳过确认
byf export -y

# 导出指定会话到自定义路径
byf export 01HZ...XYZ -o ./bug-report.zip

# 排除全局诊断日志，避免分享其它会话的事件
byf export 01HZ...XYZ -o ./bug-report.zip --no-include-global-log
```
