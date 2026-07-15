# 环境变量

BYF 通过环境变量来覆盖默认路径、切换 OAuth 端点以及调整运行时行为。大部分变量在 `byf` 进程启动时读取，少数（如遥测开关、OAuth 锁、诊断日志）在相关子系统初始化时读取。BYF 自有变量使用 `BYF_*` 前缀；此外，CLI 也会读取若干系统标准变量。

::: warning 注意
**供应商凭证不在此列**：`BYF_API_KEY`、`ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、`GOOGLE_API_KEY` 等密钥变量**不会**从 `process.env` 自动读取。它们必须写在 `config.toml` 的 `[providers.<name>]` 段（`api_key` / `base_url`）或 `[providers.<name>.env]` 子表中；仅在 shell 中 `export` 不会让某个供应商自动获得凭证。详见 [配置覆盖](./overrides.md#供应商凭证) 与 [供应商](./providers.md)。
:::

## 核心路径

`BYF_HOME` 用于覆盖 BYF 的数据根目录，默认值是 `~/.byf`。CLI 自身的应用数据、`byf-core` 的配置、ripgrep 缓存以及 OAuth 凭证都会落在这个目录下。

```sh
export BYF_HOME="/path/to/custom/byf"
```

数据布局的详细说明请参阅 [数据路径](./data-locations.md)。

::: warning 注意
设置后请确保目录可写。多个 `byf` 实例如果共享同一个 `BYF_HOME`，会共享配置与凭证文件。
:::

## 供应商凭证键名

下列键名出现在 `config.toml` 的 `[providers.<name>.env]` 子表中，用作供应商 `api_key` / `base_url` 的回退来源。**`byf` 主进程不会从 `process.env` 直接读取它们**；只有 `[providers.<name>.env]` 子表内对应键的值才会被供应商客户端识别。详细解析顺序见 [配置覆盖：供应商凭证](./overrides.md#供应商凭证)。

| 键名                    | 适用供应商                                                | 用途                      | 默认值                       |
| ----------------------- | --------------------------------------------------------- | ------------------------- | ---------------------------- |
| `BYF_API_KEY`           | BYF                                                       | API 密钥                  | 无                           |
| `BYF_BASE_URL`          | BYF                                                       | API 基础 URL              | `https://api.example.com/v1` |
| `ANTHROPIC_API_KEY`     | Anthropic                                                 | API 密钥                  | 无                           |
| `ANTHROPIC_BASE_URL`    | Anthropic                                                 | API 基础 URL              | 跟随 Anthropic SDK 默认值    |
| `OPENAI_API_KEY`        | OpenAI（`openai` 与 `openai_responses` 均使用）           | API 密钥                  | 无                           |
| `OPENAI_BASE_URL`       | OpenAI（`openai` 与 `openai_responses` 均使用）           | API 基础 URL              | `https://api.openai.com/v1`  |
| `GOOGLE_API_KEY`        | Google GenAI、Vertex AI（作为 `VERTEXAI_API_KEY` 的备用） | API 密钥                  | 无                           |
| `VERTEXAI_API_KEY`      | Vertex AI                                                 | API 密钥（未使用 ADC 时） | 无                           |
| `GOOGLE_CLOUD_PROJECT`  | Vertex AI                                                 | GCP 项目 ID               | 无                           |
| `GOOGLE_CLOUD_LOCATION` | Vertex AI                                                 | GCP 区域                  | 无                           |

例如在 `config.toml` 中预置 BYF 凭证：

```toml
[providers.byf.env]
BYF_API_KEY = "sk-xxx"
BYF_BASE_URL = "https://api.example.com/v1"
```

::: warning 注意
`GOOGLE_APPLICATION_CREDENTIALS`（服务账号 JSON 路径）由 Google SDK 自身从终端环境变量中读取，是这组键名中**唯一**走系统环境变量的；它走的是 Google Cloud 标准的 ADC 流程，CLI 不参与解析。其它键名都需要写在 `[providers.<name>.env]` 子表里才会生效。
:::

供应商类型与字段的完整说明请参阅 [供应商](./providers.md)。

## OAuth 与托管服务

OAuth 流程默认连接 BYF 官方的认证与托管端点，下列变量可以将它们指向自建或测试环境。

| 环境变量              | 用途                                                   | 默认值                                                         |
| --------------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| `BYF_OAUTH_HOST`      | OAuth 认证 host，优先级最高                            | —（未设置时回退到 `BYF_OAUTH_HOST`，再回退到下面的硬编码默认） |
| `BYF_OAUTH_HOST`      | OAuth 认证 host，作为 `BYF_OAUTH_HOST` 的 fallback     | —（未设置时回退到下面的硬编码默认）                            |
| `BYF_HOSTED_BASE_URL` | 托管 BYF API 的 base URL，用于 OAuth 登录后的 API 调用 | `https://api.byf.dev/coding/v1`                                |

当 `BYF_OAUTH_HOST` 和 `BYF_OAUTH_HOST` 都未设置时，OAuth 认证 host 使用硬编码常量 `https://auth.byf.dev`。

::: warning 注意
`BYF_HOSTED_BASE_URL` 与上一节的 `BYF_BASE_URL` 是两个不同变量：前者面向 OAuth 登录的托管服务，默认指向 `byf.dev`；后者面向直接使用 BYF API 密钥的供应商，默认指向 `example.com`。请按场景区分。
:::

## 运行时开关

| 环境变量                            | 用途                                                                                                                                                                                                                                                                                                       | 合法值 / 默认值                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `BYF_DISABLE_TELEMETRY`             | 关闭遥测上报                                                                                                                                                                                                                                                                                               | `1`、`true`、`t`、`yes`、`y`（不区分大小写）                                                                 |
| `BYF_BACKGROUND_KEEP_ALIVE_ON_EXIT` | 覆盖 `[background].keep_alive_on_exit`，控制会话关闭时是否保留仍在运行的后台任务                                                                                                                                                                                                                           | 真值：`1`、`true`、`yes`、`on`；假值：`0`、`false`、`no`、`off`；未设置时读取 `config.toml`，再回退到 `true` |
| `BYF_PRINT_WAIT_CEILING_S`          | 覆盖 `[background].print_wait_ceiling_s`：`byf -p` 在主 turn 结束后（以及 goal/cron hold 释放后）等待后台任务的最长秒数。超时则结束等待并以非 0 退出，不会 kill 任务。**不**限制 goal hold 或会话内 Cron keep-alive。                                                                                      | 正整数秒；未设置时读取 `config.toml`，再默认 `3600`                                                          |
| `BYF_DISABLE_CRON`                  | 会话内 Cron 总开关：设为 `1` 时 `CronCreate` 失败，调度器不再触发任务                                                                                                                                                                                                                                      | 恰好为 `1`                                                                                                   |
| `BYF_CRON_NO_JITTER`                | 关闭按任务确定性 fire 抖动（便于测试 / bench）。生产环境应保持未设置。                                                                                                                                                                                                                                     | 恰好为 `1`                                                                                                   |
| `BYF_SHELL_PATH`                    | 覆盖 Windows 上 Git Bash (`bash.exe`) 的绝对路径，仅在 Windows 自动探测失败时需要                                                                                                                                                                                                                          | 无                                                                                                           |
| `BYF_MODEL_MAX_COMPLETION_TOKENS`   | 单步 LLM 请求 `max_completion_tokens` 的显式硬上限。未设置时，对于已知上下文窗口的模型，BYF 会使用安全的剩余上下文窗口；设为 `0` 或负数则完全禁用 clamp。**目前只对 `byf` 类型的供应商生效**；Anthropic 等其它供应商请改用 `[models.<alias>].max_output_size`（详见 [配置文件](./config-files.md#models)） | 未设置：按剩余上下文计算；未知上下文窗口时回退到 `loop_control.reserved_context_size`，再回退到 32000        |

例如在共享主机上禁用遥测：

```sh
export BYF_DISABLE_TELEMETRY="1"
```

`BYF_BACKGROUND_KEEP_ALIVE_ON_EXIT` 的优先级高于 `config.toml`。例如临时运行 `BYF_BACKGROUND_KEEP_ALIVE_ON_EXIT=0 byf -p "..."` 时，即使配置文件里写了 `keep_alive_on_exit = true`，本次进程退出前也会请求停止后台任务。

`BYF_PRINT_WAIT_CEILING_S` 同样覆盖 `print_wait_ceiling_s`。CI 中缩短等待示例：

```sh
BYF_PRINT_WAIT_CEILING_S=120 byf -p "跑冒烟测试"
```

## 诊断日志

下列变量控制 `byf` 的诊断日志。日志会写入两个位置：全局诊断日志在 `$BYF_HOME/logs/byf.log`，每个会话自身的诊断日志在 `<sessionDir>/logs/byf.log`（路径细节见 [数据路径](./data-locations.md#日志与更新状态)）。所有变量都只在进程启动时读取一次。

| 环境变量                    | 用途                                                   | 默认值            |
| --------------------------- | ------------------------------------------------------ | ----------------- |
| `BYF_LOG_LEVEL`             | 日志级别，可选 `off`、`error`、`warn`、`info`、`debug` | `info`            |
| `BYF_LOG_GLOBAL_MAX_BYTES`  | 全局日志文件单个最大字节数                             | `6291456`（6 MB） |
| `BYF_LOG_GLOBAL_FILES`      | 全局日志文件保留份数                                   | `5`               |
| `BYF_LOG_SESSION_MAX_BYTES` | 会话级日志文件单个最大字节数                           | `5242880`（5 MB） |
| `BYF_LOG_SESSION_FILES`     | 会话级日志文件保留份数                                 | `3`               |

整数类变量解析失败（非正整数、非数字）时静默回落到默认值。

## 剪贴板桥接

`BYF_WSL_CLIPBOARD_IMAGE_PATH` 由 CLI 在调用 WSL 剪贴板辅助子进程时自动注入，用于传递临时图片路径。该变量写入到 PowerShell 子进程的环境中，由子进程脚本内部读取；byf 主进程自身不读取此变量。在外部 shell 中设置它对 byf 主进程**无效**，用户无需手动管理此变量。

## 系统环境变量

BYF 也会读取一些标准的系统环境变量，用于检测运行环境与默认行为：

- `HOME`：用户主目录，用于解析默认数据路径。
- `VISUAL`、`EDITOR`：调用外部编辑器时的可执行命令，`VISUAL` 优先。
- `PATH`：定位 `rg`、`git` 等外部依赖。
- `NO_COLOR`：设置且非空时，强制关闭颜色与主题检测，界面回退到深色主题。遵循 [no-color.org](https://no-color.org) 约定。
- `FORCE_COLOR`：值为 `"0"` 时，同样关闭颜色与主题检测，界面回退到深色主题。
- `CI`：非空且非 `"0"` 时，关闭主题检测并回退到深色主题；遥测模块也会读取此变量以标记 CI 环境。
- `LANG`：用于在遥测上下文中标记 locale（仅作为标记，不改变 CLI 行为）。
- `TERM_PROGRAM`：用于检测终端对 OSC 9 通知的支持（iTerm2、WezTerm、ghostty、WarpTerminal 等）；也会写入遥测上下文。
- `TERM`：用于检测终端对 OSC 9 通知的支持（xterm-kitty、xterm-ghostty 等）。
- `TMUX`：检测是否运行在 tmux 内，用于终端通知路径的判断。
- `COLORFGBG`：检测终端配色（深色 / 浅色）。
- `DISPLAY`、`WAYLAND_DISPLAY`、`XDG_SESSION_TYPE`：检测 Linux 图形会话，用于剪贴板与图片相关功能。`XDG_SESSION_TYPE` 值为 `wayland` 时也判定为 Wayland 会话。
- `WSL_DISTRO_NAME`、`WSLENV`：检测是否运行在 WSL 内，用于剪贴板的 PowerShell 桥接回退。
- `TERMUX_VERSION`：检测是否运行在 Termux 中。
- `LOCALAPPDATA`：Windows 上探测 Git Bash 安装路径时使用。

这些变量遵循各操作系统的常规约定，`byf` 仅读取不修改。
