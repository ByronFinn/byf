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
