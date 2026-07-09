<div align="center">

# 🧑‍💻 BYF (Be Your Friend)

**一个运行在终端里的 AI 编程 Agent —— 在命令行中探索、编辑、构建和交付。**

[![npm version](https://img.shields.io/npm/v/@byfriends/cli?color=blue&logo=npm)](https://www.npmjs.com/package/@byfriends/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-brightgreen)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20|%20Linux%20|%20Windows-lightgrey)](#平台支持)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)

**其他语言版本：** [English](README.md)

</div>

---

## ✨ 功能特性

| 特性                  | 描述                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------- |
| ⚡ **极速 TUI**       | 精致的终端界面，毫秒级启动 —— 为长时间专注的编码会话而设计。                                 |
| 📦 **单二进制安装**   | 一键安装。终端用户无需预装 Bun/Node、无需配置 PATH、无全局模块冲突。                         |
| 🧩 **子 Agent**       | 在隔离的上下文窗口中调度 `coder`、`explore` 和 `plan` 子 Agent —— 并行工作，主对话保持整洁。 |
| 🎥 **视频输入**       | 将屏幕录制或演示片段拖入聊天。让 Agent 直接观看，无需费力用文字描述。                        |
| 🔌 **AI 原生 MCP**    | 通过 `/mcp-config` 以对话方式添加、编辑和认证 Model Context Protocol 服务 —— 无需手写 JSON。 |
| 🔗 **生命周期钩子**   | 在关键节点执行本地命令 —— 控制风险工具调用、审计决策、发送桌面通知、接入自有自动化流程。     |
| 🔐 **自有密钥与配置** | 自带 API 密钥和模型服务凭证。无厂商锁定，无遥测门槛。                                        |

---

## 🚀 快速开始

### 安装

两条官方路径——均安装 **compile 原生二进制**（**运行** BYF 无需预装 Bun 或 Node）：

**1. GitHub Release 脚本（macOS arm64 / Linux x64 MVP）**

```sh
curl -fsSL https://github.com/ByronFinn/byf/releases/latest/download/install.sh | bash
```

**Windows PowerShell：**

```powershell
irm https://github.com/ByronFinn/byf/releases/latest/download/install.ps1 | iex
```

**2. npm 全局安装（分平台 optionalDependencies 二进制）**

```sh
npm install -g @byfriends/cli
```

`npm i -g` 会安装薄 launcher，并解析当前平台的 optionalDependency 子包（`@byfriends/cli-darwin-arm64` 或 `@byfriends/cli-linux-x64`）。真正运行的是与 GitHub Release **同源** 的 compile 二进制。官方二进制矩阵目前为 **darwin-arm64** 与 **linux-x64**；其它平台 deferred。

其它包管理器在支持 optionalDependencies 时同样可用：

```sh
pnpm add -g @byfriends/cli
# 或
bun add -g @byfriends/cli
```

### 启动第一个会话

打开任意项目目录，启动 BYF：

```sh
cd your-project
byf
```

也可以附带一条提示词直接启动：

```sh
byf "解释一下这个仓库的主要目录结构"
```

BYF 将在终端中读取代码、编辑文件、执行命令，并帮助你推进开发任务。

---

## ⚠️ 破坏性变更（全量 Bun 工具链迁移）

本 0.x **minor** 版本包含破坏性的运行时与分发变更（见 [ADR 0028](docs/adr/0028-full-bun-toolchain.md) / PRD-0020）。**不是**协调式的 1.0 major —— 升级前请阅读下文。

| 受众                                                         | 契约                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **CLI 终端用户**                                             | 官方安装路径为 **compile 二进制**（GitHub Release 或 npm optionalDep）。运行 `byf` **不需要**预装 Bun/Node。 |
| **库消费者**（`@byfriends/sdk`、`@byfriends/agent-core` 等） | **仅 Bun** 运行时。不再官方支持用 Node 解释执行库包。                                                        |
| **贡献者 / CI**                                              | **仅 Bun >= 1.3.14**（`bun install`、`bun test` 等）。pnpm 不再是官方开发工具链。                            |

### 旧 npm-global JS 布局用户：请重装

旧版 `@byfriends/cli` 全局安装可能仍指向 Node 解释执行的 `dist/main.mjs`。该路径**已废弃**。Node SEA 单二进制亦**不再**作为官方路径，由 `bun build --compile` 取代。

若 `byf update` 提示 legacy JS 安装，或升级后 CLI 无法使用，请干净重装：

```sh
# npm 全局（推荐重装）
npm uninstall -g @byfriends/cli
npm install -g @byfriends/cli

# 或改用 Release 二进制
curl -fsSL https://github.com/ByronFinn/byf/releases/latest/download/install.sh | bash
```

然后验证：

```sh
byf --version
```

---

## 📖 使用说明

### 常用命令

| 命令           | 说明                          |
| -------------- | ----------------------------- |
| `byf`          | 在当前目录启动交互式 TUI 会话 |
| `byf "prompt"` | 附带提示词直接启动            |
| `byf vis`      | 打开会话可视化与回放工具      |
| `byf --help`   | 查看所有可用选项              |

### BYF 内部交互命令

| 命令              | 说明                                       |
| ----------------- | ------------------------------------------ |
| `/btw <question>` | 侧查询 —— 基于当前上下文的只读一次性提问   |
| `/mcp-config`     | 以对话方式配置 Model Context Protocol 服务 |
| `/<skill-name>`   | 调用内置 Agent 技能                        |

---

## ⚙️ 配置

BYF 的用户配置文件位于 `~/.byf/config.toml`。

```toml
# 示例：~/.byf/config.toml
[providers.my-provider]
type = "openai-completions"
base_url = "https://api.example.com/v1"
api_key = "sk-..."  # 或通过环境变量设置

[hooks.pre-tool]
command = "./scripts/audit.sh"
```

**环境变量：**

| 变量       | 说明                                    |
| ---------- | --------------------------------------- |
| `BYF_HOME` | 自定义 BYF 主目录（默认：`~/.byf`）     |
| `VIS_HOST` | vis 服务的主机地址（默认：`127.0.0.1`） |
| `PORT`     | vis 服务的端口（默认：`3001`）          |

> 💡 请在本地配置中提供你的 API 密钥，切勿将其提交到仓库中。

---

## 🏗️ 项目结构

BYF 是一个 [Bun monorepo](https://bun.com/docs/install/workspaces)（见 [ADR 0028](docs/adr/0028-full-bun-toolchain.md)）：

```
byf/
├── apps/
│   ├── cli/               # CLI / TUI 应用程序
│   └── vis/               # 会话可视化与回放工具
│       ├── server/        #   Hono API 服务
│       └── web/           #   React/Vite SPA
├── packages/
│   ├── agent-core/        # 统一 Agent 引擎
│   ├── node-sdk/          # 公开的 TypeScript SDK (@byfriends/sdk)
│   ├── kosong/            # LLM / 模型服务抽象层
│   ├── kaos/              # 执行环境与文件系统抽象
│   └── oauth/             # OAuth 与认证工具
├── docs/                  # VitePress 双语文档站点
├── CONTRIBUTING.md        # 贡献指南
├── LICENSE                # MIT 许可证
└── package.json           # 根工作区配置
```

**运行时契约：** `packages/` 下的库包为 **Bun-only**；发布给终端用户的 CLI 为独立二进制。

---

## 🤝 参与贡献

欢迎贡献！请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解：

- 开发环境搭建（**仅 Bun >= 1.3.14** —— 官方路径不再是 pnpm/Node）
- 提交信息规范（Conventional Commits）
- Changeset 要求
- 拉取请求指南

在提交功能或重大变更前，请先提交 issue 与项目路线图对齐。

---

## 📄 许可证

本项目采用 **MIT 许可证** 授权。详见 [LICENSE](LICENSE) 文件。

---

<div align="center">
为终端优先的开发者而构建 ❤️
</div>
