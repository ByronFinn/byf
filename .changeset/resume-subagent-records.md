---
'@byfriends/agent-core': patch
'@byfriends/sdk': patch
'@byfriends/cli': patch
---

Fix: `/agent` records disappear after session resume

After resuming a session, the `/agent` panel showed empty Agent tool-call
cards — the child agent's name, tool calls, text, and token count were all
lost. Root cause: those fields are read from per-card subagent runtime state,
which only the live event stream populates; the replay-projection path that
resume uses never reconstructed it.

- **Persist `parentToolCallId`** — `AgentMeta` (state.json) now records the
  parent tool-call id that spawned each sub-agent, so a resumed main-agent
  `Agent` tool-call can be mapped back to its child. `createAgent`/`spawn`
  thread it through; `ResumedAgentState` exposes it.
- **Project child activity onto resumed cards** — `distillSubagents` distills
  each non-main agent's resumed state (replay → tool calls + text, profileName,
  usage.total) into a `SubagentReplayBlockData` keyed by `parentToolCallId`.
  `projectReplayRecords` attaches it to the matching `Agent` tool-call, and the
  existing `applySubagentReplay` pipeline (now also consuming `usage`) fills the
  card — so `/agent` shows the child's name, tools, text, and token count.
- **Fix Agent grouping after resume** — replay projection now assigns
  `step`/`turnId` to projected tool-calls (one assistant message = one step,
  turnId increments per user turn), so adjacent resumed Agent calls group into
  an `AgentGroupComponent` again, matching live behavior.
- **Graceful degradation** — old sessions persisted before `parentToolCallId`
  still resume without crashing; their Agent cards render from the result
  summary as before. Token count is restored; elapsed time is not (replay
  records carry no timestamps) and is left for a follow-up.

All new fields are optional; no wire-format or breaking change.
