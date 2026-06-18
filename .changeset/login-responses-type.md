---
'@byfriends/cli': minor
---

Wire openai_responses type in /login model listing (PRD-0002, issue #149)

The `openai_responses` type dispatches to the same OpenAI-compatible `/models`
endpoint as `openai-completions` (they share the model registry), but writes
`type: 'openai_responses'` into the provider config so the runtime uses the
Responses API wire format. The `/login` type picker already listed this option
since #145; this slice adds the end-to-end test coverage verifying the correct
type is written to config when the user selects it.
