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
| 📦 **单二进制安装**   | 一键安装。无需 Node.js 环境、无需配置 PATH、无全局模块冲突。                                 |
| 🧩 **子 Agent**       | 在隔离的上下文窗口中调度 `coder`、`explore` 和 `plan` 子 Agent —— 并行工作，主对话保持整洁。 |
| 🎥 **视频输入**       | 将屏幕录制或演示片段拖入聊天。让 Agent 直接观看，无需费力用文字描述。                        |
| 🔌 **AI 原生 MCP**    | 通过 `/mcp-config` 以对话方式添加、编辑和认证 Model Context Protocol 服务 —— 无需手写 JSON。 |
| 🔗 **生命周期钩子**   | 在关键节点执行本地命令 —— 控制风险工具调用、审计决策、发送桌面通知、接入自有自动化流程。     |
| 🔐 **自有密钥与配置** | 自带 API 密钥和模型服务凭证。无厂商锁定，无遥测门槛。                                        |

---

## 🚀 快速开始

### 安装

**npm（推荐）**

```sh
npm install -g @byfriends/cli
```

**脚本安装（macOS / Linux）**

```sh
curl -fsSL https://github.com/ByronFinn/byf/releases/latest/download/install.sh | bash
```

**脚本安装（Windows PowerShell）**

```powershell
irm https://github.com/ByronFinn/byf/releases/latest/download/install.ps1 | iex
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

BYF 是一个 [Bun](https://bun.com) monorepo（workspace 定义在根 `package.json`）：

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

---

## 🤝 参与贡献

欢迎贡献！请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解：

- 开发环境搭建与工作流程
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
