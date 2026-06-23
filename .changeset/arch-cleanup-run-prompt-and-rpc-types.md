---
'@byfriends/agent-core': patch
'@byfriends/cli': patch
---

refactor: dedupe run-prompt session resume and tighten `proxyWithExtraPayload` cast

- `run-prompt.ts` had two near-identical resume branches (`--session`
  and `--continue`) that each repeated `resumeSession` + permission
  forcing + `setModel` + `installHeadlessHandlers`. Extracted
  `resumePromptSession()` and `mostRecentSessionId()` helpers so the
  resume path exists once; the caller resolves a session id (explicit
  flag, latest-in-workdir, or none) and hands it off. Behavior
  unchanged, including the "No sessions to continue" message.
- `rpc/types.ts` `proxyWithExtraPayload` previously cast the whole
  Proxy target with `as any`, silencing type-checking inside the
  handler too. The target is now typed; the unavoidable output-type
  assertion (the Proxy's return signature genuinely differs from the
  target's) is moved to a single result-level `as unknown as
  RPCMethods<T>`, so the handler body stays type-checked.
