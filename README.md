<div align="center">

# 🧑‍💻 BYF (Be Your Friend)

**An AI coding agent that runs in your terminal — explore, edit, build, and ship from the command line.**

[![npm version](https://img.shields.io/npm/v/@byfriends/cli?color=blue&logo=npm)](https://www.npmjs.com/package/@byfriends/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-brightgreen)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20|%20Linux%20|%20Windows-lightgrey)](#platform-support)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)

**Read this in other languages:** [简体中文](README.zh-CN.md)

</div>

---

## ✨ Features

| Feature                       | Description                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| ⚡ **Blazing-fast TUI**       | A polished terminal UI that starts in milliseconds — built for long, focused coding sessions.                                          |
| 📦 **Single-binary install**  | Install with one command. No Bun/Node runtime setup for end users, no PATH gymnastics, no global module conflicts.                     |
| 🧩 **Subagents**              | Dispatch `coder`, `explore`, and `plan` subagents in isolated context windows — parallel work that keeps your main conversation clean. |
| 🎥 **Video input**            | Drop a screen recording or demo clip into the chat. Let the agent watch instead of typing out what's hard to describe in words.        |
| 🔌 **AI-native MCP**          | Add, edit, and authenticate Model Context Protocol servers conversationally via `/mcp-config` — no hand-editing JSON.                  |
| 🔗 **Lifecycle hooks**        | Run local commands at key points — gate risky tool calls, audit decisions, fire desktop notifications, wire into your own automation.  |
| 🔐 **Your keys, your config** | Bring your own API keys and provider credentials. No vendor lock-in, no telemetry gate.                                                |

---

## 🚀 Quick Start

### Install

Two official paths — both install a **native compile binary** (no need to preinstall Bun or Node to _run_ BYF):

**1. GitHub Release script (macOS arm64 / Linux x64 MVP)**

```sh
curl -fsSL https://github.com/ByronFinn/byf/releases/latest/download/install.sh | bash
```

**Windows PowerShell:**

```powershell
irm https://github.com/ByronFinn/byf/releases/latest/download/install.ps1 | iex
```

**2. npm global (platform optionalDependencies binary)**

```sh
npm install -g @byfriends/cli
```

`npm i -g` installs a thin launcher plus the matching platform package (`@byfriends/cli-darwin-arm64` or `@byfriends/cli-linux-x64`). The real CLI is the same compile binary as GitHub Releases. Official binary matrix is currently **darwin-arm64** and **linux-x64**; other platforms are deferred.

Other package managers work the same way if they honor optionalDependencies:

```sh
pnpm add -g @byfriends/cli
# or
bun add -g @byfriends/cli
```

### Start your first session

Open any project directory and launch BYF:

```sh
cd your-project
byf
```

Or start with an inline prompt:

```sh
byf "Explain the main directories in this repository"
```

BYF will inspect your code, edit files, run shell commands, and help you iterate — all from within your terminal.

---

## ⚠️ Breaking changes (Bun toolchain migration)

This 0.x **minor** line introduces breaking runtime and distribution changes (see [ADR 0028](docs/adr/0028-full-bun-toolchain.md) / PRD-0020). **Not** a coordinated 1.0 major — read the notes below before upgrading.

| Audience                                                             | Contract                                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **CLI end users**                                                    | Official install is a **compile binary** (GitHub Release or npm optionalDep). You do **not** need Bun/Node to run `byf`. |
| **Library consumers** (`@byfriends/sdk`, `@byfriends/agent-core`, …) | **Bun-only** runtime. Node.js is no longer a supported interpreter for library packages.                                 |
| **Contributors / CI**                                                | **Bun >= 1.3.14** only (`bun install`, `bun test`, …). pnpm is not the official toolchain.                               |

### Reinstall if you used the old npm-global JS layout

Older `@byfriends/cli` globals shipped a Node-interpreted `dist/main.mjs` entry. That path is **gone**. Node SEA binaries are also **deprecated** in favor of `bun build --compile`.

If `byf update` reports a legacy JS install, or the CLI breaks after upgrade, reinstall cleanly:

```sh
# npm global (recommended reinstall)
npm uninstall -g @byfriends/cli
npm install -g @byfriends/cli

# or switch to the Release binary
curl -fsSL https://github.com/ByronFinn/byf/releases/latest/download/install.sh | bash
```

Then verify:

```sh
byf --version
```

---

## 📖 Usage

### Common commands

| Command        | Description                                               |
| -------------- | --------------------------------------------------------- |
| `byf`          | Start an interactive TUI session in the current directory |
| `byf "prompt"` | Start with an inline prompt                               |
| `byf vis`      | Open the session visualization and replay tool            |
| `byf --help`   | Show all available options                                |

### Interactive commands inside BYF

| Command           | Description                                                          |
| ----------------- | -------------------------------------------------------------------- |
| `/btw <question>` | Side query — a one-shot read-only question using the current context |
| `/mcp-config`     | Configure Model Context Protocol servers conversationally            |
| `/<skill-name>`   | Invoke built-in agent skills                                         |

---

## ⚙️ Configuration

BYF stores its user configuration at `~/.byf/config.toml`.

```toml
# Example: ~/.byf/config.toml
[providers.my-provider]
type = "openai-completions"
base_url = "https://api.example.com/v1"
api_key = "sk-..."  # or set via environment variable

[hooks.pre-tool]
command = "./scripts/audit.sh"
```

**Environment variables:**

| Variable   | Description                                       |
| ---------- | ------------------------------------------------- |
| `BYF_HOME` | Override BYF's home directory (default: `~/.byf`) |
| `VIS_HOST` | Host for the vis server (default: `127.0.0.1`)    |
| `PORT`     | Port for the vis server (default: `3001`)         |

> 💡 Keep your API keys and secrets in local configuration — never commit them to your repository.

---

## 🏗️ Project Structure

BYF is a [Bun monorepo](https://bun.com/docs/install/workspaces) (see [ADR 0028](docs/adr/0028-full-bun-toolchain.md)):

```
byf/
├── apps/
│   ├── cli/               # CLI / TUI application
│   └── vis/               # Session visualization & replay tool
│       ├── server/        #   Hono API server
│       └── web/           #   React/Vite SPA
├── packages/
│   ├── agent-core/        # Unified agent engine
│   ├── node-sdk/          # Public TypeScript SDK (@byfriends/sdk)
│   ├── kosong/            # LLM / provider abstraction layer
│   ├── kaos/              # Execution environment & filesystem abstractions
│   └── oauth/             # OAuth & authentication utilities
├── docs/                  # VitePress bilingual documentation site
├── CONTRIBUTING.md        # Contribution guidelines
├── LICENSE                # MIT license
└── package.json           # Root workspace config
```

**Runtime contracts:** library packages under `packages/` are **Bun-only**. The published CLI is a standalone binary for end users.

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development setup (**Bun >= 1.3.14** only — not pnpm/Node as the official path)
- Commit convention (Conventional Commits)
- Changeset requirements
- Pull request guidelines

Before submitting a feature or significant change, please open an issue first to align with the project roadmap.

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

<div align="center">
Built with ❤️ for the terminal-first developer.
</div>
