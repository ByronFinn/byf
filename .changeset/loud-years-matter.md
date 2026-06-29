---
"@byfriends/kosong": minor
"@byfriends/agent-core": minor
"@byfriends/sdk": minor
"@byfriends/cli": minor
---

refactor: consolidate `isAbortError` and replace manual signal wiring

- Move `isAbortError` from `agent-core/src/loop/errors.ts` to `kosong/src/errors.ts`
  as the canonical implementation
- `agent-core/src/loop/errors.ts` re-exports from `@byfriends/kosong`
- Replace 3 inline `DOMException`/`AbortError` name checks with canonical
  `isAbortError()` in `proxied-fetch.ts`, `web-search.ts`, `google-genai.ts`
- Export `isAbortError` from `@byfriends/agent-core` and re-export from
  `@byfriends/sdk`
- Remove duplicate CLI `isAbortError` in `tui/utils/errors.ts`; CLI now imports
  from `@byfriends/sdk`
- Replace manual `addEventListener('abort', ...)` forwarding with
  `linkAbortSignal()` in `proxied-fetch.ts` (both main and retry paths)
- Replace manual timeout-only `AbortController` with `createDeadlineAbortSignal()`
  in `rg-locator.ts`
- Add unit tests for `isAbortError` in kosong and `linkAbortSignal`/
  `createDeadlineAbortSignal` in agent-core
- Add `classifySearchError` unit tests for behavioral narrowing

Fixes a root-cause issue where `createDeadlineAbortSignal().clear()` removed
the parent-signal listener, orphaning concurrent in-flight requests when
used in proxied-fetch's catch-and-retry path. The `linkAbortSignal` usage
keeps the listener attached (`{ once: true }`), matching the original behavior.

Affected PRDs: PRD-0016 (btw cancel path), PRD-0015 (fork rewind)
