# PRD-0014: Legacy SSE MCP Transport Support

**Status**: Done
**Created**: 2026-06-22
**Author**: BYF
**Related**: CONTEXT.md (MCP glossary), docs/en/customization/mcp.md (user config guide)

## Problem

BYF currently supports two MCP transport types: **stdio** (local subprocess) and **streamable HTTP** (the MCP spec's modern HTTP transport, `StreamableHTTPClientTransport`). Some MCP servers — particularly older ones published before the 2025-03-26 spec revision — only expose the **legacy SSE transport** (a long-lived GET SSE stream for server→client + POST for client→server). Users connecting to these servers today get a confusing connection failure because BYF has no `SSEClientTransport` codepath.

The SDK (`@modelcontextprotocol/sdk`) already ships `SSEClientTransport` and explicitly sanctions its use as a backwards-compat measure for legacy servers ("clients may need to support both transports during the migration period"). The codebase's transport architecture (discriminated-union config + factory-pattern `createClient`) makes adding a third transport a well-scoped extension — the only non-trivial design point is terminal-error detection, because `SSEClientTransport`'s error semantics differ from `StreamableHTTPClientTransport`.

## Goal

Add a third MCP transport option, `transport: "sse"`, that connects to legacy SSE-only MCP servers via the SDK's `SSEClientTransport`. It coexists with `stdio` and `http` (streamable HTTP) as a peer in the discriminated-union config and the `createClient` factory. Users with legacy SSE servers can declare them explicitly in `mcp.json`.

## Not Building (Out of Scope)

- **HTTP→SSE auto-fallback**: SDK's recommended "try streamable HTTP, fall back to SSE" pattern is NOT included. MVP requires explicit `transport: "sse"`. The factory structure does not preclude adding fallback later, but it is deferred to keep scope minimal.
- **Config shorthand inference for SSE**: Bare `url` entries continue to default to `transport: "http"`. SSE requires explicit `transport: "sse"`. This is deliberate — SSE and HTTP have field-for-field identical config shapes, so inference cannot disambiguate them.
- **Wall-clock / retry-cap health monitoring for SSE**: The `eventsource` library reconnects indefinitely on transient errors. MVP uses minimal terminal detection (Unauthorized + server-forced-close only). A more aggressive liveness probe is deferred until real-world need is demonstrated.
- **SSE-specific user documentation beyond the config guide**: No separate guide page; the existing `docs/en/customization/mcp.md` and Chinese mirror get a transport-options update only.

## What I Already Know (ground truth from code)

### Transport architecture (3 layers)

1. **Config schema** (`packages/agent-core/src/config/schema.ts:155-203`):
   - Zod discriminated union on `transport: 'stdio' | 'http'`.
   - `McpServerCommonFields` shared by all transports (enabled, startupTimeoutMs, toolTimeoutMs, enabledTools, disabledTools).
   - `z.preprocess` infers transport from shorthand: bare `command` → `stdio`, bare `url` → `http`.
   - HTTP config: `url` + `headers` + `bearerTokenEnvVar`.

2. **Transport clients** (`packages/agent-core/src/mcp/client-*.ts`):
   - `StdioMcpClient` wraps SDK `StdioClientTransport`; `HttpMcpClient` wraps `StreamableHTTPClientTransport`.
   - Both implement `MCPClient` interface (listTools/callTool) **plus** `onUnexpectedClose(listener)` (runtime contract used by connection manager).
   - Both follow identical hook-before-handshake pattern: install `onclose`/`onerror` hooks BEFORE `client.connect()`, use `ready`/`closed` latches to distinguish handshake-phase failures (caller sees via `connect()` throwing) from post-ready disconnects (fires `onUnexpectedClose`).
   - `buildMcpHttpHeaders(config, envLookup)` in `client-http.ts` — transport-agnostic header builder; reusable for SSE.

3. **Connection manager** (`packages/agent-core/src/mcp/connection-manager.ts`):
   - `createClient()` factory (lines 291-302): switch on `config.transport`.
   - `RuntimeMcpClient = StdioMcpClient | HttpMcpClient` (line 40) — type of `entry.client`.
   - `McpServerEntry.transport: 'stdio' | 'http'` (line 19) — public status surface.
   - `resolveOAuthProvider()` (lines 304-318): attaches OAuth provider only for `transport === 'http'` + no static bearer + tokens exist.
   - `shouldMarkNeedsAuth()` (lines 320-330): same `transport === 'http'` gate.

### SDK SSEClientTransport (from `@modelcontextprotocol/sdk@1.29.0`)

- **Import**: `import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'` (deep path, not barrel-exported — same pattern as stdio/streamableHttp).
- **Constructor**: `new SSEClientTransport(url: URL, opts?: SSEClientTransportOptions)`.
- **Options overlap with StreamableHTTP**: `authProvider`, `requestInit`, `fetch` — all accepted with identical semantics. Additional SSE-only: `eventSourceInit`.
- **Implements `Transport`**: same `start()`, `send()`, `close()`, `onclose`/`onerror`/`onmessage` contract. SDK `Client.connect(transport)` works with either.
- **Marked `@deprecated`**: "Prefer to use StreamableHTTPClientTransport where possible. Note that because some servers are still using SSE, clients may need to support both transports during the migration period."

### ⚠️ Critical difference: terminal-error semantics

| Aspect                                | `StreamableHTTPClientTransport`                                                     | `SSEClientTransport`                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Reconnect budget                      | Built-in (`maxRetries: 2`); exhaustion → `"Maximum reconnection attempts exceeded"` | **None**. Underlying `eventsource` library reconnects **indefinitely** on transient errors |
| Terminal signal                       | `UnauthorizedError` + reconnect-exhaustion message                                  | `UnauthorizedError` + `SseError` with `code === 204` (server-forced close via HTTP 204)    |
| Existing `isTerminalTransportError()` | ✅ Works (matches UnauthorizedError + reconnect message)                            | ❌ **Does NOT work** — SSE never emits "Maximum reconnection attempts"                     |

**Implication**: `SseMcpClient` needs its own terminal-error predicate. Reusing `client-http.ts`'s `isTerminalTransportError` would mean SSE flaps never resolve as terminal (except Unauthorized).

### Reusable helpers (`client-shared.ts`)

All transport-agnostic, safe to reuse in `client-sse.ts`:

- `BYF_MCP_CLIENT_NAME`, `BYF_MCP_CLIENT_VERSION`
- `buildRequestOptions(toolCallTimeoutMs, signal)`
- `toMcpToolDefinition(tool)`, `toMcpToolResult(result)`
- `UnexpectedCloseReason`, `UnexpectedCloseListener`

## Requirements

1. **New config schema** `McpServerSseConfigSchema`: `transport: z.literal('sse')` + `url` + `headers` + `bearerTokenEnvVar` + `McpServerCommonFields`. Field-for-field identical to HTTP schema except the `transport` literal. Add to `McpServerConfigDiscriminatedSchema`.
2. **New client** `SseMcpClient` in `packages/agent-core/src/mcp/client-sse.ts`: wraps SDK `SSEClientTransport`, implements `MCPClient` + `onUnexpectedClose()`, structurally mirrors `HttpMcpClient` (hook-before-handshake, ready/closed latches, buffered unexpectedClose replay).
3. **SSE-specific terminal-error predicate** `isTerminalSseError(error)`: uses `error instanceof SseError` (imported from `@modelcontextprotocol/sdk/client/sse.js`) + `error.code === 204` for server-forced close, plus message-sniff `/unauthorized/i` for auth failures. Lives in `client-sse.ts` (not shared — transport-specific). **Note**: The SDK's `SseError` and `UnauthorizedError` classes never set `this.name` (it defaults to `'Error'`), so `error.name` checks do NOT work — `instanceof` or message-sniff is required.
4. **Connection manager updates**: `createClient()` gains `'sse'` branch; `RuntimeMcpClient` union adds `SseMcpClient`; `McpServerEntry.transport` widens to `'stdio' | 'http' | 'sse'`; `resolveOAuthProvider()` and `shouldMarkNeedsAuth()` extend their transport gate to `'http' | 'sse'` (SSE supports the same `authProvider` option and OAuth flow).
5. **Config preprocess unchanged**: bare `url` still defaults to `'http'`. SSE requires explicit `transport: "sse"`.
6. **Index re-exports**: `packages/agent-core/src/mcp/index.ts` exports the new client + config type.
7. **User docs update**: `docs/en/customization/mcp.md` + `docs/zh/customization/mcp.md` add `sse` as a transport option with a brief note about legacy SSE servers.
8. **Changeset**: `minor` bump for `@byfriends/agent-core` (new transport option, no breaking change to existing configs).

## Acceptance Criteria

- [ ] `mcp.json` entry with `"transport": "sse"` + `"url": "..."` parses, connects, lists tools, and calls tools against a legacy SSE MCP server.
- [ ] `McpServerSseConfigSchema` accepts the same optional fields as HTTP (headers, bearerTokenEnvVar, enabled, startupTimeoutMs, toolTimeoutMs, enabledTools, disabledTools).
- [ ] SSE server with `bearerTokenEnvVar` resolves the token from env at connection time (same as HTTP).
- [ ] SSE server returning 401 (without static bearer, without pre-existing OAuth tokens) flips to `needs-auth` status, same as HTTP.
- [ ] `SseMcpClient` detects terminal errors via `isTerminalSseError` (Unauthorized + code 204) and fires `onUnexpectedClose`; transient errors do NOT fire unexpected-close (eventsource auto-reconnects).
- [ ] `McpServerEntry.transport` reports `'sse'` for SSE entries in status/listing.
- [ ] Bare `url` entries (no transport field) still default to `'http'`, not `'sse'`.
- [ ] `createClient()` factory selects `SseMcpClient` for `transport === 'sse'`.
- [ ] `SSEClientTransport` import carries no special suppression — the project's tsconfig (`deprecation` not set) and oxlint (`typescript/no-deprecated: "off"`) do not flag `@deprecated` SDK imports.
- [ ] Existing stdio and HTTP transport tests pass unchanged.
- [ ] User docs (`docs/en` + `docs/zh`) list `sse` as a transport option.
- [ ] Changeset generated under `.changeset/` with `minor` bump for `@byfriends/agent-core`.

## Technical Approach

### Decision (ADR-lite)

**D1 — Explicit `transport: "sse"` (no shorthand inference)**

- SSE and HTTP have identical config fields (`url`/`headers`/`bearerTokenEnvVar`). Shorthand inference cannot disambiguate.
- Requiring explicit `transport: "sse"` is consistent with the discriminated-union pattern and makes user intent unambiguous.
- Users connecting to legacy SSE servers know they need SSE; the explicit declaration aids debugging.

**D2 — Minimal terminal detection (no wall-clock / retry-cap)**

- Only `UnauthorizedError` and `SseError(code===204)` are treated as terminal failures.
- Transient errors rely on `eventsource` library's built-in auto-reconnect.
- Trade-off: a server that goes permanently offline (non-204) may leave the entry stuck in `connected` with ongoing reconnect attempts. Accepted for MVP — adding liveness probes adds complexity and config surface without demonstrated real-world need. The factory structure does not preclude adding a liveness probe later.

**D3 — SSE-specific `isTerminalSseError`, not a shared predicate**

- SSE and streamable-HTTP have fundamentally different terminal-error signals. A shared function with transport-conditional logic would be less clear than two focused predicates.
- `isTerminalTransportError` stays in `client-http.ts`; `isTerminalSseError` lives in `client-sse.ts`.

**D4 — OAuth flow extended to SSE**

- `SSEClientTransport` accepts the same `authProvider` option. The `resolveOAuthProvider()` and `shouldMarkNeedsAuth()` gates widen from `transport === 'http'` to `transport === 'http' || transport === 'sse'`.
- SSE servers that need OAuth get the same `needs-auth` → synthetic authenticate tool → browser flow → reconnect path as HTTP.

**D5 — `client-sse.ts` structurally mirrors `client-http.ts`**

- Same class structure: constructor builds SDK transport + `Client`, `connect()` installs hooks before handshake, `onUnexpectedClose()` with buffered replay, `listTools()`/`callTool()` delegate to SDK client.
- Reuses `buildMcpHttpHeaders` for header building. **Note**: `buildMcpHttpHeaders`'s parameter type must be narrowed from `McpServerHttpConfig` to `Pick<McpServerHttpConfig, 'headers' | 'bearerTokenEnvVar'>` so SSE config can be passed — the full `McpServerHttpConfig` type has a required `transport: 'http'` literal that blocks `'sse'` structurally (code-verified: TypeScript rejects `transport: 'sse'` → `transport: 'http'`).

### Implementation touch-points (4 code files + 1 new + 2 docs)

**New file:**

- `packages/agent-core/src/mcp/client-sse.ts` — `SseMcpClient` class + `isTerminalSseError()`.

**Edit — `packages/agent-core/src/mcp/client-http.ts`:**

- Narrow `buildMcpHttpHeaders` parameter type from `McpServerHttpConfig` to `Pick<McpServerHttpConfig, 'headers' | 'bearerTokenEnvVar'>` so SSE config can be passed without a `transport: 'http'` literal mismatch.

**Edit — `packages/agent-core/src/config/schema.ts`:**

- Add `McpServerSseConfigSchema` (z.object with `transport: z.literal('sse')`, same fields as HTTP).
- Add to `McpServerConfigDiscriminatedSchema` discriminated union array.
- Export `McpServerSseConfig` type.
- Preprocess: **no change** (bare `url` → `'http'` stays as-is; SSE must be explicit).

**Edit — `packages/agent-core/src/mcp/connection-manager.ts`:**

- `RuntimeMcpClient` type: add `| SseMcpClient`.
- `McpServerEntry.transport`: widen to `'stdio' | 'http' | 'sse'`.
- `createClient()`: add `if (config.transport === 'sse')` branch → `new SseMcpClient(config, {...})`.
- `resolveOAuthProvider()`: gate `config.transport !== 'http'` → `config.transport !== 'http' && config.transport !== 'sse'`.
- `shouldMarkNeedsAuth()`: gate `entry.config.transport !== 'http'` → same widening.
- `getHttpServerUrl()`: widen transport gate to include `'sse'` (used by the synthetic auth tool for OAuth discovery against the server URL; SSE servers participating in OAuth need the same URL resolution).

**Edit — `packages/agent-core/src/mcp/index.ts`:**

- Re-export `SseMcpClient` and `McpServerSseConfig`.

**Edit — `docs/en/customization/mcp.md` + `docs/zh/customization/mcp.md`:**

- Add `sse` to transport options, with a note about legacy SSE servers and that `http` (streamable HTTP) is preferred for new servers.

### Tests (in existing test files)

- New `packages/agent-core/test/mcp/client-sse.test.ts`: SSE client connect/listTools/callTool, terminal-error detection (SseError code 204), transient-error tolerance (no unexpected-close fire). Mirrors `client-http.test.ts` structure with fake-fetch.
- `packages/agent-core/test/mcp/connection-manager.test.ts`: SSE entry connects, lists tools, calls tools; SSE 401 → needs-auth; terminal error → failed; `McpServerEntry.transport` reports `'sse'`.
- Config schema tests (wherever `McpServerConfigSchema` is tested): SSE schema parse + rejection of invalid configs; bare `url` still defaults to `'http'`.

## Domain Terms

- **Legacy SSE transport**: The original MCP HTTP transport (pre-2025-03-26 spec revision). Uses a long-lived GET Server-Sent Events stream for server→client messages and POST for client→server. Replaced by Streamable HTTP in the spec but still used by some servers. SDK class: `SSEClientTransport` (marked `@deprecated`).
- **Streamable HTTP transport**: The MCP spec's modern HTTP transport. Supports session management, resumable streams, and optional SSE for streaming responses. SDK class: `StreamableHTTPClientTransport`. BYF config transport literal: `'http'`.

## Open Questions

无。所有设计决策已解决（显式 `'sse'` 传输 + 最小终端检测 + SSE 专属错误谓词 + OAuth 扩展到 SSE）。

## Implementation Plan (small PRs)

1. **PR1 — SSE config schema + client skeleton**: Add `McpServerSseConfigSchema` to `schema.ts`, create `client-sse.ts` with `SseMcpClient` + `isTerminalSseError`, wire into `connection-manager.ts` (factory + types + OAuth gates), update `index.ts` exports. Unit tests for client + schema.
2. **PR2 — Integration tests + docs**: End-to-end SSE connection tests (fake-fetch pattern), update user docs (`docs/en` + `docs/zh`), generate changeset.

## Traceability

**Think session**: 2026-06-22. **Grilled**: 2026-06-23. Code cross-checked: `config/schema.ts`, `connection-manager.ts`, `client-http.ts`, `client-shared.ts`, `types.ts`, SDK `client/sse.d.ts` + `sse.js`, SDK `client/auth.js`, `tsconfig.json`, `.oxlintrc.json`.

**Grill resolved items:**

- G1 (buildMcpHttpHeaders typing): PRD claim "structural typing works" was **false** — `transport: 'http'` literal blocks `'sse'`. Fix: narrow parameter to `Pick<McpServerHttpConfig, 'headers' | 'bearerTokenEnvVar'>`.
- G2 (missing touch-point): `getHttpServerUrl()` in connection-manager gates on `transport !== 'http'` — must widen to include `'sse'` for OAuth discovery. Added to implementation touch-points.
- G3 (isTerminalSseError detection): SDK's `SseError` and `UnauthorizedError` never set `this.name` (always `'Error'`). Must use `error instanceof SseError` + `error.code === 204`, not `error.name` checks.
- G4 (deprecation AC moot): Project has no `deprecation: true` in tsconfig and `typescript/no-deprecated: "off"` in oxlint. Importing `SSEClientTransport` won't fail any build/lint. AC simplified.
- G5 (isUnauthorizedLikeError for SSE 401): Existing function checks `.code === 401` on error — `SseError` carries `code` property. Works without modification beyond the transport-gate widening in D4.
- G6/G7 (CONTEXT.md glossary): MCP entry updated from "stdio/HTTP" to "stdio/HTTP/SSE" with a note distinguishing SSE (legacy) from Streamable HTTP.
- G8 (ADR assessment): No decision meets all 3 conditions (hard to reverse + surprising + real trade-off). D2 (minimal terminal detection) is closest but fails "hard to reverse" — liveness probes are additive. No ADR created.
- G9/G10 (test file structure): Actual paths are `packages/agent-core/test/mcp/{client-http,client-stdio,connection-manager,tool-manager-mcp}.test.ts`. New test: `client-sse.test.ts` (new file, mirrors `client-http.test.ts`). Updated PRD.

**Sliced into:**

- #182 — [PRD-0014] SSE transport core — config + client + manager wiring (AFK, open) — In Progress
- #183 — [PRD-0014] SSE docs + changeset — ship readiness (AFK, blocked by #182, open) — In Progress

**Implemented by:**

- #182: `packages/agent-core/src/mcp/client-sse.ts`, `packages/agent-core/src/config/schema.ts`, `packages/agent-core/src/mcp/connection-manager.ts`, `packages/agent-core/src/mcp/client-http.ts`, `packages/agent-core/src/mcp/index.ts`, `packages/agent-core/src/rpc/core-api.ts`, `packages/agent-core/src/rpc/events.ts`
- #183: `docs/en/customization/mcp.md`, `docs/zh/customization/mcp.md`, `.changeset/sse-mcp-transport-support.md`
