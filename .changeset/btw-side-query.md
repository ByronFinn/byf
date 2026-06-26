---
'@byfriends/agent-core': minor
'@byfriends/sdk': minor
'@byfriends/cli': minor
---

feat: add /btw side-query command

A read-only side question answered from a snapshot of the current conversation
context, without entering the main turn flow. The answer streams into a
dismissible overlay and never touches the main transcript, wire records, usage,
or the turn pipeline — so resume/fork see nothing. Works in both idle and
streaming states (the side query only reads a stable snapshot, trimmed back to
the last fully-complete step when a tool call is in flight).

- `Agent.askSide()` / `AgentAPI.askSide`: detached single `generate()` with empty
  tools over `ContextMemory.getStableSnapshot()`, mirroring the compaction
  "detached generate" pattern. Builds a `promptPlan` so the side query hits the
  same cached prefix as the main turn. Streams
  `btw.started`/`btw.delta`/`btw.completed`/`btw.failed` events scoped by a
  `queryId` (isolated from the main transcript's turnId). Per-query
  `AbortController`s support cancellation via the caller's `signal` or the new
  `AgentAPI.cancelSideQuery({ queryId })` RPC.
- `Session.askSide(query, { signal?, queryId? })` in the SDK for headless
  invocation and cancellation; `Session.cancelSideQuery(queryId)` forwards the
  cancel RPC to the agent.
- `/btw <question>` CLI command + `BtwViewer` overlay (Q + streamed A, Esc/Enter
  to close and abort). The CLI generates a `queryId` before the network round-trip
  and calls `cancelSideQuery` on close, so the agent-side LLM request is actually
  terminated.
- Read-only directive: `Agent.askSide` injects a `system` message between the
  snapshot and the question that forbids tool-call-like output. Without it the
  side query reused the main agent's action-oriented system prompt while sending
  **no tools**, so a question that would normally need a tool made the model emit
  raw tool-call syntax (e.g. `<tool_call><function=WebSearch>`) as plain text.
  The directive is a layered system message so the main system prompt and its
  cache prefix stay untouched.
- The overlay now mounts via `ui.showOverlay` anchored at `center` with the same
  dimensions as the approval panel / question dialog (`min(80, 0.85*columns)` ×
  `0.82*rows`), instead of replacing the editor area. This avoids the previous
  bottom-anchored 40% overlay being clipped, keeps the border fully visible, and
  closing needs no editor restore. When an approval or askUserQuestion modal
  arrives mid-query, the btw overlay is temporarily hidden (`setHidden(true)`) and
  restored once the modal resolves.
- `BtwViewer` no longer draws its own left/right box borders; it uses the same
  single-line top/bottom boundary style as the approval panel and question dialog,
  so wide characters (e.g. CJK text) cannot push the right border out of alignment.
  The overlay's `maxHeight` is passed through to the component, which sizes its
  output to exactly that height so the bottom boundary is never truncated by the
  overlay manager.
