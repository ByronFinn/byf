# ADR 0006: Monorepo Layered Architecture

## Status

Accepted

## Context

BYF is a TypeScript monorepo with multiple packages and applications. We need to document the intentional layering and dependency direction so future contributors and AI agents understand what can depend on what.

## Decision

The codebase is organized in four layers with strict dependency direction (top depends on bottom):

```
apps/cli  ──→  packages/node-sdk  ──→  packages/agent-core  ──→  packages/kosong
                                                                          ──→  packages/kaos
apps/vis  ──→  (type + wire-migration runtime from agent-core; types only from kosong)
```

### Layer responsibilities

| Layer       | Package               | Role                                                                                                                                                                                  |
| ----------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application | `apps/cli`            | CLI / TUI. Consumes core capabilities **only** through `@byfriends/sdk`. Must not import `@byfriends/agent-core` directly.                                                            |
| Application | `apps/vis`            | Visual debugging. Reads session data from filesystem. Takes a read-only runtime dependency on wire-record migration functions and the `AGENT_WIRE_PROTOCOL_VERSION` constant from `agent-core`. Type-only from `kosong`.                                                  |
| SDK         | `packages/node-sdk`   | Public TypeScript SDK. Bridges host applications to agent-core via typed RPC channel (`createRPC<CoreAPI, SDKAPI>`). Isolation seam between CLI and engine internals.                 |
| Engine      | `packages/agent-core` | Unified agent engine: Agent, Session, Profile, Skill, Tool, Plan, Permission, Background, Records, Compaction, RPC, Config. Depends on kosong (LLM) and kaos (execution environment). |
| LLM         | `packages/kosong`     | Provider abstraction layer. `ChatProvider` interface with adapters for OpenAI, Anthropic, Google GenAI. Stateless `generate()` loop handles streaming, tool call routing, abort.      |
| Environment | `packages/kaos`       | Execution environment abstraction. `Kaos` interface with `LocalKaos` and `SSHKaos` adapters. Bound to async context. No knowledge of agents or LLMs.                                  |
| Utility     | `packages/oauth`      | OAuth and authentication utilities. Retained for transition period.                                                                                                                   |
| Utility     | `packages/telemetry`  | Telemetry infrastructure. Disabled in BYF.                                                                                                                                            |

### Key invariants

- **CLI → agent-core dependency is forbidden.** The SDK (`@byfriends/sdk`) is the only access path. Enforced by convention and `apps/cli/AGENTS.md`.
- **agent-core never touches `fs` or `child_process` directly** for operations that might run remotely. All file/process operations go through `Kaos`.
- **kosong and kaos have no knowledge of each other.** Both are consumed by agent-core independently.
- **vis reads from filesystem, not from agent-core at runtime (except wire-migration helpers).** It imports only type definitions, the `AGENT_WIRE_PROTOCOL_VERSION` constant, and wire-record migration functions (`migrateWireRecord`, `resolveWireMigrations`). agent-coreʼs agent loop, Session, Profile, Skill, Tool, RPC, and other subsystems are never loaded.

### Internal architecture of agent-core

Agent-core has one main seam: the `Agent` class is the central hub holding 14 subsystems. The `Session` is the outer container that creates and owns `Agent` instances. The `Loop` is stateless — called by `TurnFlow` and doesn't hold state between turns.

The `RPC` module defines three API layers: `CoreAPI` (full host), `SessionAPI` (per-session), `AgentAPI` (per-agent). `SDKAPI` is the callback interface the host must implement.

### Internal architecture of kosong

The `ChatProvider` interface is the central seam. Each adapter (OpenAI Completions, OpenAI Responses, Anthropic, Google GenAI) implements `generate()` returning a `StreamedMessage`. The `createProvider()` factory dispatches on `ProviderConfig.type`.

## Consequences

- **Positive:** Clear dependency direction prevents circular coupling. The SDK seam allows replacing the CLI with alternative hosts. The Kaos seam allows running the same agent logic locally or remotely.
- **Positive:** vis can debug any session without importing the agent loop, Session, Profile, Skill, Tool, RPC, or other agent-core subsystems at runtime. The only agent-core surface loaded is the wire-migration layer (a thin, stable leaf dependency).
- **Negative:** node-sdk adds an RPC indirection layer. The trade-off is intentional — the isolation seam is more valuable than the call overhead.
