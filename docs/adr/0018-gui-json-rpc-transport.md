# ADR 0018: GUI ↔ Core Transport Uses JSON-RPC 2.0 Over NDJSON

## Status

Accepted

## Context

PRD-0009 introduces a native macOS GUI (`apps/gui/macos`) that must communicate with the agent engine (`agent-core` via `node-sdk`). A Swift host cannot run a Node.js engine in-process, so the engine runs as a forked subprocess (`packages/gui-core` SEA binary) and the two communicate over a wire protocol on stdio.

The agent engine already has a well-typed in-process RPC contract (`CoreAPI` / `SDKAPI` / `AgentEvent` in `packages/agent-core/src/rpc/`), but it has no wire transport — `createRPC` simulates the network with `JSON.stringify` round-trips and `setTimeout(0)`. The transport is genuinely new work.

Options considered:

1. **JSON-RPC 2.0 over NDJSON (stdio)** — the same wire shape MCP and LSP use. One JSON object per line. `agent-core` already depends on `@modelcontextprotocol/sdk`, and its `StdioClientTransport` is a proven reference for this exact framing.
2. **Custom NDJSON protocol** — invent request/response/notification framing from scratch. Slightly smaller frames, but we re-derive what JSON-RPC already standardizes.
3. **JSON-RPC 2.0 over LSP `Content-Length` framing** — binary-safe header-prefixed framing. Heavier to parse; overkill for text-dominant agent output.
4. **gRPC / protobuf** — schema-first binary protocol. Strong typing, but adds a heavyweight toolchain dependency and poor `tail -f` debuggability; mismatched to a JS↔Swift boundary.

A hard requirement that eliminated some options: the protocol is **bidirectional and asymmetric**. Beyond the host→core requests (`prompt`, `createSession`, …) and core→host event stream (`emitEvent`), core also issues **reverse requests** (`requestApproval`, `requestQuestion`) that the host must answer with a correlated response. Any protocol without first-class request-id correlation forces us to hand-roll that.

## Decision

Adopt **JSON-RPC 2.0 over NDJSON framing on stdio** for the gui-core ↔ host boundary.

Concretely:

- **Message format**: JSON-RPC 2.0. Three message kinds map cleanly to byf's needs:
  - host→core calls (`createSession`, `prompt`, …) → `request`
  - return values / errors → `response`
  - core→host event stream (`emitEvent`) → `notification` (method `event`)
  - core→host reverse requests (`requestApproval`/`requestQuestion`) → `request` with its own id; host answers with a matching `response`.
- **Framing**: NDJSON — one complete JSON object per line. No bare `\n` inside a frame body; all newlines must be escaped (guaranteed by using a JSON encoder, never hand-concatenating strings).
- **Error model**: reuse `ByfErrorPayload`, mapped to JSON-RPC's `error: { code, message, data }`.
- **Method namespacing**: mirror the `CoreAPI` layering — `core.*` / `session.*` / `agent.*`.
- **Transport abstraction**: `gui-core` exposes a `Transport` interface; MVP implements `StdioTransport`, with `UnixDomainSocketTransport` reserved for when stdio pollution (accidental stdout writes inside the subprocess) or multi-window engine sharing becomes a real pain. Switching transports requires zero protocol change.

Constraints on the subprocess to keep stdio clean:

- The gui-core entry (`main.ts`) writes **only** JSON-RPC frames to stdout.
- All logging is forced to stderr. The `getRootLogger()` sink is configured to stderr.
- Subprocess stderr uses a bounded tail buffer (modeled on `StdioClientTransport`'s `BoundedTail`) to prevent an exploding stderr from blocking the process.

## Consequences

- **Positive**: Zero new dependencies (MCP SDK already present). Reverse-RPC correlation is solved by JSON-RPC's id field rather than hand-rolled. Debuggable with `tail -f`. The contract layer in `agent-core/src/rpc/` is the schema source of truth — gui-core only adds framing, not a parallel schema.
- **Positive**: Transport-swappable (UDS) without touching the protocol, matching LSP/MCP's transport-agnostic design.
- **Negative**: NDJSON framing forbids bare newlines in frame bodies — a discipline that must be enforced (Swift side must use a JSON encoder, never string concatenation). Embedding large diffs/code is fine (escapes), but the rule must be documented in `apps/gui/protocol/SPEC.md`.
- **Negative**: stdout pollution risk inside the subprocess — any stray `console.log` in engine code or transitive deps corrupts the stream. Mitigated by forcing logs to stderr and by reserving UDS as an escape hatch.
- **Method catalog**: the JSON-RPC method list (`core.*` / `session.*` / `agent.*`) is derived from the `CoreAPI` type itself — gui-core's `methods.ts` generates the dispatch table from the type, and `apps/gui/protocol/SPEC.md` is its language-agnostic projection for the Swift host. There is no hand-maintained parallel schema.
- **Note**: gui-core does **not** register the plan-related methods (`getPlan`/`enterPlan`/`cancelPlan`/`clearPlan`) on the wire — they are removed at the protocol layer per ADR 0008.
