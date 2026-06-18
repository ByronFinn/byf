---
'@byfriends/kosong': patch
---

Migrate all four provider adapters (`openai-completions`, `anthropic`, `openai-responses`, `google-genai`) to extend `BaseChatProvider`, and their `StreamedMessage` implementations to extend `BaseStreamedMessage`. This removes duplicated `_clone`, accessors, `_createClient` boilerplate, and the `StreamedMessage` field/getter skeleton. Finish-reason normalization is now config-driven via `makeFinishReasonNormalizer` for OpenAI and Anthropic adapters. Google error classification reuses `convertProviderError` while preserving its fetch-specific `TypeError` handling.
