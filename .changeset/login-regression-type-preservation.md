---
'@byfriends/cli': minor
---

Cross-type regression guard for /login manual fallback type preservation (PRD-0002, issue #152)

Add tests verifying that when model fetching fails and the user enters a model
manually, the selected interface type (`anthropic` / `openai_responses`) is
preserved in the provider config rather than falling back to
`openai-completions`. Dual type-keys are covered: anthropic manual entry and
openai_responses manual entry, both driven through the full login flow.
