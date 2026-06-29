---
"@byfriends/kosong": minor
"@byfriends/agent-core": minor
"@byfriends/sdk": minor
"@byfriends/cli": minor
---

refactor: consolidate `isAbortError` into a single canonical version in kosong

- Move `isAbortError` from `agent-core/src/loop/errors.ts` to `kosong/src/errors.ts`
  as the canonical implementation
- `agent-core/src/loop/errors.ts` re-exports from `@byfriends/kosong`
- Replace 3 inline `DOMException`/`AbortError` name checks with canonical
  `isAbortError()` in `proxied-fetch.ts`, `web-search.ts`, `google-genai.ts`
- Export `isAbortError` from `@byfriends/agent-core` and re-export from
  `@byfriends/sdk`
- Remove duplicate CLI `isAbortError` in `tui/utils/errors.ts`; CLI now imports
  from `@byfriends/sdk`
- Add unit tests for `isAbortError` in kosong and `linkAbortSignal`/
  `createDeadlineAbortSignal` in agent-core

Affected PRDs: PRD-0016 (btw cancel path), PRD-0015 (fork rewind)
