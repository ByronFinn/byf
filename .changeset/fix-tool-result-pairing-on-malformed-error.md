---
"@byfriends/agent-core": patch
---

Fix: ensure paired `tool.result` events are always emitted when a tool returns `isError=true` with a malformed or missing `output` field.

Previously, if `resolveExecution` returned `{ isError: true }` without an `output` property, `normalizeToolResult` would throw `TypeError: Cannot read properties of undefined (reading 'length')`. This uncaught exception broke the `runToolCallBatch` loop, causing all subsequent `tool.result` events in the same batch to be silently dropped. The missing tool results left orphan `tool.call` entries in the context history, which caused the next LLM request to fail because providers require every `tool_call` to have a matching `tool_call_id` result.

The fix coerces the `execution` result through `coerceToolResult` before building the pending tool result, so malformed error objects are normalized into safe `{ output, isError: true }` shapes just like runtime tool returns.
