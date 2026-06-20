---
'@byfriends/sdk': minor
---

Add `runtime` passthrough from `ByfHarnessOptions` to `ByfCore` via `SDKRpcClient`. Optionally accepts a custom `RuntimeConfig` (kaos, osEnv, etc.) for injecting execution environments. Default behavior unchanged when omitted.