# ADR 0011: Turn-Boundary Cache Staking Strategy

## Status

Accepted

## Context

ADR 0009 Phase 4 established a multi-boundary cache design with breakpoints only on the system prompt and tool definitions. Conversation history was explicitly marked "No cache." This was a conservative starting point.

Production usage revealed this leaves significant caching value on the table. In a 10-turn CLI session, every turn re-sends the entire conversation history without any cache benefit. Since history (especially tool results with large file contents) often dominates token count, the per-turn cost savings from caching even one turn of history are substantial.

Anthropic allows up to 4 `cache_control` breakpoints per request. ADR 0009 used only 2 (system prompt + tools). The remaining 2 slots were unused.

Meanwhile, analysis of CLI/TUI caching best practices ("golden rules") identified a clear staking strategy:

1. **Stake 1**: System prompt end (existing)
2. **Stake 2**: Tools array end (existing)
3. **Stake 3**: Previous turn's last assistant message (new)
4. **Stake 4 (dynamic)**: Largest content block in current turn, if above threshold (new)

Stake 3 is the highest-value addition: it freezes the entire preceding conversation (including expensive tool results) into cache, so the current turn only pays full price for new input.

Stake 4 optimizes streaming performance (TTFT/TPS) when the current turn contains a large burst of context (user-pasted logs, large file reads).

## Decision

### 3+1 Staking Model

```
[Stake 1] System prompt (via PromptPlan blocks)
[Stake 2] Tools array end (last tool definition)
[Stake 3] Previous turn's last assistant message   ← NEW
--- cache boundary ---
[Stake 4] Dynamic: largest content in current turn   ← NEW (conditional)
[Current user input]
```

### Architecture: Compute-Consumer Decoupling

Introduce a **CacheStakingStrategy** module in agent-core that produces provider-agnostic logical tags on messages. Provider adapters consume these tags and translate to their native cache control format.

**Why decoupled:** The strategy module must not know about provider types. Provider-specific caching behavior (Anthropic explicit blocks vs. OpenAI automatic prefix matching) is solely the adapter's concern. This follows the Open/Closed Principle: adding a new provider requires only a new adapter, not changes to the staking strategy.

### Logical Tagging Protocol

Extend kosong's `Message` type with an optional `cacheHint` field:

```typescript
interface CacheHint {
  readonly isLastTurnEnd?: boolean;
  readonly isSuddenLargeContext?: boolean;
}

interface Message {
  // ... existing fields ...
  readonly cacheHint?: CacheHint;
}
```

**Why on Message (not a separate map):** `cacheHint` is a high-level semantic (like `role` or `content`) expressing "this message's position in the temporal stream." It travels with the data, surviving copies and slices. Zero runtime overhead (same memory reference). Non-Anthropic adapters simply ignore it during serialization.

### Turn Boundary Identification

The strategy receives `previousTurnMessageCount` from TurnFlow (which already knows turn boundaries). No reverse inference from message roles or content patterns.

### Tool Stability Ordering

Tools are ordered by stability: Builtin tools first (never change), MCP tools after (may connect/disconnect). When MCP tools are absent, a fixed sentinel marker is appended to ensure Stake 2's physical endpoint never collapses into Stake 1's endpoint.

### Dynamic Context Anchor (Stake 4)

Before sending, scan current-turn messages for content exceeding a size threshold (~2000 chars). If found, tag the largest block with `isSuddenLargeContext`. This stake is conditional: it is only placed when a qualifying large block exists.

### Two Parallel Mechanisms

| Mechanism            | Scope                                    | Carrier                      | Module                     |
| -------------------- | ---------------------------------------- | ---------------------------- | -------------------------- |
| PromptPlan           | System prompt + tools (static blueprint) | `GenerateOptions.promptPlan` | `agent-core/prompt-plan`   |
| CacheStakingStrategy | Conversation history (dynamic coloring)  | `Message.cacheHint`          | `agent-core/cache-staking` |

These are not redundant. PromptPlan manages non-array structures (system text, tool schemas). CacheStakingStrategy manages array-structured conversation history. The different physical data models warrant different mechanisms.

### Timestamp Fix

The directory tree injection contained `new Date().toISOString()` which regenerated every time. Changed to inject the timestamp once at session start, preventing unnecessary cache invalidation.

### Future Defensive Rules

Runtime state that changes per-request (token budget remaining, TUI viewport, terminal dimensions) must NEVER enter the system prompt or tool definitions. Such data must be attached as ephemeral content in the final user message.

## Consequences

- **Positive**: Per-turn Anthropic billing drops significantly. A 10-turn session with tool results caches turns 1-9; only turn 10's new input pays full price. For typical CLI sessions, this could reduce input token costs by 50-80%.
- **Positive**: Streaming TTFT improves when large context blocks are cached via Stake 4.
- **Positive**: Provider-agnostic design means non-Anthropic providers benefit from stable ordering without code changes.
- **Positive**: Adding new providers requires no changes to the staking strategy.
- **Negative**: The `cacheHint` field on `Message` is visible to all providers. Non-Anthropic adapters must simply ignore it (no harm, but it is extra data in memory).
- **Negative**: MCP tool changes (connect/disconnect) still invalidate the tools cache stake. Accepted trade-off; mitigated by stability ordering.
- **Negative**: The dynamic context anchor (Stake 4) adds a per-request scan of current-turn messages. Negligible cost (string length comparison).
