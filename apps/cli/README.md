# @byfriends/cli

> BYF (Be Your Friend) — an AI coding agent that runs in your terminal

[![npm](https://img.shields.io/npm/v/@byfriends/cli)](https://www.npmjs.com/package/@byfriends/cli) [![License](https://img.shields.io/badge/license-proprietary-blue)](LICENSE)

## Install

### npm (recommended)

```sh
npm install -g @byfriends/cli
```

Or with pnpm:

```sh
pnpm add -g @byfriends/cli
```

### Quick install (macOS/Linux)

```sh
curl -fsSL https://github.com/ByronFinn/byf/releases/latest/download/install.sh | bash
```

### Quick install (Windows)

```powershell
irm https://github.com/ByronFinn/byf/releases/latest/download/install.ps1 | iex
```

## Quick Start

Open a project and start the interactive UI:

```sh
cd your-project
byf
```

You can also start with an inline prompt:

```sh
byf "Explain the main directories in this repository"
```

Configure your provider credentials or API key in `~/.byf/config.toml`, then start a session.

## Key Features

- **Single-binary distribution.** Install with one command — no Node.js setup, no PATH gymnastics, no global module conflicts.
- **Blazing-fast startup.** The TUI is ready in milliseconds, so opening a session never feels heavy.
- **Polished TUI.** A carefully tuned interface designed for long, focused agent sessions.
- **Video input.** Drop a screen recording or demo clip into the chat — let the agent watch instead of typing out what's hard to describe in words.
- **AI-native MCP configuration.** Add, edit, and authenticate Model Context Protocol servers conversationally via `/mcp-config` — no hand-editing JSON.
- **Subagents for focused, parallel work.** Dispatch built-in `coder`, `explore`, and `plan` subagents in isolated context windows; the main conversation stays clean.
- **Lifecycle hooks.** Run local commands at key points — gate risky tool calls, audit decisions, fire desktop notifications, wire into your own automation.

## Documentation

See the main repository README for documentation.

## Repository & Issues

- Source: https://github.com/ByronFinn/byf
- Issues: https://github.com/ByronFinn/byf/issues
- Security: see SECURITY.md in the main repository

## License

Proprietary — see [LICENSE](https://github.com/ByronFinn/byf/blob/main/LICENSE) for terms.
