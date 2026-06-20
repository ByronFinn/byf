---
'@byfriends/agent-core': minor
'@byfriends/sdk': minor
'@byfriends/cli': minor
---

Remove the last plan-mode remnants left over from ADR 0008.

The earlier removal (`.changeset/plan-removed-157.md`) deleted the engine and
SDK methods but left a shell of always-null / never-produced types and a replay
branch that could never fire. This cleans up that shell so the RPC and wire
contracts no longer carry dead plan surface area:

- `PlanData` type, `ResumedAgentState.plan` field, and the `plan_updated` arm of
  `AgentReplayRecord` are removed (`plan` was always `null` and no code produced
  `plan_updated` records).
- The `plan_mode.enter` / `cancel` / `exit` wire record event types and their
  record-router mapping are removed. Per the user's decision, backward
  compatibility for old sessions containing these legacy records is no longer
  maintained; such records are now unknown types during replay.
- The CLI `replay-ops` projection no longer handles the unreachable
  `plan_updated` branch.
- vis no longer renders or projects `plan_mode.*` records.
- User docs (interaction guide, slash-command reference, data locations) drop the
  obsolete `/plan` command, Shift-Tab shortcut, and Plan mode sections (EN + ZH).
