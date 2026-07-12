# Slash Commands

Slash commands are built-in control commands provided by BYF in the interactive TUI, used to switch modes, manage sessions, view status, and more. Type `/` in the input box to trigger command completion; the candidate list filters in real time as you continue typing, and command aliases participate in matching as well.

After typing a full command name (such as `/help`), press `Enter` to execute it. If the `/`-prefixed input does not match any built-in or skill command, it is sent to the agent as an ordinary message.

::: tip Tip
Some commands are only available in the idle state. Running them while the session is streaming a response or compacting the context will be blocked, with a hint to press `Esc` or `Ctrl-C` first to interrupt the current operation. The "Always available" column in the tables below marks commands that remain available during streaming or compacting.
:::

## Account and configuration

| Command                                      | Alias     | Description                                                                                                                                                                                                                                                                                                                          | Always available |
| -------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| `/login`                                     | —         | Pick an account or platform and sign in: BYF uses the OAuth device code flow, while the BYF API signs in with an API key.                                                                                                                                                                                                            | No               |
| `/logout`                                    | —         | Clear the credentials of the currently selected account (BYF OAuth credentials, or the corresponding open platform provider config).                                                                                                                                                                                                 | No               |
| `/connect [--refresh] [--url=<catalog-url>]` | —         | Configure a provider and model from a model catalog. The default catalog is bundled with the CLI; pass `--refresh` to fetch the latest catalog from models.dev, or `--url` to read it from a custom URL. See [Providers and models — `/connect` and the model catalog](../configuration/providers.md#connect-and-the-model-catalog). | No               |
| `/model`                                     | —         | Switch the LLM model used by the current session.                                                                                                                                                                                                                                                                                    | No               |
| `/settings`                                  | `/config` | Open the settings panel inside the TUI.                                                                                                                                                                                                                                                                                              | Yes              |
| `/permission`                                | —         | Choose a permission mode.                                                                                                                                                                                                                                                                                                            | Yes              |
| `/editor`                                    | —         | Configure the external editor launched by `Ctrl-G`.                                                                                                                                                                                                                                                                                  | Yes              |
| `/theme`                                     | —         | Switch the terminal UI color theme.                                                                                                                                                                                                                                                                                                  | Yes              |

## Session management

| Command                    | Alias     | Description                                                                                                                                                 | Always available |
| -------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `/new`                     | `/clear`  | Start a brand-new session, discarding the current context.                                                                                                  | No               |
| `/sessions`                | `/resume` | Browse historical sessions and switch to or resume one.                                                                                                     | No               |
| `/tasks`                   | `/task`   | Browse the background task list.                                                                                                                            | Yes              |
| `/fork`                    | —         | Fork a new session from the current one, preserving the full conversation history.                                                                          | No               |
| `/title [<text>]`          | `/rename` | Without arguments, show the current session title; with an argument, set it as the new title (up to 200 characters).                                        | Yes              |
| `/compact [<instruction>]` | —         | Compact the current conversation context to free up token usage; optionally pass a custom instruction telling the model what to preserve during compaction. | No               |
| `/init`                    | —         | Analyze the current codebase and generate `AGENTS.md`.                                                                                                      | No               |
| `/add-dir [path\|list]`    | —         | Add an extra workspace root, or list current roots. See [Workspace roots](#workspace-roots).                                                                | No               |

### Workspace roots

| Command           | Alias | Description                                                                                                                                                                                                                                                                  | Always available |
| ----------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `/add-dir`        | —     | Same as `/add-dir list` — print the main workspace directory and every additional root.                                                                                                                                                                                      | No               |
| `/add-dir list`   | —     | List the current workspace root and additional allowed directories.                                                                                                                                                                                                          | No               |
| `/add-dir <path>` | —     | Propose adding `<path>` as an extra workspace root. A picker offers: this session only; remember for the project (writes `.byf/local.toml` → `workspace.additional_dir`); or cancel. Paths must exist and be directories; Read/Grep/Glob/Write/Edit apply immediately after. | No               |

::: tip Project memory
Choosing **remember** appends the path to the project root’s `.byf/local.toml` under `workspace.additional_dir` (string array). Later sessions started in that project load those dirs automatically. The file is separate from `~/.byf/config.toml`; teams often add `.byf/local.toml` to `.gitignore` when paths are machine-local. You can also pass `--add-dir` on the CLI at startup (repeatable).
:::

## Autonomous goal mode

| Command                                                                        | Alias | Description                                                                                                                                                                                                                                                                                                | Always available |
| ------------------------------------------------------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `/goal`                                                                        | —     | Show the current goal snapshot (objective, status, remaining budget) as a one-line transcript entry.                                                                                                                                                                                                       | Yes              |
| `/goal status`                                                                 | —     | Same as `/goal` — print the current status line.                                                                                                                                                                                                                                                           | Yes              |
| `/goal pause`                                                                  | —     | Soft-stop the current goal. The active turn finishes naturally, then the driver halts at the next turn boundary. Use `/goal resume` to continue.                                                                                                                                                           | Yes              |
| `/goal cancel`                                                                 | —     | Hard-stop the current goal: abort the active turn (equivalent to `Esc`) and clear goal state.                                                                                                                                                                                                              | Yes              |
| `/goal resume`                                                                 | —     | Resume a paused or blocked goal back to active.                                                                                                                                                                                                                                                            | No               |
| `/goal <objective>`                                                            | —     | Create a new autonomous goal. The driver takes over at the end of the current turn and keeps advancing the objective across turns until the model marks it complete/blocked or the budget runs out.                                                                                                        | No               |
| `/goal replace [--max-turns N] [--max-tokens N] [--max-seconds N] <objective>` | —     | Replace the current goal with a new one (atomic cancel + create).                                                                                                                                                                                                                                          | No               |
| `/goal [--max-turns N] [--max-tokens N] [--max-seconds N] <objective>`         | —     | Create a goal with an explicit budget. `--max-turns` caps the number of continuation turns, `--max-tokens` caps cumulative input+output tokens, `--max-seconds` caps wall-clock time while active (paused intervals do not count). Any subset of flags may be supplied; omitted dimensions stay unbounded. | No               |

::: tip When to use goal mode
Goal mode is for hands-off, multi-turn work — "fix all the lint errors in this package", "audit every endpoint for auth checks", "migrate the test suite to the new fixture helper". For single-shot questions or anything you want to drive turn-by-turn, just talk to the agent normally; goal mode is overhead you do not need.

While a goal is active you will see a status badge in the footer and a system reminder at the start of every continuation turn re-stating the objective and remaining budget. `/goal status` reprints the snapshot to the transcript whenever you want to check in.
:::

## Mode and runtime control

| Command           | Alias  | Description                                                                                                                                                                               | Always available |
| ----------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `/yolo [on\|off]` | `/yes` | Toggle auto-approve mode. Without arguments, flip the current state; pass `on`/`off` explicitly to force the corresponding state. When enabled, ordinary tool call approvals are skipped. | Yes              |

::: warning Note
`/yolo` skips approval confirmation for ordinary tool calls. Make sure you understand the potential risks before enabling it.
:::

## Information and status

| Command     | Alias      | Description                                                                                                | Always available |
| ----------- | ---------- | ---------------------------------------------------------------------------------------------------------- | ---------------- |
| `/help`     | `/h`, `/?` | Show keyboard shortcuts and all available commands.                                                        | Yes              |
| `/usage`    | —          | Show token usage, context consumption, and quota information.                                              | Yes              |
| `/status`   | —          | Show the current session runtime status, including version, model, working directory, and permission mode. | Yes              |
| `/mcp`      | —          | List the MCP servers in the current session and their connection status.                                   | Yes              |
| `/version`  | —          | Show the BYF version number.                                                                               | Yes              |
| `/feedback` | —          | Submit feedback to help improve BYF.                                                                       | Yes              |

## Exit

| Command | Alias   | Description | Always available |
| ------- | ------- | ----------- | ---------------- |
| `/exit` | `/quit` | Exit BYF.   | No               |

## Dynamic skill commands

In addition to the built-in commands, user-activatable skills are automatically registered as slash commands under the `skill:` namespace:

```
/skill:<name> [extra text]
```

For example, `/skill:code-style` loads the content of the `code-style` skill and sends it to the agent; any text after the command is appended to the skill prompt, as in `/skill:git-commits fix the login failure issue`.

For convenience, skill commands also support a short form `/<name>` that omits the `skill:` prefix, provided the name is not already taken by a built-in command. In other words, `/code-style` falls back to matching `/skill:code-style`.

BYF ships with a built-in `mcp-config` skill for configuring MCP servers and handling MCP OAuth login. It still belongs to the skill namespace in completion and help (`/skill:mcp-config`), and it can also be invoked directly as `/mcp-config`.

Skill types that can be exposed as slash commands include `prompt`, `inline`, `flow`, and skills without an explicitly declared type. For skill installation and authoring, see [Agent Skills](../customization/skills.md).

::: info Note
All skill commands are only available while the agent is idle; during streaming or compacting, press `Esc` or `Ctrl-C` first to interrupt the current operation.
:::

::: info Note
Flow-type skills are also exposed via `/skill:<name>`; there is no separate `/flow:` namespace.
:::
