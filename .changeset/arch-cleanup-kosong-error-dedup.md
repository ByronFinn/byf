---
'@byfriends/kosong': patch
---

refactor: collapse OpenAI/Anthropic error converters onto shared `convertProviderError`

`convertOpenAIError` (openai-common.ts) and `convertAnthropicError`
(anthropic.ts) each re-implemented the same status / timeout / network
classification ladder that already lives in `provider-common.ts`
(`convertProviderError`), including duplicate `NETWORK_RE` / `TIMEOUT_RE`
regexes and a private `classifyBaseApiError` helper. Both converters now
unwrap their SDK-specific classes into `(message, status?, requestId?)`
and delegate the classification to `convertProviderError`. Behavior is
unchanged (covered by `provider-common.test.ts` and
`openai-common-errors.test.ts`). Completes the ADR 0015 consolidation
that `provider-common.ts` was created for.
