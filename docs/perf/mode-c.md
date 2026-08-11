# CPU Profile

| Duration | Samples | Interval | Functions |
|----------|---------|----------|----------|
| 420.2ms | 257 | 1.0ms | 414 |

**Top 10:** `anonymous` 22.3%, `estimateTokensForContentPart` 21.0%, `estimateTokens` 20.8%, `(anonymous)` 9.0%, `estimateTokensForContentPart` 7.2%, `addUsage` 1.9%, `stringify` 0.8%, `async chatOnce` 0.6%, `isTransforming` 0.4%, `callRootRef` 0.4%

## Hot Functions (Self Time)

| Self% | Self | Total% | Total | Function | Location |
|------:|-----:|-------:|------:|----------|----------|
| 22.3% | 93.8ms | 68.3% | 287.0ms | `anonymous` | `[native code]` |
| 21.0% | 88.3ms | 21.0% | 88.3ms | `estimateTokensForContentPart` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` |
| 20.8% | 87.7ms | 21.1% | 89.0ms | `estimateTokens` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:16` |
| 9.0% | 37.9ms | 87.8% | 368.9ms | `(anonymous)` | `[native code]` |
| 7.2% | 30.4ms | 7.2% | 30.4ms | `estimateTokensForContentPart` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:59` |
| 1.9% | 8.0ms | 1.9% | 8.0ms | `addUsage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/usage.ts:49` |
| 0.8% | 3.4ms | 0.8% | 3.4ms | `stringify` | `[native code]` |
| 0.6% | 2.9ms | 0.6% | 2.9ms | `async chatOnce` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts` |
| 0.4% | 1.8ms | 0.4% | 1.8ms | `isTransforming` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:385` |
| 0.4% | 1.8ms | 0.4% | 1.8ms | `callRootRef` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `_emitFuncBegin` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:81` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `hasObservableSideEffectsForRegExpMatch` | `[native code]` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `optimizeNames` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:74` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/yauzl@3.3.0/node_modules/yauzl/fd-slicer.js:60` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `readBlockScalar` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `call` | `[native code]` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `_addVocabularies` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDOMStringList.js` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `dispatchEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:140` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `parse` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/fast-uri@3.1.0/node_modules/fast-uri/index.js:250` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `copyDataProperties` | `[native code]` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `push` | `[native code]` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/tar@7.5.13/node_modules/tar/dist/esm/index.min.js:3` |
| 0.3% | 1.6ms | 0.3% | 1.6ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/mime@3.0.0/node_modules/mime/types/standard.js:1` |
| 0.3% | 1.6ms | 0.3% | 1.6ms | `trackDuplicateToolCall` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts` |
| 0.3% | 1.6ms | 0.3% | 1.6ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/any-base@1.1.0/node_modules/any-base/src/converter.js:73` |
| 0.3% | 1.5ms | 0.3% | 1.5ms | `async runTurn` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/run-turn.ts` |
| 0.3% | 1.5ms | 0.3% | 1.5ms | `ZodType` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@3.25.76/node_modules/zod/v3/types.js:278` |
| 0.3% | 1.5ms | 0.3% | 1.5ms | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs` |
| 0.3% | 1.5ms | 0.3% | 1.5ms | `ChatKit` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/beta/chatkit/chatkit.mjs:9` |
| 0.3% | 1.4ms | 0.3% | 1.4ms | `params` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/required.js` |
| 0.3% | 1.4ms | 0.3% | 1.4ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/enum.js:32` |
| 0.3% | 1.4ms | 0.3% | 1.4ms | `_isoDateTime` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js` |
| 0.3% | 1.4ms | 0.3% | 1.4ms | `init` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:7` |
| 0.3% | 1.4ms | 0.3% | 1.4ms | `withoutBackgroundDescription` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/shell/bash.ts` |
| 0.3% | 1.4ms | 0.3% | 1.4ms | `flattenRef` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js` |
| 0.3% | 1.4ms | 0.3% | 1.4ms | `Graders` | `[native code]` |
| 0.3% | 1.4ms | 54.8% | 230.6ms | `require` | `[native code]` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:257` |
| 0.3% | 1.3ms | 49.8% | 209.2ms | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:47` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `coerceAndCheckDataType` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/dataType.js:41` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/fast-sha256@1.3.0/node_modules/fast-sha256/sha256.js` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `_toPrimitive` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `stringSplitFast` | `[native code]` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:388` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/util.js` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `next` | `[native code]` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `errorObjectCode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `structuredClone` | `[native code]` |
| 0.3% | 1.2ms | 0.3% | 1.2ms | `node:crypto` | `node:crypto:74` |
| 0.2% | 1.2ms | 0.2% | 1.2ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js` |
| 0.2% | 1.2ms | 0.2% | 1.2ms | `providerForCapabilityProbe` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:374` |

## Call Tree (Total Time)

| Total% | Total | Self% | Self | Function | Location |
|-------:|------:|------:|-----:|----------|----------|
| 87.8% | 368.9ms | 9.0% | 37.9ms | `(anonymous)` | `[native code]` |
| 87.8% | 368.9ms | 0.0% | 0us | `processTicksAndRejections` | `[native code]` |
| 68.3% | 287.0ms | 22.3% | 93.8ms | `anonymous` | `[native code]` |
| 54.8% | 230.6ms | 0.3% | 1.4ms | `require` | `[native code]` |
| 54.8% | 230.6ms | 0.0% | 0us | `bound require` | `[native code]` |
| 50.6% | 212.6ms | 0.0% | 0us | `estimateTokensForMessages` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:29` |
| 49.8% | 209.2ms | 0.3% | 1.3ms | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:47` |
| 21.1% | 89.0ms | 20.8% | 87.7ms | `estimateTokens` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:16` |
| 21.0% | 88.3ms | 21.0% | 88.3ms | `estimateTokensForContentPart` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` |
| 16.1% | 67.9ms | 0.0% | 0us | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:51` |
| 16.1% | 67.9ms | 0.0% | 0us | `async runTurn` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/run-turn.ts:93` |
| 16.1% | 67.9ms | 0.0% | 0us | `async beforeStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:577` |
| 16.1% | 67.9ms | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:579` |
| 16.1% | 67.9ms | 0.0% | 0us | `async beforeStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:273` |
| 16.1% | 67.9ms | 0.0% | 0us | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:69` |
| 12.6% | 53.1ms | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:423` |
| 12.4% | 52.2ms | 0.0% | 0us | `code` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:439` |
| 11.7% | 49.5ms | 0.0% | 0us | `async withProviderRequestAuth` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/request-auth.ts:20` |
| 11.7% | 49.4ms | 0.0% | 0us | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:131` |
| 11.7% | 49.4ms | 0.0% | 0us | `async chat` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:82` |
| 11.7% | 49.4ms | 0.0% | 0us | `async chatWithRetry` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/retry.ts:54` |
| 11.7% | 49.4ms | 0.0% | 0us | `async chatWithRetry` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/retry.ts:37` |
| 11.7% | 49.4ms | 0.0% | 0us | `async chatOnce` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:85` |
| 11.0% | 46.4ms | 0.0% | 0us | `logLlmRequest` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:403` |
| 11.0% | 46.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:258` |
| 11.0% | 46.4ms | 0.0% | 0us | `buildLlmRequestMetadata` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:741` |
| 10.7% | 45.3ms | 0.0% | 0us | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:216` |
| 10.7% | 45.3ms | 0.0% | 0us | `async beforeStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:277` |
| 10.7% | 45.3ms | 0.0% | 0us | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:156` |
| 10.7% | 45.1ms | 0.0% | 0us | `applyCompletionBudget` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/completion-budget.ts:105` |
| 10.7% | 45.1ms | 0.0% | 0us | `async chatOnce` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:95` |
| 10.7% | 45.1ms | 0.0% | 0us | `computeCompletionBudgetCap` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/completion-budget.ts:72` |
| 7.4% | 31.1ms | 0.0% | 0us | `block` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:568` |
| 7.2% | 30.4ms | 7.2% | 30.4ms | `estimateTokensForContentPart` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:59` |
| 5.3% | 22.5ms | 0.0% | 0us | `get tokenCountWithPending` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:146` |
| 4.0% | 17.1ms | 0.0% | 0us | `keywordCode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:464` |
| 4.0% | 17.1ms | 0.0% | 0us | `typeAndKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:128` |
| 3.9% | 16.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/index.js:31` |
| 3.9% | 16.5ms | 0.0% | 0us | `get tokenCountWithPending` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:247` |
| 3.6% | 15.3ms | 0.0% | 0us | `map` | `[native code]` |
| 3.5% | 14.7ms | 0.0% | 0us | `ws` | `ws:3` |
| 3.5% | 14.7ms | 0.0% | 0us | `node:http` | `node:http:2` |
| 2.9% | 12.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:192` |
| 2.9% | 12.5ms | 0.0% | 0us | `schemaKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:190` |
| 2.9% | 12.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:222` |
| 2.9% | 12.5ms | 0.0% | 0us | `iterateKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:219` |
| 2.8% | 11.9ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/picomatch@4.0.4/node_modules/picomatch/index.js:3` |
| 2.6% | 10.9ms | 0.0% | 0us | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:208` |
| 2.6% | 10.9ms | 0.0% | 0us | `validateExecutableToolArgs` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:234` |
| 2.6% | 10.9ms | 0.0% | 0us | `preflightToolCall` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:202` |
| 2.6% | 10.9ms | 0.0% | 0us | `async runToolCallBatch` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:126` |
| 2.6% | 10.9ms | 0.0% | 0us | `async runToolCallBatch` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:122` |
| 2.5% | 10.6ms | 0.0% | 0us | `subschema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:438` |
| 2.5% | 10.6ms | 0.0% | 0us | `subschemaCode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:91` |
| 2.5% | 10.6ms | 0.0% | 0us | `subSchemaObjCode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:115` |
| 2.5% | 10.6ms | 0.0% | 0us | `optimizeNames` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:173` |
| 2.4% | 10.3ms | 0.0% | 0us | `async runTurn` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/run-turn.ts:46` |
| 2.4% | 10.3ms | 0.0% | 0us | `async runTurn` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:539` |
| 2.2% | 9.5ms | 0.0% | 0us | `groupKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:200` |
| 2.2% | 9.4ms | 0.0% | 0us | `compile` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:159` |
| 2.2% | 9.4ms | 0.0% | 0us | `_addSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:461` |
| 2.2% | 9.4ms | 0.0% | 0us | `validateSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:255` |
| 2.2% | 9.4ms | 0.0% | 0us | `_compileMetaSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:483` |
| 2.2% | 9.4ms | 0.0% | 0us | `_compileSchemaEnv` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:471` |
| 2.2% | 9.4ms | 0.0% | 0us | `defaultMeta` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:29` |
| 2.1% | 9.1ms | 0.0% | 0us | `validateFunction` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:37` |
| 2.1% | 9.1ms | 0.0% | 0us | `topSchemaObjCode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:62` |
| 2.1% | 9.1ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:70` |
| 2.1% | 9.1ms | 0.0% | 0us | `validateFunctionCode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:21` |
| 2.1% | 9.1ms | 0.0% | 0us | `func` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:587` |
| 2.1% | 9.1ms | 0.0% | 0us | `compileSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:80` |
| 2.0% | 8.5ms | 0.0% | 0us | `async beforeStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:299` |
| 2.0% | 8.5ms | 0.0% | 0us | `get shouldBlock` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:259` |
| 1.9% | 8.0ms | 1.9% | 8.0ms | `addUsage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/usage.ts:49` |
| 1.9% | 8.0ms | 0.0% | 0us | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:199` |
| 1.9% | 8.0ms | 0.0% | 0us | `recordStepUsage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/run-turn.ts:72` |
| 1.8% | 7.9ms | 0.0% | 0us | `spawnChild` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:650` |
| 1.8% | 7.9ms | 0.0% | 0us | `from` | `[native code]` |
| 1.8% | 7.9ms | 0.0% | 0us | `async runModeC` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:665` |
| 1.8% | 7.9ms | 0.0% | 0us | `async main` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:684` |
| 1.8% | 7.9ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:774` |
| 1.8% | 7.9ms | 0.0% | 0us | `async runModeC` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:637` |
| 1.8% | 7.9ms | 0.0% | 0us | `async main` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:699` |
| 1.8% | 7.9ms | 0.0% | 0us | `createPerfAgent` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:298` |
| 1.8% | 7.9ms | 0.0% | 0us | `get shouldCompact` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:255` |
| 1.8% | 7.9ms | 0.0% | 0us | `async beforeStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:298` |
| 1.8% | 7.9ms | 0.0% | 0us | `checkAutoCompaction` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:313` |
| 1.7% | 7.2ms | 0.0% | 0us | `process` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:60` |
| 1.7% | 7.1ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/xml2js.js:39` |
| 1.7% | 7.1ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/parse-bmfont-xml@1.1.6/node_modules/parse-bmfont-xml/lib/index.js:1` |
| 1.6% | 6.9ms | 0.0% | 0us | `init` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:21` |
| 1.5% | 6.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:4` |
| 1.5% | 6.4ms | 0.0% | 0us | `update` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:62` |
| 1.5% | 6.3ms | 0.0% | 0us | `code` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/applicator/properties.js:33` |
| 1.5% | 6.3ms | 0.0% | 0us | `applyPropertySchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/applicator/properties.js:45` |
| 1.4% | 6.1ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/index.js:4` |
| 1.4% | 6.0ms | 0.0% | 0us | `async beforeStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:289` |
| 1.4% | 6.0ms | 0.0% | 0us | `applyPruning` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:244` |
| 1.3% | 5.8ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/builder.js:127` |
| 1.3% | 5.8ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/builder.js:7` |
| 1.3% | 5.8ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/index.js:65` |
| 1.3% | 5.8ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/xml2js.js:10` |
| 1.2% | 5.3ms | 0.0% | 0us | `optimizeNames` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:229` |
| 1.1% | 5.0ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png.js:5` |
| 1.1% | 4.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/utif2@4.1.0/node_modules/utif2/UTIF.js:12` |
| 1.1% | 4.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/utif2@4.1.0/node_modules/utif2/UTIF.js:1648` |
| 1.1% | 4.6ms | 0.0% | 0us | `schemaKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:185` |
| 1.0% | 4.5ms | 0.0% | 0us | `reportError` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:18` |
| 1.0% | 4.4ms | 0.0% | 0us | `createProvider` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/index.ts:24` |
| 1.0% | 4.4ms | 0.0% | 0us | `OpenAICompletionsChatProvider` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/openai-completions.ts:405` |
| 1.0% | 4.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/index.js:9` |
| 1.0% | 4.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:242` |
| 0.9% | 4.1ms | 0.0% | 0us | `tryResolvedProviderConfig` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:143` |
| 0.9% | 4.1ms | 0.0% | 0us | `resolveRuntimeProvider` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:120` |
| 0.9% | 4.1ms | 0.0% | 0us | `resolveModelCapabilities` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:254` |
| 0.9% | 4.0ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/call-bind@1.0.9/node_modules/call-bind/index.js:3` |
| 0.9% | 4.0ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/set-function-length@1.2.2/node_modules/set-function-length/index.js:3` |
| 0.9% | 4.0ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:4` |
| 0.8% | 3.6ms | 0.0% | 0us | `objectProcessor` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/json-schema-processors.js:287` |
| 0.8% | 3.6ms | 0.0% | 0us | `arrayProcessor` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/json-schema-processors.js:278` |
| 0.8% | 3.5ms | 0.0% | 0us | `_compile` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:526` |
| 0.8% | 3.5ms | 0.0% | 0us | `render` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:440` |
| 0.8% | 3.5ms | 0.0% | 0us | `compile` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:1023` |
| 0.8% | 3.5ms | 0.0% | 0us | `compile` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:518` |
| 0.8% | 3.4ms | 0.0% | 0us | `bound call` | `[native code]` |
| 0.8% | 3.4ms | 0.8% | 3.4ms | `stringify` | `[native code]` |
| 0.8% | 3.4ms | 0.0% | 0us | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:52` |
| 0.8% | 3.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:4` |
| 0.7% | 3.2ms | 0.0% | 0us | `initializeBuiltinTools` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/tool/index.ts:366` |
| 0.7% | 3.2ms | 0.0% | 0us | `toInputJsonSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/support/input-schema.ts:27` |
| 0.7% | 3.2ms | 0.0% | 0us | `_error` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:371` |
| 0.7% | 3.2ms | 0.0% | 0us | `error` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:367` |
| 0.7% | 3.2ms | 0.0% | 0us | `errorObject` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:94` |
| 0.7% | 3.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:20` |
| 0.7% | 3.1ms | 0.0% | 0us | `forEach` | `[native code]` |
| 0.7% | 3.0ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:8` |
| 0.7% | 3.0ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:5` |
| 0.7% | 3.0ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:27` |
| 0.7% | 3.0ms | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:397` |
| 0.7% | 3.0ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/index.js:7` |
| 0.7% | 2.9ms | 0.0% | 0us | `loadAgentProfilesFromSources` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:20` |
| 0.7% | 2.9ms | 0.0% | 0us | `finalizeRawAgentProfileSource` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:67` |
| 0.7% | 2.9ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/default.ts:19` |
| 0.7% | 2.9ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:6` |
| 0.7% | 2.9ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/implementation.js:3` |
| 0.7% | 2.9ms | 0.0% | 0us | `groupKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:208` |
| 0.6% | 2.9ms | 0.6% | 2.9ms | `async chatOnce` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts` |
| 0.6% | 2.8ms | 0.0% | 0us | `internal:streams/lazy_transform` | `internal:streams/lazy_transform:2` |
| 0.6% | 2.8ms | 0.0% | 0us | `internal:streams/duplex` | `internal:streams/duplex:2` |
| 0.6% | 2.8ms | 0.0% | 0us | `node:crypto` | `node:crypto:2` |
| 0.6% | 2.8ms | 0.0% | 0us | `internal:streams/transform` | `internal:streams/transform:2` |
| 0.6% | 2.8ms | 0.0% | 0us | `inlineRefSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js:38` |
| 0.6% | 2.8ms | 0.0% | 0us | `if` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:466` |
| 0.6% | 2.6ms | 0.0% | 0us | `typeAndKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:127` |
| 0.6% | 2.6ms | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:585` |
| 0.6% | 2.6ms | 0.0% | 0us | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:234` |
| 0.6% | 2.6ms | 0.0% | 0us | `get modelCapabilities` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:133` |
| 0.6% | 2.6ms | 0.0% | 0us | `record` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/usage/index.ts:43` |
| 0.6% | 2.6ms | 0.0% | 0us | `async afterStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:584` |
| 0.6% | 2.6ms | 0.0% | 0us | `emitStatusUpdated` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:606` |
| 0.6% | 2.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:5` |
| 0.5% | 2.5ms | 0.0% | 0us | `node:fs/promises` | `node:fs/promises:2` |
| 0.5% | 2.5ms | 0.0% | 0us | `node:events` | `node:events:9` |
| 0.5% | 2.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:19` |
| 0.5% | 2.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLStringWriter.js:35` |
| 0.5% | 2.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLStringWriter.js:7` |
| 0.4% | 1.8ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/collaboration/ask-user.ts:90` |
| 0.4% | 1.8ms | 0.0% | 0us | `isTransforming` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:398` |
| 0.4% | 1.8ms | 0.0% | 0us | `initializeBuiltinTools` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/tool/index.ts:378` |
| 0.4% | 1.8ms | 0.0% | 0us | `AskUserQuestionTool` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/collaboration/ask-user.ts:92` |
| 0.4% | 1.8ms | 0.0% | 0us | `toJSONSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/json-schema-processors.js:602` |
| 0.4% | 1.8ms | 0.0% | 0us | `process` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:83` |
| 0.4% | 1.8ms | 0.4% | 1.8ms | `isTransforming` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:385` |
| 0.4% | 1.8ms | 0.4% | 1.8ms | `callRootRef` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js` |
| 0.4% | 1.7ms | 0.0% | 0us | `BashTool` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/shell/bash.ts:164` |
| 0.4% | 1.7ms | 0.0% | 0us | `compile` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:997` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `_emitFuncBegin` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:81` |
| 0.4% | 1.7ms | 0.0% | 0us | `compileRoot` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:963` |
| 0.4% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/parser-async.js:8` |
| 0.4% | 1.7ms | 0.0% | 0us | `nextToken` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:36` |
| 0.4% | 1.7ms | 0.0% | 0us | `parseAnd` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:605` |
| 0.4% | 1.7ms | 0.0% | 0us | `parseAsRoot` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:1005` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `hasObservableSideEffectsForRegExpMatch` | `[native code]` |
| 0.4% | 1.7ms | 0.0% | 0us | `nextToken` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/lexer.js:203` |
| 0.4% | 1.7ms | 0.0% | 0us | `peekToken` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:42` |
| 0.4% | 1.7ms | 0.0% | 0us | `parseInlineIf` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:581` |
| 0.4% | 1.7ms | 0.0% | 0us | `parseNodes` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:988` |
| 0.4% | 1.7ms | 0.0% | 0us | `parseNot` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:613` |
| 0.4% | 1.7ms | 0.0% | 0us | `parseExpression` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:577` |
| 0.4% | 1.7ms | 0.0% | 0us | `[Symbol.match]` | `[native code]` |
| 0.4% | 1.7ms | 0.0% | 0us | `parseOr` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:597` |
| 0.4% | 1.7ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/read.ts:163` |
| 0.4% | 1.7ms | 0.0% | 0us | `optimize` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:597` |
| 0.4% | 1.7ms | 0.0% | 0us | `optimizeNames` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:228` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `optimizeNames` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:74` |
| 0.4% | 1.7ms | 0.0% | 0us | `compileSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:81` |
| 0.4% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png-sync.js:3` |
| 0.4% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/parser-sync.js:13` |
| 0.4% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png.js:7` |
| 0.4% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/yauzl@3.3.0/node_modules/yauzl/index.js:3` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/yauzl@3.3.0/node_modules/yauzl/fd-slicer.js:60` |
| 0.4% | 1.7ms | 0.0% | 0us | `loadDocuments` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2784` |
| 0.4% | 1.7ms | 0.0% | 0us | `readBlockMapping` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2260` |
| 0.4% | 1.7ms | 0.0% | 0us | `parseAgentProfileYaml` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:76` |
| 0.4% | 1.7ms | 0.0% | 0us | `readDocument` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2721` |
| 0.4% | 1.7ms | 0.0% | 0us | `composeNode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2537` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `readBlockScalar` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs` |
| 0.4% | 1.7ms | 0.0% | 0us | `composeNode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2541` |
| 0.4% | 1.7ms | 0.0% | 0us | `load$1` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2810` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `call` | `[native code]` |
| 0.4% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/boolSchema.js:4` |
| 0.4% | 1.7ms | 0.0% | 0us | `filter` | `[native code]` |
| 0.4% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:4` |
| 0.4% | 1.7ms | 0.0% | 0us | `node:_http_server` | `node:_http_server:42` |
| 0.4% | 1.7ms | 0.0% | 0us | `(anonymous)` | `internal:util/inspect:179` |
| 0.4% | 1.7ms | 0.0% | 0us | `internal:util/inspect` | `internal:util/inspect:179` |
| 0.4% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:4` |
| 0.4% | 1.7ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:6` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `_addVocabularies` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js` |
| 0.4% | 1.7ms | 0.0% | 0us | `Ajv` | `[native code]` |
| 0.4% | 1.7ms | 0.0% | 0us | `Ajv` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:113` |
| 0.4% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDOMStringList.js:28` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDOMStringList.js` |
| 0.4% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDOMConfiguration.js:64` |
| 0.4% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:11` |
| 0.4% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDOMConfiguration.js:7` |
| 0.4% | 1.7ms | 0.0% | 0us | `onTextDelta` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:307` |
| 0.4% | 1.7ms | 0.0% | 0us | `async generate` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:366` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `dispatchEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:140` |
| 0.4% | 1.7ms | 0.0% | 0us | `onMessagePart` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:207` |
| 0.4% | 1.7ms | 0.0% | 0us | `Ajv2020` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/2020.js:11` |
| 0.4% | 1.7ms | 0.0% | 0us | `_addDefaultMetaSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/2020.js:29` |
| 0.4% | 1.7ms | 0.0% | 0us | `addMetaSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:243` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `parse` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/fast-uri@3.1.0/node_modules/fast-uri/index.js:250` |
| 0.4% | 1.7ms | 0.0% | 0us | `addMetaSchema2020` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/refs/json-schema-2020-12/index.js:23` |
| 0.4% | 1.7ms | 0.0% | 0us | `getFullPath` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/resolve.js:74` |
| 0.4% | 1.7ms | 0.0% | 0us | `getSchemaRefs` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/resolve.js:100` |
| 0.4% | 1.7ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:12` |
| 0.4% | 1.7ms | 0.0% | 0us | `_addSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:451` |
| 0.4% | 1.7ms | 0.0% | 0us | `Ajv` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:114` |
| 0.4% | 1.7ms | 0.0% | 0us | `addSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:235` |
| 0.4% | 1.7ms | 0.0% | 0us | `object` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:579` |
| 0.4% | 1.7ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/web/fetch-url.ts:62` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `copyDataProperties` | `[native code]` |
| 0.4% | 1.7ms | 0.0% | 0us | `fail` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:348` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `push` | `[native code]` |
| 0.4% | 1.7ms | 0.0% | 0us | `str` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/code.js:73` |
| 0.4% | 1.7ms | 0.0% | 0us | `code` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/limitNumber.js:23` |
| 0.4% | 1.7ms | 0.0% | 0us | `extraErrorProps` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:115` |
| 0.4% | 1.7ms | 0.4% | 1.7ms | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/tar@7.5.13/node_modules/tar/dist/esm/index.min.js:3` |
| 0.4% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/crypto/crypto.js:33` |
| 0.4% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:23` |
| 0.4% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/json-bigint@1.0.0/node_modules/json-bigint/lib/stringify.js:1` |
| 0.4% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/json-bigint@1.0.0/node_modules/json-bigint/index.js:1` |
| 0.4% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gcp-metadata@8.1.2/node_modules/gcp-metadata/build/src/index.js:65` |
| 0.3% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/exif-parser@0.1.12/node_modules/exif-parser/lib/parser.js:5` |
| 0.3% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/exif-parser@0.1.12/node_modules/exif-parser/lib/simplify.js:2` |
| 0.3% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/exif-parser@0.1.12/node_modules/exif-parser/index.js:1` |
| 0.3% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/index.js:6` |
| 0.3% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/mime@3.0.0/node_modules/mime/lite.js:4` |
| 0.3% | 1.6ms | 0.3% | 1.6ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/mime@3.0.0/node_modules/mime/types/standard.js:1` |
| 0.3% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:6` |
| 0.3% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:5` |
| 0.3% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/dataType.js:5` |
| 0.3% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/index.js:15` |
| 0.3% | 1.6ms | 0.0% | 0us | `trackToolLifecycle` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:726` |
| 0.3% | 1.6ms | 0.0% | 0us | `trackLoopTelemetry` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:713` |
| 0.3% | 1.6ms | 0.0% | 0us | `safeEmitLive` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:170` |
| 0.3% | 1.6ms | 0.0% | 0us | `async recordEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:163` |
| 0.3% | 1.6ms | 0.0% | 0us | `emitLiveEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:694` |
| 0.3% | 1.6ms | 0.3% | 1.6ms | `trackDuplicateToolCall` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts` |
| 0.3% | 1.6ms | 0.3% | 1.6ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/any-base@1.1.0/node_modules/any-base/src/converter.js:73` |
| 0.3% | 1.6ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@jimp+plugin-hash@1.6.1/node_modules/@jimp/plugin-hash/dist/esm/index.js:11` |
| 0.3% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/any-base@1.1.0/node_modules/any-base/src/converter.js:33` |
| 0.3% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/any-base@1.1.0/node_modules/any-base/index.js:21` |
| 0.3% | 1.5ms | 0.3% | 1.5ms | `async runTurn` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/run-turn.ts` |
| 0.3% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/loaders.js:5` |
| 0.3% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:10` |
| 0.3% | 1.5ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@jimp+plugin-color@1.6.1/node_modules/@jimp/plugin-color/dist/esm/index.js:12` |
| 0.3% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@3.25.76/node_modules/zod/v3/types.js:2357` |
| 0.3% | 1.5ms | 0.3% | 1.5ms | `ZodType` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@3.25.76/node_modules/zod/v3/types.js:278` |
| 0.3% | 1.5ms | 0.0% | 0us | `ZodUnion` | `[native code]` |
| 0.3% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:33` |
| 0.3% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/get-intrinsic@1.3.0/node_modules/get-intrinsic/index.js:57` |
| 0.3% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/get-proto@1.0.1/node_modules/get-proto/Object.getPrototypeOf.js:3` |
| 0.3% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/get-proto@1.0.1/node_modules/get-proto/index.js:4` |
| 0.3% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/aos/EncodeForRegExpEscape.js:16` |
| 0.3% | 1.5ms | 0.0% | 0us | `get hasProvider` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:94` |
| 0.3% | 1.5ms | 0.0% | 0us | `update` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:57` |
| 0.3% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/for-each@0.3.5/node_modules/for-each/index.js:3` |
| 0.3% | 1.5ms | 0.3% | 1.5ms | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs` |
| 0.3% | 1.5ms | 0.0% | 0us | `Beta` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/beta/beta.mjs:15` |
| 0.3% | 1.5ms | 0.3% | 1.5ms | `ChatKit` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/beta/chatkit/chatkit.mjs:9` |
| 0.3% | 1.5ms | 0.0% | 0us | `async runTurn` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:532` |
| 0.3% | 1.5ms | 0.0% | 0us | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:101` |
| 0.3% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gcp-metadata@8.1.2/node_modules/gcp-metadata/build/src/index.js:67` |
| 0.3% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-logging-utils@1.1.3/node_modules/google-logging-utils/build/src/index.js:30` |
| 0.3% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:16` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/code.js:12` |
| 0.3% | 1.4ms | 0.0% | 0us | `checkReportMissingProp` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/code.js:10` |
| 0.3% | 1.4ms | 0.0% | 0us | `extraErrorProps` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:113` |
| 0.3% | 1.4ms | 0.0% | 0us | `code` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/required.js:23` |
| 0.3% | 1.4ms | 0.0% | 0us | `_compileSchemaEnv` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:473` |
| 0.3% | 1.4ms | 0.0% | 0us | `allErrorsMode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/required.js:43` |
| 0.3% | 1.4ms | 0.3% | 1.4ms | `params` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/required.js` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:5` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/code.js:116` |
| 0.3% | 1.4ms | 0.0% | 0us | `validateUnion` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/code.js:115` |
| 0.3% | 1.4ms | 0.0% | 0us | `code` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/enum.js:32` |
| 0.3% | 1.4ms | 0.3% | 1.4ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/enum.js:32` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:19` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gaxios@7.1.4/node_modules/gaxios/build/cjs/src/index.js:31` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gaxios@7.1.4/node_modules/gaxios/build/cjs/src/gaxios.js:22` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gifwrap@0.10.1/node_modules/gifwrap/src/index.js:7` |
| 0.3% | 1.4ms | 0.0% | 0us | `_int` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js:319` |
| 0.3% | 1.4ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:786` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:373` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:396` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js:494` |
| 0.3% | 1.4ms | 0.3% | 1.4ms | `_isoDateTime` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js` |
| 0.3% | 1.4ms | 0.0% | 0us | `ZodNumberFormat` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` |
| 0.3% | 1.4ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/background/task-output.ts:48` |
| 0.3% | 1.4ms | 0.3% | 1.4ms | `init` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:7` |
| 0.3% | 1.4ms | 0.0% | 0us | `BashTool` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/shell/bash.ts:165` |
| 0.3% | 1.4ms | 0.3% | 1.4ms | `withoutBackgroundDescription` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/shell/bash.ts` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/define-properties@1.2.1/node_modules/define-properties/index.js:8` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:3` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/define-data-property@1.1.4/node_modules/define-data-property/index.js:8` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/aos/EncodeForRegExpEscape.js:3` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/es-abstract@1.24.2/node_modules/es-abstract/2024/Number/toString.js:4` |
| 0.3% | 1.4ms | 0.0% | 0us | `finalize` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:296` |
| 0.3% | 1.4ms | 0.3% | 1.4ms | `flattenRef` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js` |
| 0.3% | 1.4ms | 0.0% | 0us | `initializeBuiltinTools` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/tool/index.ts:361` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/read.ts:172` |
| 0.3% | 1.4ms | 0.0% | 0us | `ReadTool` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/read.ts:174` |
| 0.3% | 1.4ms | 0.0% | 0us | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:97` |
| 0.3% | 1.4ms | 0.0% | 0us | `FineTuning` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/fine-tuning/fine-tuning.mjs:17` |
| 0.3% | 1.4ms | 0.3% | 1.4ms | `Graders` | `[native code]` |
| 0.3% | 1.4ms | 0.0% | 0us | `Alpha` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/fine-tuning/alpha/alpha.mjs:8` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/inflate.js:4` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/zlib/inflate.js:26` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/2019.js:6` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/dynamic/index.js:6` |
| 0.3% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/dynamic/recursiveRef.js:3` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/picomatch@4.0.4/node_modules/picomatch/lib/picomatch.js:4` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/stscredentials.js:19` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/baseexternalclient.js:20` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:30` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/externalclient.js:17` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/jwtclient.js:17` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/tokenHandler.js:4` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/googleToken.js:18` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/getToken.js:17` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/jwsSign.js:18` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/jws@4.0.1/node_modules/jws/lib/sign-stream.js:6` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/jws@4.0.1/node_modules/jws/index.js:2` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:257` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `coerceAndCheckDataType` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/dataType.js:41` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/fast-sha256@1.3.0/node_modules/fast-sha256/sha256.js:15` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/fast-sha256@1.3.0/node_modules/fast-sha256/sha256.js` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/standardwebhooks@1.0.0/node_modules/standardwebhooks/dist/index.js:6` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `_toPrimitive` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js` |
| 0.3% | 1.3ms | 0.0% | 0us | `_createClass` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js:4` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js:83` |
| 0.3% | 1.3ms | 0.0% | 0us | `_defineProperties` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js:3` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js:72` |
| 0.3% | 1.3ms | 0.0% | 0us | `_toPropertyKey` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js:5` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:6` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gifwrap@0.10.1/node_modules/gifwrap/src/index.js:3` |
| 0.3% | 1.3ms | 0.0% | 0us | `async chatOnce` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:110` |
| 0.3% | 1.3ms | 0.0% | 0us | `buildPromptPlan` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/prompt-plan/builder.ts:336` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `stringSplitFast` | `[native code]` |
| 0.3% | 1.3ms | 0.0% | 0us | `generateOptions` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:150` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/draft7.js:3` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/index.js:4` |
| 0.3% | 1.3ms | 0.0% | 0us | `_number` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js:302` |
| 0.3% | 1.3ms | 0.0% | 0us | `ZodNumber` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` |
| 0.3% | 1.3ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:1632` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:388` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:551` |
| 0.3% | 1.3ms | 0.0% | 0us | `ZodObject` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js:903` |
| 0.3% | 1.3ms | 0.0% | 0us | `object` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:581` |
| 0.3% | 1.3ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/types.ts:6` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/util.js` |
| 0.3% | 1.3ms | 0.0% | 0us | `get value` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/util.js:33` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `next` | `[native code]` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/dataType.js:50` |
| 0.3% | 1.3ms | 0.0% | 0us | `coerceAndCheckDataType` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/dataType.js:46` |
| 0.3% | 1.3ms | 0.0% | 0us | `reportTypeError` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/dataType.js:185` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `errorObjectCode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js` |
| 0.3% | 1.3ms | 0.0% | 0us | `node:_http_client` | `node:_http_client:44` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/parser.js:9` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/parser.js:385` |
| 0.3% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/xml2js.js:12` |
| 0.3% | 1.3ms | 0.3% | 1.3ms | `structuredClone` | `[native code]` |
| 0.3% | 1.2ms | 0.3% | 1.2ms | `node:crypto` | `node:crypto:74` |
| 0.2% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLWriterBase.js:16` |
| 0.2% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLWriterBase.js:428` |
| 0.2% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/draft7.js:5` |
| 0.2% | 1.2ms | 0.0% | 0us | `internal:fs/streams` | `internal:fs/streams:2` |
| 0.2% | 1.2ms | 0.0% | 0us | `internal:stream` | `internal:stream:2` |
| 0.2% | 1.2ms | 0.0% | 0us | `internal:streams/compose` | `internal:streams/compose:2` |
| 0.2% | 1.2ms | 0.0% | 0us | `node:stream` | `node:stream:2` |
| 0.2% | 1.2ms | 0.0% | 0us | `internal:streams/operators` | `internal:streams/operators:2` |
| 0.2% | 1.2ms | 0.0% | 0us | `get ReadStream` | `node:fs:578` |
| 0.2% | 1.2ms | 0.2% | 1.2ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js` |
| 0.2% | 1.2ms | 0.0% | 0us | `parseAgentProfileYaml` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:85` |
| 0.2% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js:922` |
| 0.2% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/parse.js:33` |
| 0.2% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/get-intrinsic@1.3.0/node_modules/get-intrinsic/index.js:244` |
| 0.2% | 1.2ms | 0.2% | 1.2ms | `providerForCapabilityProbe` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:374` |
| 0.2% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:24` |
| 0.2% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/computeclient.js:19` |

## Function Details

### `anonymous`
`[native code]` | Self: 22.3% (93.8ms) | Total: 68.3% (287.0ms) | Samples: 46

**Called by:**
- `require` (145)
- `node:http` (3)
- `ws` (3)
- `node:_http_client` (1)
- `node:stream` (1)
- `node:fs/promises` (1)
- `get ReadStream` (1)
- `internal:stream` (1)
- `internal:streams/compose` (1)
- `internal:streams/transform` (1)
- `(anonymous)` (1)
- `node:crypto` (1)
- `internal:fs/streams` (1)
- `internal:streams/duplex` (1)
- `node:_http_server` (1)
- `internal:streams/operators` (1)
- `internal:streams/lazy_transform` (1)
- `node:events` (1)

**Calls:**
- `(anonymous)` (5)
- `(anonymous)` (4)
- `(anonymous)` (4)
- `node:http` (3)
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
- `internal:streams/transform` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `node:_http_server` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `node:events` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `node:stream` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `internal:stream` (1)
- `internal:streams/compose` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `internal:streams/duplex` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `node:_http_client` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `internal:util/inspect` (1)
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
- `internal:fs/streams` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `internal:streams/lazy_transform` (1)
- `internal:streams/operators` (1)

### `estimateTokensForContentPart`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` | Self: 21.0% (88.3ms) | Total: 21.0% (88.3ms) | Samples: 58

**Called by:**
- `estimateTokensForMessage` (58)

### `estimateTokens`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:16` | Self: 20.8% (87.7ms) | Total: 21.1% (89.0ms) | Samples: 59

**Called by:**
- `estimateTokensForMessage` (60)

**Calls:**
- `next` (1)

### `(anonymous)`
`[native code]` | Self: 9.0% (37.9ms) | Total: 87.8% (368.9ms) | Samples: 25

**Called by:**
- `processTicksAndRejections` (238)

**Calls:**
- `async runTurn` (39)
- `async (anonymous)` (36)
- `async withProviderRequestAuth` (33)
- `async executeLoopStep` (31)
- `async executeLoopStep` (7)
- `async runTurn` (7)
- `(anonymous)` (5)
- `(module)` (5)
- `(anonymous)` (4)
- `(anonymous)` (4)
- `(anonymous)` (3)
- `(anonymous)` (3)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `async executeLoopStep` (2)
- `(module)` (2)
- `(anonymous)` (2)
- `async executeLoopStep` (2)
- `(module)` (1)
- `(anonymous)` (1)
- `(module)` (1)
- `(module)` (1)
- `(module)` (1)
- `async runTurn` (1)
- `async recordEvent` (1)
- `(module)` (1)
- `(anonymous)` (1)
- `(module)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(module)` (1)
- `(module)` (1)
- `(module)` (1)
- `(module)` (1)
- `(anonymous)` (1)
- `async (anonymous)` (1)
- `(anonymous)` (1)
- `(module)` (1)
- `(anonymous)` (1)

### `estimateTokensForContentPart`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:59` | Self: 7.2% (30.4ms) | Total: 7.2% (30.4ms) | Samples: 20

**Called by:**
- `estimateTokensForMessage` (20)

### `addUsage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/usage.ts:49` | Self: 1.9% (8.0ms) | Total: 1.9% (8.0ms) | Samples: 2

**Called by:**
- `recordStepUsage` (2)

### `stringify`
`[native code]` | Self: 0.8% (3.4ms) | Total: 0.8% (3.4ms) | Samples: 2

**Called by:**
- `estimateTokensForMessage` (2)

### `async chatOnce`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts` | Self: 0.6% (2.9ms) | Total: 0.6% (2.9ms) | Samples: 1

**Called by:**
- `async chatOnce` (1)

### `isTransforming`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:385` | Self: 0.4% (1.8ms) | Total: 0.4% (1.8ms) | Samples: 1

**Called by:**
- `isTransforming` (1)

### `callRootRef`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js` | Self: 0.4% (1.8ms) | Total: 0.4% (1.8ms) | Samples: 1

**Called by:**
- `keywordCode` (1)

### `_emitFuncBegin`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:81` | Self: 0.4% (1.7ms) | Total: 0.4% (1.7ms) | Samples: 1

**Called by:**
- `compileRoot` (1)

### `hasObservableSideEffectsForRegExpMatch`
`[native code]` | Self: 0.4% (1.7ms) | Total: 0.4% (1.7ms) | Samples: 1

**Called by:**
- `[Symbol.match]` (1)

### `optimizeNames`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:74` | Self: 0.4% (1.7ms) | Total: 0.4% (1.7ms) | Samples: 1

**Called by:**
- `optimizeNames` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/yauzl@3.3.0/node_modules/yauzl/fd-slicer.js:60` | Self: 0.4% (1.7ms) | Total: 0.4% (1.7ms) | Samples: 1

**Called by:**
- `anonymous` (1)

### `readBlockScalar`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs` | Self: 0.4% (1.7ms) | Total: 0.4% (1.7ms) | Samples: 1

**Called by:**
- `composeNode` (1)

### `call`
`[native code]` | Self: 0.4% (1.7ms) | Total: 0.4% (1.7ms) | Samples: 1

**Called by:**
- `bound call` (1)

### `_addVocabularies`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js` | Self: 0.4% (1.7ms) | Total: 0.4% (1.7ms) | Samples: 1

**Called by:**
- `Ajv` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDOMStringList.js` | Self: 0.4% (1.7ms) | Total: 0.4% (1.7ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `dispatchEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:140` | Self: 0.4% (1.7ms) | Total: 0.4% (1.7ms) | Samples: 1

**Called by:**
- `onTextDelta` (1)

### `parse`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/fast-uri@3.1.0/node_modules/fast-uri/index.js:250` | Self: 0.4% (1.7ms) | Total: 0.4% (1.7ms) | Samples: 1

**Called by:**
- `getFullPath` (1)

### `copyDataProperties`
`[native code]` | Self: 0.4% (1.7ms) | Total: 0.4% (1.7ms) | Samples: 1

**Called by:**
- `object` (1)

### `push`
`[native code]` | Self: 0.4% (1.7ms) | Total: 0.4% (1.7ms) | Samples: 1

**Called by:**
- `str` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/tar@7.5.13/node_modules/tar/dist/esm/index.min.js:3` | Self: 0.4% (1.7ms) | Total: 0.4% (1.7ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/mime@3.0.0/node_modules/mime/types/standard.js:1` | Self: 0.3% (1.6ms) | Total: 0.3% (1.6ms) | Samples: 1

**Called by:**
- `anonymous` (1)

### `trackDuplicateToolCall`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts` | Self: 0.3% (1.6ms) | Total: 0.3% (1.6ms) | Samples: 1

**Called by:**
- `trackToolLifecycle` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/any-base@1.1.0/node_modules/any-base/src/converter.js:73` | Self: 0.3% (1.6ms) | Total: 0.3% (1.6ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `async runTurn`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/run-turn.ts` | Self: 0.3% (1.5ms) | Total: 0.3% (1.5ms) | Samples: 1

**Called by:**
- `async runTurn` (1)

### `ZodType`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@3.25.76/node_modules/zod/v3/types.js:278` | Self: 0.3% (1.5ms) | Total: 0.3% (1.5ms) | Samples: 1

**Called by:**
- `ZodUnion` (1)

### `OpenAI`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs` | Self: 0.3% (1.5ms) | Total: 0.3% (1.5ms) | Samples: 1

**Called by:**
- `OpenAICompletionsChatProvider` (1)

### `ChatKit`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/beta/chatkit/chatkit.mjs:9` | Self: 0.3% (1.5ms) | Total: 0.3% (1.5ms) | Samples: 1

**Called by:**
- `Beta` (1)

### `params`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/required.js` | Self: 0.3% (1.4ms) | Total: 0.3% (1.4ms) | Samples: 1

**Called by:**
- `extraErrorProps` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/enum.js:32` | Self: 0.3% (1.4ms) | Total: 0.3% (1.4ms) | Samples: 1

**Called by:**
- `map` (1)

### `_isoDateTime`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js` | Self: 0.3% (1.4ms) | Total: 0.3% (1.4ms) | Samples: 1

**Called by:**
- `(module)` (1)

### `init`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:7` | Self: 0.3% (1.4ms) | Total: 0.3% (1.4ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `withoutBackgroundDescription`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/shell/bash.ts` | Self: 0.3% (1.4ms) | Total: 0.3% (1.4ms) | Samples: 1

**Called by:**
- `BashTool` (1)

### `flattenRef`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js` | Self: 0.3% (1.4ms) | Total: 0.3% (1.4ms) | Samples: 1

**Called by:**
- `finalize` (1)

### `Graders`
`[native code]` | Self: 0.3% (1.4ms) | Total: 0.3% (1.4ms) | Samples: 1

**Called by:**
- `Alpha` (1)

### `require`
`[native code]` | Self: 0.3% (1.4ms) | Total: 54.8% (230.6ms) | Samples: 1

**Called by:**
- `bound require` (146)

**Calls:**
- `anonymous` (145)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:257` | Self: 0.3% (1.3ms) | Total: 0.3% (1.3ms) | Samples: 1

**Called by:**
- `async withProviderRequestAuth` (1)

### `estimateTokensForMessage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:47` | Self: 0.3% (1.3ms) | Total: 49.8% (209.2ms) | Samples: 1

**Called by:**
- `estimateTokensForMessages` (139)

**Calls:**
- `estimateTokens` (60)
- `estimateTokensForContentPart` (58)
- `estimateTokensForContentPart` (20)

### `coerceAndCheckDataType`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/dataType.js:41` | Self: 0.3% (1.3ms) | Total: 0.3% (1.3ms) | Samples: 1

**Called by:**
- `typeAndKeywords` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/fast-sha256@1.3.0/node_modules/fast-sha256/sha256.js` | Self: 0.3% (1.3ms) | Total: 0.3% (1.3ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `_toPrimitive`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js` | Self: 0.3% (1.3ms) | Total: 0.3% (1.3ms) | Samples: 1

**Called by:**
- `_toPropertyKey` (1)

### `stringSplitFast`
`[native code]` | Self: 0.3% (1.3ms) | Total: 0.3% (1.3ms) | Samples: 1

**Called by:**
- `buildPromptPlan` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:388` | Self: 0.3% (1.3ms) | Total: 0.3% (1.3ms) | Samples: 1

**Called by:**
- `init` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/util.js` | Self: 0.3% (1.3ms) | Total: 0.3% (1.3ms) | Samples: 1

**Called by:**
- `get value` (1)

### `next`
`[native code]` | Self: 0.3% (1.3ms) | Total: 0.3% (1.3ms) | Samples: 1

**Called by:**
- `estimateTokens` (1)

### `errorObjectCode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js` | Self: 0.3% (1.3ms) | Total: 0.3% (1.3ms) | Samples: 1

**Called by:**
- `reportError` (1)

### `structuredClone`
`[native code]` | Self: 0.3% (1.3ms) | Total: 0.3% (1.3ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `node:crypto`
`node:crypto:74` | Self: 0.3% (1.2ms) | Total: 0.3% (1.2ms) | Samples: 1

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js` | Self: 0.2% (1.2ms) | Total: 0.2% (1.2ms) | Samples: 1

**Called by:**
- `anonymous` (1)

### `providerForCapabilityProbe`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:374` | Self: 0.2% (1.2ms) | Total: 0.2% (1.2ms) | Samples: 1

**Called by:**
- `resolveModelCapabilities` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/get-intrinsic@1.3.0/node_modules/get-intrinsic/index.js:57` | Self: 0.0% (0us) | Total: 0.3% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `internal:streams/lazy_transform`
`internal:streams/lazy_transform:2` | Self: 0.0% (0us) | Total: 0.6% (2.8ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `addMetaSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:243` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `forEach` (1)

**Calls:**
- `addSchema` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:6` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `Beta`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/beta/beta.mjs:15` | Self: 0.0% (0us) | Total: 0.3% (1.5ms) | Samples: 0

**Called by:**
- `OpenAI` (1)

**Calls:**
- `ChatKit` (1)

### `allErrorsMode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/required.js:43` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `code` (1)

**Calls:**
- `checkReportMissingProp` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:16` | Self: 0.0% (0us) | Total: 0.3% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/baseexternalclient.js:20` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `groupKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:200` | Self: 0.0% (0us) | Total: 2.2% (9.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (6)

**Calls:**
- `iterateKeywords` (6)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/crypto/crypto.js:33` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `object`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:581` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `ZodObject` (1)

### `internal:streams/operators`
`internal:streams/operators:2` | Self: 0.0% (0us) | Total: 0.2% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `checkReportMissingProp`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/code.js:10` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `allErrorsMode` (1)

**Calls:**
- `if` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png.js:5` | Self: 0.0% (0us) | Total: 1.1% (5.0ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `bound require` (2)

### `async runModeC`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:665` | Self: 0.0% (0us) | Total: 1.8% (7.9ms) | Samples: 0

**Called by:**
- `async runModeC` (5)

**Calls:**
- `from` (5)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js:494` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `init` (1)

**Calls:**
- `init` (1)

### `parseExpression`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:577` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `parseNodes` (1)

**Calls:**
- `parseInlineIf` (1)

### `parseInlineIf`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:581` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `parseExpression` (1)

**Calls:**
- `parseOr` (1)

### `logLlmRequest`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:403` | Self: 0.0% (0us) | Total: 11.0% (46.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (31)

**Calls:**
- `buildLlmRequestMetadata` (31)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/xml2js.js:39` | Self: 0.0% (0us) | Total: 1.7% (7.1ms) | Samples: 0

**Called by:**
- `anonymous` (5)

**Calls:**
- `(anonymous)` (4)
- `(anonymous)` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:30` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `if`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:466` | Self: 0.0% (0us) | Total: 0.6% (2.8ms) | Samples: 0

**Called by:**
- `checkReportMissingProp` (1)
- `coerceAndCheckDataType` (1)

**Calls:**
- `code` (2)

### `Alpha`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/fine-tuning/alpha/alpha.mjs:8` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `FineTuning` (1)

**Calls:**
- `Graders` (1)

### `resolveRuntimeProvider`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:120` | Self: 0.0% (0us) | Total: 0.9% (4.1ms) | Samples: 0

**Called by:**
- `tryResolvedProviderConfig` (3)

**Calls:**
- `resolveModelCapabilities` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/define-properties@1.2.1/node_modules/define-properties/index.js:8` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/call-bind@1.0.9/node_modules/call-bind/index.js:3` | Self: 0.0% (0us) | Total: 0.9% (4.0ms) | Samples: 0

**Called by:**
- `anonymous` (3)

**Calls:**
- `bound require` (3)

### `async chat`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:82` | Self: 0.0% (0us) | Total: 11.7% (49.4ms) | Samples: 0

**Called by:**
- `async chatWithRetry` (31)

**Calls:**
- `async chatOnce` (31)

### `preflightToolCall`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:202` | Self: 0.0% (0us) | Total: 2.6% (10.9ms) | Samples: 0

**Called by:**
- `map` (7)

**Calls:**
- `validateExecutableToolArgs` (7)

### `parseAgentProfileYaml`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:85` | Self: 0.0% (0us) | Total: 0.2% (1.2ms) | Samples: 0

**Called by:**
- `finalizeRawAgentProfileSource` (1)

**Calls:**
- `(anonymous)` (1)

### `error`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:367` | Self: 0.0% (0us) | Total: 0.7% (3.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)
- `fail` (1)

**Calls:**
- `_error` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-logging-utils@1.1.3/node_modules/google-logging-utils/build/src/index.js:30` | Self: 0.0% (0us) | Total: 0.3% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `compile`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:997` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `compile` (1)

**Calls:**
- `compileRoot` (1)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:208` | Self: 0.0% (0us) | Total: 2.6% (10.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (7)

**Calls:**
- `async runToolCallBatch` (7)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/implementation.js:3` | Self: 0.0% (0us) | Total: 0.7% (2.9ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:131` | Self: 0.0% (0us) | Total: 11.7% (49.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (31)

**Calls:**
- `async chatWithRetry` (31)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:579` | Self: 0.0% (0us) | Total: 16.1% (67.9ms) | Samples: 0

**Called by:**
- `async beforeStep` (45)

**Calls:**
- `async beforeStep` (45)

### `peekToken`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:42` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `parseNot` (1)

**Calls:**
- `nextToken` (1)

### `objectProcessor`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/json-schema-processors.js:287` | Self: 0.0% (0us) | Total: 0.8% (3.6ms) | Samples: 0

**Called by:**
- `process` (2)

**Calls:**
- `process` (2)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:69` | Self: 0.0% (0us) | Total: 16.1% (67.9ms) | Samples: 0

**Called by:**
- `async executeLoopStep` (45)

**Calls:**
- `async beforeStep` (45)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLStringWriter.js:35` | Self: 0.0% (0us) | Total: 0.5% (2.4ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `(anonymous)` (2)

### `get value`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/util.js:33` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/jwsSign.js:18` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/read.ts:172` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `ReadTool` (1)

**Calls:**
- `toInputJsonSchema` (1)

### `processTicksAndRejections`
`[native code]` | Self: 0.0% (0us) | Total: 87.8% (368.9ms) | Samples: 0

**Calls:**
- `(anonymous)` (238)

### `async runToolCallBatch`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:122` | Self: 0.0% (0us) | Total: 2.6% (10.9ms) | Samples: 0

**Called by:**
- `async executeLoopStep` (7)

**Calls:**
- `async runToolCallBatch` (7)

### `ZodNumber`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `_number` (1)

**Calls:**
- `init` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:33` | Self: 0.0% (0us) | Total: 0.3% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:6` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `Ajv` (1)

### `compile`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:1023` | Self: 0.0% (0us) | Total: 0.8% (3.5ms) | Samples: 0

**Called by:**
- `_compile` (2)

**Calls:**
- `parseAsRoot` (1)
- `compile` (1)

### `composeNode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2537` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `readDocument` (1)

**Calls:**
- `readBlockMapping` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:24` | Self: 0.0% (0us) | Total: 0.2% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/externalclient.js:17` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `code`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:439` | Self: 0.0% (0us) | Total: 12.4% (52.2ms) | Samples: 0

**Called by:**
- `block` (20)
- `code` (6)
- `func` (6)
- `if` (2)

**Calls:**
- `(anonymous)` (8)
- `(anonymous)` (8)
- `code` (6)
- `(anonymous)` (6)
- `keywordCode` (3)
- `forEach` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)

### `internal:fs/streams`
`internal:fs/streams:2` | Self: 0.0% (0us) | Total: 0.2% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `record`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/usage/index.ts:43` | Self: 0.0% (0us) | Total: 0.6% (2.6ms) | Samples: 0

**Called by:**
- `async (anonymous)` (2)

**Calls:**
- `emitStatusUpdated` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gaxios@7.1.4/node_modules/gaxios/build/cjs/src/gaxios.js:22` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/xml2js.js:10` | Self: 0.0% (0us) | Total: 1.3% (5.8ms) | Samples: 0

**Called by:**
- `(anonymous)` (4)

**Calls:**
- `bound require` (4)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/parser-sync.js:13` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `trackLoopTelemetry`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:713` | Self: 0.0% (0us) | Total: 0.3% (1.6ms) | Samples: 0

**Called by:**
- `emitLiveEvent` (1)

**Calls:**
- `trackToolLifecycle` (1)

### `optimizeNames`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:228` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `optimizeNames` (1)

**Calls:**
- `optimizeNames` (1)

### `validateFunctionCode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:21` | Self: 0.0% (0us) | Total: 2.1% (9.1ms) | Samples: 0

**Called by:**
- `compileSchema` (6)

**Calls:**
- `topSchemaObjCode` (6)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:19` | Self: 0.0% (0us) | Total: 0.5% (2.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `bound require` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/get-proto@1.0.1/node_modules/get-proto/Object.getPrototypeOf.js:3` | Self: 0.0% (0us) | Total: 0.3% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `ZodObject`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `object` (1)

**Calls:**
- `init` (1)

### `internal:streams/transform`
`internal:streams/transform:2` | Self: 0.0% (0us) | Total: 0.6% (2.8ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/builder.js:7` | Self: 0.0% (0us) | Total: 1.3% (5.8ms) | Samples: 0

**Called by:**
- `(anonymous)` (4)

**Calls:**
- `bound require` (4)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:786` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `_isoDateTime` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png.js:7` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/get-intrinsic@1.3.0/node_modules/get-intrinsic/index.js:244` | Self: 0.0% (0us) | Total: 0.2% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:19` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `nextToken`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/lexer.js:203` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `nextToken` (1)

**Calls:**
- `[Symbol.match]` (1)

### `_addSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:461` | Self: 0.0% (0us) | Total: 2.2% (9.4ms) | Samples: 0

**Called by:**
- `compile` (6)

**Calls:**
- `validateSchema` (6)

### `loadDocuments`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2784` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `load$1` (1)

**Calls:**
- `readDocument` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/2019.js:6` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:11` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `keywordCode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:464` | Self: 0.0% (0us) | Total: 4.0% (17.1ms) | Samples: 0

**Called by:**
- `(anonymous)` (8)
- `code` (3)

**Calls:**
- `code` (4)
- `inlineRefSchema` (2)
- `code` (1)
- `validateUnion` (1)
- `code` (1)
- `callRootRef` (1)
- `code` (1)

### `forEach`
`[native code]` | Self: 0.0% (0us) | Total: 0.7% (3.1ms) | Samples: 0

**Called by:**
- `code` (1)
- `addMetaSchema2020` (1)

**Calls:**
- `(anonymous)` (1)
- `addMetaSchema` (1)

### `_compileMetaSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:483` | Self: 0.0% (0us) | Total: 2.2% (9.4ms) | Samples: 0

**Called by:**
- `_compileSchemaEnv` (6)

**Calls:**
- `compileSchema` (5)
- `compileSchema` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDOMConfiguration.js:7` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gifwrap@0.10.1/node_modules/gifwrap/src/index.js:3` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLWriterBase.js:428` | Self: 0.0% (0us) | Total: 0.2% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `(anonymous)` (1)

### `Ajv`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:113` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `Ajv` (1)

**Calls:**
- `_addVocabularies` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png-sync.js:3` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/index.js:15` | Self: 0.0% (0us) | Total: 0.3% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `subschema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:438` | Self: 0.0% (0us) | Total: 2.5% (10.6ms) | Samples: 0

**Called by:**
- `applyPropertySchema` (4)
- `inlineRefSchema` (2)
- `(anonymous)` (1)

**Calls:**
- `subschemaCode` (7)

### `code`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/applicator/properties.js:33` | Self: 0.0% (0us) | Total: 1.5% (6.3ms) | Samples: 0

**Called by:**
- `keywordCode` (4)

**Calls:**
- `applyPropertySchema` (4)

### `update`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:57` | Self: 0.0% (0us) | Total: 0.3% (1.5ms) | Samples: 0

**Called by:**
- `createPerfAgent` (1)

**Calls:**
- `get hasProvider` (1)

### `process`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:60` | Self: 0.0% (0us) | Total: 1.7% (7.2ms) | Samples: 0

**Called by:**
- `objectProcessor` (2)
- `toJSONSchema` (1)
- `arrayProcessor` (1)

**Calls:**
- `objectProcessor` (2)
- `arrayProcessor` (2)

### `buildPromptPlan`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/prompt-plan/builder.ts:336` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `generateOptions` (1)

**Calls:**
- `stringSplitFast` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDOMStringList.js:28` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `(anonymous)` (1)

### `async chatOnce`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:95` | Self: 0.0% (0us) | Total: 10.7% (45.1ms) | Samples: 0

**Called by:**
- `async chatOnce` (29)

**Calls:**
- `applyCompletionBudget` (29)

### `OpenAI`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:101` | Self: 0.0% (0us) | Total: 0.3% (1.5ms) | Samples: 0

**Called by:**
- `OpenAICompletionsChatProvider` (1)

**Calls:**
- `Beta` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:5` | Self: 0.0% (0us) | Total: 0.6% (2.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `bound require` (2)

### `node:fs/promises`
`node:fs/promises:2` | Self: 0.0% (0us) | Total: 0.5% (2.5ms) | Samples: 0

**Calls:**
- `anonymous` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/loaders.js:5` | Self: 0.0% (0us) | Total: 0.3% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `parseOr`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:597` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `parseInlineIf` (1)

**Calls:**
- `parseAnd` (1)

### `_number`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js:302` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `ZodNumber` (1)

### `initializeBuiltinTools`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/tool/index.ts:361` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `update` (1)

**Calls:**
- `ReadTool` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:27` | Self: 0.0% (0us) | Total: 0.7% (3.0ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/es-abstract@1.24.2/node_modules/es-abstract/2024/Number/toString.js:4` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/jws@4.0.1/node_modules/jws/index.js:2` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDOMConfiguration.js:64` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `(anonymous)` (1)

### `errorObject`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:94` | Self: 0.0% (0us) | Total: 0.7% (3.2ms) | Samples: 0

**Called by:**
- `reportError` (2)

**Calls:**
- `extraErrorProps` (1)
- `extraErrorProps` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/draft7.js:3` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:1632` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `_number` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:4` | Self: 0.0% (0us) | Total: 0.9% (4.0ms) | Samples: 0

**Called by:**
- `(anonymous)` (3)

**Calls:**
- `bound require` (3)

### `async runTurn`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:532` | Self: 0.0% (0us) | Total: 0.3% (1.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `createProvider` (1)

### `ZodUnion`
`[native code]` | Self: 0.0% (0us) | Total: 0.3% (1.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `ZodType` (1)

### `async runTurn`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:539` | Self: 0.0% (0us) | Total: 2.4% (10.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (7)

**Calls:**
- `async runTurn` (7)

### `internal:streams/duplex`
`internal:streams/duplex:2` | Self: 0.0% (0us) | Total: 0.6% (2.8ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `get tokenCountWithPending`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:247` | Self: 0.0% (0us) | Total: 3.9% (16.5ms) | Samples: 0

**Called by:**
- `get shouldBlock` (6)
- `get shouldCompact` (5)

**Calls:**
- `get tokenCountWithPending` (11)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js:903` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `init` (1)

**Calls:**
- `get value` (1)

### `async runTurn`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/run-turn.ts:46` | Self: 0.0% (0us) | Total: 2.4% (10.3ms) | Samples: 0

**Called by:**
- `async runTurn` (7)

**Calls:**
- `async runTurn` (6)
- `async runTurn` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/parser.js:9` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/any-base@1.1.0/node_modules/any-base/src/converter.js:33` | Self: 0.0% (0us) | Total: 0.3% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:23` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/getToken.js:17` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `toJSONSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/json-schema-processors.js:602` | Self: 0.0% (0us) | Total: 0.4% (1.8ms) | Samples: 0

**Called by:**
- `toInputJsonSchema` (1)

**Calls:**
- `process` (1)

### `map`
`[native code]` | Self: 0.0% (0us) | Total: 3.6% (15.3ms) | Samples: 0

**Called by:**
- `async runToolCallBatch` (7)
- `loadAgentProfilesFromSources` (2)
- `code` (1)

**Calls:**
- `preflightToolCall` (7)
- `finalizeRawAgentProfileSource` (2)
- `(anonymous)` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/web/fetch-url.ts:62` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `object` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLStringWriter.js:7` | Self: 0.0% (0us) | Total: 0.5% (2.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `bound require` (2)

### `finalize`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:296` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `toInputJsonSchema` (1)

**Calls:**
- `flattenRef` (1)

### `inlineRefSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js:38` | Self: 0.0% (0us) | Total: 0.6% (2.8ms) | Samples: 0

**Called by:**
- `keywordCode` (2)

**Calls:**
- `subschema` (2)

### `code`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/enum.js:32` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `keywordCode` (1)

**Calls:**
- `map` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/standardwebhooks@1.0.0/node_modules/standardwebhooks/dist/index.js:6` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:199` | Self: 0.0% (0us) | Total: 1.9% (8.0ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `recordStepUsage` (2)

### `_int`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js:319` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `ZodNumberFormat` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@jimp+plugin-hash@1.6.1/node_modules/@jimp/plugin-hash/dist/esm/index.js:11` | Self: 0.0% (0us) | Total: 0.3% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (1)

### `Ajv`
`[native code]` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `Ajv` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/index.js:31` | Self: 0.0% (0us) | Total: 3.9% (16.5ms) | Samples: 0

**Calls:**
- `bound require` (10)

### `async beforeStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:273` | Self: 0.0% (0us) | Total: 16.1% (67.9ms) | Samples: 0

**Called by:**
- `async (anonymous)` (45)

**Calls:**
- `async beforeStep` (30)
- `async beforeStep` (6)
- `async beforeStep` (5)
- `async beforeStep` (4)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/aos/EncodeForRegExpEscape.js:3` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:192` | Self: 0.0% (0us) | Total: 2.9% (12.5ms) | Samples: 0

**Called by:**
- `code` (8)

**Calls:**
- `groupKeywords` (6)
- `groupKeywords` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/tokenHandler.js:4` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `node:events`
`node:events:9` | Self: 0.0% (0us) | Total: 0.5% (2.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `compile`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:518` | Self: 0.0% (0us) | Total: 0.8% (3.5ms) | Samples: 0

**Called by:**
- `render` (2)

**Calls:**
- `_compile` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/parser.js:385` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `(anonymous)` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:4` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `async main`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:699` | Self: 0.0% (0us) | Total: 1.8% (7.9ms) | Samples: 0

**Called by:**
- `async main` (5)

**Calls:**
- `async runModeC` (5)

### `getSchemaRefs`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/resolve.js:100` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `_addSchema` (1)

**Calls:**
- `getFullPath` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:242` | Self: 0.0% (0us) | Total: 1.0% (4.2ms) | Samples: 0

**Called by:**
- `anonymous` (3)

**Calls:**
- `(anonymous)` (2)
- `(anonymous)` (1)

### `AskUserQuestionTool`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/collaboration/ask-user.ts:92` | Self: 0.0% (0us) | Total: 0.4% (1.8ms) | Samples: 0

**Called by:**
- `initializeBuiltinTools` (1)

**Calls:**
- `(anonymous)` (1)

### `async chatWithRetry`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/retry.ts:37` | Self: 0.0% (0us) | Total: 11.7% (49.4ms) | Samples: 0

**Called by:**
- `async executeLoopStep` (31)

**Calls:**
- `async chatWithRetry` (31)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gaxios@7.1.4/node_modules/gaxios/build/cjs/src/index.js:31` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `parseAnd`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:605` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `parseOr` (1)

**Calls:**
- `parseNot` (1)

### `compile`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:159` | Self: 0.0% (0us) | Total: 2.2% (9.4ms) | Samples: 0

**Called by:**
- `validateExecutableToolArgs` (6)

**Calls:**
- `_addSchema` (6)

### `checkAutoCompaction`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:313` | Self: 0.0% (0us) | Total: 1.8% (7.9ms) | Samples: 0

**Called by:**
- `async beforeStep` (5)

**Calls:**
- `get shouldCompact` (5)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/zlib/inflate.js:26` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `async generate`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:366` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `async withProviderRequestAuth` (1)

**Calls:**
- `async (anonymous)` (1)

### `isTransforming`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:398` | Self: 0.0% (0us) | Total: 0.4% (1.8ms) | Samples: 0

**Called by:**
- `process` (1)

**Calls:**
- `isTransforming` (1)

### `render`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:440` | Self: 0.0% (0us) | Total: 0.8% (3.5ms) | Samples: 0

**Called by:**
- `BashTool` (1)
- `(module)` (1)

**Calls:**
- `compile` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/picomatch@4.0.4/node_modules/picomatch/index.js:3` | Self: 0.0% (0us) | Total: 2.8% (11.9ms) | Samples: 0

**Calls:**
- `bound require` (2)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/read.ts:163` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `render` (1)

### `iterateKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:219` | Self: 0.0% (0us) | Total: 2.9% (12.5ms) | Samples: 0

**Called by:**
- `groupKeywords` (6)
- `groupKeywords` (2)

**Calls:**
- `block` (8)

### `trackToolLifecycle`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:726` | Self: 0.0% (0us) | Total: 0.3% (1.6ms) | Samples: 0

**Called by:**
- `trackLoopTelemetry` (1)

**Calls:**
- `trackDuplicateToolCall` (1)

### `nextToken`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:36` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `peekToken` (1)

**Calls:**
- `nextToken` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gcp-metadata@8.1.2/node_modules/gcp-metadata/build/src/index.js:67` | Self: 0.0% (0us) | Total: 0.3% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:4` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:4` | Self: 0.0% (0us) | Total: 1.5% (6.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (4)

**Calls:**
- `bound require` (4)

### `_defineProperties`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js:3` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `_createClass` (1)

**Calls:**
- `_toPropertyKey` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:70` | Self: 0.0% (0us) | Total: 2.1% (9.1ms) | Samples: 0

**Called by:**
- `code` (6)

**Calls:**
- `typeAndKeywords` (5)
- `typeAndKeywords` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/aos/EncodeForRegExpEscape.js:16` | Self: 0.0% (0us) | Total: 0.3% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `node:http`
`node:http:2` | Self: 0.0% (0us) | Total: 3.5% (14.7ms) | Samples: 0

**Called by:**
- `anonymous` (3)

**Calls:**
- `anonymous` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:6` | Self: 0.0% (0us) | Total: 0.3% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `Ajv`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:114` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `Ajv2020` (1)

**Calls:**
- `_addDefaultMetaSchema` (1)

### `_addDefaultMetaSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/2020.js:29` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `Ajv` (1)

**Calls:**
- `addMetaSchema2020` (1)

### `recordStepUsage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/run-turn.ts:72` | Self: 0.0% (0us) | Total: 1.9% (8.0ms) | Samples: 0

**Called by:**
- `async executeLoopStep` (2)

**Calls:**
- `addUsage` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/fast-sha256@1.3.0/node_modules/fast-sha256/sha256.js:15` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `(anonymous)` (1)

### `internal:stream`
`internal:stream:2` | Self: 0.0% (0us) | Total: 0.2% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `addMetaSchema2020`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/refs/json-schema-2020-12/index.js:23` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `_addDefaultMetaSchema` (1)

**Calls:**
- `forEach` (1)

### `optimize`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:597` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `compileSchema` (1)

**Calls:**
- `optimizeNames` (1)

### `get hasProvider`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:94` | Self: 0.0% (0us) | Total: 0.3% (1.5ms) | Samples: 0

**Called by:**
- `update` (1)

**Calls:**
- `tryResolvedProviderConfig` (1)

### `computeCompletionBudgetCap`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/completion-budget.ts:72` | Self: 0.0% (0us) | Total: 10.7% (45.1ms) | Samples: 0

**Called by:**
- `applyCompletionBudget` (29)

**Calls:**
- `estimateTokensForMessages` (29)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:5` | Self: 0.0% (0us) | Total: 0.3% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `typeAndKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:127` | Self: 0.0% (0us) | Total: 0.6% (2.6ms) | Samples: 0

**Called by:**
- `subSchemaObjCode` (1)
- `(anonymous)` (1)

**Calls:**
- `coerceAndCheckDataType` (1)
- `coerceAndCheckDataType` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/googleToken.js:18` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `createPerfAgent`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:298` | Self: 0.0% (0us) | Total: 1.8% (7.9ms) | Samples: 0

**Called by:**
- `spawnChild` (5)

**Calls:**
- `update` (4)
- `update` (1)

### `OpenAICompletionsChatProvider`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/openai-completions.ts:405` | Self: 0.0% (0us) | Total: 1.0% (4.4ms) | Samples: 0

**Called by:**
- `createProvider` (3)

**Calls:**
- `OpenAI` (1)
- `OpenAI` (1)
- `OpenAI` (1)

### `get shouldCompact`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:255` | Self: 0.0% (0us) | Total: 1.8% (7.9ms) | Samples: 0

**Called by:**
- `checkAutoCompaction` (5)

**Calls:**
- `get tokenCountWithPending` (5)

### `bound call`
`[native code]` | Self: 0.0% (0us) | Total: 0.8% (3.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)
- `internal:util/inspect` (1)

**Calls:**
- `call` (1)
- `filter` (1)

### `func`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:587` | Self: 0.0% (0us) | Total: 2.1% (9.1ms) | Samples: 0

**Called by:**
- `validateFunction` (6)

**Calls:**
- `code` (6)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/exif-parser@0.1.12/node_modules/exif-parser/lib/simplify.js:2` | Self: 0.0% (0us) | Total: 0.3% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/define-data-property@1.1.4/node_modules/define-data-property/index.js:8` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/boolSchema.js:4` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/set-function-length@1.2.2/node_modules/set-function-length/index.js:3` | Self: 0.0% (0us) | Total: 0.9% (4.0ms) | Samples: 0

**Called by:**
- `anonymous` (3)

**Calls:**
- `bound require` (3)

### `code`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/required.js:23` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `keywordCode` (1)

**Calls:**
- `allErrorsMode` (1)

### `async runTurn`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/run-turn.ts:93` | Self: 0.0% (0us) | Total: 16.1% (67.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (39)
- `async runTurn` (6)

**Calls:**
- `async executeLoopStep` (45)

### `async beforeStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:577` | Self: 0.0% (0us) | Total: 16.1% (67.9ms) | Samples: 0

**Called by:**
- `async executeLoopStep` (45)

**Calls:**
- `async (anonymous)` (45)

### `defaultMeta`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:29` | Self: 0.0% (0us) | Total: 2.2% (9.4ms) | Samples: 0

**Called by:**
- `validateSchema` (6)

**Calls:**
- `_compileSchemaEnv` (6)

### `createProvider`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/index.ts:24` | Self: 0.0% (0us) | Total: 1.0% (4.4ms) | Samples: 0

**Called by:**
- `resolveModelCapabilities` (2)
- `async runTurn` (1)

**Calls:**
- `OpenAICompletionsChatProvider` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/dynamic/recursiveRef.js:3` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `addSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:235` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `addMetaSchema` (1)

**Calls:**
- `_addSchema` (1)

### `readDocument`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2721` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `loadDocuments` (1)

**Calls:**
- `composeNode` (1)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:397` | Self: 0.0% (0us) | Total: 0.7% (3.0ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)
- `async generate` (1)

**Calls:**
- `onMessagePart` (1)
- `structuredClone` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:373` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `_int` (1)

### `topSchemaObjCode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:62` | Self: 0.0% (0us) | Total: 2.1% (9.1ms) | Samples: 0

**Called by:**
- `validateFunctionCode` (6)

**Calls:**
- `validateFunction` (6)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:20` | Self: 0.0% (0us) | Total: 0.7% (3.2ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:5` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/yauzl@3.3.0/node_modules/yauzl/index.js:3` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `ws`
`ws:3` | Self: 0.0% (0us) | Total: 3.5% (14.7ms) | Samples: 0

**Calls:**
- `anonymous` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:396` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `init` (1)

**Calls:**
- `init` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/index.js:65` | Self: 0.0% (0us) | Total: 1.3% (5.8ms) | Samples: 0

**Called by:**
- `anonymous` (4)

**Calls:**
- `(anonymous)` (3)
- `(anonymous)` (1)

### `get modelCapabilities`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:133` | Self: 0.0% (0us) | Total: 0.6% (2.6ms) | Samples: 0

**Called by:**
- `emitStatusUpdated` (2)

**Calls:**
- `tryResolvedProviderConfig` (2)

### `_toPropertyKey`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js:5` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `_defineProperties` (1)

**Calls:**
- `_toPrimitive` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/computeclient.js:19` | Self: 0.0% (0us) | Total: 0.2% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/builder.js:127` | Self: 0.0% (0us) | Total: 1.3% (5.8ms) | Samples: 0

**Called by:**
- `anonymous` (4)

**Calls:**
- `(anonymous)` (4)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/xml2js.js:12` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/for-each@0.3.5/node_modules/for-each/index.js:3` | Self: 0.0% (0us) | Total: 0.3% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `extraErrorProps`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:115` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `errorObject` (1)

**Calls:**
- `str` (1)

### `groupKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:208` | Self: 0.0% (0us) | Total: 0.7% (2.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `iterateKeywords` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/inflate.js:4` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `bound require`
`[native code]` | Self: 0.0% (0us) | Total: 54.8% (230.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (10)
- `(anonymous)` (5)
- `(anonymous)` (4)
- `(anonymous)` (4)
- `(anonymous)` (4)
- `(anonymous)` (4)
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

**Calls:**
- `require` (146)

### `parseNodes`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:988` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `parseAsRoot` (1)

**Calls:**
- `parseExpression` (1)

### `typeAndKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:128` | Self: 0.0% (0us) | Total: 4.0% (17.1ms) | Samples: 0

**Called by:**
- `subSchemaObjCode` (6)
- `(anonymous)` (5)

**Calls:**
- `schemaKeywords` (8)
- `schemaKeywords` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:5` | Self: 0.0% (0us) | Total: 0.7% (3.0ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `reportTypeError`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/dataType.js:185` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `reportError` (1)

### `applyCompletionBudget`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/completion-budget.ts:105` | Self: 0.0% (0us) | Total: 10.7% (45.1ms) | Samples: 0

**Called by:**
- `async chatOnce` (29)

**Calls:**
- `computeCompletionBudgetCap` (29)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/code.js:12` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `code` (1)

**Calls:**
- `error` (1)

### `readBlockMapping`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2260` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `composeNode` (1)

**Calls:**
- `composeNode` (1)

### `from`
`[native code]` | Self: 0.0% (0us) | Total: 1.8% (7.9ms) | Samples: 0

**Called by:**
- `async runModeC` (5)

**Calls:**
- `spawnChild` (5)

### `get shouldBlock`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:259` | Self: 0.0% (0us) | Total: 2.0% (8.5ms) | Samples: 0

**Called by:**
- `async beforeStep` (6)

**Calls:**
- `get tokenCountWithPending` (6)

### `filter`
`[native code]` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `bound call` (1)

**Calls:**
- `(anonymous)` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gifwrap@0.10.1/node_modules/gifwrap/src/index.js:7` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `async beforeStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:277` | Self: 0.0% (0us) | Total: 10.7% (45.3ms) | Samples: 0

**Called by:**
- `async beforeStep` (30)

**Calls:**
- `applyObservationMasking` (30)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@jimp+plugin-color@1.6.1/node_modules/@jimp/plugin-color/dist/esm/index.js:12` | Self: 0.0% (0us) | Total: 0.3% (1.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (1)

### `parseAsRoot`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:1005` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `compile` (1)

**Calls:**
- `parseNodes` (1)

### `async main`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:684` | Self: 0.0% (0us) | Total: 1.8% (7.9ms) | Samples: 0

**Called by:**
- `(module)` (5)

**Calls:**
- `async main` (5)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/mime@3.0.0/node_modules/mime/lite.js:4` | Self: 0.0% (0us) | Total: 0.3% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `ZodNumberFormat`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `_int` (1)

**Calls:**
- `init` (1)

### `coerceAndCheckDataType`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/dataType.js:46` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `typeAndKeywords` (1)

**Calls:**
- `if` (1)

### `code`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/limitNumber.js:23` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `keywordCode` (1)

**Calls:**
- `fail` (1)

### `extraErrorProps`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:113` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `errorObject` (1)

**Calls:**
- `params` (1)

### `update`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:62` | Self: 0.0% (0us) | Total: 1.5% (6.4ms) | Samples: 0

**Called by:**
- `createPerfAgent` (4)

**Calls:**
- `initializeBuiltinTools` (2)
- `initializeBuiltinTools` (1)
- `initializeBuiltinTools` (1)

### `block`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:568` | Self: 0.0% (0us) | Total: 7.4% (31.1ms) | Samples: 0

**Called by:**
- `schemaKeywords` (8)
- `iterateKeywords` (8)
- `schemaKeywords` (3)
- `validateUnion` (1)

**Calls:**
- `code` (20)

### `get ReadStream`
`node:fs:578` | Self: 0.0% (0us) | Total: 0.2% (1.2ms) | Samples: 0

**Calls:**
- `anonymous` (1)

### `async afterStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:584` | Self: 0.0% (0us) | Total: 0.6% (2.6ms) | Samples: 0

**Called by:**
- `async executeLoopStep` (2)

**Calls:**
- `async (anonymous)` (2)

### `arrayProcessor`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/json-schema-processors.js:278` | Self: 0.0% (0us) | Total: 0.8% (3.6ms) | Samples: 0

**Called by:**
- `process` (2)

**Calls:**
- `process` (1)
- `process` (1)

### `process`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:83` | Self: 0.0% (0us) | Total: 0.4% (1.8ms) | Samples: 0

**Called by:**
- `arrayProcessor` (1)

**Calls:**
- `isTransforming` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:222` | Self: 0.0% (0us) | Total: 2.9% (12.5ms) | Samples: 0

**Called by:**
- `code` (8)

**Calls:**
- `keywordCode` (8)

### `object`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:579` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `copyDataProperties` (1)

### `getFullPath`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/resolve.js:74` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `getSchemaRefs` (1)

**Calls:**
- `parse` (1)

### `compileRoot`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:963` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `compile` (1)

**Calls:**
- `_emitFuncBegin` (1)

### `node:_http_server`
`node:_http_server:42` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/index.js:4` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:51` | Self: 0.0% (0us) | Total: 16.1% (67.9ms) | Samples: 0

**Called by:**
- `async runTurn` (45)

**Calls:**
- `async executeLoopStep` (45)

### `(anonymous)`
`internal:util/inspect:179` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `filter` (1)

**Calls:**
- `bound call` (1)

### `applyPruning`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:244` | Self: 0.0% (0us) | Total: 1.4% (6.0ms) | Samples: 0

**Called by:**
- `async beforeStep` (4)

**Calls:**
- `get tokenCountWithPending` (4)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/collaboration/ask-user.ts:90` | Self: 0.0% (0us) | Total: 0.4% (1.8ms) | Samples: 0

**Called by:**
- `AskUserQuestionTool` (1)

**Calls:**
- `toInputJsonSchema` (1)

### `generateOptions`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:150` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `async chatOnce` (1)

**Calls:**
- `buildPromptPlan` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:774` | Self: 0.0% (0us) | Total: 1.8% (7.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (5)

**Calls:**
- `async main` (5)

### `async runModeC`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:637` | Self: 0.0% (0us) | Total: 1.8% (7.9ms) | Samples: 0

**Called by:**
- `async main` (5)

**Calls:**
- `async runModeC` (5)

### `safeEmitLive`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:170` | Self: 0.0% (0us) | Total: 0.3% (1.6ms) | Samples: 0

**Called by:**
- `async recordEvent` (1)

**Calls:**
- `emitLiveEvent` (1)

### `async withProviderRequestAuth`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/request-auth.ts:20` | Self: 0.0% (0us) | Total: 11.7% (49.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (33)

**Calls:**
- `(anonymous)` (31)
- `(anonymous)` (1)
- `async generate` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/exif-parser@0.1.12/node_modules/exif-parser/lib/parser.js:5` | Self: 0.0% (0us) | Total: 0.3% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `ReadTool`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/read.ts:174` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `initializeBuiltinTools` (1)

**Calls:**
- `(anonymous)` (1)

### `validateExecutableToolArgs`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:234` | Self: 0.0% (0us) | Total: 2.6% (10.9ms) | Samples: 0

**Called by:**
- `preflightToolCall` (7)

**Calls:**
- `compile` (6)
- `_compileSchemaEnv` (1)

### `internal:util/inspect`
`internal:util/inspect:179` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound call` (1)

### `onTextDelta`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:307` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `onMessagePart` (1)

**Calls:**
- `dispatchEvent` (1)

### `async beforeStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:298` | Self: 0.0% (0us) | Total: 1.8% (7.9ms) | Samples: 0

**Called by:**
- `async beforeStep` (5)

**Calls:**
- `checkAutoCompaction` (5)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:12` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `Ajv2020` (1)

### `validateUnion`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/code.js:115` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `keywordCode` (1)

**Calls:**
- `block` (1)

### `finalizeRawAgentProfileSource`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:67` | Self: 0.0% (0us) | Total: 0.7% (2.9ms) | Samples: 0

**Called by:**
- `map` (2)

**Calls:**
- `parseAgentProfileYaml` (1)
- `parseAgentProfileYaml` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@3.25.76/node_modules/zod/v3/types.js:2357` | Self: 0.0% (0us) | Total: 0.3% (1.5ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `ZodUnion` (1)

### `tryResolvedProviderConfig`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:143` | Self: 0.0% (0us) | Total: 0.9% (4.1ms) | Samples: 0

**Called by:**
- `get modelCapabilities` (2)
- `get hasProvider` (1)

**Calls:**
- `resolveRuntimeProvider` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/any-base@1.1.0/node_modules/any-base/index.js:21` | Self: 0.0% (0us) | Total: 0.3% (1.6ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `(anonymous)` (1)

### `emitStatusUpdated`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:606` | Self: 0.0% (0us) | Total: 0.6% (2.6ms) | Samples: 0

**Called by:**
- `record` (2)

**Calls:**
- `get modelCapabilities` (2)

### `Ajv2020`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/2020.js:11` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `Ajv` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/utif2@4.1.0/node_modules/utif2/UTIF.js:1648` | Self: 0.0% (0us) | Total: 1.1% (4.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (3)

**Calls:**
- `(anonymous)` (3)

### `optimizeNames`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:173` | Self: 0.0% (0us) | Total: 2.5% (10.6ms) | Samples: 0

**Called by:**
- `optimizeNames` (3)
- `optimize` (1)
- `optimizeNames` (1)
- `optimizeNames` (1)

**Calls:**
- `optimizeNames` (3)
- `optimizeNames` (1)
- `optimizeNames` (1)
- `optimizeNames` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/jws@4.0.1/node_modules/jws/lib/sign-stream.js:6` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `subSchemaObjCode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:115` | Self: 0.0% (0us) | Total: 2.5% (10.6ms) | Samples: 0

**Called by:**
- `subschemaCode` (7)

**Calls:**
- `typeAndKeywords` (6)
- `typeAndKeywords` (1)

### `parseAgentProfileYaml`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:76` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `finalizeRawAgentProfileSource` (1)

**Calls:**
- `load$1` (1)

### `async chatWithRetry`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/retry.ts:54` | Self: 0.0% (0us) | Total: 11.7% (49.4ms) | Samples: 0

**Called by:**
- `async chatWithRetry` (31)

**Calls:**
- `async chat` (31)

### `emitLiveEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:694` | Self: 0.0% (0us) | Total: 0.3% (1.6ms) | Samples: 0

**Called by:**
- `safeEmitLive` (1)

**Calls:**
- `trackLoopTelemetry` (1)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:234` | Self: 0.0% (0us) | Total: 0.6% (2.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `async afterStep` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/dynamic/index.js:6` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `validateSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:255` | Self: 0.0% (0us) | Total: 2.2% (9.4ms) | Samples: 0

**Called by:**
- `_addSchema` (6)

**Calls:**
- `defaultMeta` (6)

### `_addSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:451` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `addSchema` (1)

**Calls:**
- `getSchemaRefs` (1)

### `schemaKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:185` | Self: 0.0% (0us) | Total: 1.1% (4.6ms) | Samples: 0

**Called by:**
- `typeAndKeywords` (3)

**Calls:**
- `block` (3)

### `_createClass`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js:4` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `_defineProperties` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js:72` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `_createClass` (1)

### `_compileSchemaEnv`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:473` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `validateExecutableToolArgs` (1)

**Calls:**
- `compileSchema` (1)

### `get tokenCountWithPending`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:146` | Self: 0.0% (0us) | Total: 5.3% (22.5ms) | Samples: 0

**Called by:**
- `get tokenCountWithPending` (11)
- `applyPruning` (4)

**Calls:**
- `estimateTokensForMessages` (15)

### `_compile`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:526` | Self: 0.0% (0us) | Total: 0.8% (3.5ms) | Samples: 0

**Called by:**
- `compile` (2)

**Calls:**
- `compile` (2)

### `optimizeNames`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:229` | Self: 0.0% (0us) | Total: 1.2% (5.3ms) | Samples: 0

**Called by:**
- `optimizeNames` (3)

**Calls:**
- `optimizeNames` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/json-bigint@1.0.0/node_modules/json-bigint/lib/stringify.js:1` | Self: 0.0% (0us) | Total: 0.4% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/jwtclient.js:17` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/index.js:4` | Self: 0.0% (0us) | Total: 1.4% (6.1ms) | Samples: 0

**Called by:**
- `(anonymous)` (4)

**Calls:**
- `bound require` (4)

### `resolveModelCapabilities`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:254` | Self: 0.0% (0us) | Total: 0.9% (4.1ms) | Samples: 0

**Called by:**
- `resolveRuntimeProvider` (3)

**Calls:**
- `createProvider` (2)
- `providerForCapabilityProbe` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/dataType.js:50` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `code` (1)

**Calls:**
- `reportTypeError` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/background/task-output.ts:48` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/types.ts:6` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `object` (1)

### `compileSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:80` | Self: 0.0% (0us) | Total: 2.1% (9.1ms) | Samples: 0

**Called by:**
- `_compileMetaSchema` (5)
- `_compileSchemaEnv` (1)

**Calls:**
- `validateFunctionCode` (6)

### `node:stream`
`node:stream:2` | Self: 0.0% (0us) | Total: 0.2% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:4` | Self: 0.0% (0us) | Total: 0.8% (3.3ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `estimateTokensForMessage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:52` | Self: 0.0% (0us) | Total: 0.8% (3.4ms) | Samples: 0

**Called by:**
- `estimateTokensForMessages` (2)

**Calls:**
- `stringify` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:3` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `internal:streams/compose`
`internal:streams/compose:2` | Self: 0.0% (0us) | Total: 0.2% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `reportError`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:18` | Self: 0.0% (0us) | Total: 1.0% (4.5ms) | Samples: 0

**Called by:**
- `_error` (2)
- `reportTypeError` (1)

**Calls:**
- `errorObject` (2)
- `errorObjectCode` (1)

### `composeNode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2541` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `readBlockMapping` (1)

**Calls:**
- `readBlockScalar` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:551` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `init` (1)

**Calls:**
- `init` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/parser-async.js:8` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:216` | Self: 0.0% (0us) | Total: 10.7% (45.3ms) | Samples: 0

**Called by:**
- `async beforeStep` (30)

**Calls:**
- `applyObservationMasking` (30)

### `toInputJsonSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/support/input-schema.ts:27` | Self: 0.0% (0us) | Total: 0.7% (3.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)
- `(anonymous)` (1)

**Calls:**
- `toJSONSchema` (1)
- `finalize` (1)

### `onMessagePart`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:207` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `async (anonymous)` (1)

**Calls:**
- `onTextDelta` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:8` | Self: 0.0% (0us) | Total: 0.7% (3.0ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/stscredentials.js:19` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `load$1`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2810` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `parseAgentProfileYaml` (1)

**Calls:**
- `loadDocuments` (1)

### `async beforeStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:299` | Self: 0.0% (0us) | Total: 2.0% (8.5ms) | Samples: 0

**Called by:**
- `async beforeStep` (6)

**Calls:**
- `get shouldBlock` (6)

### `subschemaCode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:91` | Self: 0.0% (0us) | Total: 2.5% (10.6ms) | Samples: 0

**Called by:**
- `subschema` (7)

**Calls:**
- `subSchemaObjCode` (7)

### `[Symbol.match]`
`[native code]` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `nextToken` (1)

**Calls:**
- `hasObservableSideEffectsForRegExpMatch` (1)

### `estimateTokensForMessages`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:29` | Self: 0.0% (0us) | Total: 50.6% (212.6ms) | Samples: 0

**Called by:**
- `async (anonymous)` (36)
- `buildLlmRequestMetadata` (31)
- `applyObservationMasking` (30)
- `computeCompletionBudgetCap` (29)
- `get tokenCountWithPending` (15)

**Calls:**
- `estimateTokensForMessage` (139)
- `estimateTokensForMessage` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/utif2@4.1.0/node_modules/utif2/UTIF.js:12` | Self: 0.0% (0us) | Total: 1.1% (4.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (3)

**Calls:**
- `bound require` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/picomatch@4.0.4/node_modules/picomatch/lib/picomatch.js:4` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `compileSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:81` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `_compileMetaSchema` (1)

**Calls:**
- `optimize` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/index.js:9` | Self: 0.0% (0us) | Total: 1.0% (4.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (3)

**Calls:**
- `bound require` (3)

### `BashTool`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/shell/bash.ts:164` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `initializeBuiltinTools` (1)

**Calls:**
- `render` (1)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:156` | Self: 0.0% (0us) | Total: 10.7% (45.3ms) | Samples: 0

**Called by:**
- `applyObservationMasking` (30)

**Calls:**
- `estimateTokensForMessages` (30)

### `schemaKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:190` | Self: 0.0% (0us) | Total: 2.9% (12.5ms) | Samples: 0

**Called by:**
- `typeAndKeywords` (8)

**Calls:**
- `block` (8)

### `validateFunction`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:37` | Self: 0.0% (0us) | Total: 2.1% (9.1ms) | Samples: 0

**Called by:**
- `topSchemaObjCode` (6)

**Calls:**
- `func` (6)

### `node:_http_client`
`node:_http_client:44` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `spawnChild`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:650` | Self: 0.0% (0us) | Total: 1.8% (7.9ms) | Samples: 0

**Called by:**
- `from` (5)

**Calls:**
- `createPerfAgent` (5)

### `applyPropertySchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/applicator/properties.js:45` | Self: 0.0% (0us) | Total: 1.5% (6.3ms) | Samples: 0

**Called by:**
- `code` (4)

**Calls:**
- `subschema` (4)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/code.js:116` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `forEach` (1)

**Calls:**
- `subschema` (1)

### `_compileSchemaEnv`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:471` | Self: 0.0% (0us) | Total: 2.2% (9.4ms) | Samples: 0

**Called by:**
- `defaultMeta` (6)

**Calls:**
- `_compileMetaSchema` (6)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/draft7.js:5` | Self: 0.0% (0us) | Total: 0.2% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/parse.js:33` | Self: 0.0% (0us) | Total: 0.2% (1.2ms) | Samples: 0

**Called by:**
- `parseAgentProfileYaml` (1)

**Calls:**
- `(anonymous)` (1)

### `initializeBuiltinTools`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/tool/index.ts:366` | Self: 0.0% (0us) | Total: 0.7% (3.2ms) | Samples: 0

**Called by:**
- `update` (2)

**Calls:**
- `BashTool` (1)
- `BashTool` (1)

### `initializeBuiltinTools`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/tool/index.ts:378` | Self: 0.0% (0us) | Total: 0.4% (1.8ms) | Samples: 0

**Called by:**
- `update` (1)

**Calls:**
- `AskUserQuestionTool` (1)

### `node:crypto`
`node:crypto:2` | Self: 0.0% (0us) | Total: 0.6% (2.8ms) | Samples: 0

**Calls:**
- `anonymous` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/default.ts:19` | Self: 0.0% (0us) | Total: 0.7% (2.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `loadAgentProfilesFromSources` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:258` | Self: 0.0% (0us) | Total: 11.0% (46.4ms) | Samples: 0

**Called by:**
- `async withProviderRequestAuth` (31)

**Calls:**
- `logLlmRequest` (31)

### `async recordEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:163` | Self: 0.0% (0us) | Total: 0.3% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `safeEmitLive` (1)

### `str`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/code.js:73` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `extraErrorProps` (1)

**Calls:**
- `push` (1)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:423` | Self: 0.0% (0us) | Total: 12.6% (53.1ms) | Samples: 0

**Called by:**
- `(anonymous)` (36)

**Calls:**
- `estimateTokensForMessages` (36)

### `async chatOnce`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:85` | Self: 0.0% (0us) | Total: 11.7% (49.4ms) | Samples: 0

**Called by:**
- `async chat` (31)

**Calls:**
- `async chatOnce` (29)
- `async chatOnce` (1)
- `async chatOnce` (1)

### `_error`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:371` | Self: 0.0% (0us) | Total: 0.7% (3.2ms) | Samples: 0

**Called by:**
- `error` (2)

**Calls:**
- `reportError` (2)

### `async beforeStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:289` | Self: 0.0% (0us) | Total: 1.4% (6.0ms) | Samples: 0

**Called by:**
- `async beforeStep` (4)

**Calls:**
- `applyPruning` (4)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/parse-bmfont-xml@1.1.6/node_modules/parse-bmfont-xml/lib/index.js:1` | Self: 0.0% (0us) | Total: 1.7% (7.1ms) | Samples: 0

**Called by:**
- `(anonymous)` (5)

**Calls:**
- `bound require` (5)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/index.js:7` | Self: 0.0% (0us) | Total: 0.7% (3.0ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:10` | Self: 0.0% (0us) | Total: 0.3% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `loadAgentProfilesFromSources`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:20` | Self: 0.0% (0us) | Total: 0.7% (2.9ms) | Samples: 0

**Called by:**
- `(module)` (2)

**Calls:**
- `map` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:6` | Self: 0.0% (0us) | Total: 0.7% (2.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `bound require` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/exif-parser@0.1.12/node_modules/exif-parser/index.js:1` | Self: 0.0% (0us) | Total: 0.3% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:585` | Self: 0.0% (0us) | Total: 0.6% (2.6ms) | Samples: 0

**Called by:**
- `async afterStep` (2)

**Calls:**
- `record` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/index.js:6` | Self: 0.0% (0us) | Total: 0.3% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `async chatOnce`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:110` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `async chatOnce` (1)

**Calls:**
- `generateOptions` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js:922` | Self: 0.0% (0us) | Total: 0.2% (1.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `anonymous` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLWriterBase.js:16` | Self: 0.0% (0us) | Total: 0.2% (1.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `parseNot`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:613` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `parseAnd` (1)

**Calls:**
- `peekToken` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js:83` | Self: 0.0% (0us) | Total: 0.3% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `(anonymous)` (1)

### `FineTuning`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/fine-tuning/fine-tuning.mjs:17` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `OpenAI` (1)

**Calls:**
- `Alpha` (1)

### `init`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:21` | Self: 0.0% (0us) | Total: 1.6% (6.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)
- `ZodNumberFormat` (1)
- `ZodNumber` (1)
- `(anonymous)` (1)
- `ZodObject` (1)

**Calls:**
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/get-proto@1.0.1/node_modules/get-proto/index.js:4` | Self: 0.0% (0us) | Total: 0.3% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/dataType.js:5` | Self: 0.0% (0us) | Total: 0.3% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `fail`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:348` | Self: 0.0% (0us) | Total: 0.4% (1.7ms) | Samples: 0

**Called by:**
- `code` (1)

**Calls:**
- `error` (1)

### `OpenAI`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:97` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `OpenAICompletionsChatProvider` (1)

**Calls:**
- `FineTuning` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gcp-metadata@8.1.2/node_modules/gcp-metadata/build/src/index.js:65` | Self: 0.0% (0us) | Total: 0.4% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `BashTool`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/shell/bash.ts:165` | Self: 0.0% (0us) | Total: 0.3% (1.4ms) | Samples: 0

**Called by:**
- `initializeBuiltinTools` (1)

**Calls:**
- `withoutBackgroundDescription` (1)

### `async runToolCallBatch`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:126` | Self: 0.0% (0us) | Total: 2.6% (10.9ms) | Samples: 0

**Called by:**
- `async runToolCallBatch` (7)

**Calls:**
- `map` (7)

### `buildLlmRequestMetadata`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:741` | Self: 0.0% (0us) | Total: 11.0% (46.4ms) | Samples: 0

**Called by:**
- `logLlmRequest` (31)

**Calls:**
- `estimateTokensForMessages` (31)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/json-bigint@1.0.0/node_modules/json-bigint/index.js:1` | Self: 0.0% (0us) | Total: 0.4% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

## Files

| Self% | Self | File |
|------:|-----:|------|
| 49.4% | 207.9ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` |
| 35.4% | 148.8ms | `[native code]` |
| 1.9% | 8.0ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/usage.ts` |
| 0.7% | 3.2ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js` |
| 0.6% | 2.9ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts` |
| 0.4% | 1.8ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js` |
| 0.4% | 1.7ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js` |
| 0.4% | 1.7ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js` |
| 0.4% | 1.7ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/yauzl@3.3.0/node_modules/yauzl/fd-slicer.js` |
| 0.4% | 1.7ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs` |
| 0.4% | 1.7ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js` |
| 0.4% | 1.7ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDOMStringList.js` |
| 0.4% | 1.7ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts` |
| 0.4% | 1.7ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/fast-uri@3.1.0/node_modules/fast-uri/index.js` |
| 0.4% | 1.7ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/tar@7.5.13/node_modules/tar/dist/esm/index.min.js` |
| 0.3% | 1.6ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/mime@3.0.0/node_modules/mime/types/standard.js` |
| 0.3% | 1.6ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts` |
| 0.3% | 1.6ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/any-base@1.1.0/node_modules/any-base/src/converter.js` |
| 0.3% | 1.5ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/run-turn.ts` |
| 0.3% | 1.5ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@3.25.76/node_modules/zod/v3/types.js` |
| 0.3% | 1.5ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs` |
| 0.3% | 1.5ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/beta/chatkit/chatkit.mjs` |
| 0.3% | 1.4ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/required.js` |
| 0.3% | 1.4ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/enum.js` |
| 0.3% | 1.4ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js` |
| 0.3% | 1.4ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js` |
| 0.3% | 1.4ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/shell/bash.ts` |
| 0.3% | 1.3ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts` |
| 0.3% | 1.3ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/dataType.js` |
| 0.3% | 1.3ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/fast-sha256@1.3.0/node_modules/fast-sha256/sha256.js` |
| 0.3% | 1.3ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/nodes.js` |
| 0.3% | 1.3ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js` |
| 0.3% | 1.3ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/util.js` |
| 0.3% | 1.3ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js` |
| 0.3% | 1.2ms | `node:crypto` |
| 0.2% | 1.2ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js` |
| 0.2% | 1.2ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts` |
