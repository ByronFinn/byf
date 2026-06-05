---
"@byfriends/agent-core": minor
---

Add output offloading and multi-pass compaction pipeline.

- **ScratchManager**: new module that writes large tool outputs to scratch files under `~/.byf/sessions/<sessionId>/scratch/`. Implements FIFO eviction when the max file count (100) or total size (50 MB) is exceeded.
- **OutputOffloading**: new module that offloads string tool outputs larger than ~8,000 tokens to scratch. The context message is replaced with a preview containing the file path and a `Read(path="...")` hint so the agent can retrieve the full output later.
- **ContextMemory integration**: `appendLoopEvent` is now async and attempts to offload `tool.result` events before appending them. Offloading is skipped during wire replay. `scratchManager` is created when both `agent.homedir` and `sessionId` are available.
- **Multi-pass pipeline**: `FullCompaction.beforeStep()` now runs four passes in order:
  1. Output offloading (already applied at `tool.result` time)
  2. Observation masking (zero-cost)
  3. Low-priority pruning (zero-cost) — removes oldest masked tool results when context pressure remains high
  4. LLM summarization / compaction (expensive, only when necessary)
- **Wire records**: added `context.output_offloaded` and `context.pruning` record types, plus `pruning.applied` RPC event.
