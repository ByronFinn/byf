# @byfriends/cli

> BYF (Be Your Friend) — an AI coding agent that runs in your terminal

[![npm](https://img.shields.io/npm/v/@byfriends/cli)](https://www.npmjs.com/package/@byfriends/cli) [![License](https://img.shields.io/badge/license-MIT-brightgreen)](LICENSE)

## Install

Two official paths. Both deliver a **native `bun build --compile` binary** — you do **not** need Bun or Node preinstalled to *run* `byf`.

### GitHub Release (macOS arm64 / Linux x64)

```sh
curl -fsSL https://github.com/ByronFinn/byf/releases/latest/download/install.sh | bash
```

Windows (best-effort script; official compile matrix is MVP two platforms):

```powershell
irm https://github.com/ByronFinn/byf/releases/latest/download/install.ps1 | iex
```

### npm (platform optionalDependencies)

```sh
npm install -g @byfriends/cli
```

Or with pnpm / bun:

```sh
pnpm add -g @byfriends/cli
bun add -g @byfriends/cli
```

The published main package ships a thin `bin/byf.cjs` launcher. npm resolves the matching platform package (`@byfriends/cli-darwin-arm64` or `@byfriends/cli-linux-x64`) via **optionalDependencies**; that package contains the same compile binary as GitHub Releases.

**MVP platforms:** `darwin-arm64`, `linux-x64`. Other OS/arch combos are deferred.

### Reinstall (legacy Node JS global)

If you previously installed a Node-interpreted global (`dist/main.mjs` layout), that path is **removed**. Uninstall and reinstall:

```sh
npm uninstall -g @byfriends/cli
npm install -g @byfriends/cli
```

Or switch to the Release binary via `install.sh` above. `byf update` will detect the old JS layout and print reinstall guidance instead of hot-patching it.

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

- **Single-binary distribution.** Install with one command — no Bun/Node setup for end users, no PATH gymnastics, no global module conflicts.
- **Blazing-fast startup.** The TUI is ready in milliseconds, so opening a session never feels heavy.
- **Polished TUI.** A carefully tuned interface designed for long, focused agent sessions.
- **Video input.** Drop a screen recording or demo clip into the chat — let the agent watch instead of typing out what's hard to describe in words.
- **AI-native MCP configuration.** Add, edit, and authenticate Model Context Protocol servers conversationally via `/mcp-config` — no hand-editing JSON.
- **Subagents for focused, parallel work.** Dispatch built-in `coder`, `explore`, and `plan` subagents in isolated context windows; the main conversation stays clean.
- **Lifecycle hooks.** Run local commands at key points — gate risky tool calls, audit decisions, fire desktop notifications, wire into your own automation.

## Library vs CLI

This package is the **CLI**. End users get a compile binary.

`@byfriends/*` **library** packages (e.g. `@byfriends/sdk`) are **Bun-only** for import/runtime — that is a separate contract from the CLI binary distribution. See the monorepo [README](../../README.md) and [ADR 0028](../../docs/adr/0028-full-bun-toolchain.md).

## Documentation

See the main repository README for documentation.

## Repository & Issues

- Source: https://github.com/ByronFinn/byf
- Issues: https://github.com/ByronFinn/byf/issues
- Security: see SECURITY.md in the main repository

## License

MIT — see [LICENSE](https://github.com/ByronFinn/byf/blob/main/LICENSE) for terms.
