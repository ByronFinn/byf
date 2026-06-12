# Getting started

## What is BYF

BYF is an AI agent that runs in the terminal, helping you carry out software development tasks and day-to-day terminal operations. It can read and edit code, run shell commands, search files, and fetch web pages, autonomously planning and adjusting the next step based on feedback as it works.

It fits scenarios such as:

- **Writing and modifying code**: implementing new features, fixing bugs, completing refactors
- **Understanding a project**: exploring an unfamiliar codebase and answering questions about architecture and implementation
- **Automating tasks**: batch-processing files, running builds and tests, chaining multiple scripts together

The entire CLI is written in TypeScript, distributed through npm, and runs on Node.js.

## Installation

### Install script (recommended)

The quickest way to install BYF is with the install script; no pre-installed Node.js is required:

```sh
curl -fsSL https://github.com/ByronFinn/byf/releases/byf/install.sh | bash
```

This downloads the latest release, verifies the checksum, and places the `byf` executable on your `PATH`.

::: tip Platform support
BYF is built and tested primarily on **macOS** and **Linux**. Windows is supported but on a best-effort basis.
:::

### npm installation

If you prefer to install via npm, you need Node.js 24.15.0 or later:

```sh
node --version
```

The package name is `@byfriends/cli`:

```sh
npm install -g @byfriends/cli
```

Or with pnpm:

```sh
pnpm add -g @byfriends/cli
```

## Upgrade and uninstall

After installation, verify that the executable is ready:

```sh
byf --version
```

**Upgrade**: if you installed via the script, re-run it. If you installed via npm:

```sh
npm install -g @byfriends/cli@latest
```

**Uninstall**: if you installed via the script, remove the `byf` executable. If you installed via npm:

```sh
npm uninstall -g @byfriends/cli
```

## First launch

Move into the project directory you want to work in and simply run `byf` to start the interactive UI:

```sh
cd your-project
byf
```

If you only want to run a single instruction without entering the interactive UI, use the `-p` flag:

```sh
byf -p "Take a look at this project's directory structure"
```

To resume the previous session, add the `-C` flag:

```sh
byf -C
```

On the first launch, BYF has no credentials yet, and you need to configure an API source before you can start a conversation. In the interactive UI, enter the slash command `/login` to begin the login flow:

```
/login
```

`/login` opens a platform selector supporting:

- **BYF** — OAuth device code flow; open the URL on any device, sign in, and enter the code to authorize
- **BYF API** — log in directly with an API key

To sign out, enter `/logout` to clear the current credentials.

::: tip
If you want to use Anthropic, OpenAI, Google, or other providers, edit `config.toml` directly to configure the API key. See [Providers and models](../configuration/providers.md) for details. Runtime configuration such as the model and provider is also written to `config.toml`. See [Config files](../configuration/config-files.md), [Environment variables](../configuration/env-vars.md), and [Configuration overrides](../configuration/overrides.md) for details.
:::

## Your first conversation

Once login is complete, you can describe a task to BYF directly in natural language. For example, you can have it familiarize itself with the current project first:

```
Take a look at this project's directory structure and briefly describe what each directory is for.
```

BYF will automatically call file-reading, search, and web-fetching tools, browse the relevant content, and then give you an answer. Read-only operations such as reading files and searching the web are executed automatically by default without requiring confirmation. For operations that modify files or run shell commands, it asks for your confirmation before executing by default, and you can approve or reject as you see fit.

You can also have it do something more concrete, such as:

```
Add a function in src/utils that converts any string to kebab-case, and add a unit test for it.
```

BYF plans the steps, modifies the code, runs the tests, and tells you what it did at each step.

In the interactive UI, entering `/help` shows all available [slash commands](../reference/slash-commands.md) along with common keyboard shortcut hints. To exit BYF, enter `/exit`. You can also press `Ctrl-C` — the UI will first clear the current input and prompt you to press it again, and the second press exits. Or press `Ctrl-D` twice with the input box empty to exit.

## Where data is stored

BYF stores its local data under `~/.byf/` by default, including config files, session records, logs, and the update cache. If you want to move it elsewhere, you can point to a new root directory via the `BYF_HOME` environment variable. For the full directory layout and environment variable reference, see [Data locations](../configuration/data-locations.md) and [Environment variables](../configuration/env-vars.md).
