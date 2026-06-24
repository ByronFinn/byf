---
'@byfriends/sdk': minor
'@byfriends/agent-core': minor
'@byfriends/cli': minor
---

feat(fork): optional rewind to a user message when forking a session

`/fork` can now branch from an earlier user message instead of always
copying the whole session. Running `/fork` opens a picker listing the
session's user messages; selecting the Nth message forks a new session
that drops that message and everything after it (edit-message semantics),
so you can resume from just before it and re-enter the prompt.

- `ForkSessionInput` / `ForkSessionPayload` / `ForkSessionRecordInput`
  gain an optional `upToMessage?: number` (1-based ordinal of a
  user-origin message). Omitted → full copy, fully backwards compatible.
- Truncation anchors on the ordinal of `turn.prompt`/`turn.steer` records
  with `origin.kind === 'user'` (turnId is not persisted on the wire
  boundary — see ADR-0020). Out-of-range ordinals reject and leave no
  partial session behind.
- Sub-agents spawned by dropped turns are removed from the forked
  session's state and their wire directories are deleted.
- `state.json` records `forkedFromMessage` when a rewind fork happens,
  alongside the existing `forkedFrom`.

No breaking changes: all new fields are optional and default to the
previous full-copy behavior.
