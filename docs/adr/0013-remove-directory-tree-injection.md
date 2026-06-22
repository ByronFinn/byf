# ADR 0013: Prompt Cache Optimization — Three-Tier Overhaul

## Status

Accepted

## Context

The `DirectoryTreeInjector` (in `agent-core/src/agent/injection/directory-tree.ts`) injected the project directory structure and a session timestamp into conversation history via `appendSystemReminder()`. This created persistent `user`-role messages in `_history`.

For prefix-match cache providers (OpenAI-compatible: GLM, DeepSeek, Kimi, etc.), any change to the message array prefix invalidates the cache. The directory tree injection caused cache prefix breakage in two scenarios:

1. **Initial injection** (session start): a new message is appended to `_history`.
2. **Tree change** (file created/deleted externally): a new message is appended, and the previous injection's position in the prefix shifts.

Production cache analysis on GLM-5.2 measured ~19,712 tokens of cache loss from a single injection event. In a 50-step session with 3 tree changes, this amounted to ~300K tokens of unnecessary re-billing.

Meanwhile, the directory tree injection had diminishing value:

- Many projects include a high-level project map in AGENTS.md (e.g., `## Project Map`).
- The model discovers file-level structure through tools (Glob, Bash, Read) when needed.
- The injected tree becomes stale as the session progresses — it only refreshes when the injector detects a change.
- The user's task prompt usually specifies the target file or module.

Two additional cache inefficiencies were identified:

- **Impure global cache block**: The system prompt's Block 0 (`base`, scope `global`) contained the `# Working Environment` section with session-specific variables (`BYF_OS`, `BYF_SHELL`, `BYF_WORK_DIR`). This meant Block 0 was not truly cross-session stable — for OpenAI, `prompt_cache_key` (SHA256 of global-block text) changed per session, and for Anthropic the global cache breakpoint covered unstable content.
- **Dynamic content polluting cache prefix**: The session timestamp (previously bundled with the directory tree injector) and permission-mode reminders changed per-step or per-event, yet were persisted into `_history` or embedded in the system prompt, breaking cache where they appeared.

## Decision

This ADR covers three tiers of cache optimization that were implemented together.

### Tier 1: Remove DirectoryTreeInjector entirely

Delete the `DirectoryTreeInjector` class and all its dependencies (`buildTree`, `collectEntries`, exclusion sets, path utilities). Remove it from `InjectionManager`'s injector list.

**Rationale**: The directory tree is the only dynamic injector that fires mid-session on content changes. Removing it eliminates the only controllable source of injection-induced cache breakage in `_history`. The model can discover project structure through tools on demand — this aligns with the existing Progressive Disclosure principle.

### Tier 2: Restructure system prompt into a pure 4-block cache architecture

Reorder `system.md` so that `# Project Information` (AGENTS.md) comes **before** `# Working Environment`. Add `# Working Environment` to `IMPLICIT_BOUNDARY_HEADERS` in `builder.ts`. This splits the former Block 0 into two blocks:

- **Block 0 (global)**: Pure agent rules (identity, First Principles, Tool Use, Protocol, Safety) — no per-session variables.
- **Block 2 (session)**: Working Environment (OS, shell, cwd) — now in its own session-scoped block.

The resulting 4-block structure:

| Block | Name                  | Scope     | Content                                                         |
| ----- | --------------------- | --------- | --------------------------------------------------------------- |
| 0     | `base`                | `global`  | Agent identity, principles, safety — zero per-session variables |
| 1     | `projectInstructions` | `project` | AGENTS.md                                                       |
| 2     | `workingEnvironment`  | `session` | OS, shell, working directory                                    |
| 3     | `sessionContext`      | `session` | Skills listing                                                  |

**Rationale**: Block 0 is now truly stable across sessions. For OpenAI-compatible providers, `prompt_cache_key = SHA256(global blocks)` is identical for every session in the same project. For Anthropic, the global cache breakpoint covers only stable agent rules. This maximizes cross-session cache reuse without any per-session contamination.

### Tier 3: Activate the ephemeral injection pipeline for dynamic content

The `EphemeralInjection` interface and `project()`'s second parameter existed but were dead code. This tier activates the full pipeline:

1. **`projector.ts`**: Implement the `before_user` position. `before_user` injections are appended **after** all history (at the end), not prepended before it. This means they never break the cached prefix.
2. **`injector.ts`**: Add optional `getEphemeral?(): readonly EphemeralInjection[]` to the `DynamicInjector` base class.
3. **`manager.ts`**: Add `getEphemeralInjections()` that collects from all injectors via `flatMap`.
4. **`timestamp.ts`** (new): `TimestampInjector` produces a fresh ISO timestamp each step at `before_user`.
5. **`permission-mode.ts`**: Converted from persistent (transition-based, writes to `_history`) to ephemeral (state-based, always reflects current mode via `getEphemeral()`). Only fires when auto mode is active.
6. **`context/index.ts`**: Add `getMessages(ephemeral?)` method; `messages` getter delegates to it with no ephemerals.
7. **`turn/index.ts`**: `buildMessages` callback calls `injection.getEphemeralInjections()` and passes them to `context.getMessages(ephemeral)`.

**Rationale**: Dynamic per-step content (timestamp, permission mode state) belongs at the end of the message array, not in the system prompt or in `_history`. The `before_user` position keeps this content outside the cached prefix entirely — zero cache impact, always fresh.

### Final architecture

The prompt-cache best-practice layered model:

```
CACHE ZONE (stable prefix):
  Block 0 (global): Agent Rules — no per-session variables
  Block 1 (project): Project Knowledge (AGENTS.md)
  Block 2 (session): Working Environment + Skills
  Tool Specs (separate API param)
CONVERSATION HISTORY (clean, no system injections):
  user / assistant / tool messages
DYNAMIC ZONE (per-request, at end, zero cache impact):
  Current Time (always fresh)
  Permission Mode (always current state)
```

## Alternatives Considered

### A. Remove DirectoryTreeInjector only, move timestamp to system prompt (original PRD scope)

Keep `PermissionModeInjector` persistent; embed `BYF_TIMESTAMP` as a template variable in the system prompt's `# Working Environment` section. **Partially adopted, then superseded**: Tier 1 (removal) was kept, but the timestamp-in-system-prompt approach was replaced by Tier 3's ephemeral injection. A frozen session timestamp in the system prompt is less useful than a fresh per-step timestamp, and the ephemeral approach has zero cache impact.

### B. First-persistent + rest-ephemeral hybrid for directory tree

First injection writes to history (cacheable); subsequent changes are ephemeral. **Rejected**: the model still loses visibility of tree changes after the ephemeral step expires, and the complexity is disproportionate to the value when tool-based discovery works well.

### C. Inline injection into tool results

Append directory tree text to the preceding tool result's output (similar to `tool-dedup.ts`). **Rejected**: only works when a tool result precedes the injection step; doesn't apply at turn start (user prompt → LLM response with no prior tool result).

### D. Keep DirectoryTreeInjector persistent (status quo)

Accept the cache breakage as a trade-off for upfront project awareness. **Rejected**: production cache analysis showed significant token waste (~300K tokens per 50-step session), and the injected tree's value is replaceable by AGENTS.md project maps and on-demand tool discovery.

## Consequences

- **Positive**: Eliminates the only controllable source of injection-induced cache breakage. Prefix-match providers (GLM, OpenAI, DeepSeek, etc.) no longer lose cache on directory tree changes.
- **Positive**: Block 0 (global) is truly cross-session stable. `prompt_cache_key` is now identical across sessions for the same project, maximizing OpenAI-compatible cache reuse.
- **Positive**: Timestamp is fresh every step (not frozen at session start), improving the model's time-aware decisions.
- **Positive**: Permission mode injection is now state-based — it survives compaction (always reflects current state) rather than being a one-time transition event that compaction can erase.
- **Positive**: Simpler `InjectionManager` — `DirectoryTreeInjector` removed, all dynamic injectors are ephemeral (no `_history` pollution).
- **Positive**: Conversation history is clean — no system-reminder messages from dynamic injectors.
- **Negative**: Model starts each session without a file-level directory tree. May require an extra tool call (Glob/ls) at the start of some tasks to orient. Mitigated by AGENTS.md project maps and user prompt context.
- **Negative**: Model does not automatically detect external directory structure changes (e.g., git pull). Model can discover changes through tools when relevant.
