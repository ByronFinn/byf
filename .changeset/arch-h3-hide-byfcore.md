---
'@byfriends/agent-core': major
'@byfriends/sdk': patch
---

refactor: hide `ByfCore` concrete class behind `createByfCore()` factory

The SDK held `core: ByfCore` as a **public** field on `SDKRpcClient`,
leaking the engine's 40+ internal members (`sessions` map, `sdk`
Promise, `providerManager`, `sessionStore`, `telemetry`, `rpcClient`,
…) through the SDK type surface and breaking the ADR 0006 isolation
seam ("SDK is the isolation seam between CLI and engine internals").

This violated Information Hiding (the concrete class was reachable via
`import { ByfCore } from '@byfriends/agent-core'`), Dependency Inversion
(the SDK depended on a concrete engine class instead of the `CoreAPI`
contract), and Interface Segregation (the SDK only needed
`homeDir`/`configPath` but inherited the type graph of all 40+ members).

### Changes

- `agent-core`: new `createByfCore(rpcClient, options)` factory returns a
  narrow `CoreEngineHandle` (`{ core: PromisableMethods<CoreAPI>,
homeDir, configPath }`). The `ByfCore` concrete class is no longer
  re-exported from the package public index.
- `agent-core`: `PromisableMethods` / `Promisify` / `Promisable` contract
  types are now re-exported so SDK callers can type the handle.
- `node-sdk`: `SDKRpcClient.core` is now `private`, typed as
  `PromisableMethods<CoreAPI>` (the contract). `homeDir`/`configPath`
  are first-class readonly fields set once at construction. The `ByfCore`
  type no longer appears anywhere in the SDK import graph.

### BREAKING CHANGE

`ByfCore` (the class) is no longer re-exported from
`@byfriends/agent-core`. Code that constructed it directly must switch to
the factory:

```ts
// before
import { ByfCore } from '@byfriends/agent-core';
const core = new ByfCore(rpcClient, options);

// after
import { createByfCore } from '@byfriends/agent-core';
const { core, homeDir, configPath } = createByfCore(rpcClient, options);
```

`ByfCoreOptions` is still exported (it is the factory's parameter type).
`CoreAPI`, `SDKAPI`, `createRPC` and all payload types are unchanged.

No monorepo-internal consumers are affected: only `node-sdk` consumed
`ByfCore`, and it now uses the factory. `apps/cli` and `apps/vis` never
imported it. Engine-internal tests that need the concrete class import it
from the engine module path (`rpc/core-impl`), not the package public
index — engine internals remain accessible inside the engine package.
