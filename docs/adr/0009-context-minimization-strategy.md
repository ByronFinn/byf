# ADR 0009: Context Minimization Strategy

## Status

Accepted

## Context

BYF's LLM context is bloated. First-call input is ~8,000-17,000 tokens, growing unbounded as tool outputs accumulate. The root causes identified:

1. Tool definitions consume ~49% of first-call tokens (~10K), with descriptions duplicating system prompt instructions.
2. System prompt mixes static and dynamic content with no cache boundary.
3. Skills listing is always injected (~500-1,500 tokens) with no progressive disclosure.
4. Tool outputs accumulate without optimization, reaching up to 83.9% of total context in long sessions.

We evaluated multiple approaches (conservative content-only vs. architectural restructuring) and chose a four-phase plan that maximizes impact while minimizing risk.

## Decision

### Phase 1: Tool Description Compression (Highest Impact, Lowest Risk)

Apply a **key-instruction anchoring** strategy instead of a naive cut:

- **Global behavioral instructions** (e.g. "you are a professional software engineer") → move to system prompt (single source of truth).
- **Tool-specific high-risk instructions** (e.g. Bash's "never run superuser commands") → keep in tool description as 1-2 short sentences (~50 tokens) to exploit context locality.
- **State-transition tools** (Enter/Exit plan mode) were deleted entirely (see ADR 0008).

Target: Tool definitions from ~10,068 → ~6,000 tokens (~40% reduction).

### Phase 2: System Prompt Restructuring

- **AGENTS.md**: Kept in the system prompt (not moved to messages) to preserve instruction following. Will receive an independent cache boundary in Phase 4. Added an AGENTS.md budget warning at 4,000 tokens.
- **Directory tree**: Moved from system prompt to an InjectionManager (`DirectoryTreeInjector`). Injected once at session start and refreshed when file-structure-changing tool calls occur (Write of new files, Bash mkdir/rm/mv). Excludes large/irrelevant directories (node_modules, .git, dist, etc.).
- **Skills**: Progressive disclosure — only names + one-line descriptions injected; full content loaded via the `Skill` tool on demand.
- **Research guidelines**: Compressed to 5 core rules, including "plan before researching" and "search queries should be well-designed".
- **First principles**: Added as a meta-cognitive instruction in the system prompt.

Target: System prompt from ~6,000-7,200 → ~3,500-4,500 tokens.

### Phase 3: Tool Output Optimization

Two complementary strategies, applied in order:

1. **Importance-Based Observation Masking**: Replaces old tool results with compact structured summaries plus small head/tail fragments. Triggered by token pressure (60-85% of effective capacity), not turn count. Priority queue:
   - High persistence: Write/Edit results, user-visible output (kept until compaction).
   - Medium: Bash results (mask at 60-80%).
   - Low: Read/Glob/Grep results (mask at 60%).

2. **Output Offloading**: Tool outputs > ~8,000 tokens are written to scratch files (`~/.byf/sessions/<id>/scratch/`) and replaced with a ~1,000-char preview + file reference. Scratch files are bounded (50MB/session, 100 files max, FIFO eviction).

Summary format: `[Bash: 'npm test', exit=0, 127 lines, stderr: none]`
Head/tail: Bash keeps first 3 + last 5 lines; Read keeps first 3 + last 3 lines; Grep/Glob keep first 3 + last 2 lines.

Target: Long-session tool output context reduced by 60-80%.

### Phase 4: Prompt Caching Infrastructure

Multi-boundary cache design. Only **Anthropic** requires code changes (explicit `cache_control` breakpoints). All other providers (OpenAI, DeepSeek, Kimi, GLM, Qwen, local LLMs) use automatic prefix matching — BYF only needs to guarantee stable content ordering.

```
[Cache boundary 1] System prompt static part (identity + coding rules)
[Cache boundary 2] AGENTS.md (project-level cache)
[Cache boundary 3] Tool definitions (session-level cache)
[No cache] Conversation history + tool results
```

### Multi-Pass Compaction Pipeline

When token pressure exceeds thresholds, the system applies strategies in order of increasing cost, stopping as soon as the budget is safe:

```
Observation Masking (free) → Low-priority result pruning (free) → LLM Summarization (expensive)
```

## Consequences

- **Positive**: First-call tokens reduced from ~8,000-17,000 to ~5,500-7,000. Cached prefix tokens could reduce per-turn billing to ~500-1,000 on Anthropic.
- **Positive**: Long-session thrashing (repeated exploration due to lost context) is mitigated by importance-based masking that preserves high-value results.
- **Positive**: Minimal architectural changes — leverages existing InjectionManager, Compaction, and Wire Records infrastructure.
- **Negative**: Compressed tool descriptions require adversarial testing (forget tests, hallucination tests, jailbreak tests) to ensure no behavioral regression.
- **Negative**: AGENTS.md budget warning may annoy users with large instruction files, but it serves as a valuable nudge toward concise project conventions.
- **Negative**: Directory tree auto-refresh adds I/O overhead on every turn that follows a structure-changing tool call.
