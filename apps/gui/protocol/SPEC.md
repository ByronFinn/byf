# BYF GUI Native Host Protocol

**Version**: 1.0
**Transport**: stdio (NDJSON framing)
**Message Format**: JSON-RPC 2.0
**Encoding**: UTF-8

## Overview

The native GUI host (Swift AppKit) communicates with the agent engine (gui-core SEA binary) by forking it as a child process with pipes on stdin/stdout. The protocol is **JSON-RPC 2.0** over **NDJSON** (one complete JSON object per line, delimited by `\n`).

This is the **language-agnostic cross-platform seam** — all future native hosts (macOS, Linux, Windows) share this protocol specification, implementing the client side in their respective languages.

## Transport

- **stdin**: GUI host writes JSON-RPC frames TO the engine (requests, responses)
- **stdout**: Engine writes JSON-RPC frames TO the GUI host (responses, notifications, reverse requests)
- **stderr**: Reserved for engine diagnostics (BoundedTail capture, never parsed as protocol)
- **Line delimiter**: `\n` (U+000A)
- **Frame**: One complete JSON object per line. **No bare `\n` inside a frame** — all newlines within string values must be escaped (`\n`) by using a proper JSON encoder.

### Constraints

1. **Message body must not contain bare newlines.** Use `JSON.stringify` / `JSONSerialization.data` to encode JSON; never hand-concatenate strings with `\n`.
2. **stdout is protocol-only.** The engine must never write non-JSON data to stdout. All diagnostics, logs, and errors go to stderr.
3. **Stderr uses BoundedTail** (4KB ring buffer) on the engine side to prevent unbounded memory growth.

## Message Format (JSON-RPC 2.0)

Every frame is a valid JSON-RPC 2.0 message with `"jsonrpc": "2.0"`.

### Request (GUI → Engine)

```
{"jsonrpc":"2.0","id":1,"method":"core.createSession","params":{"workDir":"/path"}}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jsonrpc` | `"2.0"` | ✅ | Protocol version marker |
| `id` | `number` | ✅ | Request identifier (integer). Used to correlate response. |
| `method` | `string` | ✅ | Method name (see Method Namespace) |
| `params` | `object` | Optional | Method parameters |

### Response (Engine → GUI)

```
{"jsonrpc":"2.0","id":1,"result":{"sessionId":"session_xxx","workDir":"/path"}}
```

Or with error:

```
{"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"Internal error","data":{...}}}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jsonrpc` | `"2.0"` | ✅ | Protocol version marker |
| `id` | `number` | ✅ | Must match the corresponding request's id |
| `result` | `any` | See note | Present on success. Mutually exclusive with `error`. |
| `error` | `object` | See note | Present on failure. See Error Model. |

### Notification (Engine → GUI)

```
{"jsonrpc":"2.0","method":"event","params":{"type":"turn.started",...}}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jsonrpc` | `"2.0"` | ✅ | Protocol version marker |
| `method` | `string` | ✅ | Always `"event"` for event notifications |
| `params` | `object` | ✅ | An `AgentEvent` object (see Event Types) |

Notifications have **no `id`** — they are one-way push events from the engine.

### Reverse Request (Engine → GUI)

```
{"jsonrpc":"2.0","id":100,"method":"requestApproval","params":{"toolCallId":"call_1",...}}
```

The engine sends a **request with an id** to the GUI host. The GUI must respond with a matching `id`:

```
{"jsonrpc":"2.0","id":100,"result":{"decision":"approved"}}
```

This is the core mechanism for tool approval and user questions.

| Method | Direction | Description |
|--------|-----------|-------------|
| `requestApproval` | Engine → GUI | Request user approval for a tool call |
| `requestQuestion` | Engine → GUI | Request user input for a question |
| `toolCall` | Engine → GUI | (Reserved) Custom SDK tool execution |

### Method Namespace

Methods are namespaced to mirror the CoreAPI/SessionAPI/AgentAPI layering:

| Prefix | Scope | Examples |
|--------|-------|----------|
| `core.*` | Global engine lifecycle | `core.createSession`, `core.resumeSession`, `core.listSessions`, `core.closeSession` |
| `session.*` | Per-session operations | `session.prompt`, `session.cancel`, `session.setModel`, `session.compact` |
| `agent.*` | Per-agent introspection | `agent.getConfig`, `agent.getUsage`, `agent.listSkills`, `agent.activateSkill`, `agent.getBackground` |

The following methods are **NOT registered** (plan mode removed per ADR 0008):

- `agent.getPlan`, `agent.clearPlan`, `agent.enterPlan`, `agent.cancelPlan`
- `session.getPlan`, `session.clearPlan`, `session.enterPlan`, `session.cancelPlan`
- `core.getPlan`, `core.clearPlan`, `core.enterPlan`, `core.cancelPlan`

## Event Types

All events from the engine arrive as `{"jsonrpc":"2.0","method":"event","params":<AgentEvent>}`.

The `params` object is a discriminated union on the `type` field. Key event types:

### Turn Lifecycle
| Type | Description |
|------|-------------|
| `turn.started` | A new turn begins (`turnId`, `origin`) |
| `turn.ended` | A turn completes (`reason: 'completed'\|'cancelled'\|'failed'`) |
| `turn.step.started` | A step within a turn begins |
| `turn.step.completed` | A step within a turn completes (with `usage`) |
| `turn.step.interrupted` | A step was interrupted |

### Streaming Content
| Type | Description |
|------|-------------|
| `assistant.delta` | Streaming text token from the assistant |
| `thinking.delta` | Streaming thinking/reasoning token |
| `tool.call.started` | A tool call begins (`name`, `args`, `display`) |
| `tool.call.delta` | Streaming tool call arguments |
| `tool.progress` | Tool execution progress update |
| `tool.result` | Tool execution result (`output`, `isError`, `blockedReason`) |

### Status
| Type | Description |
|------|-------------|
| `agent.status.updated` | Model/permission/usage/context changed |
| `session.meta.updated` | Session metadata changed |
| `error` | An error occurred |
| `warning` | A warning condition |

### Background Tasks
| Type | Description |
|------|-------------|
| `background.task.started` | A background task started |
| `background.task.updated` | Background task status changed |
| `background.task.terminated` | Background task completed/failed/killed |

### Event ID
Every event object includes `agentId` and `sessionId` fields. The GUI host must route events to the correct session tab based on `sessionId`.

## Error Model

JSON-RPC standard errors:

| Code | Meaning |
|------|---------|
| `-32700` | Parse error (invalid NDJSON frame) |
| `-32600` | Invalid Request |
| `-32601` | Method not found |
| `-32603` | Internal error |

Custom errors carry the full `ByfErrorPayload` in the `data` field:
```json
{
  "code": -32603,
  "message": "Internal error",
  "data": {
    "code": "some.error.code",
    "message": "Human-readable message",
    "details": "..."
  }
}
```

## Session Routing

Multiple sessions share the same stdio connection. The GUI must route:

- **Events**: by `params.sessionId` → corresponding `ChatViewController`
- **Reverse requests**: by active tab (the session the user is currently interacting with) or by the turnId/toolCallId's session context
- **Responses**: by `id` → the originally-sending component's pending promise

## Healthcheck

On engine startup, the GUI should send:
```
{"jsonrpc":"2.0","id":1,"method":"core.listSessions","params":{"workDir":"<workDir>"}}
```

If the engine is ready, it responds with a session list (possibly empty). This verifies:
- Engine started successfully
- HomeDir and SessionStore are initialized
- Config is loaded

Do NOT use `getCoreInfo` as a healthcheck — it only returns a version string and does not verify engine initialization.