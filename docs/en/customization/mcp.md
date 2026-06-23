# Model Context Protocol

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) is an open protocol that lets models safely call tools exposed by external processes or services. BYF acts as an MCP client to integrate these external tools, exposing them to the agent alongside built-in tools (`Read`, `Bash`, `Grep`, etc.).

## Integration scope

BYF connects to MCP servers via stdio (local subprocess), HTTP (streamable HTTP), or SSE (legacy SSE transport). Once connected, MCP tools behave the same as built-in tools: they are available to the agent, subject to permission rules, and go through the approval flow.

## Configuration and login

MCP server configurations live in `mcp.json` in two layers:

- User-level: `~/.byf/mcp.json` (or `$BYF_HOME/mcp.json`), shared across projects
- Project-level: `.byf/mcp.json` in the current workspace

Project entries override user-level entries with the same name.

The easiest entry point is running `/mcp-config` in the TUI, which guides you through adding, editing, or removing servers. To check connection status, run `/mcp`.

The top-level shape of `mcp.json` is:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    },
    "linear": {
      "url": "https://mcp.linear.app/mcp"
    },
    "legacy-db": {
      "transport": "sse",
      "url": "https://old-server.example.com/mcp"
    }
  }
}
```

Entries with `command` are stdio servers; entries with `url` (without a `transport` field) default to HTTP servers. For legacy SSE-only servers, set `"transport": "sse"` explicitly. SSE and HTTP accept the same optional fields (`headers`, `bearerTokenEnvVar`, etc.). Note that **HTTP (Streamable HTTP) is preferred for new servers** — SSE is supported only for backwards compatibility with pre-2025-03-26 MCP servers.

HTTP and SSE servers can provide static credentials through `headers` or `bearerTokenEnvVar`. When OAuth is required, run `/mcp-config login <server-name>` to complete browser authorization.

Optional fields:

| Field              | Type                     | Applies to  | Description                                                     |
| ------------------ | ------------------------ | ----------- | --------------------------------------------------------------- |
| `env`              | `Record<string, string>` | stdio       | Environment variables injected into the subprocess              |
| `cwd`              | `string`                 | stdio       | Working directory for the subprocess                            |
| `headers`          | `Record<string, string>` | HTTP / SSE  | Static headers appended to every request                        |
| `bearerTokenEnvVar`| `string`                 | HTTP / SSE  | Env var name for bearer token, resolved at connection time      |
| `enabled`          | `boolean`                | both        | Set to `false` to disable the server without removing the entry |
| `startupTimeoutMs` | `number`                 | both        | Connection timeout in milliseconds, default `30000`             |
| `toolTimeoutMs`    | `number`                 | both        | Per-tool-call timeout in milliseconds                           |
| `enabledTools`     | `string[]`               | both        | Allowlist: only expose the tools in this list                   |
| `disabledTools`    | `string[]`               | both        | Blocklist: exclude the tools in this list                       |

::: warning Note
Stdio entries in a project-level `.byf/mcp.json` execute local commands when the session starts. Only enable project-level MCP servers in repositories you trust.
:::

## Tool naming and permissions

MCP tools are exposed using the naming convention `mcp__<server>__<tool>`. Permission matching supports `*` and `**` wildcards, so `mcp__github__*` covers every tool from the `github` server.

Calls that do not match any rule trigger an approval request. Choosing "Approve for this session" in the approval prompt auto-approves subsequent matching calls.

You can also pre-load permanent rules in the `[[permission.rules]]` array of tables in `config.toml`:

```toml
[[permission.rules]]
decision = "allow"
pattern = "mcp__github__*"

[[permission.rules]]
decision = "deny"
pattern = "mcp__filesystem__write_file"
```

The full syntax of the `pattern` field and the accepted values of other fields such as `decision`, `scope`, and `reason` are documented in [Config files](../configuration/config-files.md#permission).

## Security

- Only integrate MCP servers from trusted sources
- Check that the tool name and arguments are reasonable in approval requests
- Keep manual approval for high-risk tools, and avoid broad `mcp__*` wildcard allowlisting

::: warning Note
In YOLO mode, MCP tool calls are auto-approved like any other tool. Only use this mode when you fully trust the integrated MCP servers.
:::
