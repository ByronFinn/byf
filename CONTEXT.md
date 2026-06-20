# Context: BYF (Be Your Friend)

An AI coding agent that runs in the terminal.

## Glossary

### BYF
The product name. Short for "Be Your Friend". An AI coding agent that runs in the terminal.



## License Terms
- Users may copy and redistribute unmodified BYF software
- Local modification for personal use is allowed
- Redistribution of modified versions is prohibited
- Commercial use is prohibited
- Source code is publicly visible on GitHub (source-available, not open source)

## Glossary

### Provider
A named API endpoint configured by the user. Each provider has a user-chosen name (e.g. "deepseek"), a `type` (e.g. `openai-completions`, `anthropic`, `google-genai`), a `base_url`, an `api_key`, and an optional `allowedPrefixes` for model filtering. Stored in config under `providers[name]`.

### openai-completions
The unified provider type for any OpenAI Chat Completions-compatible API (OpenAI, DeepSeek, Ollama, etc.). Replaces the former `openai` and `openai-compat` types. _Avoid_: openai (deprecated), openai-compat (deprecated).

### Catalog Provider
A well-known provider (OpenAI, Anthropic, etc.) configured through `/connect`, which fetches metadata from the models.dev catalog. Distinct from user-configured providers from `/login`.

### /login
CLI command to add a custom provider via BYO API key + base URL. Supports three interface types: `openai-completions` (OpenAI Chat Completions-compatible), `openai_responses` (OpenAI Responses API), and `anthropic` (Anthropic native). `google-genai` and `vertexai` are deferred until the base-URL propagation to the runtime provider is implemented. Flow: type → name → base_url → api_key → select model. Supports multiple providers. Catalog enrichment (ADR 0012) applies to all types.

### /connect
CLI command to configure a catalog provider from models.dev. Complements `/login`.

### /logout
CLI command to open an interactive selector to remove a configured provider. The provider for `defaultModel` is highlighted by default. The `/disconnect` alias behaves identically.

### Agent
The central class in `agent-core`. Holds subsystem references (ContextMemory, ConfigState, ToolManager, PermissionManager, FullCompaction, BackgroundManager, AgentRecords, TurnFlow, InjectionManager, UsageRecorder, SkillManager, HookEngine, ReplayBuilder). Must be usable on its own — the constructor must not force the caller to create a Session instance, nor require an `agentId` or `session`.

### Session
The outer lifecycle container in `agent-core`. Owns a `SkillRegistry`, `McpConnectionManager`, and a map of `Agent` instances (main + sub-agents). Creates agents, loads skills & MCP servers, manages metadata, triggers hooks.

### Turn
A single conversational cycle: user prompt → LLM loop → tool calls → response. Orchestrated by `TurnFlow` which drives the stateless `loop/runTurn()`. A session consists of multiple turns.

### Wire Records
Event-sourced persistence layer (`AgentRecords`). Logs every state-changing action to `wire.jsonl` in JSONL format. Supports protocol version migration. Used for session resume (replay records to rebuild in-memory state) and vis debugging.

### ChatProvider
The LLM provider interface in `kosong`. Defines `generate()` returning a `StreamedMessage` (async iterable of `TextPart`, `ThinkPart`, `ToolCall`, `ToolCallPart`). Adapters: `openai-completions`, `openai_responses`, `anthropic`, `google-genai`, `vertexai`. Created via `createProvider(config)` factory.

### Kaos
The execution environment abstraction. `Kaos` interface bound to async context via `AsyncLocalStorage` — code calls `readText()`, `exec()` etc. without knowing whether it runs locally or remotely. Currently only `LocalKaos` (local filesystem) is implemented; `SSHKaos` (remote via SSH/SFTP) is aspirational per ADR 0006 but not yet implemented in code. `RuntimeConfig` carries the active `Kaos` instance; `ByfCoreOptions.runtime?` allows injecting a custom one (the `node-sdk` harness does not yet forward it).

### ByfHarness
The top-level SDK entry point in `node-sdk`. Manages session lifecycle, config. CLI creates a `ByfHarness`, then calls `createSession()` / `resumeSession()` to get a `Session` object. A host passes `homeDir` (session storage location) and `configPath` (config.toml location) separately — they are independent.

### uiMode
A free-form string tag on `ByfHarnessOptions` (default `'shell'`) used as the `source` of the `SessionStart` hook. Distinguishes how a session was launched: `'shell'` (interactive TUI), `'print'` (headless `--print`).

### MCP (Model Context Protocol)
External tool integration. `McpConnectionManager` in agent-core manages MCP server connections (stdio/HTTP), tool discovery, OAuth, and reconnection.

### Compaction
Summarizes old conversation history to fit within context limits. Triggered manually or on context overflow. Compaction events are recorded in wire records and displayed as ribbons in vis.

### Thinking
Extended thinking / reasoning by the model. Controlled by `ThinkingEffort` (`off | low | medium | high | xhigh | max`). Each provider adapter maps effort levels to its native API parameter.

### Approval
A permission gate before a tool is executed. The agent presents a tool call to the user (with the command, diff, or file operation details), who approves, rejects, or cancels. The approval outcome flows into the tool result as `blockedReason` (`'rejected'` | `'cancelled'`) when the tool was not executed. Approved tools proceed to execution normally.

### Sub-agent Activity Trace
A user-visible account of what a sub-agent did while working: lifecycle status, visible assistant output, tool activity, approval waits, errors, and final result. It is not the model's private chain-of-thought.

### Foreground Sub-agent
A sub-agent spawned via the Agent tool call that blocks the parent agent. Its events are routed via `routeSubagentEvent` to the parent `ToolCallComponent`. While running it lives in `pendingToolComponents`; after completion the component survives in `transcriptContainer` (solo or inside an `AgentGroupComponent`). Distinct from background agents (covered by `/tasks` via `listBackgroundTasks()`).

### Live Viewer
The full-screen, scrollable, real-time viewer of a foreground sub-agent's activity, opened via `/agent`. Subscribes to the parent `ToolCallComponent`'s live state (not a one-shot snapshot). The rendering carrier of the Sub-agent Activity Trace.

### /agent
CLI command to open the foreground sub-agent list + live viewer. Singular form, aligned with Codex's `/agent` (single-session sub-agent threads). Distinct from Claude Code's plural `/agents` (cross-session independent sessions).

### Context Minimization
A first-class engineering concern in the agent engine. The discipline of curating the smallest set of high-signal tokens that maximize the likelihood of desired outcomes. Encompasses system prompt size, tool definition tokens, conversation history, tool outputs, and prompt caching.

### Observation Masking
A rule-based compression strategy that replaces old tool results in the conversation history with compact structured summaries plus a small head/tail fragment. Requires no LLM call — purely string transformation. Outperforms LLM summarization at a fraction of the cost (per JetBrains research). Ordered by importance (Write/Edit preserved longest, Read/Grep/Glob masked first).

### Importance-Based Masking
The specific variant of observation masking used in BYF. Tool results are classified by priority: high-persistence results (Write/Edit, user-visible output) are kept longest; low-persistence results (Glob/Grep search results) are masked first. Triggered by token pressure thresholds (60-85%), not by turn count.

### Cache Boundary
A sentinel marker (`__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` pattern) that splits the prompt into a static cacheable prefix and a dynamic per-session suffix. Enables Anthropic's prompt cache API. Static content before the boundary is cached globally; dynamic content after it is recomputed per turn.

### Cache Hint
A provider-agnostic logical tag (`cacheHint`) on a `Message` indicating its temporal caching significance (e.g., `isLastTurnEnd` marks the previous turn's final assistant message). Produced by `CacheStakingStrategy`, consumed by provider adapters. Not a provider-specific API parameter.

### CacheStakingStrategy
An agent-core module that analyzes conversation history and attaches `CacheHint` tags to messages based on turn boundaries and content size. Decoupled from provider specifics — it decides *what* to cache; adapters decide *how*. Complements `PromptPlan` (which handles system prompt and tools).

### PromptPlan
A structured representation of the system prompt as ordered, named blocks (`PromptBlock[]`), each with a `CacheScope`. Produced by the builder in agent-core, consumed by provider adapters via `GenerateOptions.promptPlan`. Manages static, non-array content (system instructions, AGENTS.md, tool schemas).

### Search Provider
A configured web search backend (exa, brave, firecrawl, etc.) with its API keys and priority level. The WebSearch tool maintains a list of Search Providers and tries them in priority order, falling back automatically on failure. Distinct from Provider (LLM API endpoint).

### Turn Boundary
The division point between consecutive Turns in the conversation history. Identified by `previousTurnMessageCount` from TurnFlow. Used by `CacheStakingStrategy` to place the history cache stake at the previous turn's last assistant message, ensuring the entire preceding conversation (including tool results) is cached.

### Dynamic Context Anchor
The optional 4th cache stake point, placed after the largest content block in the current turn (threshold ~2000 chars). Optimizes streaming TTFT/TPS when the current turn contains a burst of large context (user-pasted logs, large file reads). Conditional: only placed when a qualifying block exists.

### Tool Stability Ordering
Tools are ordered by stability before caching: Builtin tools (never change) first, MCP tools (may connect/disconnect) after. A fixed sentinel marker ensures the tools cache endpoint never collapses into the system prompt cache endpoint when no MCP tools are present.

### Progressive Disclosure
Loading only names and brief descriptions at startup, then fetching full content on demand. Applied to Skills (names/descriptions in system prompt, full SKILL.md via `Skill` tool) and directory structure (not injected; model discovers via tools when needed).

### Dynamic Injection
The mechanism by which the agent system adds context to the conversation beyond what the user and model produce. Managed by `InjectionManager` in agent-core, which runs registered `DynamicInjector` instances in the `beforeStep` hook. Injectors can produce two kinds of injection: **persistent** (via `inject()` → `appendSystemReminder()`, written into `_history` as `user`-role messages) and **ephemeral** (via `getEphemeral()`, rendered fresh each step at request time, never stored in history). Current injectors: `PermissionModeInjector` (ephemeral — reflects current permission mode state, only fires when auto mode is active) and `TimestampInjector` (ephemeral — fresh ISO timestamp each step at `before_user` position). Formerly included `DirectoryTreeInjector` (removed — directory structure is now progressively disclosed via tools). Persistent injection is still used for one-time events (skill activation, `/init` completion).

### Ephemeral Injection
A per-request injection rendered fresh at projection time (in `projector.ts`) and never persisted to `_history`. Placed at the `before_user` position — appended **after** all conversation history — so it has zero impact on the cached prefix. Carries dynamic content that changes every step (timestamp, permission mode state). Contrasted with persistent injection (`appendSystemReminder()`), which writes to `_history` and stays in the cached prefix. See ADR 0013.

### Cache Scope
The stability classification assigned to each `PromptBlock` in a `PromptPlan`: `'global'` (identical across all sessions — pure agent rules), `'project'` (stable within a project — AGENTS.md), `'session'` (varies per session — OS, cwd, skills), or `'none'` (not cached). Provider adapters use scope to decide cache breakpoint placement. See ADR 0013 for the 4-block architecture that separates pure global rules from session-scoped environment.

### Dynamic Zone
The tail of the projected message array where ephemeral injections (timestamp, permission mode) are appended at the `before_user` position. Content here is per-request and never participates in the cached prefix. Part of the three-zone prompt layout: Cache Zone (stable system prompt blocks + tool specs), Conversation History (clean user/assistant/tool messages), Dynamic Zone (ephemeral per-request content).

### Cache Hit Rate
The ratio of input tokens served from the provider's prompt cache to total input tokens: `inputCacheRead / (inputOther + inputCacheRead + inputCacheCreation)`. A key metric for prompt cache efficiency. Two distinct scopes exist: **per-turn** (computed from `TokenUsage` of the current turn only, reflects "what just happened") and **session-cumulative** (computed from the aggregated `TokenUsage` across all turns, reflects "overall cache health"). The per-turn value is typically higher after the first turn because it excludes the initial cache-creation cost that permanently lowers the session-cumulative average.

### Structured Summary
The compact representation used for masked tool results. Example: `[Bash: 'npm test', exit=0, 127 lines, stderr: none]`. Preserves the tool call metadata and a small head/tail fragment so the agent can decide whether to re-read the full output.

### Output Offloading
Writing full tool outputs exceeding a threshold (~8,000 tokens) to scratch files and replacing the tool result with a preview (1,000 chars) plus a file reference. Agent can re-read on demand. Scratch files are size/age bounded to prevent unbounded growth.

### AGENTS.md Budget
A soft limit (4,000 tokens) that triggers a warning when merged AGENTS.md content exceeds it. Encourages concise project instructions. AGENTS.md is always loaded into the system prompt (not moved to messages) to preserve instruction following.


