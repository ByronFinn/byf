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
  "detached generate" pattern. Streams `btw.started`/`btw.delta`/`btw.completed`/
  `btw.failed` events scoped by a `queryId` (isolated from the main transcript's
  turnId).
- `Session.askSide(query, { signal? })` in the SDK for headless invocation and
  cancellation.
- `/btw <question>` CLI command + `BtwViewer` overlay (Q + streamed A, Esc/Enter
  to close and abort).
