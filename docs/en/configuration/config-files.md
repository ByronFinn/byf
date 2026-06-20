# Config files

BYF stores its global configuration in a single TOML file that covers API providers, model aliases, agent loop parameters, background tasks, external services, and more. This page describes the location of the config file, its top-level fields, each nested structure, and a complete example.

## Config file location

The default config file is located at `~/.byf/config.toml`. The directory and file are created automatically on first run with restrictive permissions.

If you want to place the data directory elsewhere, set the `BYF_HOME` environment variable:

```sh
export BYF_HOME=/path/to/byf-home
```

The config file path then becomes `$BYF_HOME/config.toml`. Regardless of where the directory lives, the file name is always `config.toml`.

::: tip
TOML field names always use snake_case (for example, `default_model`, `max_context_size`). If a key contains `.`, you must use a quoted TOML key; otherwise TOML will treat `.` as a nested table separator.
:::

## Top-level fields

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `default_model` | `string` | — | Default model alias; must be defined in `models` |
| `default_thinking` | `boolean` | `false` | Initial value of the Thinking toggle for new sessions; can be flipped from the model menu inside a session. Even when this is `true`, setting `[thinking].mode = "off"` will still force Thinking off. See [`thinking`](#thinking) below |
| `default_permission_mode` | `string` | `manual` | Default permission mode for new sessions; one of `manual`, `auto`, `yolo` |
| `merge_all_available_skills` | `boolean` | `true` | Whether to merge Agent Skills from all available directories |
| `extra_skill_dirs` | `array<string>` | — | Extra skill search directories, layered on top of the default directories |
| `telemetry` | `boolean` | `true` | Whether anonymous telemetry is enabled; only disabled when explicitly set to `false` |
| `providers` | `table` | `{}` | API provider table; see below |
| `models` | `table` | — | Model alias table; see below |
| `thinking` | `table` | — | Default parameters for Thinking mode |
| `loop_control` | `table` | — | Agent loop control parameters |
| `background` | `table` | — | Background task runtime parameters |
| `services` | `table` | — | Built-in external service configuration |
| `permission` | `table` | — | Permission rule configuration; see below |
| `hooks` | `array<table>` | — | Lifecycle hook configuration. See [Hooks](../customization/hooks.md) |

## Complete example

```toml
default_model = "byf/byf-default"
default_thinking = true
default_permission_mode = "manual"
merge_all_available_skills = true
telemetry = true

[providers."managed:byf"]
type = "openai-compat"
base_url = "https://api.byf.dev/coding/v1"
api_key = ""

[models."byf/byf-default"]
provider = "managed:byf"
model = "byf-default"
max_context_size = 262144

[thinking]
mode = "auto"

[loop_control]
max_retries_per_step = 3
reserved_context_size = 50000

[background]
max_running_tasks = 4
keep_alive_on_exit = false
agent_task_timeout_s = 900

[[permission.rules]]
decision = "allow"
pattern = "Read"

[[permission.rules]]
decision = "deny"
pattern = "Bash(rm -rf*)"

[[hooks]]
event = "PreToolUse"
matcher = "Bash"
command = "node ~/.byf/hooks/check-bash.mjs"
timeout = 5
```

## `providers`

Each entry in the `providers` table defines the connection info for one API provider, keyed by a unique name.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | `string` | Yes | Provider type; one of `anthropic`, `openai`, `byf`, `google-genai`, `openai_responses`, `vertexai` |
| `api_key` | `string` | No | API key |
| `base_url` | `string` | No | API base URL |
| `oauth` | `table` | No | OAuth credential reference; see below |
| `env` | `table<string, string>` | No | A configuration sub-table keyed by provider-specific names (such as `BYF_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_CLOUD_PROJECT`), used as fallback values for `api_key` / `base_url` and related fields. This is just a sub-table inside the config file — **it is not written into your shell environment** — and is consulted only when the corresponding field on `[providers.<name>]` is unset |
| `custom_headers` | `table<string, string>` | No | Custom HTTP headers attached to each request |

OAuth credential reference structure:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `storage` | `string` | Yes | Credential storage location; currently only `file` is supported |
| `key` | `string` | Yes | Unique identifier of the credential entry |

```toml
[providers.openai]
type = "openai"
base_url = "https://api.openai.com/v1"
api_key = "sk-xxx"
custom_headers = { "X-Custom-Header" = "value" }
```

## `models`

Each entry in the `models` table defines a model alias, keyed by a unique name.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `provider` | `string` | Yes | Name of the provider to use; must be defined in `providers` |
| `model` | `string` | Yes | Model identifier used when calling the API |
| `max_context_size` | `integer` | Yes | Maximum context length in tokens; must be at least 1 |
| `max_output_size` | `integer` | No | Per-request output budget cap (`max_tokens` on the wire). Only the `anthropic` provider currently honors it. When the alias resolves to a known Claude family, the value is clamped to that model's documented ceiling to avoid exceeding the server-side limit. Omit to use the per-model default — see [`providers.md`](./providers.md#anthropic). |
| `capabilities` | `array<string>` | No | Capability tags to add explicitly, for example `thinking`, `image_in`, `video_in`, `audio_in`, `tool_use` |
| `display_name` | `string` | No | Name shown in the UI; falls back to `model` when unset |
| `reasoning_key` | `string` | No | `openai` provider only. Override the field name used for reasoning content. By default the provider auto-detects `reasoning_content`, `reasoning_details`, and `reasoning` on incoming responses and serializes thinking back as `reasoning_content` — set this only if your gateway uses a non-standard field name |

`capabilities` is unioned with the capabilities that the provider capability registry matches by model-name prefix — entries can only be added, never removed. You usually do not need to set this by hand; reach for it only when the model is not covered by the registry, or when you want to force-enable a particular capability.

If a model alias contains `.`, use a quoted key:

```toml
[models."gpt-4.1"]
provider = "openai"
model = "gpt-4.1"
max_context_size = 1047576
```

## `thinking`

`thinking` controls the default behavior of Thinking mode. Even when the top-level `default_thinking = true`, setting `mode` to `"off"` will still force Thinking off.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `mode` | `string` | — | Trigger policy; one of `auto`, `on`, `off`. `"off"` forces Thinking off; any other value or omission does not disable it, and the effective behavior is decided together by the per-session Thinking toggle and `effort` |
| `effort` | `string` | `high` | Default effort level used when Thinking is on; one of `low`, `medium`, `high`, `xhigh`, `max`. The levels actually available depend on the provider |

## `loop_control`

`loop_control` governs the step count, retries, and context compaction threshold of the agent execution loop.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `max_steps_per_turn` | `integer` | — | Maximum number of steps per turn; unset by default (no limit) |
| `max_retries_per_step` | `integer` | `3` | Maximum retries per step |
| `reserved_context_size` | `integer` | — | Number of tokens reserved for response generation; compaction is triggered when the context approaches this threshold |



## `background`

`background` controls the runtime limits for background tasks. Background tasks are launched through the `Bash` tool or the `Agent` tool's `run_in_background=true` parameter.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `max_running_tasks` | `integer` | — | Maximum number of background tasks running concurrently |
| `keep_alive_on_exit` | `boolean` | `true` | Whether to keep still-running background tasks when the session closes. Set to `false` to request stopping background tasks when `byf -p` finishes and exits, when an SDK session closes, or when a harness closes |
| `agent_task_timeout_s` | `integer` | — | Maximum runtime in seconds for background agent tasks |

`keep_alive_on_exit` can be overridden by the `BYF_BACKGROUND_KEEP_ALIVE_ON_EXIT` environment variable; the environment variable has higher priority than `config.toml`. The schema also reserves `kill_grace_period_ms` and `print_wait_ceiling_s`; these fields currently pass schema validation only and are not read by the CLI runtime.

## `services`

`services` configures the built-in external services BYF calls. Two optional services are recognized: `web_search` (web search with multi-provider support) and `fetch_url` (URL content fetching). Other keys are ignored.

### `web_search`

Configures web search backends. Supports multiple search providers with priority-based automatic fallback. Each provider entry in the `[[services.web_search.providers]]` array-of-tables has the following fields:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | `string` | Yes | Provider type: `exa`, `brave`, or `firecrawl` |
| `api_keys` | `array<string>` | Yes | One or more API keys; keys are tried sequentially within a single search call |
| `priority` | `integer` | Yes | Priority order (lower number = tried first) |
| `base_url` | `string` | No | Custom base URL override; defaults to the provider's built-in endpoint |

```toml
[services.web_search]

[[services.web_search.providers]]
type = "exa"
api_keys = ["sk-exa-primary", "sk-exa-secondary"]
priority = 1

[[services.web_search.providers]]
type = "brave"
api_keys = ["sk-brave"]
priority = 2
base_url = "https://custom.brave.api/search"

[[services.web_search.providers]]
type = "firecrawl"
api_keys = ["sk-firecrawl"]
priority = 3
```

**Behavior**: Providers are tried in ascending `priority` order. The first provider to return results (including empty results) wins. Fallback to the next provider is triggered automatically on any error (auth failure, rate limit, server error, timeout, bad request). Empty results do NOT trigger fallback — a provider saying "no results" is a valid answer.

If all providers fail, the WebSearch tool returns an error message to the LLM describing the last error.

When no `[services.web_search]` section is configured, the WebSearch tool is not registered (same as before).

### `fetch_url`

Configures URL content fetching (via `[services.fetch_url]`). Uses the same flat structure as the original single-service format:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `base_url` | `string` | No | Service API URL |
| `api_key` | `string` | No | API key |
| `oauth` | `table` | No | OAuth credential reference, same structure as `providers.*.oauth` |
| `custom_headers` | `table<string, string>` | No | Custom HTTP headers attached to each request |

If no `base_url` is configured, a local fallback is used (downloads and extracts page content directly).

```toml
[services.fetch_url]
base_url = "https://api.example.com/v1/fetch"
api_key = "sk-xxx"
```

## `permission`

`permission` configures the initial permission rules loaded when a session starts, controlling the default approval behavior for tool calls. The default permission mode for new sessions is controlled by the top-level `default_permission_mode` field; an explicit startup permission mode, such as the CLI's `--yolo` flag, overrides that default.

Rules are written as a `[[permission.rules]]` array of tables, where each rule contains the following fields:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `decision` | `string` | Yes | Decision result; one of `allow`, `deny`, `ask` |
| `scope` | `string` | No | Rule scope; one of `turn-override`, `session-runtime`, `project`, `user`; defaults to `user` |
| `pattern` | `string` | Yes | Match pattern in the form `ToolName` or `ToolName(arg-pattern)`. `ToolName` must match the runtime tool name exactly — built-in tools are `Read`, `Write`, `Edit`, `Bash`, `Grep`, and so on (see [Built-in tools](../reference/tools.md)) |
| `reason` | `string` | No | Rule description for debugging or auditing |

Example:

```toml
[[permission.rules]]
decision = "allow"
pattern = "Read"

[[permission.rules]]
decision = "allow"
pattern = "Grep"

[[permission.rules]]
decision = "deny"
pattern = "Bash(rm -rf*)"

[[permission.rules]]
decision = "ask"
pattern = "Bash"
```

::: tip
MCP server declarations are configured in `~/.byf/mcp.json` or the project-local `.byf/mcp.json`, not in `config.toml`. The interactive configuration entry point is `/mcp-config`; see [Model Context Protocol](../customization/mcp.md).
:::
