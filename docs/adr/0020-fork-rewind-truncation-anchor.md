# 0020 - Fork Rewind Truncation Anchor

Date: 2026-06-24

## Status

Accepted

## Context

PRD-0015 adds an optional rewind step to the `/fork` command: the user picks a historical user message, and the forked session branches from just before it (edit-message semantics). Implementing this requires locating, in the persisted `wire.jsonl`, the precise point at which to truncate the record stream.

The initial design assumed the `turnId` carried by loop events (`step.begin`, `tool.call`, …) could serve as a stable identifier to locate the truncation point. Code cross-checking during `/grill` disproved this assumption:

1. **`turnId` is not persisted on the turn boundary.** `TurnFlow.prompt()` (`packages/agent-core/src/agent/turn/index.ts:79-86`) writes a `turn.prompt` wire record containing only `{ type, input, origin }` — no `turnId`. The turnId is an in-memory counter on `TurnFlow` (`turn/index.ts:64`, starting at -1, incrementing per turn) emitted only via `turn.started` / `turn.ended` events, which are `LoopLiveOnlyEvent` and **never written to wire** (`packages/agent-core/src/loop/events.ts:113-119`).
2. **There is no `turn.end` wire record.** A turn's "completion" can only be inferred from the appearance of the next `turn.prompt` / `turn.steer` record, or the end of the stream. A turn aborted via `turn.cancel` is also written to wire (`types.ts:26`) and counts as ended.
3. **turnId resets on fork.** Because turnId is derived by counting during replay, a forked session's turnIds are recomputed from zero — so a turnId stored at fork time would be meaningless in the new session.

So neither turnId nor a persisted turn-end marker can anchor a truncation point reliably.

## Decision

Locate the fork truncation point by **the ordinal occurrence of `turn.prompt` / `turn.steer` wire records** (filtered to `origin.kind === 'user'`). The fork API takes `upToMessage: number` — a 1-based index of a user message. Truncation keeps every wire record that appears **before** the Nth qualifying `turn.prompt`/`turn.steer` record, and drops that record and everything after it. This yields edit-message semantics: the forked session resumes from the state just before the selected message, and the user can re-enter it.

Concretely, `SessionStore.fork` copies the source session directory, then rewrites the main agent's `wire.jsonl` to the truncated prefix, and removes orphaned sub-agents (those spawned by dropped turns) from `state.json`'s `metadata.agents`.

## Consequences

### Positive

* The truncation point is an objectively existing wire record line — no inference of turn boundaries required (`turn.prompt` *is* the boundary).
* Naturally compatible with the existing replay-based session restoration: a truncated prefix replays to a consistent state for free, with no extra snapshot logic.
* Safe under compaction: compaction events are append-only (`context.apply_compaction`, `context.clear` never delete prior `turn.prompt` records), so the retained prefix contains the compaction history and replays coherently.
* Avoids the unstable-turnId trap entirely by not relying on turnId at all.

### Negative

* The truncation logic must correctly distinguish `turn.prompt` from `turn.steer` and filter by `origin.kind === 'user'` (background-task and hook-originated turns must not be counted as user-selectable rewind points).
* Orphaned sub-agent cleanup adds complexity: the implementation must map retained main-agent tool calls to spawned sub-agents and prune unreferenced ones from `metadata.agents` plus delete their wire directories.
* `upToMessage` is a positional ordinal, so it is only meaningful at fork time against the source session's current wire — it is not a durable, portable identifier.

## Alternatives Considered

* **Persist turnId on the `turn.prompt` record** so it could anchor truncation directly. Rejected: would require a wire protocol migration (new field on an existing record type) and still leaves the turnId-reset-on-fork problem for any stored references. The ordinal approach needs no schema change.
* **Checkpoint semantics (retain through the selected turn's end).** Rejected for MVP: with no `turn.end` wire marker, "the Nth turn's end" can only be approximated as "just before the (N+1)th `turn.prompt`", which is fragile for the last turn (no following anchor) and for cancelled turns. Edit-message semantics (truncate *at* the Nth `turn.prompt`) has an unambiguous anchor. Checkpoint semantics deferred to v2.
* **Rebuild the session from the resume snapshot instead of truncating wire.** Rejected: would require reconstructing wire records, breaking the "wire is the single source of truth" invariant and forcing every subsystem (replay, tools, background) to adapt — far larger blast radius.

## References

* PRD-0015 (Fork Step Rewind)
* `packages/agent-core/src/agent/turn/index.ts:79-86` (`turn.prompt` write site)
* `packages/agent-core/src/loop/events.ts:113-119` (`LoopLiveOnlyEvent` — turnId not persisted)
* `packages/agent-core/src/agent/records/types.ts:18-26` (`turn.prompt` / `turn.cancel` record shapes)
* [Claude Code Checkpointing](https://code.claude.com/docs/en/checkpointing) — edit-message fork semantics reference
