---
"@byfriends/agent-core": minor
"@byfriends/sdk": minor
---

Emit `llmFirstTokenLatencyMs` and `llmStreamDurationMs` on `turn.step.completed` events. Consumers can now observe how long the LLM provider took to produce its first streamed output token and how long the entire stream took to complete.
