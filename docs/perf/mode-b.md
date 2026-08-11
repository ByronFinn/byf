# CPU Profile

| Duration | Samples | Interval | Functions |
|----------|---------|----------|----------|
| 7.66s | 5028 | 1.0ms | 541 |

**Top 10:** `estimateTokensForMessage` 83.6%, `next` 5.1%, `estimateTokensForContentPart` 2.7%, `estimateTokensForContentPart` 2.6%, `anonymous` 1.2%, `(anonymous)` 0.5%, `stringify` 0.5%, `estimateTokens` 0.4%, `cloneObject` 0.3%, `isAlreadyMasked` 0.2%

## Hot Functions (Self Time)

| Self% | Self | Total% | Total | Function | Location |
|------:|-----:|-------:|------:|----------|----------|
| 83.6% | 6.41s | 84.1% | 6.44s | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:52` |
| 5.1% | 397.1ms | 5.2% | 404.6ms | `next` | `[native code]` |
| 2.7% | 207.4ms | 2.7% | 207.4ms | `estimateTokensForContentPart` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:59` |
| 2.6% | 202.5ms | 2.6% | 202.5ms | `estimateTokensForContentPart` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` |
| 1.2% | 94.3ms | 3.7% | 290.2ms | `anonymous` | `[native code]` |
| 0.5% | 42.4ms | 99.3% | 7.60s | `(anonymous)` | `[native code]` |
| 0.5% | 38.8ms | 0.5% | 38.8ms | `stringify` | `[native code]` |
| 0.4% | 38.2ms | 5.5% | 426.8ms | `estimateTokens` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:16` |
| 0.3% | 29.1ms | 0.3% | 29.1ms | `cloneObject` | `[native code]` |
| 0.2% | 17.3ms | 0.2% | 17.3ms | `isAlreadyMasked` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:94` |
| 0.1% | 9.6ms | 0.1% | 9.6ms | `start` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/cron/manager.ts` |
| 0.0% | 7.3ms | 0.0% | 7.3ms | `parse` | `[native code]` |
| 0.0% | 7.2ms | 0.0% | 7.2ms | `async loadFromDisk` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/background/manager.ts` |
| 0.0% | 6.9ms | 0.7% | 56.7ms | `map` | `[native code]` |
| 0.0% | 6.0ms | 0.0% | 6.0ms | `flattenRef` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:292` |
| 0.0% | 5.9ms | 0.6% | 50.4ms | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:45` |
| 0.0% | 4.7ms | 0.0% | 4.7ms | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` |
| 0.0% | 4.4ms | 0.0% | 4.4ms | `structuredClone` | `[native code]` |
| 0.0% | 3.2ms | 0.0% | 3.2ms | `get` | `[native code]` |
| 0.0% | 3.2ms | 0.0% | 3.2ms | `applyPruning` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:262` |
| 0.0% | 3.1ms | 0.0% | 3.1ms | `async drainBatch` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:176` |
| 0.0% | 3.1ms | 0.0% | 3.1ms | `internal:fs/streams` | `internal:fs/streams:130` |
| 0.0% | 2.6ms | 0.0% | 2.6ms | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:182` |
| 0.0% | 2.5ms | 0.0% | 2.5ms | `push` | `[native code]` |
| 0.0% | 2.0ms | 0.0% | 2.0ms | `isKilled` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/cron/manager.ts:171` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `fill` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:76` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `(anonymous)` | `internal:fs/streams:147` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `has` | `[native code]` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:642` |
| 0.0% | 1.7ms | 0.3% | 23.0ms | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:691` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `mapLoopEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:910` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `async restoreAppendLoopEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:455` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `getValidatedPath` | `internal:fs/streams` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:145` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:79` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `stringSplitFast` | `[native code]` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `async chatOnce` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `defineLazy` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/util.js:67` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `slice` | `[native code]` |
| 0.0% | 1.6ms | 0.0% | 3.0ms | `Beta` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/beta/beta.mjs:15` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `trackDuplicateToolCall` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts` |
| 0.0% | 1.6ms | 0.0% | 3.3ms | `emitLiveEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:695` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `getToolPriority` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `findAll` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `applyPruning` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:265` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `validate0` | `[native code]` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `Uploads` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/uploads/uploads.mjs:11` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `getOwnPropertyDescriptor` | `[native code]` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `resolveModelCapabilities` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:268` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `failResult` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `countLines` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:67` |
| 0.0% | 1.5ms | 0.0% | 2.9ms | `Obj` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/object.js:51` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `code` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js:14` |
| 0.0% | 1.5ms | 2.9% | 227.7ms | `require` | `[native code]` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `initializeContext` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `coerceObjectProperties` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:110` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `digest` | `node:crypto:196` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `Realtime` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/beta/realtime/realtime.mjs:12` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:581` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:61` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `maskToolResult` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:102` |
| 0.0% | 1.5ms | 0.0% | 5.9ms | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:321` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `get names` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:142` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `regExpMatchFast` | `[native code]` |
| 0.0% | 1.4ms | 0.0% | 3.2ms | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:195` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `estimateTokensForMessages` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `parseFilter` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:841` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `flatIntoArray` | `[native code]` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `ZodTuple` | `[native code]` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:323` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `extendSubschemaMode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/subschema.js:71` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:69` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `Sessions` | `[native code]` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `logRecord` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts:40` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `add` | `[native code]` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `join` | `[native code]` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `_boolean` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js:369` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `init` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `readEnv` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/internal/utils/env.mjs:10` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `parse` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/fast-uri@3.1.0/node_modules/fast-uri/index.js:263` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `buildLlmRequestMetadata` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:735` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `KeywordCxt` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js` |
| 0.0% | 1.3ms | 10.0% | 771.7ms | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:47` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `readBlockSequence` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2074` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `scheduleFlush` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:123` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `parseInt` | `[native code]` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `exec` | `[native code]` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `copyDataProperties` | `[native code]` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `async runPrepareToolExecutionHook` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:365` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:373` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `defineProperty` | `[native code]` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `createRuntimeProviderAuthResolver` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:147` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `containsSchemaKeyword` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:47` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `Embeddings` | `[native code]` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `SetGoalBudgetTool` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/goal/set-goal-budget.ts` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/capability-registry.ts:226` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `makeTable` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/zlib/crc32.js:33` |

## Call Tree (Total Time)

| Total% | Total | Self% | Self | Function | Location |
|-------:|------:|------:|-----:|----------|----------|
| 99.3% | 7.60s | 0.5% | 42.4ms | `(anonymous)` | `[native code]` |
| 99.3% | 7.60s | 0.0% | 0us | `processTicksAndRejections` | `[native code]` |
| 94.9% | 7.27s | 0.0% | 0us | `estimateTokensForMessages` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:29` |
| 84.1% | 6.44s | 83.6% | 6.41s | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:52` |
| 42.8% | 3.28s | 0.0% | 0us | `restore` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts:62` |
| 42.8% | 3.28s | 0.0% | 0us | `async replay` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts:140` |
| 42.8% | 3.28s | 0.0% | 0us | `routeToHandler` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts:76` |
| 42.8% | 3.28s | 0.0% | 0us | `restoreRecord` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:405` |
| 42.8% | 3.27s | 0.0% | 0us | `restoreObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:464` |
| 31.8% | 2.44s | 0.0% | 0us | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:156` |
| 30.8% | 2.36s | 0.0% | 0us | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:207` |
| 21.5% | 1.64s | 0.0% | 0us | `async runTurn` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/run-turn.ts:93` |
| 21.5% | 1.64s | 0.0% | 0us | `async beforeStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:577` |
| 21.5% | 1.64s | 0.0% | 0us | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:51` |
| 21.5% | 1.64s | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:579` |
| 21.5% | 1.64s | 0.0% | 0us | `async beforeStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:273` |
| 21.5% | 1.64s | 0.0% | 0us | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:69` |
| 20.5% | 1.57s | 0.0% | 0us | `async beforeStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:277` |
| 20.4% | 1.56s | 0.0% | 0us | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:216` |
| 10.6% | 816.5ms | 0.0% | 0us | `async chatOnce` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:85` |
| 10.6% | 816.5ms | 0.0% | 0us | `async chatWithRetry` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/retry.ts:37` |
| 10.6% | 816.5ms | 0.0% | 0us | `async chatWithRetry` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/retry.ts:54` |
| 10.6% | 816.5ms | 0.0% | 0us | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:131` |
| 10.6% | 816.5ms | 0.0% | 0us | `async chat` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:82` |
| 10.6% | 813.5ms | 0.0% | 0us | `async chatOnce` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:95` |
| 10.6% | 813.5ms | 0.0% | 0us | `applyCompletionBudget` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/completion-budget.ts:105` |
| 10.5% | 811.8ms | 0.0% | 0us | `computeCompletionBudgetCap` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/completion-budget.ts:72` |
| 10.4% | 801.3ms | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:423` |
| 10.4% | 800.3ms | 0.0% | 0us | `async withProviderRequestAuth` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/request-auth.ts:20` |
| 10.4% | 798.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:258` |
| 10.4% | 797.2ms | 0.0% | 0us | `logLlmRequest` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:403` |
| 10.3% | 795.9ms | 0.0% | 0us | `buildLlmRequestMetadata` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:741` |
| 10.0% | 771.7ms | 0.0% | 1.3ms | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:47` |
| 5.5% | 426.8ms | 0.4% | 38.2ms | `estimateTokens` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:16` |
| 5.2% | 404.6ms | 5.1% | 397.1ms | `next` | `[native code]` |
| 5.1% | 391.7ms | 0.0% | 0us | `async runTurn` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/run-turn.ts:46` |
| 5.1% | 391.7ms | 0.0% | 0us | `async runTurn` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:539` |
| 4.1% | 319.4ms | 0.0% | 0us | `estimateTokensForContentPart` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:60` |
| 3.7% | 290.2ms | 1.2% | 94.3ms | `anonymous` | `[native code]` |
| 2.9% | 228.9ms | 0.0% | 0us | `bound require` | `[native code]` |
| 2.9% | 227.7ms | 0.0% | 1.5ms | `require` | `[native code]` |
| 2.7% | 207.4ms | 2.7% | 207.4ms | `estimateTokensForContentPart` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:59` |
| 2.6% | 202.5ms | 2.6% | 202.5ms | `estimateTokensForContentPart` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` |
| 0.7% | 56.7ms | 0.0% | 6.9ms | `map` | `[native code]` |
| 0.6% | 50.4ms | 0.0% | 5.9ms | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:45` |
| 0.5% | 44.9ms | 0.0% | 0us | `get tokenCountWithPending` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:146` |
| 0.5% | 38.9ms | 0.0% | 0us | `code` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:439` |
| 0.5% | 38.8ms | 0.5% | 38.8ms | `stringify` | `[native code]` |
| 0.4% | 38.1ms | 0.0% | 0us | `async beforeStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:289` |
| 0.4% | 33.5ms | 0.0% | 0us | `mergeAdjacentUserMessages` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:155` |
| 0.4% | 33.5ms | 0.0% | 0us | `project` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:42` |
| 0.4% | 32.1ms | 0.0% | 0us | `cloneMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:187` |
| 0.3% | 29.1ms | 0.3% | 29.1ms | `cloneObject` | `[native code]` |
| 0.3% | 28.9ms | 0.0% | 0us | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:200` |
| 0.3% | 28.8ms | 0.0% | 0us | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:82` |
| 0.3% | 27.8ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:187` |
| 0.3% | 27.3ms | 0.0% | 0us | `buildMessages` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:552` |
| 0.3% | 24.1ms | 0.0% | 0us | `block` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:568` |
| 0.3% | 23.0ms | 0.0% | 0us | `async appendTranscriptRecord` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:690` |
| 0.3% | 23.0ms | 0.0% | 1.7ms | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:691` |
| 0.3% | 23.0ms | 0.0% | 0us | `async recordEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:162` |
| 0.3% | 23.0ms | 0.0% | 0us | `async recordEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:159` |
| 0.2% | 21.3ms | 0.0% | 0us | `async appendLoopEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:296` |
| 0.2% | 20.3ms | 0.0% | 0us | `async beforeStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:298` |
| 0.2% | 20.3ms | 0.0% | 0us | `checkAutoCompaction` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:313` |
| 0.2% | 18.5ms | 0.0% | 0us | `offloadToolOutput` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:350` |
| 0.2% | 18.5ms | 0.0% | 0us | `async runToolCallBatch` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:154` |
| 0.2% | 18.5ms | 0.0% | 0us | `async offloadOutput` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/output-offloading.ts:33` |
| 0.2% | 18.5ms | 0.0% | 0us | `shouldOffload` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/output-offloading.ts:29` |
| 0.2% | 18.5ms | 0.0% | 0us | `async foldLoopEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/wire-fold.ts:220` |
| 0.2% | 18.5ms | 0.0% | 0us | `async offloadOutput` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/output-offloading.ts:44` |
| 0.2% | 18.5ms | 0.0% | 0us | `async appendLoopEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:301` |
| 0.2% | 18.5ms | 0.0% | 0us | `async foldLoopEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/wire-fold.ts:159` |
| 0.2% | 17.6ms | 0.0% | 0us | `get tokenCountWithPending` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:247` |
| 0.2% | 17.3ms | 0.0% | 0us | `maskToolResult` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:105` |
| 0.2% | 17.3ms | 0.2% | 17.3ms | `isAlreadyMasked` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:94` |
| 0.2% | 17.2ms | 0.0% | 0us | `resolveRuntimeProvider` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:120` |
| 0.2% | 17.2ms | 0.0% | 0us | `tryResolvedProviderConfig` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:143` |
| 0.2% | 16.6ms | 0.0% | 0us | `applyPruning` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:244` |
| 0.2% | 15.3ms | 0.0% | 0us | `async beforeStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:299` |
| 0.1% | 14.7ms | 0.0% | 0us | `ws` | `ws:3` |
| 0.1% | 14.7ms | 0.0% | 0us | `node:http` | `node:http:2` |
| 0.1% | 14.0ms | 0.0% | 0us | `applyPruning` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:276` |
| 0.1% | 13.9ms | 0.0% | 0us | `async runModeB` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:591` |
| 0.1% | 13.6ms | 0.0% | 0us | `typeAndKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:128` |
| 0.1% | 13.2ms | 0.0% | 0us | `node:_http_client` | `node:_http_client:44` |
| 0.1% | 13.2ms | 0.0% | 0us | `resolveModelCapabilities` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:254` |
| 0.1% | 13.2ms | 0.0% | 0us | `createProvider` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/index.ts:24` |
| 0.1% | 13.2ms | 0.0% | 0us | `OpenAICompletionsChatProvider` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/openai-completions.ts:405` |
| 0.1% | 12.5ms | 0.0% | 0us | `get shouldBlock` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:259` |
| 0.1% | 12.5ms | 0.0% | 0us | `get shouldCompact` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:255` |
| 0.1% | 12.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/index.js:31` |
| 0.1% | 12.2ms | 0.0% | 0us | `keywordCode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:464` |
| 0.1% | 11.9ms | 0.0% | 0us | `update` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:62` |
| 0.1% | 11.8ms | 0.0% | 0us | `get modelCapabilities` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:133` |
| 0.1% | 11.7ms | 0.0% | 0us | `async runToolCallBatch` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:126` |
| 0.1% | 11.7ms | 0.0% | 0us | `async runToolCallBatch` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:122` |
| 0.1% | 11.7ms | 0.0% | 0us | `preflightToolCall` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:202` |
| 0.1% | 11.7ms | 0.0% | 0us | `validateExecutableToolArgs` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:234` |
| 0.1% | 11.7ms | 0.0% | 0us | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:208` |
| 0.1% | 11.6ms | 0.0% | 0us | `dispatchEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:141` |
| 0.1% | 11.2ms | 0.0% | 0us | `init` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:21` |
| 0.1% | 10.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/picomatch@4.0.4/node_modules/picomatch/lib/picomatch.js:4` |
| 0.1% | 10.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/picomatch@4.0.4/node_modules/picomatch/index.js:3` |
| 0.1% | 10.6ms | 0.0% | 0us | `tokenCountWithPending` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:247` |
| 0.1% | 10.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:181` |
| 0.1% | 10.5ms | 0.0% | 0us | `reduce` | `[native code]` |
| 0.1% | 10.5ms | 0.0% | 0us | `_addSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:461` |
| 0.1% | 10.5ms | 0.0% | 0us | `compile` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:159` |
| 0.1% | 10.3ms | 0.0% | 0us | `createPerfAgent` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:298` |
| 0.1% | 10.0ms | 0.0% | 0us | `maskToolResult` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:109` |
| 0.1% | 9.6ms | 0.1% | 9.6ms | `start` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/cron/manager.ts` |
| 0.1% | 9.6ms | 0.0% | 0us | `Agent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:227` |
| 0.1% | 9.6ms | 0.0% | 0us | `createPerfAgent` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:288` |
| 0.1% | 9.6ms | 0.0% | 0us | `CronManager` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/cron/manager.ts:190` |
| 0.1% | 8.9ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:192` |
| 0.1% | 8.9ms | 0.0% | 0us | `iterateKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:219` |
| 0.1% | 8.9ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:222` |
| 0.1% | 8.9ms | 0.0% | 0us | `schemaKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:190` |
| 0.1% | 8.9ms | 0.0% | 0us | `validateSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:255` |
| 0.1% | 8.9ms | 0.0% | 0us | `_compileMetaSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:483` |
| 0.1% | 8.9ms | 0.0% | 0us | `_compileSchemaEnv` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:471` |
| 0.1% | 8.9ms | 0.0% | 0us | `defaultMeta` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:29` |
| 0.1% | 8.5ms | 0.0% | 0us | `countLines` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:69` |
| 0.1% | 7.8ms | 0.0% | 0us | `shouldCompact` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:255` |
| 0.0% | 7.6ms | 0.0% | 0us | `toInputJsonSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/support/input-schema.ts:27` |
| 0.0% | 7.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/parse-bmfont-xml@1.1.6/node_modules/parse-bmfont-xml/lib/index.js:1` |
| 0.0% | 7.5ms | 0.0% | 0us | `async replay` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts:113` |
| 0.0% | 7.5ms | 0.0% | 0us | `asyncGeneratorResumeNext` | `[native code]` |
| 0.0% | 7.4ms | 0.0% | 0us | `validateFunctionCode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:21` |
| 0.0% | 7.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:70` |
| 0.0% | 7.4ms | 0.0% | 0us | `compileSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:80` |
| 0.0% | 7.4ms | 0.0% | 0us | `validateFunction` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:37` |
| 0.0% | 7.4ms | 0.0% | 0us | `func` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:587` |
| 0.0% | 7.4ms | 0.0% | 0us | `topSchemaObjCode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:62` |
| 0.0% | 7.3ms | 0.0% | 7.3ms | `parse` | `[native code]` |
| 0.0% | 7.3ms | 0.0% | 0us | `parseRecordLine` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:194` |
| 0.0% | 7.3ms | 0.0% | 0us | `async read` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:73` |
| 0.0% | 7.2ms | 0.0% | 7.2ms | `async loadFromDisk` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/background/manager.ts` |
| 0.0% | 7.2ms | 0.0% | 0us | `async loadFromDisk` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/background/manager.ts:935` |
| 0.0% | 7.2ms | 0.0% | 0us | `async resume` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:439` |
| 0.0% | 6.2ms | 0.0% | 0us | `subschema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:438` |
| 0.0% | 6.2ms | 0.0% | 0us | `subschemaCode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:91` |
| 0.0% | 6.2ms | 0.0% | 0us | `subSchemaObjCode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:115` |
| 0.0% | 6.0ms | 0.0% | 0us | `GrepTool` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/grep.ts:174` |
| 0.0% | 6.0ms | 0.0% | 0us | `async runModeB` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:609` |
| 0.0% | 6.0ms | 0.0% | 6.0ms | `flattenRef` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:292` |
| 0.0% | 6.0ms | 0.0% | 0us | `flattenRef` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:230` |
| 0.0% | 6.0ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/grep.ts:172` |
| 0.0% | 6.0ms | 0.0% | 0us | `initializeBuiltinTools` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/tool/index.ts:364` |
| 0.0% | 6.0ms | 0.0% | 0us | `finalize` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:296` |
| 0.0% | 6.0ms | 0.0% | 0us | `groupKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:200` |
| 0.0% | 6.0ms | 0.0% | 0us | `applyPropertySchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/applicator/properties.js:45` |
| 0.0% | 6.0ms | 0.0% | 0us | `code` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/applicator/properties.js:33` |
| 0.0% | 6.0ms | 0.0% | 0us | `async drainPendingRecords` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:156` |
| 0.0% | 6.0ms | 0.0% | 0us | `async drainBatch` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:160` |
| 0.0% | 6.0ms | 0.0% | 0us | `async drainBatch` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:165` |
| 0.0% | 6.0ms | 0.0% | 0us | `compile` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:518` |
| 0.0% | 6.0ms | 0.0% | 0us | `render` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:440` |
| 0.0% | 6.0ms | 0.0% | 0us | `_compile` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:526` |
| 0.0% | 5.9ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/xml2js.js:39` |
| 0.0% | 5.9ms | 0.0% | 0us | `get maxContextSize` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:251` |
| 0.0% | 5.9ms | 0.0% | 1.5ms | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:321` |
| 0.0% | 5.9ms | 0.0% | 0us | `async onTextPart` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:320` |
| 0.0% | 5.9ms | 0.0% | 0us | `async chatOnce` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:119` |
| 0.0% | 5.8ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/index.js:4` |
| 0.0% | 5.8ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:4` |
| 0.0% | 5.4ms | 0.0% | 0us | `modelCapabilities` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:133` |
| 0.0% | 4.9ms | 0.0% | 0us | `safeEmitLive` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:170` |
| 0.0% | 4.9ms | 0.0% | 0us | `async recordEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:163` |
| 0.0% | 4.9ms | 0.0% | 0us | `prompt` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:455` |
| 0.0% | 4.9ms | 0.0% | 0us | `launch` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:125` |
| 0.0% | 4.9ms | 0.0% | 0us | `async runTurns` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:317` |
| 0.0% | 4.7ms | 0.0% | 4.7ms | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` |
| 0.0% | 4.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/builder.js:127` |
| 0.0% | 4.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/index.js:65` |
| 0.0% | 4.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/builder.js:7` |
| 0.0% | 4.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/xml2js.js:10` |
| 0.0% | 4.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:165` |
| 0.0% | 4.6ms | 0.0% | 0us | `compile` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:1023` |
| 0.0% | 4.6ms | 0.0% | 0us | `schemaKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:185` |
| 0.0% | 4.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:20` |
| 0.0% | 4.5ms | 0.0% | 0us | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:101` |
| 0.0% | 4.5ms | 0.0% | 0us | `get names` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:235` |
| 0.0% | 4.4ms | 0.0% | 4.4ms | `structuredClone` | `[native code]` |
| 0.0% | 4.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:4` |
| 0.0% | 4.2ms | 0.0% | 0us | `emitStatusUpdated` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:606` |
| 0.0% | 4.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:8` |
| 0.0% | 4.1ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/utif2@4.1.0/node_modules/utif2/UTIF.js:12` |
| 0.0% | 4.1ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/utif2@4.1.0/node_modules/utif2/UTIF.js:1648` |
| 0.0% | 3.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/call-bind@1.0.9/node_modules/call-bind/index.js:3` |
| 0.0% | 3.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/set-function-length@1.2.2/node_modules/set-function-length/index.js:3` |
| 0.0% | 3.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:4` |
| 0.0% | 3.3ms | 0.0% | 1.6ms | `emitLiveEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:695` |
| 0.0% | 3.3ms | 0.0% | 0us | `ZodOptional` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` |
| 0.0% | 3.3ms | 0.0% | 0us | `optional` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:889` |
| 0.0% | 3.2ms | 0.0% | 0us | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:188` |
| 0.0% | 3.2ms | 0.0% | 3.2ms | `get` | `[native code]` |
| 0.0% | 3.2ms | 0.0% | 1.4ms | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:195` |
| 0.0% | 3.2ms | 0.0% | 3.2ms | `applyPruning` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:262` |
| 0.0% | 3.1ms | 0.0% | 0us | `internal:streams/transform` | `internal:streams/transform:2` |
| 0.0% | 3.1ms | 0.0% | 0us | `node:crypto` | `node:crypto:2` |
| 0.0% | 3.1ms | 0.0% | 0us | `internal:streams/lazy_transform` | `internal:streams/lazy_transform:2` |
| 0.0% | 3.1ms | 0.0% | 0us | `internal:streams/duplex` | `internal:streams/duplex:2` |
| 0.0% | 3.1ms | 0.0% | 3.1ms | `async drainBatch` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:176` |
| 0.0% | 3.1ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:6` |
| 0.0% | 3.1ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/implementation.js:3` |
| 0.0% | 3.1ms | 0.0% | 0us | `get ReadStream` | `node:fs:578` |
| 0.0% | 3.1ms | 0.0% | 3.1ms | `internal:fs/streams` | `internal:fs/streams:130` |
| 0.0% | 3.0ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/index.js:9` |
| 0.0% | 3.0ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:242` |
| 0.0% | 3.0ms | 0.0% | 0us | `initializeBuiltinTools` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/tool/index.ts:366` |
| 0.0% | 3.0ms | 0.0% | 0us | `BashTool` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/shell/bash.ts:164` |
| 0.0% | 3.0ms | 0.0% | 0us | `parseAsRoot` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:1005` |
| 0.0% | 3.0ms | 0.0% | 1.6ms | `Beta` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/beta/beta.mjs:15` |
| 0.0% | 3.0ms | 0.0% | 0us | `get names` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:238` |
| 0.0% | 2.9ms | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:585` |
| 0.0% | 2.9ms | 0.0% | 0us | `record` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/usage/index.ts:43` |
| 0.0% | 2.9ms | 0.0% | 0us | `async afterStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:584` |
| 0.0% | 2.9ms | 0.0% | 0us | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:234` |
| 0.0% | 2.9ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/computeclient.js:19` |
| 0.0% | 2.9ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:24` |
| 0.0% | 2.9ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/read.ts:163` |
| 0.0% | 2.9ms | 0.0% | 0us | `async prepareToolCall` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:282` |
| 0.0% | 2.9ms | 0.0% | 1.5ms | `Obj` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/object.js:51` |
| 0.0% | 2.9ms | 0.0% | 0us | `groupKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:208` |
| 0.0% | 2.8ms | 0.0% | 0us | `node:fs/promises` | `node:fs/promises:2` |
| 0.0% | 2.8ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/index.js:6` |
| 0.0% | 2.8ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:5` |
| 0.0% | 2.8ms | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:401` |
| 0.0% | 2.8ms | 0.0% | 0us | `forEach` | `[native code]` |
| 0.0% | 2.8ms | 0.0% | 0us | `shouldBlock` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:259` |
| 0.0% | 2.8ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/retry@0.13.1/node_modules/retry/index.js:1` |
| 0.0% | 2.8ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/p-retry@4.6.2/node_modules/p-retry/index.js:2` |
| 0.0% | 2.7ms | 0.0% | 0us | `async appendLoopEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:297` |
| 0.0% | 2.6ms | 0.0% | 0us | `composeNode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2537` |
| 0.0% | 2.6ms | 0.0% | 0us | `readDocument` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2721` |
| 0.0% | 2.6ms | 0.0% | 0us | `loadDocuments` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2784` |
| 0.0% | 2.6ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/default.ts:19` |
| 0.0% | 2.6ms | 0.0% | 0us | `finalizeRawAgentProfileSource` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:67` |
| 0.0% | 2.6ms | 0.0% | 0us | `load$1` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2810` |
| 0.0% | 2.6ms | 0.0% | 0us | `parseAgentProfileYaml` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:76` |
| 0.0% | 2.6ms | 0.0% | 0us | `loadAgentProfilesFromSources` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:20` |
| 0.0% | 2.6ms | 0.0% | 0us | `readBlockMapping` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2260` |
| 0.0% | 2.6ms | 0.0% | 2.6ms | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:182` |
| 0.0% | 2.5ms | 0.0% | 2.5ms | `push` | `[native code]` |
| 0.0% | 2.5ms | 0.0% | 0us | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:184` |
| 0.0% | 2.5ms | 0.0% | 0us | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:215` |
| 0.0% | 2.4ms | 0.0% | 0us | `resolveModelCapabilities` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:256` |
| 0.0% | 2.0ms | 0.0% | 2.0ms | `isKilled` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/cron/manager.ts:171` |
| 0.0% | 2.0ms | 0.0% | 0us | `tick` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/cron/scheduler.ts:279` |
| 0.0% | 1.7ms | 0.0% | 0us | `async execute` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/tool/index.ts:97` |
| 0.0% | 1.7ms | 0.0% | 0us | `async executeTool` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:531` |
| 0.0% | 1.7ms | 0.0% | 0us | `async toolCall` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:251` |
| 0.0% | 1.7ms | 0.0% | 0us | `async runRunnableToolCall` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:450` |
| 0.0% | 1.7ms | 0.0% | 0us | `async runRunnableToolCall` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:435` |
| 0.0% | 1.7ms | 0.0% | 0us | `start` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-scheduler.ts:66` |
| 0.0% | 1.7ms | 0.0% | 0us | `async start` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:335` |
| 0.0% | 1.7ms | 0.0% | 0us | `add` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-scheduler.ts:40` |
| 0.0% | 1.7ms | 0.0% | 0us | `async runToolCallBatch` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:136` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `fill` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:76` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/get-intrinsic@1.3.0/node_modules/get-intrinsic/index.js:32` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `(anonymous)` | `internal:fs/streams:147` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `node:fs:194` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/get-intrinsic@1.3.0/node_modules/get-intrinsic/index.js:244` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gaxios@7.1.4/node_modules/gaxios/build/cjs/src/index.js:31` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gaxios@7.1.4/node_modules/gaxios/build/cjs/src/gaxios.js:20` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:19` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/yauzl@3.3.0/node_modules/yauzl/index.js:4` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/packer-async.js:6` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png.js:6` |
| 0.0% | 1.7ms | 0.0% | 0us | `async runToolCallBatch` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:152` |
| 0.0% | 1.7ms | 0.0% | 0us | `async finalizeToolResult` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:638` |
| 0.0% | 1.7ms | 0.0% | 0us | `async finalizePendingToolResult` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:471` |
| 0.0% | 1.7ms | 0.0% | 0us | `async finalizePendingToolResult` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:480` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:642` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `has` | `[native code]` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/stscredentials.js:19` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:30` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/baseexternalclient.js:20` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/externalclient.js:17` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/define-properties@1.2.1/node_modules/define-properties/index.js:8` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:3` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/define-data-property@1.1.4/node_modules/define-data-property/index.js:8` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `mapLoopEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:910` |
| 0.0% | 1.7ms | 0.0% | 0us | `computeCompletionBudgetCap` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/completion-budget.ts:73` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `async restoreAppendLoopEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:455` |
| 0.0% | 1.7ms | 0.0% | 0us | `restoreRecord` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:402` |
| 0.0% | 1.7ms | 0.0% | 0us | `ReadStream` | `internal:fs/streams:58` |
| 0.0% | 1.7ms | 0.0% | 0us | `createReadStream` | `node:fs:354` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `getValidatedPath` | `internal:fs/streams` |
| 0.0% | 1.7ms | 0.0% | 0us | `async read` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:63` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:4` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:4` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:4` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/boolSchema.js:4` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:145` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:884` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:79` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:58` |
| 0.0% | 1.6ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/shared/auth.js:77` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv-formats@3.0.1/node_modules/ajv-formats/dist/index.js:3` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/jpeg-js@0.4.4/node_modules/jpeg-js/index.js:2` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `stringSplitFast` | `[native code]` |
| 0.0% | 1.6ms | 0.0% | 0us | `getHandlerKey` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts:86` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/index.js:11` |
| 0.0% | 1.6ms | 0.0% | 0us | `routeToHandler` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts:69` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/authclient.js:20` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/oauth2client.js:23` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `async chatOnce` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:13` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gifwrap@0.10.1/node_modules/gifwrap/src/index.js:5` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gifwrap@0.10.1/node_modules/gifwrap/src/gifcodec.js:3` |
| 0.0% | 1.6ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:357` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:883` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `defineLazy` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/util.js:67` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js:1616` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `slice` | `[native code]` |
| 0.0% | 1.6ms | 0.0% | 0us | `async read` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:70` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/index.js:60` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `trackDuplicateToolCall` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts` |
| 0.0% | 1.6ms | 0.0% | 0us | `trackToolLifecycle` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:726` |
| 0.0% | 1.6ms | 0.0% | 0us | `emitLiveEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:694` |
| 0.0% | 1.6ms | 0.0% | 0us | `trackLoopTelemetry` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:713` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `getToolPriority` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts` |
| 0.0% | 1.6ms | 0.0% | 0us | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:194` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/aos/EncodeForRegExpEscape.js:3` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/es-abstract@1.24.2/node_modules/es-abstract/2024/Number/toString.js:5` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `findAll` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js` |
| 0.0% | 1.6ms | 0.0% | 0us | `compileRoot` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:974` |
| 0.0% | 1.6ms | 0.0% | 0us | `compile` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:997` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `applyPruning` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:265` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `validate0` | `[native code]` |
| 0.0% | 1.6ms | 0.0% | 0us | `validate` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:153` |
| 0.0% | 1.6ms | 0.0% | 0us | `validateSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:261` |
| 0.0% | 1.6ms | 0.0% | 0us | `restoreObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:463` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `Uploads` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/uploads/uploads.mjs:11` |
| 0.0% | 1.6ms | 0.0% | 0us | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:109` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/index.js:15` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `getOwnPropertyDescriptor` | `[native code]` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-logging-utils@1.1.3/node_modules/google-logging-utils/build/src/logging-utils.js:17` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gcp-metadata@8.1.2/node_modules/gcp-metadata/build/src/index.js:67` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-logging-utils@1.1.3/node_modules/google-logging-utils/build/src/logging-utils.js:56` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-logging-utils@1.1.3/node_modules/google-logging-utils/build/src/logging-utils.js:43` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-logging-utils@1.1.3/node_modules/google-logging-utils/build/src/index.js:30` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/draft7.js:4` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/limitLength.js:5` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/index.js:5` |
| 0.0% | 1.5ms | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:397` |
| 0.0% | 1.5ms | 0.0% | 0us | `async generate` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:366` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `resolveModelCapabilities` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:268` |
| 0.0% | 1.5ms | 0.0% | 0us | `callSyncRef` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js:83` |
| 0.0% | 1.5ms | 0.0% | 0us | `callRef` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js:64` |
| 0.0% | 1.5ms | 0.0% | 0us | `result` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:316` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `failResult` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js` |
| 0.0% | 1.5ms | 0.0% | 0us | `callValidate` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js:33` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `countLines` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:67` |
| 0.0% | 1.5ms | 0.0% | 0us | `subclass` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/object.js:35` |
| 0.0% | 1.5ms | 0.0% | 0us | `parseNodes` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:991` |
| 0.0% | 1.5ms | 0.0% | 0us | `NodeList` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js:88` |
| 0.0% | 1.5ms | 0.0% | 0us | `restoreRecord` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:155` |
| 0.0% | 1.5ms | 0.0% | 0us | `Node` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js:22` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `code` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js:14` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/code.js:116` |
| 0.0% | 1.5ms | 0.0% | 0us | `validateUnion` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/code.js:115` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gcp-metadata@8.1.2/node_modules/gcp-metadata/build/src/gcp-residency.js:24` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gcp-metadata@8.1.2/node_modules/gcp-metadata/build/src/index.js:66` |
| 0.0% | 1.5ms | 0.0% | 0us | `ReadTool` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/read.ts:174` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `initializeContext` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/read.ts:172` |
| 0.0% | 1.5ms | 0.0% | 0us | `toJSONSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/json-schema-processors.js:601` |
| 0.0% | 1.5ms | 0.0% | 0us | `initializeBuiltinTools` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/tool/index.ts:361` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `coerceObjectProperties` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:110` |
| 0.0% | 1.5ms | 0.0% | 0us | `buildLlmConfigSignature` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:824` |
| 0.0% | 1.5ms | 0.0% | 0us | `logLlmRequest` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:399` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `digest` | `node:crypto:196` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts` |
| 0.0% | 1.5ms | 0.0% | 0us | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:51` |
| 0.0% | 1.5ms | 0.0% | 0us | `maxContextSize` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:251` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `Realtime` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/beta/realtime/realtime.mjs:12` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:581` |
| 0.0% | 1.5ms | 0.0% | 0us | `Beta` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/beta/beta.mjs:14` |
| 0.0% | 1.5ms | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:424` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/aos/EncodeForRegExpEscape.js:17` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/safe-regex-test@1.1.0/node_modules/safe-regex-test/index.js:4` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:102` |
| 0.0% | 1.5ms | 0.0% | 0us | `ZodString` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:128` |
| 0.0% | 1.5ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/background/task-output.ts:40` |
| 0.0% | 1.5ms | 0.0% | 0us | `_string` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js:7` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:61` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `maskToolResult` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:102` |
| 0.0% | 1.5ms | 0.0% | 0us | `compileSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:81` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `get names` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:142` |
| 0.0% | 1.5ms | 0.0% | 0us | `optimize` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:597` |
| 0.0% | 1.5ms | 0.0% | 0us | `parse` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/fast-uri@3.1.0/node_modules/fast-uri/index.js:243` |
| 0.0% | 1.5ms | 0.0% | 0us | `resolveRef` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:133` |
| 0.0% | 1.5ms | 0.0% | 0us | `code` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js:19` |
| 0.0% | 1.5ms | 0.0% | 0us | `resolveSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:175` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `regExpMatchFast` | `[native code]` |
| 0.0% | 1.5ms | 0.0% | 0us | `node:_http_server` | `node:_http_server:42` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `estimateTokensForMessages` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` |
| 0.0% | 1.4ms | 0.0% | 0us | `parseAnd` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:605` |
| 0.0% | 1.4ms | 0.0% | 0us | `parseDiv` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:729` |
| 0.0% | 1.4ms | 0.0% | 0us | `parseCompare` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:673` |
| 0.0% | 1.4ms | 0.0% | 0us | `parseUnary` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:771` |
| 0.0% | 1.4ms | 0.0% | 0us | `parseSub` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:713` |
| 0.0% | 1.4ms | 0.0% | 0us | `parseMod` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:745` |
| 0.0% | 1.4ms | 0.0% | 0us | `parseIs` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:654` |
| 0.0% | 1.4ms | 0.0% | 0us | `parseInlineIf` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:581` |
| 0.0% | 1.4ms | 0.0% | 0us | `parseIn` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:620` |
| 0.0% | 1.4ms | 0.0% | 0us | `parseAdd` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:705` |
| 0.0% | 1.4ms | 0.0% | 0us | `parseMul` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:721` |
| 0.0% | 1.4ms | 0.0% | 0us | `parseExpression` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:577` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `parseFilter` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:841` |
| 0.0% | 1.4ms | 0.0% | 0us | `parseNodes` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:988` |
| 0.0% | 1.4ms | 0.0% | 0us | `parseConcat` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:697` |
| 0.0% | 1.4ms | 0.0% | 0us | `parseFloorDiv` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:737` |
| 0.0% | 1.4ms | 0.0% | 0us | `parsePow` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:753` |
| 0.0% | 1.4ms | 0.0% | 0us | `parseOr` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:597` |
| 0.0% | 1.4ms | 0.0% | 0us | `flatIntoArrayWithCallback` | `[native code]` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `flatIntoArray` | `[native code]` |
| 0.0% | 1.4ms | 0.0% | 0us | `buildMessages` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:551` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:5` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:6` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `ZodTuple` | `[native code]` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@3.25.76/node_modules/zod/v3/types.js:2654` |
| 0.0% | 1.4ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@jimp+plugin-color@1.6.1/node_modules/@jimp/plugin-color/dist/esm/index.js:72` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gcp-metadata@8.1.2/node_modules/gcp-metadata/build/src/index.js:65` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:323` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png.js:7` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png-sync.js:4` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/standardwebhooks@1.0.0/node_modules/standardwebhooks/dist/index.js:6` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `extendSubschemaMode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/subschema.js:71` |
| 0.0% | 1.4ms | 0.0% | 0us | `subschema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:436` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:69` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `Sessions` | `[native code]` |
| 0.0% | 1.4ms | 0.0% | 0us | `ChatKit` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/beta/chatkit/chatkit.mjs:10` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:16` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:19` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLWriterBase.js:12` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLWriterBase.js:428` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocType.js:17` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLStringWriter.js:7` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocType.js:186` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLStringWriter.js:35` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/jws@4.0.1/node_modules/jws/lib/sign-stream.js:4` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:27` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/jws@4.0.1/node_modules/jws/index.js:2` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/googleToken.js:18` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/getToken.js:17` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/jwsSign.js:18` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/tokenHandler.js:4` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/jwtclient.js:17` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `logRecord` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts:40` |
| 0.0% | 1.3ms | 0.0% | 0us | `cloneMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:188` |
| 0.0% | 1.3ms | 0.0% | 0us | `coerceObjectProperties` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:99` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `add` | `[native code]` |
| 0.0% | 1.3ms | 0.0% | 0us | `collectRequiredPropertyNames` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:153` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `join` | `[native code]` |
| 0.0% | 1.3ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:1317` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `_boolean` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js:369` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `init` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js` |
| 0.0% | 1.3ms | 0.0% | 0us | `Compiler` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:30` |
| 0.0% | 1.3ms | 0.0% | 0us | `compile` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:1012` |
| 0.0% | 1.3ms | 0.0% | 0us | `applyPruning` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:239` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `readEnv` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/internal/utils/env.mjs:10` |
| 0.0% | 1.3ms | 0.0% | 0us | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:152` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gifwrap@0.10.1/node_modules/gifwrap/src/index.js:7` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gifwrap@0.10.1/node_modules/gifwrap/src/gifutil.js:6` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `parse` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/fast-uri@3.1.0/node_modules/fast-uri/index.js:263` |
| 0.0% | 1.3ms | 0.0% | 0us | `addSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:235` |
| 0.0% | 1.3ms | 0.0% | 0us | `getSchemaRefs` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/resolve.js:100` |
| 0.0% | 1.3ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:6` |
| 0.0% | 1.3ms | 0.0% | 0us | `getFullPath` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/resolve.js:74` |
| 0.0% | 1.3ms | 0.0% | 0us | `Ajv` | `[native code]` |
| 0.0% | 1.3ms | 0.0% | 0us | `_addDefaultMetaSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:24` |
| 0.0% | 1.3ms | 0.0% | 0us | `_addSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:451` |
| 0.0% | 1.3ms | 0.0% | 0us | `addMetaSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:243` |
| 0.0% | 1.3ms | 0.0% | 0us | `Ajv` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:114` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `buildLlmRequestMetadata` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:735` |
| 0.0% | 1.3ms | 0.0% | 0us | `keywordCode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:462` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `KeywordCxt` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `readBlockSequence` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2074` |
| 0.0% | 1.3ms | 0.0% | 0us | `composeNode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2536` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `scheduleFlush` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:123` |
| 0.0% | 1.3ms | 0.0% | 0us | `append` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:100` |
| 0.0% | 1.3ms | 0.0% | 0us | `logRecord` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts:56` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/any-base@1.1.0/node_modules/any-base/index.js:21` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/any-base@1.1.0/node_modules/any-base/src/converter.js:50` |
| 0.0% | 1.3ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@jimp+plugin-hash@1.6.1/node_modules/@jimp/plugin-hash/dist/esm/index.js:11` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `parseInt` | `[native code]` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `exec` | `[native code]` |
| 0.0% | 1.3ms | 0.0% | 0us | `composeNode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2591` |
| 0.0% | 1.3ms | 0.0% | 0us | `resolveYamlTimestamp` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:765` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/inflate.js:4` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/index.js:7` |
| 0.0% | 1.2ms | 0.0% | 0us | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:68` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `copyDataProperties` | `[native code]` |
| 0.0% | 1.2ms | 0.0% | 0us | `async prepareToolCall` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:244` |
| 0.0% | 1.2ms | 0.0% | 0us | `async runPrepareToolExecutionHook` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:362` |
| 0.0% | 1.2ms | 0.0% | 0us | `async runToolCallBatch` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:134` |
| 0.0% | 1.2ms | 0.0% | 0us | `async prepareToolCall` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:252` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `async runPrepareToolExecutionHook` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:365` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `defineProperty` | `[native code]` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/2020.js:47` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:373` |
| 0.0% | 1.2ms | 0.0% | 0us | `async chatOnce` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:104` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `createRuntimeProviderAuthResolver` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:147` |
| 0.0% | 1.2ms | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:253` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `containsSchemaKeyword` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:47` |
| 0.0% | 1.2ms | 0.0% | 0us | `applyPruning` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:263` |
| 0.0% | 1.2ms | 0.0% | 0us | `compileToolArgsValidator` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:193` |
| 0.0% | 1.2ms | 0.0% | 0us | `ajvFor` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:37` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/applicator/index.js:9` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/draft7.js:5` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:10` |
| 0.0% | 1.2ms | 0.0% | 0us | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:79` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `Embeddings` | `[native code]` |
| 0.0% | 1.2ms | 0.0% | 0us | `getOpenAILegacyModelCapability` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/capability-registry.ts:258` |
| 0.0% | 1.2ms | 0.0% | 0us | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:230` |
| 0.0% | 1.2ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:620` |
| 0.0% | 1.2ms | 0.0% | 0us | `Type$1` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:273` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs` |
| 0.0% | 1.2ms | 0.0% | 0us | `compileStyleAliases` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:242` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `SetGoalBudgetTool` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/goal/set-goal-budget.ts` |
| 0.0% | 1.2ms | 0.0% | 0us | `initializeBuiltinTools` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/tool/index.ts:401` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:9` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/parser.js:385` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/xml2js.js:12` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/parser.js:9` |
| 0.0% | 1.2ms | 0.0% | 0us | `some` | `[native code]` |
| 0.0% | 1.2ms | 0.0% | 0us | `getOpenAILegacyModelCapability` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/capability-registry.ts:255` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/capability-registry.ts:226` |
| 0.0% | 1.2ms | 0.0% | 0us | `capabilityFromCatalog` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/capability-registry.ts:247` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/parser-async.js:4` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png.js:5` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/zlib/crc32.js:42` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/zlib/deflate.js:25` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/deflate.js:4` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `makeTable` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/zlib/crc32.js:33` |

## Function Details

### `estimateTokensForMessage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:52` | Self: 83.6% (6.41s) | Total: 84.1% (6.44s) | Samples: 4234

**Called by:**
- `estimateTokensForMessages` (4257)

**Calls:**
- `stringify` (23)

### `next`
`[native code]` | Self: 5.1% (397.1ms) | Total: 5.2% (404.6ms) | Samples: 261

**Called by:**
- `estimateTokens` (256)
- `async replay` (5)
- `countLines` (5)

**Calls:**
- `asyncGeneratorResumeNext` (5)

### `estimateTokensForContentPart`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:59` | Self: 2.7% (207.4ms) | Total: 2.7% (207.4ms) | Samples: 136

**Called by:**
- `estimateTokensForMessage` (136)

### `estimateTokensForContentPart`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` | Self: 2.6% (202.5ms) | Total: 2.6% (202.5ms) | Samples: 134

**Called by:**
- `estimateTokensForMessage` (134)

### `anonymous`
`[native code]` | Self: 1.2% (94.3ms) | Total: 3.7% (290.2ms) | Samples: 45

**Called by:**
- `require` (134)
- `node:http` (2)
- `ws` (2)
- `node:_http_client` (1)
- `get ReadStream` (1)
- `node:fs/promises` (1)
- `internal:streams/transform` (1)
- `node:crypto` (1)
- `internal:streams/duplex` (1)
- `node:_http_server` (1)
- `bound require` (1)
- `internal:streams/lazy_transform` (1)

**Calls:**
- `(anonymous)` (4)
- `(anonymous)` (3)
- `(anonymous)` (3)
- `(anonymous)` (3)
- `(anonymous)` (3)
- `(anonymous)` (3)
- `(anonymous)` (2)
- `node:http` (2)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `internal:fs/streams` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `node:_http_server` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `internal:streams/transform` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `internal:streams/duplex` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `node:_http_client` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `internal:streams/lazy_transform` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)

### `(anonymous)`
`[native code]` | Self: 0.5% (42.4ms) | Total: 99.3% (7.60s) | Samples: 29

**Called by:**
- `processTicksAndRejections` (5011)

**Calls:**
- `async replay` (2168)
- `async runTurn` (827)
- `async executeLoopStep` (538)
- `async (anonymous)` (535)
- `async withProviderRequestAuth` (528)
- `async runTurn` (258)
- `async executeLoopStep` (19)
- `async runToolCallBatch` (13)
- `async executeLoopStep` (8)
- `async replay` (5)
- `(anonymous)` (5)
- `async drainPendingRecords` (4)
- `(anonymous)` (4)
- `async runModeB` (4)
- `async chatOnce` (4)
- `(anonymous)` (4)
- `async recordEvent` (3)
- `(anonymous)` (3)
- `async runTurns` (3)
- `async executeLoopStep` (2)
- `(module)` (2)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `async prepareToolCall` (2)
- `(module)` (2)
- `async (anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (1)
- `async runModeB` (1)
- `async (anonymous)` (1)
- `async runToolCallBatch` (1)
- `async read` (1)
- `(anonymous)` (1)
- `async drainBatch` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(module)` (1)
- `async (anonymous)` (1)
- `(anonymous)` (1)
- `async resume` (1)
- `(anonymous)` (1)
- `async read` (1)
- `async runToolCallBatch` (1)
- `(module)` (1)
- `(anonymous)` (1)
- `(module)` (1)
- `(module)` (1)
- `(anonymous)` (1)
- `async (anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(module)` (1)
- `(anonymous)` (1)
- `(module)` (1)
- `(module)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `async runToolCallBatch` (1)
- `async (anonymous)` (1)
- `(module)` (1)

### `stringify`
`[native code]` | Self: 0.5% (38.8ms) | Total: 0.5% (38.8ms) | Samples: 26

**Called by:**
- `estimateTokensForMessage` (23)
- `(anonymous)` (3)

### `estimateTokens`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:16` | Self: 0.4% (38.2ms) | Total: 5.5% (426.8ms) | Samples: 25

**Called by:**
- `estimateTokensForContentPart` (210)
- `estimateTokensForMessage` (29)
- `estimateTokensForMessage` (27)
- `shouldOffload` (13)
- `estimateTokensForMessage` (1)
- `computeCompletionBudgetCap` (1)

**Calls:**
- `next` (256)

### `cloneObject`
`[native code]` | Self: 0.3% (29.1ms) | Total: 0.3% (29.1ms) | Samples: 19

**Called by:**
- `(anonymous)` (18)
- `getOpenAILegacyModelCapability` (1)

### `isAlreadyMasked`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:94` | Self: 0.2% (17.3ms) | Total: 0.2% (17.3ms) | Samples: 11

**Called by:**
- `maskToolResult` (11)

### `start`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/cron/manager.ts` | Self: 0.1% (9.6ms) | Total: 0.1% (9.6ms) | Samples: 1

**Called by:**
- `CronManager` (1)

### `parse`
`[native code]` | Self: 0.0% (7.3ms) | Total: 0.0% (7.3ms) | Samples: 5

**Called by:**
- `parseRecordLine` (5)

### `async loadFromDisk`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/background/manager.ts` | Self: 0.0% (7.2ms) | Total: 0.0% (7.2ms) | Samples: 1

**Called by:**
- `async loadFromDisk` (1)

### `map`
`[native code]` | Self: 0.0% (6.9ms) | Total: 0.7% (56.7ms) | Samples: 5

**Called by:**
- `cloneMessage` (21)
- `async runToolCallBatch` (8)
- `async drainBatch` (3)
- `loadAgentProfilesFromSources` (2)
- `async (anonymous)` (2)
- `cloneMessage` (1)
- `applyPruning` (1)

**Calls:**
- `(anonymous)` (18)
- `preflightToolCall` (8)
- `(anonymous)` (3)
- `structuredClone` (2)
- `finalizeRawAgentProfileSource` (2)

### `flattenRef`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:292` | Self: 0.0% (6.0ms) | Total: 0.0% (6.0ms) | Samples: 1

**Called by:**
- `flattenRef` (1)

### `estimateTokensForMessage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:45` | Self: 0.0% (5.9ms) | Total: 0.6% (50.4ms) | Samples: 4

**Called by:**
- `estimateTokensForMessages` (33)

**Calls:**
- `estimateTokens` (29)

### `estimateTokensForMessage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` | Self: 0.0% (4.7ms) | Total: 0.0% (4.7ms) | Samples: 3

**Called by:**
- `estimateTokensForMessages` (3)

### `structuredClone`
`[native code]` | Self: 0.0% (4.4ms) | Total: 0.0% (4.4ms) | Samples: 3

**Called by:**
- `map` (2)
- `async (anonymous)` (1)

### `get`
`[native code]` | Self: 0.0% (3.2ms) | Total: 0.0% (3.2ms) | Samples: 2

**Called by:**
- `applyObservationMasking` (2)

### `applyPruning`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:262` | Self: 0.0% (3.2ms) | Total: 0.0% (3.2ms) | Samples: 2

**Called by:**
- `async beforeStep` (2)

### `async drainBatch`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:176` | Self: 0.0% (3.1ms) | Total: 0.0% (3.1ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `internal:fs/streams`
`internal:fs/streams:130` | Self: 0.0% (3.1ms) | Total: 0.0% (3.1ms) | Samples: 1

**Called by:**
- `anonymous` (1)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:182` | Self: 0.0% (2.6ms) | Total: 0.0% (2.6ms) | Samples: 2

**Called by:**
- `restoreObservationMasking` (2)

### `push`
`[native code]` | Self: 0.0% (2.5ms) | Total: 0.0% (2.5ms) | Samples: 2

**Called by:**
- `applyObservationMasking` (2)

### `isKilled`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/cron/manager.ts:171` | Self: 0.0% (2.0ms) | Total: 0.0% (2.0ms) | Samples: 1

**Called by:**
- `tick` (1)

### `fill`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:76` | Self: 0.0% (1.7ms) | Total: 0.0% (1.7ms) | Samples: 1

**Called by:**
- `async toolCall` (1)

### `(anonymous)`
`internal:fs/streams:147` | Self: 0.0% (1.7ms) | Total: 0.0% (1.7ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `has`
`[native code]` | Self: 0.0% (1.7ms) | Total: 0.0% (1.7ms) | Samples: 1

**Called by:**
- `applyObservationMasking` (1)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:642` | Self: 0.0% (1.7ms) | Total: 0.0% (1.7ms) | Samples: 1

**Called by:**
- `async finalizeToolResult` (1)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:691` | Self: 0.0% (1.7ms) | Total: 0.3% (23.0ms) | Samples: 1

**Called by:**
- `async appendTranscriptRecord` (16)

**Calls:**
- `async appendLoopEvent` (15)

### `mapLoopEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:910` | Self: 0.0% (1.7ms) | Total: 0.0% (1.7ms) | Samples: 1

**Called by:**
- `emitLiveEvent` (1)

### `async restoreAppendLoopEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:455` | Self: 0.0% (1.7ms) | Total: 0.0% (1.7ms) | Samples: 1

**Called by:**
- `restoreRecord` (1)

### `getValidatedPath`
`internal:fs/streams` | Self: 0.0% (1.7ms) | Total: 0.0% (1.7ms) | Samples: 1

**Called by:**
- `ReadStream` (1)

### `OpenAI`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:145` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `OpenAICompletionsChatProvider` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:79` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `init` (1)

### `stringSplitFast`
`[native code]` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `getHandlerKey` (1)

### `async chatOnce`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `async chatOnce` (1)

### `defineLazy`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/util.js:67` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `slice`
`[native code]` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `async read` (1)

### `Beta`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/beta/beta.mjs:15` | Self: 0.0% (1.6ms) | Total: 0.0% (3.0ms) | Samples: 1

**Called by:**
- `OpenAI` (2)

**Calls:**
- `ChatKit` (1)

### `trackDuplicateToolCall`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `trackToolLifecycle` (1)

### `emitLiveEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:695` | Self: 0.0% (1.6ms) | Total: 0.0% (3.3ms) | Samples: 1

**Called by:**
- `safeEmitLive` (2)

**Calls:**
- `mapLoopEvent` (1)

### `getToolPriority`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `applyObservationMasking` (1)

### `findAll`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `compileRoot` (1)

### `applyPruning`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:265` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `async beforeStep` (1)

### `validate0`
`[native code]` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `validate` (1)

### `Uploads`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/uploads/uploads.mjs:11` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `OpenAI` (1)

### `getOwnPropertyDescriptor`
`[native code]` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `resolveModelCapabilities`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:268` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `resolveRuntimeProvider` (1)

### `failResult`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `result` (1)

### `countLines`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:67` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `maskToolResult` (1)

### `Obj`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/object.js:51` | Self: 0.0% (1.5ms) | Total: 0.0% (2.9ms) | Samples: 1

**Called by:**
- `Compiler` (1)
- `Node` (1)

**Calls:**
- `init` (1)

### `code`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js:14` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `keywordCode` (1)

### `require`
`[native code]` | Self: 0.0% (1.5ms) | Total: 2.9% (227.7ms) | Samples: 1

**Called by:**
- `bound require` (135)

**Calls:**
- `anonymous` (134)

### `initializeContext`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `toJSONSchema` (1)

### `coerceObjectProperties`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:110` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `async prepareToolCall` (1)

### `digest`
`node:crypto:196` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `buildLlmConfigSignature` (1)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `async runTurn` (1)

### `Realtime`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/beta/realtime/realtime.mjs:12` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `Beta` (1)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:581` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:61` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `init` (1)

### `maskToolResult`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:102` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `applyObservationMasking` (1)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:321` | Self: 0.0% (1.5ms) | Total: 0.0% (5.9ms) | Samples: 1

**Called by:**
- `async onTextPart` (3)
- `(anonymous)` (1)

**Calls:**
- `dispatchEvent` (3)

### `get names`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:142` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `regExpMatchFast`
`[native code]` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `parse` (1)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:195` | Self: 0.0% (1.4ms) | Total: 0.0% (3.2ms) | Samples: 1

**Called by:**
- `restoreObservationMasking` (2)

**Calls:**
- `has` (1)

### `estimateTokensForMessages`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` | Self: 0.0% (1.4ms) | Total: 0.0% (1.4ms) | Samples: 1

**Called by:**
- `applyPruning` (1)

### `parseFilter`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:841` | Self: 0.0% (1.4ms) | Total: 0.0% (1.4ms) | Samples: 1

**Called by:**
- `parseUnary` (1)

### `flatIntoArray`
`[native code]` | Self: 0.0% (1.4ms) | Total: 0.0% (1.4ms) | Samples: 1

**Called by:**
- `flatIntoArrayWithCallback` (1)

### `ZodTuple`
`[native code]` | Self: 0.0% (1.4ms) | Total: 0.0% (1.4ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:323` | Self: 0.0% (1.4ms) | Total: 0.0% (1.4ms) | Samples: 1

**Called by:**
- `async onTextPart` (1)

### `extendSubschemaMode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/subschema.js:71` | Self: 0.0% (1.4ms) | Total: 0.0% (1.4ms) | Samples: 1

**Called by:**
- `subschema` (1)

### `OpenAI`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:69` | Self: 0.0% (1.4ms) | Total: 0.0% (1.4ms) | Samples: 1

**Called by:**
- `OpenAICompletionsChatProvider` (1)

### `Sessions`
`[native code]` | Self: 0.0% (1.4ms) | Total: 0.0% (1.4ms) | Samples: 1

**Called by:**
- `ChatKit` (1)

### `logRecord`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts:40` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `async appendLoopEvent` (1)

### `add`
`[native code]` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `collectRequiredPropertyNames` (1)

### `join`
`[native code]` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `async drainBatch` (1)

### `_boolean`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js:369` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `(module)` (1)

### `init`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `Obj` (1)

### `readEnv`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/internal/utils/env.mjs:10` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `OpenAI` (1)

### `parse`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/fast-uri@3.1.0/node_modules/fast-uri/index.js:263` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `getFullPath` (1)

### `buildLlmRequestMetadata`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:735` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `logLlmRequest` (1)

### `KeywordCxt`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `keywordCode` (1)

### `estimateTokensForMessage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:47` | Self: 0.0% (1.3ms) | Total: 10.0% (771.7ms) | Samples: 1

**Called by:**
- `estimateTokensForMessages` (508)

**Calls:**
- `estimateTokensForContentPart` (210)
- `estimateTokensForContentPart` (136)
- `estimateTokensForContentPart` (134)
- `estimateTokens` (27)

### `readBlockSequence`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2074` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `composeNode` (1)

### `scheduleFlush`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:123` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `append` (1)

### `parseInt`
`[native code]` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `exec`
`[native code]` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `resolveYamlTimestamp` (1)

### `copyDataProperties`
`[native code]` | Self: 0.0% (1.2ms) | Total: 0.0% (1.2ms) | Samples: 1

**Called by:**
- `OpenAI` (1)

### `async runPrepareToolExecutionHook`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:365` | Self: 0.0% (1.2ms) | Total: 0.0% (1.2ms) | Samples: 1

**Called by:**
- `async runPrepareToolExecutionHook` (1)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:373` | Self: 0.0% (1.2ms) | Total: 0.0% (1.2ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `defineProperty`
`[native code]` | Self: 0.0% (1.2ms) | Total: 0.0% (1.2ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `createRuntimeProviderAuthResolver`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:147` | Self: 0.0% (1.2ms) | Total: 0.0% (1.2ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `containsSchemaKeyword`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:47` | Self: 0.0% (1.2ms) | Total: 0.0% (1.2ms) | Samples: 1

**Called by:**
- `ajvFor` (1)

### `Embeddings`
`[native code]` | Self: 0.0% (1.2ms) | Total: 0.0% (1.2ms) | Samples: 1

**Called by:**
- `OpenAI` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs` | Self: 0.0% (1.2ms) | Total: 0.0% (1.2ms) | Samples: 1

**Called by:**
- `forEach` (1)

### `SetGoalBudgetTool`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/goal/set-goal-budget.ts` | Self: 0.0% (1.2ms) | Total: 0.0% (1.2ms) | Samples: 1

**Called by:**
- `initializeBuiltinTools` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/capability-registry.ts:226` | Self: 0.0% (1.2ms) | Total: 0.0% (1.2ms) | Samples: 1

**Called by:**
- `some` (1)

### `makeTable`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/zlib/crc32.js:33` | Self: 0.0% (1.2ms) | Total: 0.0% (1.2ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@jimp+plugin-color@1.6.1/node_modules/@jimp/plugin-color/dist/esm/index.js:72` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (1)

### `parse`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/fast-uri@3.1.0/node_modules/fast-uri/index.js:243` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `resolveSchema` (1)

**Calls:**
- `regExpMatchFast` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-logging-utils@1.1.3/node_modules/google-logging-utils/build/src/index.js:30` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `compile`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:997` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `compile` (1)

**Calls:**
- `compileRoot` (1)

### `routeToHandler`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts:69` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `restore` (1)

**Calls:**
- `getHandlerKey` (1)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:208` | Self: 0.0% (0us) | Total: 0.1% (11.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (8)

**Calls:**
- `async runToolCallBatch` (8)

### `async runRunnableToolCall`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:435` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `async start` (1)

**Calls:**
- `async runRunnableToolCall` (1)

### `restoreRecord`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:405` | Self: 0.0% (0us) | Total: 42.8% (3.28s) | Samples: 0

**Called by:**
- `routeToHandler` (2165)

**Calls:**
- `restoreObservationMasking` (2164)
- `restoreObservationMasking` (1)

### `Agent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:227` | Self: 0.0% (0us) | Total: 0.1% (9.6ms) | Samples: 0

**Called by:**
- `createPerfAgent` (1)

**Calls:**
- `CronManager` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/implementation.js:3` | Self: 0.0% (0us) | Total: 0.0% (3.1ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `async runModeB`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:591` | Self: 0.0% (0us) | Total: 0.1% (13.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (4)

**Calls:**
- `createPerfAgent` (3)
- `createPerfAgent` (1)

### `async runPrepareToolExecutionHook`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:362` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `async prepareToolCall` (1)

**Calls:**
- `async runPrepareToolExecutionHook` (1)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:131` | Self: 0.0% (0us) | Total: 10.6% (816.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (538)

**Calls:**
- `async chatWithRetry` (538)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/p-retry@4.6.2/node_modules/p-retry/index.js:2` | Self: 0.0% (0us) | Total: 0.0% (2.8ms) | Samples: 0

**Calls:**
- `bound require` (1)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:401` | Self: 0.0% (0us) | Total: 0.0% (2.8ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `map` (2)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:579` | Self: 0.0% (0us) | Total: 21.5% (1.64s) | Samples: 0

**Called by:**
- `async beforeStep` (1084)

**Calls:**
- `async beforeStep` (1084)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:69` | Self: 0.0% (0us) | Total: 21.5% (1.64s) | Samples: 0

**Called by:**
- `async executeLoopStep` (1084)

**Calls:**
- `async beforeStep` (1084)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/es-abstract@1.24.2/node_modules/es-abstract/2024/Number/toString.js:5` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `offloadToolOutput`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:350` | Self: 0.0% (0us) | Total: 0.2% (18.5ms) | Samples: 0

**Called by:**
- `async foldLoopEvent` (13)

**Calls:**
- `async offloadOutput` (13)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/jwsSign.js:18` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/read.ts:172` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `ReadTool` (1)

**Calls:**
- `toInputJsonSchema` (1)

### `getOpenAILegacyModelCapability`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/capability-registry.ts:255` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `resolveModelCapabilities` (1)

**Calls:**
- `capabilityFromCatalog` (1)

### `code`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js:19` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `keywordCode` (1)

**Calls:**
- `resolveRef` (1)

### `processTicksAndRejections`
`[native code]` | Self: 0.0% (0us) | Total: 99.3% (7.60s) | Samples: 0

**Calls:**
- `(anonymous)` (5011)

### `async runToolCallBatch`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:122` | Self: 0.0% (0us) | Total: 0.1% (11.7ms) | Samples: 0

**Called by:**
- `async executeLoopStep` (8)

**Calls:**
- `async runToolCallBatch` (8)

### `async runToolCallBatch`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:136` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `add` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/call-bind@1.0.9/node_modules/call-bind/index.js:3` | Self: 0.0% (0us) | Total: 0.0% (3.5ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:6` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `Ajv` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/define-properties@1.2.1/node_modules/define-properties/index.js:8` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `async chat`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:82` | Self: 0.0% (0us) | Total: 10.6% (816.5ms) | Samples: 0

**Called by:**
- `async chatWithRetry` (538)

**Calls:**
- `async chatOnce` (538)

### `logRecord`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts:56` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `async appendLoopEvent` (1)

**Calls:**
- `append` (1)

### `composeNode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2537` | Self: 0.0% (0us) | Total: 0.0% (2.6ms) | Samples: 0

**Called by:**
- `readDocument` (2)

**Calls:**
- `readBlockMapping` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:24` | Self: 0.0% (0us) | Total: 0.0% (2.9ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `Compiler`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:30` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `compile` (1)

**Calls:**
- `Obj` (1)

### `code`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:439` | Self: 0.0% (0us) | Total: 0.5% (38.9ms) | Samples: 0

**Called by:**
- `block` (16)
- `code` (5)
- `func` (5)

**Calls:**
- `(anonymous)` (6)
- `(anonymous)` (6)
- `code` (5)
- `(anonymous)` (5)
- `keywordCode` (3)
- `forEach` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:357` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `optional` (1)

### `record`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/usage/index.ts:43` | Self: 0.0% (0us) | Total: 0.0% (2.9ms) | Samples: 0

**Called by:**
- `async (anonymous)` (2)

**Calls:**
- `emitStatusUpdated` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/xml2js.js:10` | Self: 0.0% (0us) | Total: 0.0% (4.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (3)

**Calls:**
- `bound require` (3)

### `trackLoopTelemetry`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:713` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `emitLiveEvent` (1)

**Calls:**
- `trackToolLifecycle` (1)

### `logLlmRequest`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:399` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `buildLlmConfigSignature` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:128` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `init` (1)

**Calls:**
- `init` (1)

### `validateFunctionCode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:21` | Self: 0.0% (0us) | Total: 0.0% (7.4ms) | Samples: 0

**Called by:**
- `compileSchema` (5)

**Calls:**
- `topSchemaObjCode` (5)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png.js:6` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `parseConcat`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:697` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `parseCompare` (1)

**Calls:**
- `parseAdd` (1)

### `resolveRuntimeProvider`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:120` | Self: 0.0% (0us) | Total: 0.2% (17.2ms) | Samples: 0

**Called by:**
- `tryResolvedProviderConfig` (12)

**Calls:**
- `resolveModelCapabilities` (9)
- `resolveModelCapabilities` (2)
- `resolveModelCapabilities` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/2020.js:47` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `defineProperty` (1)

### `ReadStream`
`internal:fs/streams:58` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `createReadStream` (1)

**Calls:**
- `getValidatedPath` (1)

### `async start`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:335` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `start` (1)

**Calls:**
- `async runRunnableToolCall` (1)

### `internal:streams/transform`
`internal:streams/transform:2` | Self: 0.0% (0us) | Total: 0.0% (3.1ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/builder.js:7` | Self: 0.0% (0us) | Total: 0.0% (4.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (3)

**Calls:**
- `bound require` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLWriterBase.js:12` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:30` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/get-intrinsic@1.3.0/node_modules/get-intrinsic/index.js:244` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:19` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/index.js:60` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Calls:**
- `bound require` (1)

### `_addSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:461` | Self: 0.0% (0us) | Total: 0.1% (10.5ms) | Samples: 0

**Called by:**
- `compile` (7)

**Calls:**
- `validateSchema` (6)
- `validateSchema` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/xml2js.js:39` | Self: 0.0% (0us) | Total: 0.0% (5.9ms) | Samples: 0

**Called by:**
- `anonymous` (4)

**Calls:**
- `(anonymous)` (3)
- `(anonymous)` (1)

### `async prepareToolCall`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:282` | Self: 0.0% (0us) | Total: 0.0% (2.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `coerceObjectProperties` (1)
- `coerceObjectProperties` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/deflate.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `keywordCode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:464` | Self: 0.0% (0us) | Total: 0.1% (12.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (5)
- `code` (3)

**Calls:**
- `code` (4)
- `code` (1)
- `validateUnion` (1)
- `callValidate` (1)
- `code` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/yauzl@3.3.0/node_modules/yauzl/index.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `_compileMetaSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:483` | Self: 0.0% (0us) | Total: 0.1% (8.9ms) | Samples: 0

**Called by:**
- `_compileSchemaEnv` (6)

**Calls:**
- `compileSchema` (5)
- `compileSchema` (1)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:194` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `restoreObservationMasking` (1)

**Calls:**
- `getToolPriority` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLWriterBase.js:428` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `(anonymous)` (1)

### `async finalizePendingToolResult`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:480` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `async finalizePendingToolResult` (1)

**Calls:**
- `async finalizeToolResult` (1)

### `subschema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:438` | Self: 0.0% (0us) | Total: 0.0% (6.2ms) | Samples: 0

**Called by:**
- `applyPropertySchema` (3)
- `(anonymous)` (1)

**Calls:**
- `subschemaCode` (4)

### `code`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/applicator/properties.js:33` | Self: 0.0% (0us) | Total: 0.0% (6.0ms) | Samples: 0

**Called by:**
- `keywordCode` (4)

**Calls:**
- `applyPropertySchema` (4)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/packer-async.js:6` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `callValidate`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js:33` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `keywordCode` (1)

**Calls:**
- `callRef` (1)

### `parseInlineIf`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:581` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `parseExpression` (1)

**Calls:**
- `parseOr` (1)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:200` | Self: 0.0% (0us) | Total: 0.3% (28.9ms) | Samples: 0

**Called by:**
- `applyObservationMasking` (10)
- `restoreObservationMasking` (8)

**Calls:**
- `maskToolResult` (11)
- `maskToolResult` (6)
- `maskToolResult` (1)

### `async chatOnce`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:95` | Self: 0.0% (0us) | Total: 10.6% (813.5ms) | Samples: 0

**Called by:**
- `async chatOnce` (536)

**Calls:**
- `applyCompletionBudget` (536)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:883` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `init` (1)

**Calls:**
- `init` (1)

### `OpenAI`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:101` | Self: 0.0% (0us) | Total: 0.0% (4.5ms) | Samples: 0

**Called by:**
- `OpenAICompletionsChatProvider` (3)

**Calls:**
- `Beta` (2)
- `Beta` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/zlib/deflate.js:25` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:5` | Self: 0.0% (0us) | Total: 0.0% (2.8ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `bound require` (2)

### `node:fs/promises`
`node:fs/promises:2` | Self: 0.0% (0us) | Total: 0.0% (2.8ms) | Samples: 0

**Calls:**
- `anonymous` (1)

### `shouldOffload`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/output-offloading.ts:29` | Self: 0.0% (0us) | Total: 0.2% (18.5ms) | Samples: 0

**Called by:**
- `async offloadOutput` (13)

**Calls:**
- `estimateTokens` (13)

### `restore`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts:62` | Self: 0.0% (0us) | Total: 42.8% (3.28s) | Samples: 0

**Called by:**
- `async replay` (2168)

**Calls:**
- `routeToHandler` (2167)
- `routeToHandler` (1)

### `initializeBuiltinTools`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/tool/index.ts:361` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `update` (1)

**Calls:**
- `ReadTool` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:27` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocType.js:17` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `keywordCode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:462` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `KeywordCxt` (1)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:253` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `async chatOnce` (1)

**Calls:**
- `createRuntimeProviderAuthResolver` (1)

### `maskToolResult`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:105` | Self: 0.0% (0us) | Total: 0.2% (17.3ms) | Samples: 0

**Called by:**
- `applyObservationMasking` (11)

**Calls:**
- `isAlreadyMasked` (11)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/shared/auth.js:77` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (1)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:207` | Self: 0.0% (0us) | Total: 30.8% (2.36s) | Samples: 0

**Called by:**
- `restoreObservationMasking` (1077)
- `applyObservationMasking` (486)

**Calls:**
- `estimateTokensForMessages` (1563)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:4` | Self: 0.0% (0us) | Total: 0.0% (3.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `bound require` (2)

### `async finalizeToolResult`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:638` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `async finalizePendingToolResult` (1)

**Calls:**
- `async (anonymous)` (1)

### `logLlmRequest`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:403` | Self: 0.0% (0us) | Total: 10.4% (797.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (526)

**Calls:**
- `buildLlmRequestMetadata` (525)
- `buildLlmRequestMetadata` (1)

### `parseIn`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:620` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `parseAnd` (1)

**Calls:**
- `parseIs` (1)

### `get names`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:238` | Self: 0.0% (0us) | Total: 0.0% (3.0ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `reduce` (2)

### `async runTurn`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:539` | Self: 0.0% (0us) | Total: 5.1% (391.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (258)

**Calls:**
- `async runTurn` (258)

### `get tokenCountWithPending`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:247` | Self: 0.0% (0us) | Total: 0.2% (17.6ms) | Samples: 0

**Called by:**
- `get shouldBlock` (7)
- `get shouldCompact` (5)

**Calls:**
- `get tokenCountWithPending` (12)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/index.js:11` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:1317` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `_boolean` (1)

### `async runTurn`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/run-turn.ts:46` | Self: 0.0% (0us) | Total: 5.1% (391.7ms) | Samples: 0

**Called by:**
- `async runTurn` (258)

**Calls:**
- `async runTurn` (258)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/parser.js:9` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/getToken.js:17` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `ZodOptional`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` | Self: 0.0% (0us) | Total: 0.0% (3.3ms) | Samples: 0

**Called by:**
- `optional` (2)

**Calls:**
- `init` (2)

### `parseCompare`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:673` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `parseIs` (1)

**Calls:**
- `parseConcat` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/draft7.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `async onTextPart`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:320` | Self: 0.0% (0us) | Total: 0.0% (5.9ms) | Samples: 0

**Called by:**
- `async chatOnce` (4)

**Calls:**
- `async (anonymous)` (3)
- `async (anonymous)` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLStringWriter.js:7` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `parseMul`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:721` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `parseSub` (1)

**Calls:**
- `parseDiv` (1)

### `capabilityFromCatalog`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/capability-registry.ts:247` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `getOpenAILegacyModelCapability` (1)

**Calls:**
- `some` (1)

### `finalize`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:296` | Self: 0.0% (0us) | Total: 0.0% (6.0ms) | Samples: 0

**Called by:**
- `toInputJsonSchema` (1)

**Calls:**
- `flattenRef` (1)

### `coerceObjectProperties`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:99` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `async prepareToolCall` (1)

**Calls:**
- `collectRequiredPropertyNames` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/safe-regex-test@1.1.0/node_modules/safe-regex-test/index.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `countLines`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:69` | Self: 0.0% (0us) | Total: 0.1% (8.5ms) | Samples: 0

**Called by:**
- `maskToolResult` (5)

**Calls:**
- `next` (5)

### `OpenAI`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:68` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `OpenAICompletionsChatProvider` (1)

**Calls:**
- `copyDataProperties` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:9` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `async foldLoopEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/wire-fold.ts:159` | Self: 0.0% (0us) | Total: 0.2% (18.5ms) | Samples: 0

**Called by:**
- `async appendLoopEvent` (13)

**Calls:**
- `async foldLoopEvent` (13)

### `groupKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:200` | Self: 0.0% (0us) | Total: 0.0% (6.0ms) | Samples: 0

**Called by:**
- `(anonymous)` (4)

**Calls:**
- `iterateKeywords` (4)

### `tokenCountWithPending`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:247` | Self: 0.0% (0us) | Total: 0.1% (10.6ms) | Samples: 0

**Called by:**
- `shouldCompact` (4)
- `shouldBlock` (2)
- `get shouldBlock` (1)

**Calls:**
- `get tokenCountWithPending` (7)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:184` | Self: 0.0% (0us) | Total: 0.0% (2.5ms) | Samples: 0

**Called by:**
- `applyObservationMasking` (1)
- `restoreObservationMasking` (1)

**Calls:**
- `push` (2)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@jimp+plugin-hash@1.6.1/node_modules/@jimp/plugin-hash/dist/esm/index.js:11` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (1)

### `Ajv`
`[native code]` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `Ajv` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/index.js:31` | Self: 0.0% (0us) | Total: 0.1% (12.4ms) | Samples: 0

**Calls:**
- `bound require` (8)

### `async beforeStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:273` | Self: 0.0% (0us) | Total: 21.5% (1.64s) | Samples: 0

**Called by:**
- `async (anonymous)` (1084)

**Calls:**
- `async beforeStep` (1035)
- `async beforeStep` (25)
- `async beforeStep` (13)
- `async beforeStep` (11)

### `async replay`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts:140` | Self: 0.0% (0us) | Total: 42.8% (3.28s) | Samples: 0

**Called by:**
- `(anonymous)` (2168)

**Calls:**
- `restore` (2168)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/aos/EncodeForRegExpEscape.js:3` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:192` | Self: 0.0% (0us) | Total: 0.1% (8.9ms) | Samples: 0

**Called by:**
- `code` (6)

**Calls:**
- `groupKeywords` (4)
- `groupKeywords` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/tokenHandler.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/parser.js:385` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `(anonymous)` (1)

### `compile`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:518` | Self: 0.0% (0us) | Total: 0.0% (6.0ms) | Samples: 0

**Called by:**
- `render` (4)

**Calls:**
- `_compile` (4)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `CronManager`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/cron/manager.ts:190` | Self: 0.0% (0us) | Total: 0.1% (9.6ms) | Samples: 0

**Called by:**
- `Agent` (1)

**Calls:**
- `start` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/baseexternalclient.js:20` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `parseAnd`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:605` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `parseOr` (1)

**Calls:**
- `parseIn` (1)

### `async chatWithRetry`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/retry.ts:37` | Self: 0.0% (0us) | Total: 10.6% (816.5ms) | Samples: 0

**Called by:**
- `async executeLoopStep` (538)

**Calls:**
- `async chatWithRetry` (538)

### `getSchemaRefs`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/resolve.js:100` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `_addSchema` (1)

**Calls:**
- `getFullPath` (1)

### `compile`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:159` | Self: 0.0% (0us) | Total: 0.1% (10.5ms) | Samples: 0

**Called by:**
- `validateExecutableToolArgs` (7)

**Calls:**
- `_addSchema` (7)

### `checkAutoCompaction`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:313` | Self: 0.0% (0us) | Total: 0.2% (20.3ms) | Samples: 0

**Called by:**
- `async beforeStep` (13)

**Calls:**
- `get shouldCompact` (8)
- `shouldCompact` (5)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gaxios@7.1.4/node_modules/gaxios/build/cjs/src/index.js:31` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:215` | Self: 0.0% (0us) | Total: 0.0% (2.5ms) | Samples: 0

**Called by:**
- `async beforeStep` (2)

**Calls:**
- `modelCapabilities` (1)
- `get modelCapabilities` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:16` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `async runToolCallBatch`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:152` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `async finalizePendingToolResult` (1)

### `flattenRef`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:230` | Self: 0.0% (0us) | Total: 0.0% (6.0ms) | Samples: 0

**Called by:**
- `finalize` (1)

**Calls:**
- `flattenRef` (1)

### `async generate`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:366` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `async withProviderRequestAuth` (1)

**Calls:**
- `async (anonymous)` (1)

### `render`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:440` | Self: 0.0% (0us) | Total: 0.0% (6.0ms) | Samples: 0

**Called by:**
- `BashTool` (2)
- `(module)` (2)

**Calls:**
- `compile` (4)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/picomatch@4.0.4/node_modules/picomatch/index.js:3` | Self: 0.0% (0us) | Total: 0.1% (10.6ms) | Samples: 0

**Calls:**
- `bound require` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/read.ts:163` | Self: 0.0% (0us) | Total: 0.0% (2.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `render` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:6` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `addMetaSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:243` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `_addDefaultMetaSchema` (1)

**Calls:**
- `addSchema` (1)

### `getHandlerKey`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts:86` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `routeToHandler` (1)

**Calls:**
- `stringSplitFast` (1)

### `iterateKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:219` | Self: 0.0% (0us) | Total: 0.1% (8.9ms) | Samples: 0

**Called by:**
- `groupKeywords` (4)
- `groupKeywords` (2)

**Calls:**
- `block` (6)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png.js:5` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `createPerfAgent`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:288` | Self: 0.0% (0us) | Total: 0.1% (9.6ms) | Samples: 0

**Called by:**
- `async runModeB` (1)

**Calls:**
- `Agent` (1)

### `parseExpression`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:577` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `parseNodes` (1)

**Calls:**
- `parseInlineIf` (1)

### `applyPruning`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:276` | Self: 0.0% (0us) | Total: 0.1% (14.0ms) | Samples: 0

**Called by:**
- `async beforeStep` (9)

**Calls:**
- `estimateTokensForMessages` (8)
- `estimateTokensForMessages` (1)

### `cloneMessage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:188` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `mergeAdjacentUserMessages` (1)

**Calls:**
- `map` (1)

### `resolveModelCapabilities`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:256` | Self: 0.0% (0us) | Total: 0.0% (2.4ms) | Samples: 0

**Called by:**
- `resolveRuntimeProvider` (2)

**Calls:**
- `getOpenAILegacyModelCapability` (1)
- `getOpenAILegacyModelCapability` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gcp-metadata@8.1.2/node_modules/gcp-metadata/build/src/index.js:67` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `async recordEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:159` | Self: 0.0% (0us) | Total: 0.3% (23.0ms) | Samples: 0

**Called by:**
- `dispatchEvent` (8)
- `async runToolCallBatch` (8)

**Calls:**
- `async recordEvent` (16)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:4` | Self: 0.0% (0us) | Total: 0.0% (5.8ms) | Samples: 0

**Called by:**
- `(anonymous)` (4)

**Calls:**
- `bound require` (4)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLStringWriter.js:35` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `(anonymous)` (1)

### `compile`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:1023` | Self: 0.0% (0us) | Total: 0.0% (4.6ms) | Samples: 0

**Called by:**
- `_compile` (3)

**Calls:**
- `parseAsRoot` (2)
- `compile` (1)

### `async runModeB`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:609` | Self: 0.0% (0us) | Total: 0.0% (6.0ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `createPerfAgent` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:70` | Self: 0.0% (0us) | Total: 0.0% (7.4ms) | Samples: 0

**Called by:**
- `code` (5)

**Calls:**
- `typeAndKeywords` (5)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocType.js:186` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `(anonymous)` (1)

### `async runRunnableToolCall`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:450` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `async runRunnableToolCall` (1)

**Calls:**
- `async executeTool` (1)

### `node:http`
`node:http:2` | Self: 0.0% (0us) | Total: 0.1% (14.7ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `anonymous` (2)

### `Ajv`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:114` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `Ajv` (1)

**Calls:**
- `_addDefaultMetaSchema` (1)

### `optional`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:889` | Self: 0.0% (0us) | Total: 0.0% (3.3ms) | Samples: 0

**Called by:**
- `(module)` (1)
- `(anonymous)` (1)

**Calls:**
- `ZodOptional` (2)

### `parseFloorDiv`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:737` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `parseDiv` (1)

**Calls:**
- `parseMod` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/externalclient.js:17` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/jpeg-js@0.4.4/node_modules/jpeg-js/index.js:2` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:187` | Self: 0.0% (0us) | Total: 0.3% (27.8ms) | Samples: 0

**Called by:**
- `map` (18)

**Calls:**
- `cloneObject` (18)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:19` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:13` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:82` | Self: 0.0% (0us) | Total: 0.3% (28.8ms) | Samples: 0

**Called by:**
- `(anonymous)` (19)

**Calls:**
- `buildMessages` (18)
- `buildMessages` (1)

### `subschema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:436` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `applyPropertySchema` (1)

**Calls:**
- `extendSubschemaMode` (1)

### `async drainPendingRecords`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:156` | Self: 0.0% (0us) | Total: 0.0% (6.0ms) | Samples: 0

**Called by:**
- `(anonymous)` (4)

**Calls:**
- `async drainBatch` (4)

### `optimize`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:597` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `compileSchema` (1)

**Calls:**
- `reduce` (1)

### `async drainBatch`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:160` | Self: 0.0% (0us) | Total: 0.0% (6.0ms) | Samples: 0

**Called by:**
- `async drainPendingRecords` (4)

**Calls:**
- `async drainBatch` (4)

### `computeCompletionBudgetCap`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/completion-budget.ts:72` | Self: 0.0% (0us) | Total: 10.5% (811.8ms) | Samples: 0

**Called by:**
- `applyCompletionBudget` (535)

**Calls:**
- `estimateTokensForMessages` (535)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/googleToken.js:18` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `ajvFor`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:37` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `compileToolArgsValidator` (1)

**Calls:**
- `containsSchemaKeyword` (1)

### `restoreRecord`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:155` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `routeToHandler` (1)

**Calls:**
- `update` (1)

### `get shouldCompact`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:255` | Self: 0.0% (0us) | Total: 0.1% (12.5ms) | Samples: 0

**Called by:**
- `checkAutoCompaction` (8)

**Calls:**
- `get tokenCountWithPending` (5)
- `get maxContextSize` (3)

### `OpenAICompletionsChatProvider`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/openai-completions.ts:405` | Self: 0.0% (0us) | Total: 0.1% (13.2ms) | Samples: 0

**Called by:**
- `createProvider` (9)

**Calls:**
- `OpenAI` (3)
- `OpenAI` (1)
- `OpenAI` (1)
- `OpenAI` (1)
- `OpenAI` (1)
- `OpenAI` (1)
- `OpenAI` (1)

### `maxContextSize`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:251` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `shouldCompact` (1)

**Calls:**
- `modelCapabilities` (1)

### `async finalizePendingToolResult`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:471` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `async runToolCallBatch` (1)

**Calls:**
- `async finalizePendingToolResult` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/define-data-property@1.1.4/node_modules/define-data-property/index.js:8` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/boolSchema.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/set-function-length@1.2.2/node_modules/set-function-length/index.js:3` | Self: 0.0% (0us) | Total: 0.0% (3.5ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `async runTurn`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/run-turn.ts:93` | Self: 0.0% (0us) | Total: 21.5% (1.64s) | Samples: 0

**Called by:**
- `(anonymous)` (827)
- `async runTurn` (258)

**Calls:**
- `async executeLoopStep` (1084)
- `async executeLoopStep` (1)

### `async beforeStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:577` | Self: 0.0% (0us) | Total: 21.5% (1.64s) | Samples: 0

**Called by:**
- `async executeLoopStep` (1084)

**Calls:**
- `async (anonymous)` (1084)

### `async appendLoopEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:296` | Self: 0.0% (0us) | Total: 0.2% (21.3ms) | Samples: 0

**Called by:**
- `async (anonymous)` (15)

**Calls:**
- `async appendLoopEvent` (13)
- `async appendLoopEvent` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png.js:7` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `loadDocuments`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2784` | Self: 0.0% (0us) | Total: 0.0% (2.6ms) | Samples: 0

**Called by:**
- `load$1` (2)

**Calls:**
- `readDocument` (2)

### `defaultMeta`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:29` | Self: 0.0% (0us) | Total: 0.1% (8.9ms) | Samples: 0

**Called by:**
- `validateSchema` (6)

**Calls:**
- `_compileSchemaEnv` (6)

### `async appendTranscriptRecord`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:690` | Self: 0.0% (0us) | Total: 0.3% (23.0ms) | Samples: 0

**Called by:**
- `async recordEvent` (16)

**Calls:**
- `async (anonymous)` (16)

### `addSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:235` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `addMetaSchema` (1)

**Calls:**
- `_addSchema` (1)

### `forEach`
`[native code]` | Self: 0.0% (0us) | Total: 0.0% (2.8ms) | Samples: 0

**Called by:**
- `compileStyleAliases` (1)
- `code` (1)

**Calls:**
- `(anonymous)` (1)
- `(anonymous)` (1)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:397` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `async generate` (1)

**Calls:**
- `structuredClone` (1)

### `topSchemaObjCode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:62` | Self: 0.0% (0us) | Total: 0.0% (7.4ms) | Samples: 0

**Called by:**
- `validateFunctionCode` (5)

**Calls:**
- `validateFunction` (5)

### `computeCompletionBudgetCap`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/completion-budget.ts:73` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `applyCompletionBudget` (1)

**Calls:**
- `estimateTokens` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:20` | Self: 0.0% (0us) | Total: 0.0% (4.6ms) | Samples: 0

**Called by:**
- `anonymous` (3)

**Calls:**
- `bound require` (3)

### `tick`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/cron/scheduler.ts:279` | Self: 0.0% (0us) | Total: 0.0% (2.0ms) | Samples: 0

**Calls:**
- `isKilled` (1)

### `initializeBuiltinTools`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/tool/index.ts:364` | Self: 0.0% (0us) | Total: 0.0% (6.0ms) | Samples: 0

**Called by:**
- `update` (1)

**Calls:**
- `GrepTool` (1)

### `parseOr`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:597` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `parseInlineIf` (1)

**Calls:**
- `parseAnd` (1)

### `async execute`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/tool/index.ts:97` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `async executeTool` (1)

**Calls:**
- `async toolCall` (1)

### `async appendLoopEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:301` | Self: 0.0% (0us) | Total: 0.2% (18.5ms) | Samples: 0

**Called by:**
- `async appendLoopEvent` (13)

**Calls:**
- `async foldLoopEvent` (13)

### `buildMessages`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:551` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `async executeLoopStep` (1)

**Calls:**
- `flatIntoArrayWithCallback` (1)

### `async resume`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:439` | Self: 0.0% (0us) | Total: 0.0% (7.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `async loadFromDisk` (1)

### `flatIntoArrayWithCallback`
`[native code]` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `buildMessages` (1)

**Calls:**
- `flatIntoArray` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/jws@4.0.1/node_modules/jws/index.js:2` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `ws`
`ws:3` | Self: 0.0% (0us) | Total: 0.1% (14.7ms) | Samples: 0

**Calls:**
- `anonymous` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:165` | Self: 0.0% (0us) | Total: 0.0% (4.6ms) | Samples: 0

**Called by:**
- `map` (3)

**Calls:**
- `stringify` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/index.js:65` | Self: 0.0% (0us) | Total: 0.0% (4.7ms) | Samples: 0

**Called by:**
- `anonymous` (3)

**Calls:**
- `(anonymous)` (2)
- `(anonymous)` (1)

### `shouldCompact`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:255` | Self: 0.0% (0us) | Total: 0.1% (7.8ms) | Samples: 0

**Called by:**
- `checkAutoCompaction` (5)

**Calls:**
- `tokenCountWithPending` (4)
- `maxContextSize` (1)

### `async loadFromDisk`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/background/manager.ts:935` | Self: 0.0% (0us) | Total: 0.0% (7.2ms) | Samples: 0

**Called by:**
- `async resume` (1)

**Calls:**
- `async loadFromDisk` (1)

### `createReadStream`
`node:fs:354` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `async read` (1)

**Calls:**
- `ReadStream` (1)

### `get modelCapabilities`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:133` | Self: 0.0% (0us) | Total: 0.1% (11.8ms) | Samples: 0

**Called by:**
- `get maxContextSize` (3)
- `emitStatusUpdated` (2)
- `applyPruning` (1)
- `restoreObservationMasking` (1)
- `applyObservationMasking` (1)

**Calls:**
- `tryResolvedProviderConfig` (8)

### `internal:streams/duplex`
`internal:streams/duplex:2` | Self: 0.0% (0us) | Total: 0.0% (3.1ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `estimateTokensForContentPart`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:60` | Self: 0.0% (0us) | Total: 4.1% (319.4ms) | Samples: 0

**Called by:**
- `estimateTokensForMessage` (210)

**Calls:**
- `estimateTokens` (210)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/computeclient.js:19` | Self: 0.0% (0us) | Total: 0.0% (2.9ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/builder.js:127` | Self: 0.0% (0us) | Total: 0.0% (4.7ms) | Samples: 0

**Called by:**
- `anonymous` (3)

**Calls:**
- `(anonymous)` (3)

### `preflightToolCall`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:202` | Self: 0.0% (0us) | Total: 0.1% (11.7ms) | Samples: 0

**Called by:**
- `map` (8)

**Calls:**
- `validateExecutableToolArgs` (8)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:188` | Self: 0.0% (0us) | Total: 0.0% (3.2ms) | Samples: 0

**Called by:**
- `applyObservationMasking` (1)
- `restoreObservationMasking` (1)

**Calls:**
- `get` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/xml2js.js:12` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `compile`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:1012` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `_compile` (1)

**Calls:**
- `Compiler` (1)

### `compileToolArgsValidator`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:193` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `validateExecutableToolArgs` (1)

**Calls:**
- `ajvFor` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:10` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `groupKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:208` | Self: 0.0% (0us) | Total: 0.0% (2.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `iterateKeywords` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/inflate.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:242` | Self: 0.0% (0us) | Total: 0.0% (3.0ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `(anonymous)` (1)
- `(anonymous)` (1)

### `restoreObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:464` | Self: 0.0% (0us) | Total: 42.8% (3.27s) | Samples: 0

**Called by:**
- `restoreRecord` (2164)

**Calls:**
- `applyObservationMasking` (1077)
- `applyObservationMasking` (1072)
- `applyObservationMasking` (8)
- `applyObservationMasking` (2)
- `applyObservationMasking` (2)
- `applyObservationMasking` (1)
- `applyObservationMasking` (1)
- `applyObservationMasking` (1)

### `(anonymous)`
`node:fs:194` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/background/task-output.ts:40` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `_string` (1)

### `async runToolCallBatch`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:154` | Self: 0.0% (0us) | Total: 0.2% (18.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (13)

**Calls:**
- `async recordEvent` (8)
- `dispatchEvent` (5)

### `bound require`
`[native code]` | Self: 0.0% (0us) | Total: 2.9% (228.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (8)
- `(anonymous)` (5)
- `(anonymous)` (4)
- `(anonymous)` (4)
- `(anonymous)` (3)
- `(anonymous)` (3)
- `(anonymous)` (3)
- `(anonymous)` (3)
- `(anonymous)` (3)
- `(anonymous)` (3)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)

**Calls:**
- `require` (135)
- `anonymous` (1)

### `parseNodes`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:988` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `parseAsRoot` (1)

**Calls:**
- `parseExpression` (1)

### `getOpenAILegacyModelCapability`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/capability-registry.ts:258` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `resolveModelCapabilities` (1)

**Calls:**
- `cloneObject` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/retry@0.13.1/node_modules/retry/index.js:1` | Self: 0.0% (0us) | Total: 0.0% (2.8ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `applyPruning`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:263` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `async beforeStep` (1)

**Calls:**
- `map` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:5` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `async toolCall`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:251` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `async execute` (1)

**Calls:**
- `fill` (1)

### `applyCompletionBudget`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/completion-budget.ts:105` | Self: 0.0% (0us) | Total: 10.6% (813.5ms) | Samples: 0

**Called by:**
- `async chatOnce` (536)

**Calls:**
- `computeCompletionBudgetCap` (535)
- `computeCompletionBudgetCap` (1)

### `buildLlmConfigSignature`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:824` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `logLlmRequest` (1)

**Calls:**
- `digest` (1)

### `readBlockMapping`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2260` | Self: 0.0% (0us) | Total: 0.0% (2.6ms) | Samples: 0

**Called by:**
- `composeNode` (2)

**Calls:**
- `composeNode` (1)
- `composeNode` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/grep.ts:172` | Self: 0.0% (0us) | Total: 0.0% (6.0ms) | Samples: 0

**Called by:**
- `GrepTool` (1)

**Calls:**
- `toInputJsonSchema` (1)

### `get shouldBlock`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:259` | Self: 0.0% (0us) | Total: 0.1% (12.5ms) | Samples: 0

**Called by:**
- `async beforeStep` (9)

**Calls:**
- `get tokenCountWithPending` (7)
- `tokenCountWithPending` (1)
- `get maxContextSize` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gifwrap@0.10.1/node_modules/gifwrap/src/index.js:7` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `collectRequiredPropertyNames`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:153` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `coerceObjectProperties` (1)

**Calls:**
- `add` (1)

### `async read`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:70` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `asyncGeneratorResumeNext` (1)

**Calls:**
- `slice` (1)

### `_addDefaultMetaSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:24` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `Ajv` (1)

**Calls:**
- `addMetaSchema` (1)

### `parseAsRoot`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:1005` | Self: 0.0% (0us) | Total: 0.0% (3.0ms) | Samples: 0

**Called by:**
- `compile` (2)

**Calls:**
- `parseNodes` (1)
- `parseNodes` (1)

### `createPerfAgent`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:298` | Self: 0.0% (0us) | Total: 0.1% (10.3ms) | Samples: 0

**Called by:**
- `async runModeB` (3)
- `async runModeB` (1)

**Calls:**
- `update` (4)

### `maskToolResult`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:109` | Self: 0.0% (0us) | Total: 0.1% (10.0ms) | Samples: 0

**Called by:**
- `applyObservationMasking` (6)

**Calls:**
- `countLines` (5)
- `countLines` (1)

### `func`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:587` | Self: 0.0% (0us) | Total: 0.0% (7.4ms) | Samples: 0

**Called by:**
- `validateFunction` (5)

**Calls:**
- `code` (5)

### `NodeList`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js:88` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `subclass` (1)

**Calls:**
- `Node` (1)

### `update`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:62` | Self: 0.0% (0us) | Total: 0.1% (11.9ms) | Samples: 0

**Called by:**
- `createPerfAgent` (4)
- `restoreRecord` (1)

**Calls:**
- `initializeBuiltinTools` (2)
- `initializeBuiltinTools` (1)
- `initializeBuiltinTools` (1)
- `initializeBuiltinTools` (1)

### `block`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:568` | Self: 0.0% (0us) | Total: 0.3% (24.1ms) | Samples: 0

**Called by:**
- `schemaKeywords` (6)
- `iterateKeywords` (6)
- `schemaKeywords` (3)
- `validateUnion` (1)

**Calls:**
- `code` (16)

### `validate`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:153` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `validateSchema` (1)

**Calls:**
- `validate0` (1)

### `get ReadStream`
`node:fs:578` | Self: 0.0% (0us) | Total: 0.0% (3.1ms) | Samples: 0

**Calls:**
- `anonymous` (1)

### `createProvider`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/index.ts:24` | Self: 0.0% (0us) | Total: 0.1% (13.2ms) | Samples: 0

**Called by:**
- `resolveModelCapabilities` (9)

**Calls:**
- `OpenAICompletionsChatProvider` (9)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:222` | Self: 0.0% (0us) | Total: 0.1% (8.9ms) | Samples: 0

**Called by:**
- `code` (6)

**Calls:**
- `keywordCode` (5)
- `keywordCode` (1)

### `getFullPath`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/resolve.js:74` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `getSchemaRefs` (1)

**Calls:**
- `parse` (1)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:51` | Self: 0.0% (0us) | Total: 21.5% (1.64s) | Samples: 0

**Called by:**
- `async runTurn` (1084)

**Calls:**
- `async executeLoopStep` (1084)

### `parseDiv`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:729` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `parseMul` (1)

**Calls:**
- `parseFloorDiv` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gifwrap@0.10.1/node_modules/gifwrap/src/gifcodec.js:3` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `node:_http_server`
`node:_http_server:42` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `resolveRef`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:133` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `code` (1)

**Calls:**
- `resolveSchema` (1)

### `async read`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:63` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `createReadStream` (1)

### `applyPruning`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:244` | Self: 0.0% (0us) | Total: 0.2% (16.6ms) | Samples: 0

**Called by:**
- `async beforeStep` (11)

**Calls:**
- `get tokenCountWithPending` (11)

### `OpenAI`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:152` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `OpenAICompletionsChatProvider` (1)

**Calls:**
- `readEnv` (1)

### `parseSub`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:713` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `parseAdd` (1)

**Calls:**
- `parseMul` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/limitLength.js:5` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `ChatKit`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/beta/chatkit/chatkit.mjs:10` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `Beta` (1)

**Calls:**
- `Sessions` (1)

### `restoreObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:463` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `restoreRecord` (1)

**Calls:**
- `get modelCapabilities` (1)

### `readDocument`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2721` | Self: 0.0% (0us) | Total: 0.0% (2.6ms) | Samples: 0

**Called by:**
- `loadDocuments` (2)

**Calls:**
- `composeNode` (2)

### `result`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:316` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `callSyncRef` (1)

**Calls:**
- `failResult` (1)

### `safeEmitLive`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:170` | Self: 0.0% (0us) | Total: 0.0% (4.9ms) | Samples: 0

**Called by:**
- `async recordEvent` (3)

**Calls:**
- `emitLiveEvent` (2)
- `emitLiveEvent` (1)

### `async replay`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts:113` | Self: 0.0% (0us) | Total: 0.0% (7.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (5)

**Calls:**
- `next` (5)

### `ReadTool`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/read.ts:174` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `initializeBuiltinTools` (1)

**Calls:**
- `(anonymous)` (1)

### `get maxContextSize`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:251` | Self: 0.0% (0us) | Total: 0.0% (5.9ms) | Samples: 0

**Called by:**
- `get shouldCompact` (3)
- `get shouldBlock` (1)

**Calls:**
- `get modelCapabilities` (3)
- `modelCapabilities` (1)

### `async withProviderRequestAuth`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/request-auth.ts:20` | Self: 0.0% (0us) | Total: 10.4% (800.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (528)

**Calls:**
- `(anonymous)` (527)
- `async generate` (1)

### `async offloadOutput`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/output-offloading.ts:44` | Self: 0.0% (0us) | Total: 0.2% (18.5ms) | Samples: 0

**Called by:**
- `async offloadOutput` (13)

**Calls:**
- `shouldOffload` (13)

### `validateExecutableToolArgs`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:234` | Self: 0.0% (0us) | Total: 0.1% (11.7ms) | Samples: 0

**Called by:**
- `preflightToolCall` (8)

**Calls:**
- `compile` (7)
- `compileToolArgsValidator` (1)

### `async drainBatch`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:165` | Self: 0.0% (0us) | Total: 0.0% (6.0ms) | Samples: 0

**Called by:**
- `async drainBatch` (4)

**Calls:**
- `map` (3)
- `join` (1)

### `async beforeStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:298` | Self: 0.0% (0us) | Total: 0.2% (20.3ms) | Samples: 0

**Called by:**
- `async beforeStep` (13)

**Calls:**
- `checkAutoCompaction` (13)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:102` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `init` (1)

**Calls:**
- `init` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/get-intrinsic@1.3.0/node_modules/get-intrinsic/index.js:32` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `validateUnion`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/code.js:115` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `keywordCode` (1)

**Calls:**
- `block` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `routeToHandler`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts:76` | Self: 0.0% (0us) | Total: 42.8% (3.28s) | Samples: 0

**Called by:**
- `restore` (2167)

**Calls:**
- `restoreRecord` (2165)
- `restoreRecord` (1)
- `restoreRecord` (1)

### `finalizeRawAgentProfileSource`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:67` | Self: 0.0% (0us) | Total: 0.0% (2.6ms) | Samples: 0

**Called by:**
- `map` (2)

**Calls:**
- `parseAgentProfileYaml` (2)

### `async appendLoopEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:297` | Self: 0.0% (0us) | Total: 0.0% (2.7ms) | Samples: 0

**Called by:**
- `async appendLoopEvent` (2)

**Calls:**
- `logRecord` (1)
- `logRecord` (1)

### `asyncGeneratorResumeNext`
`[native code]` | Self: 0.0% (0us) | Total: 0.0% (7.5ms) | Samples: 0

**Called by:**
- `next` (5)

**Calls:**
- `async read` (4)
- `async read` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/authclient.js:20` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/any-base@1.1.0/node_modules/any-base/index.js:21` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `(anonymous)` (1)

### `emitStatusUpdated`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:606` | Self: 0.0% (0us) | Total: 0.0% (4.2ms) | Samples: 0

**Called by:**
- `record` (2)
- `applyObservationMasking` (1)

**Calls:**
- `get modelCapabilities` (2)
- `modelCapabilities` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/utif2@4.1.0/node_modules/utif2/UTIF.js:1648` | Self: 0.0% (0us) | Total: 0.0% (4.1ms) | Samples: 0

**Called by:**
- `(anonymous)` (3)

**Calls:**
- `(anonymous)` (3)

### `project`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:42` | Self: 0.0% (0us) | Total: 0.4% (33.5ms) | Samples: 0

**Called by:**
- `buildMessages` (18)
- `launch` (3)
- `get tokenCountWithPending` (1)

**Calls:**
- `mergeAdjacentUserMessages` (22)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/jws@4.0.1/node_modules/jws/lib/sign-stream.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-logging-utils@1.1.3/node_modules/google-logging-utils/build/src/logging-utils.js:17` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `getOwnPropertyDescriptor` (1)

### `subSchemaObjCode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:115` | Self: 0.0% (0us) | Total: 0.0% (6.2ms) | Samples: 0

**Called by:**
- `subschemaCode` (4)

**Calls:**
- `typeAndKeywords` (4)

### `typeAndKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:128` | Self: 0.0% (0us) | Total: 0.1% (13.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (5)
- `subSchemaObjCode` (4)

**Calls:**
- `schemaKeywords` (6)
- `schemaKeywords` (3)

### `parseMod`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:745` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `parseFloorDiv` (1)

**Calls:**
- `parsePow` (1)

### `ZodString`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `_string` (1)

**Calls:**
- `init` (1)

### `async chatWithRetry`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/retry.ts:54` | Self: 0.0% (0us) | Total: 10.6% (816.5ms) | Samples: 0

**Called by:**
- `async chatWithRetry` (538)

**Calls:**
- `async chat` (538)

### `some`
`[native code]` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `capabilityFromCatalog` (1)

**Calls:**
- `(anonymous)` (1)

### `parseUnary`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:771` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `parsePow` (1)

**Calls:**
- `parseFilter` (1)

### `async executeTool`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:531` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `async runRunnableToolCall` (1)

**Calls:**
- `async execute` (1)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:234` | Self: 0.0% (0us) | Total: 0.0% (2.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `async afterStep` (2)

### `parsePow`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:753` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `parseMod` (1)

**Calls:**
- `parseUnary` (1)

### `shouldBlock`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:259` | Self: 0.0% (0us) | Total: 0.0% (2.8ms) | Samples: 0

**Called by:**
- `async beforeStep` (2)

**Calls:**
- `tokenCountWithPending` (2)

### `_addSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:451` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `addSchema` (1)

**Calls:**
- `getSchemaRefs` (1)

### `Node`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js:22` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `NodeList` (1)

**Calls:**
- `Obj` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-logging-utils@1.1.3/node_modules/google-logging-utils/build/src/logging-utils.js:56` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `(anonymous)` (1)

### `get tokenCountWithPending`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:146` | Self: 0.0% (0us) | Total: 0.5% (44.9ms) | Samples: 0

**Called by:**
- `get tokenCountWithPending` (12)
- `applyPruning` (11)
- `tokenCountWithPending` (7)

**Calls:**
- `estimateTokensForMessages` (29)
- `project` (1)

### `composeNode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2536` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `readBlockMapping` (1)

**Calls:**
- `readBlockSequence` (1)

### `async afterStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:584` | Self: 0.0% (0us) | Total: 0.0% (2.9ms) | Samples: 0

**Called by:**
- `async executeLoopStep` (2)

**Calls:**
- `async (anonymous)` (2)

### `async beforeStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:277` | Self: 0.0% (0us) | Total: 20.5% (1.57s) | Samples: 0

**Called by:**
- `async beforeStep` (1035)

**Calls:**
- `applyObservationMasking` (1032)
- `applyObservationMasking` (2)
- `applyObservationMasking` (1)

### `tryResolvedProviderConfig`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:143` | Self: 0.0% (0us) | Total: 0.2% (17.2ms) | Samples: 0

**Called by:**
- `get modelCapabilities` (8)
- `modelCapabilities` (4)

**Calls:**
- `resolveRuntimeProvider` (12)

### `async chatOnce`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:119` | Self: 0.0% (0us) | Total: 0.0% (5.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (4)

**Calls:**
- `async onTextPart` (4)

### `_compile`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:526` | Self: 0.0% (0us) | Total: 0.0% (6.0ms) | Samples: 0

**Called by:**
- `compile` (4)

**Calls:**
- `compile` (3)
- `compile` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/index.js:4` | Self: 0.0% (0us) | Total: 0.0% (5.8ms) | Samples: 0

**Called by:**
- `(anonymous)` (4)

**Calls:**
- `bound require` (4)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/jwtclient.js:17` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `async runTurns`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:317` | Self: 0.0% (0us) | Total: 0.0% (4.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (3)

**Calls:**
- `prompt` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/any-base@1.1.0/node_modules/any-base/src/converter.js:50` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `parseInt` (1)

### `resolveModelCapabilities`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:254` | Self: 0.0% (0us) | Total: 0.1% (13.2ms) | Samples: 0

**Called by:**
- `resolveRuntimeProvider` (9)

**Calls:**
- `createProvider` (9)

### `parseAgentProfileYaml`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:76` | Self: 0.0% (0us) | Total: 0.0% (2.6ms) | Samples: 0

**Called by:**
- `finalizeRawAgentProfileSource` (2)

**Calls:**
- `load$1` (2)

### `compileStyleAliases`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:242` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `Type$1` (1)

**Calls:**
- `forEach` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gifwrap@0.10.1/node_modules/gifwrap/src/index.js:5` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `reduce`
`[native code]` | Self: 0.0% (0us) | Total: 0.1% (10.5ms) | Samples: 0

**Called by:**
- `get names` (3)
- `get names` (2)
- `optimize` (1)
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (7)

### `async prepareToolCall`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:252` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `async prepareToolCall` (1)

**Calls:**
- `async runPrepareToolExecutionHook` (1)

### `buildMessages`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:552` | Self: 0.0% (0us) | Total: 0.3% (27.3ms) | Samples: 0

**Called by:**
- `async executeLoopStep` (18)

**Calls:**
- `project` (18)

### `compileSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:80` | Self: 0.0% (0us) | Total: 0.0% (7.4ms) | Samples: 0

**Called by:**
- `_compileMetaSchema` (5)

**Calls:**
- `validateFunctionCode` (5)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:181` | Self: 0.0% (0us) | Total: 0.1% (10.5ms) | Samples: 0

**Called by:**
- `reduce` (7)

**Calls:**
- `get names` (3)
- `get names` (2)
- `get names` (1)
- `reduce` (1)

### `emitLiveEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:694` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `safeEmitLive` (1)

**Calls:**
- `trackLoopTelemetry` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:4` | Self: 0.0% (0us) | Total: 0.0% (4.4ms) | Samples: 0

**Called by:**
- `anonymous` (3)

**Calls:**
- `bound require` (3)

### `validateSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:255` | Self: 0.0% (0us) | Total: 0.1% (8.9ms) | Samples: 0

**Called by:**
- `_addSchema` (6)

**Calls:**
- `defaultMeta` (6)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:3` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-logging-utils@1.1.3/node_modules/google-logging-utils/build/src/logging-utils.js:43` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png-sync.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `schemaKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:185` | Self: 0.0% (0us) | Total: 0.0% (4.6ms) | Samples: 0

**Called by:**
- `typeAndKeywords` (3)

**Calls:**
- `block` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gifwrap@0.10.1/node_modules/gifwrap/src/gifutil.js:6` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `GrepTool`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/grep.ts:174` | Self: 0.0% (0us) | Total: 0.0% (6.0ms) | Samples: 0

**Called by:**
- `initializeBuiltinTools` (1)

**Calls:**
- `(anonymous)` (1)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:216` | Self: 0.0% (0us) | Total: 20.4% (1.56s) | Samples: 0

**Called by:**
- `async beforeStep` (1032)

**Calls:**
- `applyObservationMasking` (534)
- `applyObservationMasking` (486)
- `applyObservationMasking` (10)
- `applyObservationMasking` (1)
- `applyObservationMasking` (1)

### `toInputJsonSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/support/input-schema.ts:27` | Self: 0.0% (0us) | Total: 0.0% (7.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)
- `(anonymous)` (1)

**Calls:**
- `toJSONSchema` (1)
- `finalize` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/index.js:15` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:8` | Self: 0.0% (0us) | Total: 0.0% (4.2ms) | Samples: 0

**Called by:**
- `anonymous` (3)

**Calls:**
- `bound require` (3)

### `modelCapabilities`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:133` | Self: 0.0% (0us) | Total: 0.0% (5.4ms) | Samples: 0

**Called by:**
- `emitStatusUpdated` (1)
- `maxContextSize` (1)
- `get maxContextSize` (1)
- `applyObservationMasking` (1)

**Calls:**
- `tryResolvedProviderConfig` (4)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/index.js:9` | Self: 0.0% (0us) | Total: 0.0% (3.0ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `bound require` (2)

### `dispatchEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:141` | Self: 0.0% (0us) | Total: 0.1% (11.6ms) | Samples: 0

**Called by:**
- `async runToolCallBatch` (5)
- `async (anonymous)` (3)

**Calls:**
- `async recordEvent` (8)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/stscredentials.js:19` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `load$1`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2810` | Self: 0.0% (0us) | Total: 0.0% (2.6ms) | Samples: 0

**Called by:**
- `parseAgentProfileYaml` (2)

**Calls:**
- `loadDocuments` (2)

### `async beforeStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:299` | Self: 0.0% (0us) | Total: 0.2% (15.3ms) | Samples: 0

**Called by:**
- `async beforeStep` (11)

**Calls:**
- `get shouldBlock` (9)
- `shouldBlock` (2)

### `subschemaCode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:91` | Self: 0.0% (0us) | Total: 0.0% (6.2ms) | Samples: 0

**Called by:**
- `subschema` (4)

**Calls:**
- `subSchemaObjCode` (4)

### `async recordEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:162` | Self: 0.0% (0us) | Total: 0.3% (23.0ms) | Samples: 0

**Called by:**
- `async recordEvent` (16)

**Calls:**
- `async appendTranscriptRecord` (16)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/oauth2client.js:23` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/parser-async.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/zlib/crc32.js:42` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `makeTable` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/index.js:5` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gcp-metadata@8.1.2/node_modules/gcp-metadata/build/src/index.js:66` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `resolveSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:175` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `resolveRef` (1)

**Calls:**
- `parse` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/utif2@4.1.0/node_modules/utif2/UTIF.js:12` | Self: 0.0% (0us) | Total: 0.0% (4.1ms) | Samples: 0

**Called by:**
- `(anonymous)` (3)

**Calls:**
- `bound require` (3)

### `estimateTokensForMessages`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:29` | Self: 0.0% (0us) | Total: 94.9% (7.27s) | Samples: 0

**Called by:**
- `applyObservationMasking` (1606)
- `applyObservationMasking` (1563)
- `async (anonymous)` (535)
- `computeCompletionBudgetCap` (535)
- `buildLlmRequestMetadata` (525)
- `get tokenCountWithPending` (29)
- `applyPruning` (8)
- `async (anonymous)` (1)

**Calls:**
- `estimateTokensForMessage` (4257)
- `estimateTokensForMessage` (508)
- `estimateTokensForMessage` (33)
- `estimateTokensForMessage` (3)
- `estimateTokensForMessage` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/picomatch@4.0.4/node_modules/picomatch/lib/picomatch.js:4` | Self: 0.0% (0us) | Total: 0.1% (10.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `compileSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:81` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `_compileMetaSchema` (1)

**Calls:**
- `optimize` (1)

### `schemaKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:190` | Self: 0.0% (0us) | Total: 0.1% (8.9ms) | Samples: 0

**Called by:**
- `typeAndKeywords` (6)

**Calls:**
- `block` (6)

### `BashTool`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/shell/bash.ts:164` | Self: 0.0% (0us) | Total: 0.0% (3.0ms) | Samples: 0

**Called by:**
- `initializeBuiltinTools` (2)

**Calls:**
- `render` (2)

### `async foldLoopEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/wire-fold.ts:220` | Self: 0.0% (0us) | Total: 0.2% (18.5ms) | Samples: 0

**Called by:**
- `async foldLoopEvent` (13)

**Calls:**
- `offloadToolOutput` (13)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:156` | Self: 0.0% (0us) | Total: 31.8% (2.44s) | Samples: 0

**Called by:**
- `restoreObservationMasking` (1072)
- `applyObservationMasking` (534)

**Calls:**
- `estimateTokensForMessages` (1606)

### `async read`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:73` | Self: 0.0% (0us) | Total: 0.0% (7.3ms) | Samples: 0

**Called by:**
- `asyncGeneratorResumeNext` (4)
- `(anonymous)` (1)

**Calls:**
- `parseRecordLine` (5)

### `async prepareToolCall`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:244` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `async runToolCallBatch` (1)

**Calls:**
- `async prepareToolCall` (1)

### `validateFunction`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:37` | Self: 0.0% (0us) | Total: 0.0% (7.4ms) | Samples: 0

**Called by:**
- `topSchemaObjCode` (5)

**Calls:**
- `func` (5)

### `node:_http_client`
`node:_http_client:44` | Self: 0.0% (0us) | Total: 0.1% (13.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `_compileSchemaEnv`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:471` | Self: 0.0% (0us) | Total: 0.1% (8.9ms) | Samples: 0

**Called by:**
- `defaultMeta` (6)

**Calls:**
- `_compileMetaSchema` (6)

### `applyPropertySchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/applicator/properties.js:45` | Self: 0.0% (0us) | Total: 0.0% (6.0ms) | Samples: 0

**Called by:**
- `code` (4)

**Calls:**
- `subschema` (3)
- `subschema` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@3.25.76/node_modules/zod/v3/types.js:2654` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `ZodTuple` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/code.js:116` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `forEach` (1)

**Calls:**
- `subschema` (1)

### `estimateTokensForMessage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:51` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `estimateTokensForMessages` (1)

**Calls:**
- `estimateTokens` (1)

### `_string`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js:7` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `ZodString` (1)

### `Beta`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/beta/beta.mjs:14` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `OpenAI` (1)

**Calls:**
- `Realtime` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:58` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `optional` (1)

### `toJSONSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/json-schema-processors.js:601` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `toInputJsonSchema` (1)

**Calls:**
- `initializeContext` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/draft7.js:5` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `restoreRecord`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:402` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `routeToHandler` (1)

**Calls:**
- `async restoreAppendLoopEvent` (1)

### `initializeBuiltinTools`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/tool/index.ts:366` | Self: 0.0% (0us) | Total: 0.0% (3.0ms) | Samples: 0

**Called by:**
- `update` (2)

**Calls:**
- `BashTool` (2)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:620` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `Type$1` (1)

### `async recordEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:163` | Self: 0.0% (0us) | Total: 0.0% (4.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (3)

**Calls:**
- `safeEmitLive` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/applicator/index.js:9` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/default.ts:19` | Self: 0.0% (0us) | Total: 0.0% (2.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `loadAgentProfilesFromSources` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:258` | Self: 0.0% (0us) | Total: 10.4% (798.7ms) | Samples: 0

**Called by:**
- `async withProviderRequestAuth` (527)

**Calls:**
- `logLlmRequest` (526)
- `logLlmRequest` (1)

### `applyPruning`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:239` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `async beforeStep` (1)

**Calls:**
- `get modelCapabilities` (1)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:423` | Self: 0.0% (0us) | Total: 10.4% (801.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (535)

**Calls:**
- `estimateTokensForMessages` (535)

### `OpenAI`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:79` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `OpenAICompletionsChatProvider` (1)

**Calls:**
- `Embeddings` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gaxios@7.1.4/node_modules/gaxios/build/cjs/src/gaxios.js:20` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/aos/EncodeForRegExpEscape.js:17` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `node:crypto`
`node:crypto:2` | Self: 0.0% (0us) | Total: 0.0% (3.1ms) | Samples: 0

**Calls:**
- `anonymous` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:884` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `init` (1)

**Calls:**
- `init` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv-formats@3.0.1/node_modules/ajv-formats/dist/index.js:3` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `initializeBuiltinTools`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/tool/index.ts:401` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `update` (1)

**Calls:**
- `SetGoalBudgetTool` (1)

### `async chatOnce`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:85` | Self: 0.0% (0us) | Total: 10.6% (816.5ms) | Samples: 0

**Called by:**
- `async chat` (538)

**Calls:**
- `async chatOnce` (536)
- `async chatOnce` (1)
- `async chatOnce` (1)

### `async beforeStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:289` | Self: 0.0% (0us) | Total: 0.4% (38.1ms) | Samples: 0

**Called by:**
- `async beforeStep` (25)

**Calls:**
- `applyPruning` (11)
- `applyPruning` (9)
- `applyPruning` (2)
- `applyPruning` (1)
- `applyPruning` (1)
- `applyPruning` (1)

### `parseAdd`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:705` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `parseConcat` (1)

**Calls:**
- `parseSub` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/parse-bmfont-xml@1.1.6/node_modules/parse-bmfont-xml/lib/index.js:1` | Self: 0.0% (0us) | Total: 0.0% (7.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (5)

**Calls:**
- `bound require` (5)

### `callSyncRef`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js:83` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `callRef` (1)

**Calls:**
- `result` (1)

### `async offloadOutput`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/output-offloading.ts:33` | Self: 0.0% (0us) | Total: 0.2% (18.5ms) | Samples: 0

**Called by:**
- `offloadToolOutput` (13)

**Calls:**
- `async offloadOutput` (13)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/index.js:7` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `loadAgentProfilesFromSources`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:20` | Self: 0.0% (0us) | Total: 0.0% (2.6ms) | Samples: 0

**Called by:**
- `(module)` (2)

**Calls:**
- `map` (2)

### `mergeAdjacentUserMessages`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:155` | Self: 0.0% (0us) | Total: 0.4% (33.5ms) | Samples: 0

**Called by:**
- `project` (22)

**Calls:**
- `cloneMessage` (21)
- `cloneMessage` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:6` | Self: 0.0% (0us) | Total: 0.0% (3.1ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `bound require` (2)

### `callRef`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js:64` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `callValidate` (1)

**Calls:**
- `callSyncRef` (1)

### `resolveYamlTimestamp`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:765` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `composeNode` (1)

**Calls:**
- `exec` (1)

### `launch`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:125` | Self: 0.0% (0us) | Total: 0.0% (4.9ms) | Samples: 0

**Called by:**
- `prompt` (3)

**Calls:**
- `project` (3)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:585` | Self: 0.0% (0us) | Total: 0.0% (2.9ms) | Samples: 0

**Called by:**
- `async afterStep` (2)

**Calls:**
- `record` (2)

### `start`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-scheduler.ts:66` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `add` (1)

**Calls:**
- `async start` (1)

### `composeNode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2591` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `readBlockMapping` (1)

**Calls:**
- `resolveYamlTimestamp` (1)

### `prompt`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:455` | Self: 0.0% (0us) | Total: 0.0% (4.9ms) | Samples: 0

**Called by:**
- `async runTurns` (3)

**Calls:**
- `launch` (3)

### `cloneMessage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:187` | Self: 0.0% (0us) | Total: 0.4% (32.1ms) | Samples: 0

**Called by:**
- `mergeAdjacentUserMessages` (21)

**Calls:**
- `map` (21)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/index.js:6` | Self: 0.0% (0us) | Total: 0.0% (2.8ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `OpenAI`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:109` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `OpenAICompletionsChatProvider` (1)

**Calls:**
- `Uploads` (1)

### `parseNodes`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:991` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `parseAsRoot` (1)

**Calls:**
- `subclass` (1)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:230` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `async beforeStep` (1)

**Calls:**
- `emitStatusUpdated` (1)

### `parseRecordLine`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:194` | Self: 0.0% (0us) | Total: 0.0% (7.3ms) | Samples: 0

**Called by:**
- `async read` (5)

**Calls:**
- `parse` (5)

### `compileRoot`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:974` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `compile` (1)

**Calls:**
- `findAll` (1)

### `subclass`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/object.js:35` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `parseNodes` (1)

**Calls:**
- `NodeList` (1)

### `trackToolLifecycle`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:726` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `trackLoopTelemetry` (1)

**Calls:**
- `trackDuplicateToolCall` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js:1616` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `init` (1)

**Calls:**
- `defineLazy` (1)

### `validateSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:261` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `_addSchema` (1)

**Calls:**
- `validate` (1)

### `init`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:21` | Self: 0.0% (0us) | Total: 0.1% (11.2ms) | Samples: 0

**Called by:**
- `ZodOptional` (2)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `ZodString` (1)
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)

### `add`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-scheduler.ts:40` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `async runToolCallBatch` (1)

**Calls:**
- `start` (1)

### `parseIs`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:654` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `parseIn` (1)

**Calls:**
- `parseCompare` (1)

### `async chatOnce`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:104` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `async chatOnce` (1)

**Calls:**
- `async (anonymous)` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gcp-metadata@8.1.2/node_modules/gcp-metadata/build/src/index.js:65` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `async runToolCallBatch`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:126` | Self: 0.0% (0us) | Total: 0.1% (11.7ms) | Samples: 0

**Called by:**
- `async runToolCallBatch` (8)

**Calls:**
- `map` (8)

### `append`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts:100` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `logRecord` (1)

**Calls:**
- `scheduleFlush` (1)

### `get names`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:235` | Self: 0.0% (0us) | Total: 0.0% (4.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (3)

**Calls:**
- `reduce` (3)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:424` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `estimateTokensForMessages` (1)

### `buildLlmRequestMetadata`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:741` | Self: 0.0% (0us) | Total: 10.3% (795.9ms) | Samples: 0

**Called by:**
- `logLlmRequest` (525)

**Calls:**
- `estimateTokensForMessages` (525)

### `async runToolCallBatch`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:134` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `async prepareToolCall` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gcp-metadata@8.1.2/node_modules/gcp-metadata/build/src/gcp-residency.js:24` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `internal:streams/lazy_transform`
`internal:streams/lazy_transform:2` | Self: 0.0% (0us) | Total: 0.0% (3.1ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `Type$1`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:273` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `compileStyleAliases` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/standardwebhooks@1.0.0/node_modules/standardwebhooks/dist/index.js:6` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

## Files

| Self% | Self | File |
|------:|-----:|------|
| 89.7% | 6.87s | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` |
| 8.5% | 651.4ms | `[native code]` |
| 0.3% | 26.2ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts` |
| 0.1% | 11.7ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/cron/manager.ts` |
| 0.1% | 9.9ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts` |
| 0.0% | 7.6ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js` |
| 0.0% | 7.2ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/background/manager.ts` |
| 0.0% | 6.6ms | `internal:fs/streams` |
| 0.0% | 6.5ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts` |
| 0.0% | 4.5ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts` |
| 0.0% | 4.4ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/persistence.ts` |
| 0.0% | 3.2ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js` |
| 0.0% | 3.1ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs` |
| 0.0% | 3.0ms | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts` |
| 0.0% | 2.9ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js` |
| 0.0% | 2.8ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts` |
| 0.0% | 2.8ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts` |
| 0.0% | 2.5ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs` |
| 0.0% | 1.6ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts` |
| 0.0% | 1.6ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/util.js` |
| 0.0% | 1.6ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/beta/beta.mjs` |
| 0.0% | 1.6ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js` |
| 0.0% | 1.6ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/uploads/uploads.mjs` |
| 0.0% | 1.5ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/object.js` |
| 0.0% | 1.5ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js` |
| 0.0% | 1.5ms | `node:crypto` |
| 0.0% | 1.5ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/beta/realtime/realtime.mjs` |
| 0.0% | 1.5ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js` |
| 0.0% | 1.4ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js` |
| 0.0% | 1.4ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/subschema.js` |
| 0.0% | 1.3ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts` |
| 0.0% | 1.3ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js` |
| 0.0% | 1.3ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js` |
| 0.0% | 1.3ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/internal/utils/env.mjs` |
| 0.0% | 1.3ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/fast-uri@3.1.0/node_modules/fast-uri/index.js` |
| 0.0% | 1.3ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts` |
| 0.0% | 1.2ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts` |
| 0.0% | 1.2ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/goal/set-goal-budget.ts` |
| 0.0% | 1.2ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/capability-registry.ts` |
| 0.0% | 1.2ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/zlib/crc32.js` |
