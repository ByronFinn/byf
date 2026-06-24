# Configuration overrides

BYF's runtime parameters come from the user config file, command-line flags, and a handful of runtime paths, endpoints, and switches read from process-level environment variables. Each layer serves a different purpose — the config file captures long-term preferences, CLI flags are well suited for temporary tweaks at this launch, and environment variables mainly locate the data directory, switch OAuth endpoints, and toggle a small number of runtime switches.

Environment variables are **not a universal fallback for configuration fields** in BYF. They fall into three categories with different scopes, and cannot be flattened into a single linear priority list.

## Three roles of environment variables

1. **Config file location**: `BYF_HOME` determines the data root holding the config file, sessions, logs, and so on, making the config file path `$BYF_HOME/config.toml` (otherwise `~/.byf/`). This is a "where to find the config" step that runs before everything else; it is not a fallback source for ordinary parameters. There is also no `BYF_CONFIG_PATH`-style variable for pointing at an arbitrary config file.
2. **Runtime switches**: a small number of switches such as `BYF_DISABLE_TELEMETRY` directly turn off the corresponding subsystem. Even if `config.toml` has `telemetry = true`, telemetry is still disabled whenever this variable is set to a truthy value — its semantics are "additionally disable", not "ordinary override".
3. **Runtime endpoints and diagnostics**: `BYF_OAUTH_HOST`, `BYF_OAUTH_HOST`, `BYF_HOSTED_BASE_URL`, `BYF_LOG_LEVEL`, and friends are read during OAuth and diagnostic subsystem initialization. See [Environment variables](./env-vars.md) for the full list.

## Priority of ordinary runtime parameters

For other runtime parameters (model alias, Plan / yolo mode, Skills directories, and so on), resolution is:

1. **Command-line flags**: parameters supplied at this launch; override every other source and apply only to the current launch.
2. **User config file**: `$BYF_HOME/config.toml` (defaulting to `~/.byf/config.toml`), used to capture long-term preferences.

A few environment variables explicitly override related config fields. For example, `BYF_BACKGROUND_KEEP_ALIVE_ON_EXIT` has higher priority than `[background].keep_alive_on_exit`. These exceptions are called out in [Environment variables](./env-vars.md) and in the corresponding [Config files](./config-files.md) field reference.

::: warning Note
Ordinary runtime parameters **do not** fall back to shell environment variables. For example, provider `api_key` / `base_url` are read only from fields in `config.toml` (including the `[providers.<name>.env]` subtable); they do not fall back to shell exports like `export BYF_API_KEY`. See [Provider credentials](#provider-credentials) below.
:::

BYF currently reads only one user-level config file. There is no project-level (in-repo) config file mechanism. To isolate configuration between projects, point `BYF_HOME` at a different data directory (see [Typical scenarios](#typical-scenarios) below) or temporarily override specific fields with CLI flags at launch.

## Config file

The config file location is controlled by the `BYF_HOME` environment variable, falling back to `~/.byf/` when unset. The file name is fixed as `config.toml`, and the directory is created with `0o700` permissions. The file can declare long-term preferences such as `default_model`, `providers`, `models`, `thinking`, and `loop_control`. See [Config files](./config-files.md) for the field reference.

## Provider credentials

Provider credentials (`api_key`, `base_url`) have their own resolution rules: BYF reads provider fields only from `config.toml` and **does not** fall back to shell environment variables. Running `export BYF_API_KEY` in your terminal alone will not give a `[providers.<name>]` entry credentials — you have to write them into the config file explicitly.

For a single provider, credentials are resolved in this order:

1. `[providers.<name>].api_key` — the key written explicitly into the config file; highest priority.
2. The corresponding key in the `[providers.<name>.env]` subtable (such as `BYF_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`) — moving the environment-variable names you would normally write in your shell into a TOML subtable. Used only when `api_key` is left empty. This is just the form of a config sub-table; it does not actually modify your process environment.
3. If both are missing, startup fails with a message that the provider has no credentials configured.

`base_url` resolves similarly to `api_key`: `[providers.<name>].base_url` is checked first, then `*_BASE_URL` keys (such as `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, `BYF_BASE_URL`) in `[providers.<name>.env]`. See [Providers](./providers.md) for the full reference of provider types and fields.

## Process-level environment variables

Variables in `process.env` are read at BYF startup and fall into the three roles described above in [Three roles of environment variables](#three-roles-of-environment-variables):

- **Data root and log paths**: `BYF_HOME` switches `~/.byf/`; `BYF_LOG_LEVEL` and friends control diagnostic logs.
- **Runtime switches**: `BYF_DISABLE_TELEMETRY` disables telemetry (overriding `telemetry = true` in `config.toml`).
- **OAuth endpoints and diagnostics**: `BYF_OAUTH_HOST`, `BYF_OAUTH_HOST`, and `BYF_HOSTED_BASE_URL` control the BYF login endpoints; `BYF_LOG_LEVEL` and friends control diagnostic logs.
- **Background-task exit policy**: `BYF_BACKGROUND_KEEP_ALIVE_ON_EXIT` overrides `[background].keep_alive_on_exit`, letting you decide for this process whether background tasks are kept on exit.

See [Environment variables](./env-vars.md) for the full list of variables and their scopes.

## Command-line flags

Parameters supplied via CLI flags at launch have the highest priority and only apply to the current launch. Common flags:

| Flag                       | Effect                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `-S, --session [id]`       | Resume the specified session; without an id, enters interactive selection                                   |
| `-C, --continue`           | Continue the most recent session for the current working directory                                          |
| `-y, --yolo`               | Auto-approve ordinary tool calls (aliases: `--yes`, `--auto-approve`)                                       |
| `-m, --model <model>`      | Specify the model alias to use for this launch                                                              |
| `-p, --prompt <prompt>`    | Execute a single prompt in non-interactive mode and exit                                                    |
| `--output-format <format>` | Specify the output format for `-p` mode: `text` or `stream-json`                                            |
| `--skills-dir <dir>`       | Replace the auto-discovered Skills directory (can be specified multiple times; applies to this launch only) |

Mutually exclusive flag rules:

- `--output-format` can only be used in prompt mode (`-p / --prompt`).
- `--prompt` cannot be combined with `--yolo`.
- In prompt mode, `-S / --session` must be given an id; the interactive selector (bare `--session`) is not accepted.
- `--continue` and `--session` cannot be used together.
- Outside prompt mode, `--yolo` cannot be combined with `--continue` or `--session`.

::: tip Tip
`--skills-dir` replaces the auto-discovered Skills directory for this launch and is suitable for one-off use. To persistently append search directories, set `extra_skill_dirs` at the top level of `config.toml` (see [Agent Skills](../customization/skills.md)). The two options have different semantics and can be chosen based on your needs.
:::

## Typical scenarios

**Switch the data directory for isolated testing.** `BYF_HOME` simultaneously affects the config file, session archives, ripgrep cache, and every other data location:

```sh
BYF_HOME="$PWD/.byf-sandbox" byf
```

**Stage temporary credentials in the config file.** Since provider credentials are read only from `config.toml`, to use a different API key for a single launch, write it into the `[providers.<name>.env]` subtable in advance:

```toml
[providers.byf.env]
BYF_API_KEY = "sk-test"
```

You can also set `api_key` directly on the provider; see [Provider credentials](#provider-credentials) above for the priority between the two.

**Skip approvals for this launch.** Suitable for batch tasks you already know are safe:

```sh
byf --yolo
```
