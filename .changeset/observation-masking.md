---
"@byfriends/agent-core": minor
---n
Enable importance-based observation masking for context minimization (PRD #77 phase 3).

When token pressure exceeds configurable thresholds, old tool result messages are replaced with structured summaries plus head/tail fragments — without any LLM call.

- **New module**: `packages/agent-core/src/agent/context/observation-masking.ts`
  - `applyObservationMasking(history, maxContextSize, toolCallIdToInfo, config)` — pure function that returns a new history array and masking result
  - Priority-based masking: `Read`/`Glob`/`Grep` (low) → `Bash` (medium) → `Write`/`Edit` (high, never masked)
  - Head/tail retention rules: Bash (3+5 lines), Read (3+3 lines), Grep/Glob (3+2 lines), Edit/Write (summary only)
  - Thrashing protection: already-masked messages are skipped on re-application

- **ContextMemory integration**: new `applyObservationMasking(config?)` method that wires the masking function, logs a `context.observation_masking` record, and updates `_history`

- **FullCompaction trigger**: `beforeStep()` now calls `agent.context.applyObservationMasking()` before `checkAutoCompaction()`, emitting `observation_masking.applied` events when masking occurs

- **Configuration**: `CompactionConfig` gains an optional `masking?: MaskingConfig` field; `DEFAULT_COMPACTION_CONFIG` includes `DEFAULT_MASKING_CONFIG`

- **Wire record support**: `context.observation_masking` records are replayed during resume to restore the masked state

- **Tests**: 24 unit tests for the masking module plus 1 integration test verifying end-to-end masking in `FullCompaction.beforeStep()`
