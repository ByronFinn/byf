# PRD-0011: Turn-Boundary Cache Staking

## Problem Statement

BYF's prompt caching currently only covers the system prompt and tool definitions. Conversation history — which dominates token usage in multi-turn CLI sessions — is sent without any cache breakpoints. In a 10-turn session where tool results (file contents, test output) accumulate, every turn re-transmits the entire history at full input price.

Anthropic's API supports up to 4 `cache_control` breakpoints per request. BYF currently uses only 2 (system prompt + tools). The remaining capacity is wasted.

Additionally, tool definitions are not stability-ordered. MCP tools (which may connect/disconnect during a session) can appear anywhere in the tool list, potentially invalidating the tools cache stake even when built-in tools haven't changed.

Finally, the `DirectoryTreeInjector` includes `new Date().toISOString()` which regenerates on every injection, adding unnecessary variability to ephemeral injection content.

## Solution

Introduce a **CacheStakingStrategy** module that applies provider-agnostic logical cache hints to conversation history messages. Provider adapters consume these hints and translate them to their native cache control format.

The staking model uses 3 fixed + 1 conditional breakpoint:

```
[Stake 1] System prompt end           (existing, via PromptPlan)
[Stake 2] Tools array end             (existing, with stability ordering fix)
[Stake 3] Previous turn's last assistant message  (new)
[Stake 4] Largest content in current turn          (new, conditional on size threshold)
```

Stake 3 is the highest-value addition: it freezes the entire preceding conversation including expensive tool results into cache, so only new input in the current turn pays full price.

Stake 4 optimizes streaming TTFT/TPS when the current turn contains a large burst of context (user-pasted logs, large file reads).

## User Stories

1. As a **CLI user on Anthropic**, I want my multi-turn conversation history to be cached, so that my per-turn token costs decrease as the session progresses.

2. As a **CLI user on Anthropic**, I want the system to cache my large file reads and tool results from previous turns, so that I'm not paying full price for re-sending the same content every turn.

3. As a **CLI user**, I want the system to automatically place an additional cache breakpoint after large content I paste or receive, so that streaming output is faster when the model is processing a big context.

4. As a **developer**, I want cache staking logic to be decoupled from provider specifics, so that adding a new provider doesn't require changes to the staking strategy.

5. As a **developer**, I want cache hints to travel with messages as a standard field, so that the tagging intent survives message array operations (slice, copy, splice).

6. As a **developer**, I want the strategy to receive turn boundary information directly from TurnFlow, so that I don't have to reverse-engineer turn boundaries from message roles.

7. As a **system administrator**, I want built-in tools to always appear before MCP tools in the tool list, so that the tools cache prefix remains stable when MCP servers connect or disconnect.

8. As a **system administrator**, I want a sentinel marker to anchor the tools cache endpoint, so that the cache breakpoint never collapses when all MCP tools are absent.

9. As a **developer**, I want the directory tree injection timestamp to be captured once at first injection, so that re-injections of unchanged trees don't introduce unnecessary content variability.

10. As a **developer on a non-Anthropic provider**, I want cache hints on messages to be silently ignored by my adapter, so that I get stable ordering benefits without any code changes.

11. As a **developer**, I want to write unit tests for cache staking without constructing full provider requests, so that tests are focused and fast.

12. As a **system administrator**, I want to see in logs which messages were tagged with cache hints, so that I can debug cache staking behavior.

13. As a **developer**, I want future runtime state (token budgets, viewport state, terminal dimensions) to follow a clear rule about placement, so that these variables don't accidentally break caching.

## Implementation Decisions

### CacheHint Type Extension (in kosong)

Extend the shared `Message` type with an optional `cacheHint` field. This is a high-level semantic expressing a message's temporal caching significance — not a provider-specific API parameter.

```
CacheHint {
  isLastTurnEnd?: boolean        // Previous turn's final message
  isSuddenLargeContext?: boolean  // Current turn's largest content block
}
```

All providers can see it. Anthropic reads it. Others ignore it during serialization.

### CacheStakingStrategy Module (in agent-core)

A new module that takes a messages array and a context object, and returns the same array with `cacheHint` tags applied. It does NOT know about provider types.

The context object includes:
- `previousTurnMessageCount`: The message count at the end of the previous turn, provided by TurnFlow
- `currentTurnStartIndex`: Derived from `previousTurnMessageCount`
- A size threshold for the dynamic anchor (default ~2000 characters)

Staking logic:
1. Tag `isLastTurnEnd` on the message at index `previousTurnMessageCount - 1` (if it's an assistant message)
2. Scan current-turn messages for content above the threshold, tag the largest with `isSuddenLargeContext`

### Turn Boundary Information Flow

TurnFlow passes `previousTurnMessageCount` (the number of committed history messages before the current turn) to the generate pipeline. This is used by CacheStakingStrategy — no reverse inference from message roles or content.

### Anthropic Adapter CacheHint Consumption

The Anthropic adapter checks each message's `cacheHint` when converting messages to Anthropic's `MessageParam` format. When `isLastTurnEnd` or `isSuddenLargeContext` is true, it injects `cache_control: { type: 'ephemeral' }` on that message's last content block.

This is a separate code path from the existing PromptPlan consumption — PromptPlan handles system prompt blocks, CacheHint handles history messages.

### Tool Stability Ordering

When assembling the tool list for a generate call, tools are ordered by stability:
1. Builtin tools (alphabetically sorted, never change)
2. MCP tools (grouped by server, order of first connection)

A fixed sentinel marker is appended after all tools to ensure the tools cache endpoint has a stable physical position even when no MCP tools are present.

### Timestamp Session-Scoping

`DirectoryTreeInjector.getInjection()` captures the timestamp on first successful injection. Subsequent injections reuse the same timestamp value even if the tree has changed.

### Two Parallel Mechanisms

PromptPlan and CacheStakingStrategy coexist as parallel mechanisms:
- **PromptPlan**: Manages non-array structures (system prompt text, tool schemas). Carried via `GenerateOptions.promptPlan`.
- **CacheStakingStrategy**: Manages array-structured conversation history. Carried inline via `Message.cacheHint`.

These are not redundant — they handle different physical data models.

## Testing Decisions

### Test Seams

| Seam | Type | Module | What's tested |
|---|---|---|---|
| `CacheStakingStrategy` unit tests | Unit (new) | agent-core | Message tagging: correct `isLastTurnEnd` position, `isSuddenLargeContext` threshold and selection, edge cases (empty history, single turn, no qualifying large block) |
| `kosong-llm-integration.test.ts` | Integration (existing) | agent-core | Full flow: CacheHint on messages → provider receives correct cache directives |
| `anthropic.test.ts` | Unit (existing) | kosong | Anthropic adapter translates `isLastTurnEnd` → `cache_control` on history message blocks |
| `directory-tree.test.ts` | Unit (existing) | agent-core | Timestamp fixed on first injection, unchanged on subsequent calls |
| Tool ordering test | Unit (new) | agent-core | `loopTools` returns Builtin first, MCP after, sentinel present |

### Test Characteristics

- Tests exercise external behavior (output: which messages have which cache hints) not internal implementation details
- Anthropic adapter tests use the existing mock provider pattern to verify `cache_control` injection without real API calls
- CacheStakingStrategy tests use plain message arrays — no provider, no LLM, no network
- Edge cases: empty history, single-turn session, all blocks below threshold, multiple large blocks (largest wins)

### Prior Art

The existing `kosong-llm-integration.test.ts` provides the pattern for testing end-to-end cache flow with mock providers. The `anthropic.test.ts` shows how to verify cache_control injection on system blocks — the same pattern extends to history message blocks.

## Out of Scope

- Changes to the PromptPlan builder (it already handles system prompt caching correctly)
- Changes to the OpenAI or Google GenAI adapters (they benefit from stable ordering without code changes)
- Implementing runtime state warnings (token budget, viewport state) in the final user message — this is a future concern documented in ADR 0011 but not implemented now
- User-facing configuration for cache staking behavior — this is an internal optimization
- Changes to sub-agent cache behavior — sub-agents have shorter lifetimes and different staking needs

## Further Notes

This implementation is guided by ADR 0011 (Turn-Boundary Cache Staking Strategy), which documents the architectural decisions in detail including the rationale for compute-consumer decoupling, the CacheHint protocol, and the two-parallel-mechanism design.

The 3+1 staking model maximizes Anthropic's 4-breakpoint allowance while keeping one breakpoint conditional. The fixed stakes (system, tools, previous turn) provide deterministic caching behavior. The dynamic anchor (Stake 4) only activates when there's genuine benefit from caching a large content block.
