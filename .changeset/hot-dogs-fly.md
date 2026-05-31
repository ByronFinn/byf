---
"@byfriends/kosong": minor
---

Add `llmFirstTokenLatencyMs` and `llmStreamDurationMs` to `GenerateResult`. These fields measure host-side latency from the `provider.generate()` call to first streamed chunk and to stream exhaustion, respectively. Both are `undefined` when the stream produces no chunks.
