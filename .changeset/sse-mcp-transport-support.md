---
'@byfriends/agent-core': minor
---

feat: add legacy SSE MCP transport support

Adds a third MCP transport option, `transport: "sse"`, that connects to
legacy SSE-only MCP servers via the SDK's `SSEClientTransport`. Key changes:

- **Config schema**: New `McpServerSseConfigSchema` with `transport: z.literal('sse')`.
  Field-for-field identical to HTTP schema (`url`, `headers`, `bearerTokenEnvVar`,
  `McpServerCommonFields`). Added to the discriminated union. Bare `url` entries
  without a `transport` field still default to `'http'` — SSE requires explicit
  `"transport": "sse"`.

- **SSE client**: `SseMcpClient` class wrapping `SSEClientTransport`, structurally
  mirroring `HttpMcpClient` (hook-before-handshake, ready/closed latches, buffered
  `onUnexpectedClose` replay). Includes SSE-specific terminal-error predicate
  `isTerminalSseError` (SseError code 204 + `/unauthorized/i` message sniff).

- **Connection manager**: `createClient()` factory supports the `'sse'` branch;
  `RuntimeMcpClient` union widened; OAuth gates (`resolveOAuthProvider`,
  `shouldMarkNeedsAuth`, `getHttpServerUrl`) extended to SSE servers.

- **User docs**: English and Chinese MCP config guides updated with SSE transport
  option, legacy note, config example, and widened optional-fields table.