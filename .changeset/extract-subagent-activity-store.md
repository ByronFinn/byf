---
'@byfriends/cli': patch
---

refactor: extract SubagentActivityStore from ToolCallComponent

Moves ~500 lines of subagent lifecycle state (spawning → running → done/failed),
sub-tool call tracking, timer management, snapshot production, and change listener
notification from the 1622-line `ToolCallComponent` into a standalone
`SubagentActivityStore` class.

- `ToolCallComponent` reduced from ~1622 to ~1053 lines (net -569 lines)
- New file: `subagent-activity-store.ts` (~816 lines)
- Public API of `ToolCallComponent` fully backward-compatible — all 14 method
  signatures unchanged; types re-exported at `tool-call.ts` bottom
- Fixes: `OngoingSubCall.streamingArguments` type convention violation (removed
  unnecessary `| undefined`), duplicate JSDoc in store
- Adds 27 direct unit tests for the store covering: full lifecycle, backgrounded
  phase, failure path, live usage updates, snapshot detail, timer management,
  listener lifecycle, replay, trimming, latestActivity computation
