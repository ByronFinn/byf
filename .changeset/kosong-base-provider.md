---
'@byfriends/kosong': patch
---

Migrate `openai-responses` and `google-genai` adapters to extend `BaseChatProvider`, removing duplicated `_clone`, accessors, and `_createClient` boilerplate. Google error classification now reuses `convertProviderError` while preserving its fetch-specific `TypeError` handling.
