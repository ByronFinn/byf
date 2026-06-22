---
'@byfriends/agent-core': minor
'@byfriends/cli': patch
'@byfriends/node-sdk': minor
---

fix: replace hardcoded API type table in login-flow.ts with loginProviderRegistry

Removes the local `API_TYPE_OPTIONS` and `DEFAULT_BASE_URL` constants from
`login-flow.ts` that duplicated the existing `loginProviderRegistry`. The
login flow now derives its provider type selection options and default
base URLs directly from the registry via `getLoginProviderOptions()` and
`loginProviderRegistry`. Also:

- Exports `loginProviderRegistry`, `getLoginProviderOptions`, and
  `LoginProviderType` as public API from `@byfriends/agent-core` and
  re-exports them through `@byfriends/node-sdk`
- Cleans up stale `@ts-expect-error` directives in
  `login-provider-registry.test.ts` that were left from before the
  registry was implemented (no behavior change)
- Removes the never-executed test file at
  `src/config/login-provider-registry.test.ts` (vitest only runs tests
  under `test/` directories)