# CPU Profile

| Duration | Samples | Interval | Functions |
|----------|---------|----------|----------|
| 4.34s | 2846 | 1.0ms | 469 |

**Top 10:** `estimateTokensForMessage` 83.3%, `next` 4.7%, `estimateTokensForContentPart` 4.2%, `anonymous` 2.2%, `(anonymous)` 0.9%, `estimateTokensForContentPart` 0.4%, `estimateTokens` 0.3%, `cloneObject` 0.3%, `stringify` 0.2%, `map` 0.2%

## Hot Functions (Self Time)

| Self% | Self | Total% | Total | Function | Location |
|------:|-----:|-------:|------:|----------|----------|
| 83.3% | 3.61s | 83.6% | 3.62s | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:52` |
| 4.7% | 205.1ms | 4.7% | 205.1ms | `next` | `[native code]` |
| 4.2% | 182.5ms | 4.2% | 182.5ms | `estimateTokensForContentPart` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:59` |
| 2.2% | 96.1ms | 6.8% | 298.6ms | `anonymous` | `[native code]` |
| 0.9% | 43.3ms | 98.8% | 4.28s | `(anonymous)` | `[native code]` |
| 0.4% | 20.9ms | 0.4% | 20.9ms | `estimateTokensForContentPart` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` |
| 0.3% | 16.6ms | 4.9% | 216.9ms | `estimateTokens` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:16` |
| 0.3% | 13.8ms | 0.3% | 13.8ms | `cloneObject` | `[native code]` |
| 0.2% | 12.3ms | 0.2% | 12.3ms | `stringify` | `[native code]` |
| 0.2% | 12.2ms | 0.9% | 39.5ms | `map` | `[native code]` |
| 0.1% | 5.7ms | 0.1% | 5.7ms | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:50` |
| 0.1% | 4.7ms | 0.1% | 4.7ms | `structuredClone` | `[native code]` |
| 0.1% | 4.5ms | 0.1% | 4.5ms | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` |
| 0.0% | 4.3ms | 0.0% | 4.3ms | `countLines` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts` |
| 0.0% | 3.4ms | 0.0% | 3.4ms | `extractTextFromContent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:58` |
| 0.0% | 3.3ms | 1.1% | 49.0ms | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:45` |
| 0.0% | 3.1ms | 0.0% | 3.1ms | `applyPruning` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:265` |
| 0.0% | 2.8ms | 0.1% | 4.6ms | `filter` | `[native code]` |
| 0.0% | 2.6ms | 0.1% | 6.0ms | `maskToolResult` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:102` |
| 0.0% | 1.8ms | 0.0% | 1.8ms | `addRule` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:567` |
| 0.0% | 1.8ms | 0.0% | 1.8ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts` |
| 0.0% | 1.8ms | 0.0% | 1.8ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js:766` |
| 0.0% | 1.8ms | 0.0% | 1.8ms | `emitStatusUpdated` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:612` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `init` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:20` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:68` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `async executeTool` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:535` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@3.25.76/node_modules/zod/v3/helpers/util.js` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `applyCacheStaking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/cache-staking/index.ts:22` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `defaultProcessor` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/json-schema-processors.js` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `async runRunnableToolCall` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `get` | `[native code]` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:256` |
| 0.0% | 1.6ms | 0.1% | 6.5ms | `countLines` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:69` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `defineProperties` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/define-properties@1.2.1/node_modules/define-properties/index.js` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `/^[a-z$_][a-z$_0-9]*$/i` | `[native code]` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `buildLlmRequestMetadata` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:735` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/image-q@4.0.0/node_modules/image-q/dist/esm/image-q.mjs` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `isAlreadyMasked` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:94` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `has` | `[native code]` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `ClientSecrets` | `[native code]` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/checks.js:9` |
| 0.0% | 1.5ms | 0.0% | 4.3ms | `async appendLoopEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:296` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `/^(?:(?:25[0-5]\|2[0-4]\d\|1\d{2}\|[1-9]\d\|\d)\.){3}(?:25[0-5]\|2[0-4]\d\|1\d{2}\|[1-9]\d\|\d)$/u` | `[native code]` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `async chatOnce` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:108` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `validate0` | `[native code]` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `finally` | `[native code]` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:69` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `resolveModelCapabilities` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:268` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/code.js:49` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `pipe` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:71` |
| 0.0% | 1.4ms | 0.1% | 7.2ms | `async recordEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:159` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:141` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `_elseNode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:621` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `driveAsyncFunction` | `[native code]` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `flatIntoArray` | `[native code]` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `set` | `[native code]` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js:498` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `pushHistorySideEffects` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:373` |
| 0.0% | 1.3ms | 0.0% | 2.7ms | `async foldLoopEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/wire-fold.ts:159` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `setInterval` | `[native code]` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `readPlainScalar` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:1631` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:128` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `[Symbol.match]` | `[native code]` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `emptyStr` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/code.js:39` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `cloneMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:185` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:135` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `Files` | `[native code]` |
| 0.0% | 1.2ms | 0.5% | 24.2ms | `mergeAdjacentUserMessages` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:155` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@jimp+plugin-resize@1.6.1/node_modules/@jimp/plugin-resize/dist/esm/constants.js` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `str` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/code.js:68` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `countLines` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:67` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `push` | `[native code]` |

## Call Tree (Total Time)

| Total% | Total | Self% | Self | Function | Location |
|-------:|------:|------:|-----:|----------|----------|
| 98.8% | 4.28s | 0.9% | 43.3ms | `(anonymous)` | `[native code]` |
| 98.8% | 4.28s | 0.0% | 0us | `processTicksAndRejections` | `[native code]` |
| 93.6% | 4.06s | 0.0% | 0us | `estimateTokensForMessages` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:29` |
| 83.6% | 3.62s | 83.3% | 3.61s | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:52` |
| 38.5% | 1.67s | 0.0% | 0us | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:69` |
| 38.5% | 1.67s | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:579` |
| 38.5% | 1.67s | 0.0% | 0us | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:51` |
| 38.5% | 1.67s | 0.0% | 0us | `async runTurn` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/run-turn.ts:93` |
| 38.5% | 1.67s | 0.0% | 0us | `async beforeStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:273` |
| 38.5% | 1.67s | 0.0% | 0us | `async beforeStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:577` |
| 36.7% | 1.59s | 0.0% | 0us | `async beforeStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:277` |
| 36.6% | 1.59s | 0.0% | 0us | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:216` |
| 18.7% | 815.9ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:258` |
| 18.7% | 815.9ms | 0.0% | 0us | `async withProviderRequestAuth` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/request-auth.ts:20` |
| 18.7% | 815.9ms | 0.0% | 0us | `logLlmRequest` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:403` |
| 18.7% | 815.1ms | 0.0% | 0us | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:156` |
| 18.7% | 814.3ms | 0.0% | 0us | `buildLlmRequestMetadata` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:741` |
| 18.6% | 810.5ms | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:423` |
| 18.4% | 799.0ms | 0.0% | 0us | `async chat` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:82` |
| 18.4% | 799.0ms | 0.0% | 0us | `async chatOnce` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:85` |
| 18.4% | 799.0ms | 0.0% | 0us | `async chatWithRetry` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/retry.ts:37` |
| 18.4% | 799.0ms | 0.0% | 0us | `async chatWithRetry` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/retry.ts:54` |
| 18.4% | 799.0ms | 0.0% | 0us | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:131` |
| 18.3% | 797.4ms | 0.0% | 0us | `async chatOnce` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:95` |
| 18.3% | 797.4ms | 0.0% | 0us | `computeCompletionBudgetCap` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/completion-budget.ts:72` |
| 18.3% | 797.4ms | 0.0% | 0us | `applyCompletionBudget` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/completion-budget.ts:105` |
| 17.3% | 755.0ms | 0.0% | 0us | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:207` |
| 9.2% | 400.9ms | 0.0% | 0us | `async runTurn` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/run-turn.ts:46` |
| 9.2% | 400.9ms | 0.0% | 0us | `async runTurn` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:539` |
| 8.6% | 374.7ms | 0.0% | 0us | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:47` |
| 6.8% | 298.6ms | 2.2% | 96.1ms | `anonymous` | `[native code]` |
| 5.2% | 225.8ms | 0.0% | 0us | `bound require` | `[native code]` |
| 5.1% | 221.4ms | 0.0% | 0us | `require` | `[native code]` |
| 4.9% | 216.9ms | 0.3% | 16.6ms | `estimateTokens` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:16` |
| 4.7% | 205.1ms | 4.7% | 205.1ms | `next` | `[native code]` |
| 4.2% | 182.5ms | 4.2% | 182.5ms | `estimateTokensForContentPart` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:59` |
| 3.3% | 143.6ms | 0.0% | 0us | `estimateTokensForContentPart` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:60` |
| 1.1% | 51.3ms | 0.0% | 0us | `get tokenCountWithPending` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:146` |
| 1.1% | 49.0ms | 0.0% | 3.3ms | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:45` |
| 1.0% | 45.9ms | 0.0% | 0us | `async beforeStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:289` |
| 0.9% | 39.5ms | 0.2% | 12.2ms | `map` | `[native code]` |
| 0.9% | 39.2ms | 0.0% | 0us | `code` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:439` |
| 0.5% | 24.2ms | 0.0% | 1.2ms | `mergeAdjacentUserMessages` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:155` |
| 0.5% | 24.2ms | 0.0% | 0us | `project` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:42` |
| 0.5% | 21.9ms | 0.0% | 0us | `block` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:568` |
| 0.4% | 21.6ms | 0.0% | 0us | `cloneMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:187` |
| 0.4% | 20.9ms | 0.4% | 20.9ms | `estimateTokensForContentPart` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` |
| 0.4% | 20.4ms | 0.0% | 0us | `async beforeStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:298` |
| 0.4% | 20.4ms | 0.0% | 0us | `checkAutoCompaction` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:313` |
| 0.4% | 19.9ms | 0.0% | 0us | `applyPruning` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:244` |
| 0.4% | 19.8ms | 0.0% | 0us | `applyPruning` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:276` |
| 0.4% | 19.7ms | 0.0% | 0us | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:200` |
| 0.4% | 19.5ms | 0.0% | 0us | `get tokenCountWithPending` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:247` |
| 0.4% | 18.8ms | 0.0% | 0us | `init` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:21` |
| 0.4% | 17.7ms | 0.0% | 0us | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:82` |
| 0.3% | 17.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/index.js:31` |
| 0.3% | 15.1ms | 0.0% | 0us | `ws` | `ws:3` |
| 0.3% | 15.1ms | 0.0% | 0us | `node:http` | `node:http:2` |
| 0.3% | 14.4ms | 0.0% | 0us | `buildMessages` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:552` |
| 0.3% | 13.8ms | 0.3% | 13.8ms | `cloneObject` | `[native code]` |
| 0.3% | 13.6ms | 0.0% | 0us | `node:_http_client` | `node:_http_client:8` |
| 0.2% | 12.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:187` |
| 0.2% | 12.3ms | 0.2% | 12.3ms | `stringify` | `[native code]` |
| 0.2% | 12.3ms | 0.0% | 0us | `async beforeStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:299` |
| 0.2% | 12.1ms | 0.0% | 0us | `maskToolResult` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:109` |
| 0.2% | 11.9ms | 0.0% | 0us | `get shouldCompact` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:255` |
| 0.2% | 11.8ms | 0.0% | 0us | `tokenCountWithPending` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:247` |
| 0.2% | 11.6ms | 0.0% | 0us | `typeAndKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:128` |
| 0.2% | 11.6ms | 0.0% | 0us | `keywordCode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:464` |
| 0.2% | 11.1ms | 0.0% | 0us | `async runTurns` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:317` |
| 0.2% | 11.1ms | 0.0% | 0us | `prompt` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:455` |
| 0.2% | 11.1ms | 0.0% | 0us | `launch` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:125` |
| 0.2% | 10.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/picomatch@4.0.4/node_modules/picomatch/index.js:3` |
| 0.2% | 10.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/picomatch@4.0.4/node_modules/picomatch/lib/picomatch.js:4` |
| 0.2% | 10.6ms | 0.0% | 0us | `tryResolvedProviderConfig` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:143` |
| 0.2% | 10.6ms | 0.0% | 0us | `resolveRuntimeProvider` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:120` |
| 0.2% | 10.6ms | 0.0% | 0us | `get shouldBlock` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:259` |
| 0.2% | 10.3ms | 0.0% | 0us | `preflightToolCall` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:202` |
| 0.2% | 10.3ms | 0.0% | 0us | `async runToolCallBatch` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:126` |
| 0.2% | 10.3ms | 0.0% | 0us | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:208` |
| 0.2% | 10.3ms | 0.0% | 0us | `compile` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:159` |
| 0.2% | 10.3ms | 0.0% | 0us | `validateExecutableToolArgs` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:234` |
| 0.2% | 10.3ms | 0.0% | 0us | `async runToolCallBatch` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:122` |
| 0.2% | 10.3ms | 0.0% | 0us | `_addSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:461` |
| 0.2% | 9.2ms | 0.0% | 0us | `get modelCapabilities` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:133` |
| 0.2% | 8.8ms | 0.0% | 0us | `_compileMetaSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:483` |
| 0.2% | 8.8ms | 0.0% | 0us | `validateSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:255` |
| 0.2% | 8.8ms | 0.0% | 0us | `_compileSchemaEnv` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:471` |
| 0.2% | 8.8ms | 0.0% | 0us | `defaultMeta` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:29` |
| 0.2% | 8.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:222` |
| 0.2% | 8.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:192` |
| 0.2% | 8.7ms | 0.0% | 0us | `schemaKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:190` |
| 0.2% | 8.7ms | 0.0% | 0us | `iterateKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:219` |
| 0.1% | 8.5ms | 0.0% | 0us | `shouldCompact` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:255` |
| 0.1% | 7.6ms | 0.0% | 0us | `createProvider` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/index.ts:24` |
| 0.1% | 7.6ms | 0.0% | 0us | `resolveModelCapabilities` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:254` |
| 0.1% | 7.6ms | 0.0% | 0us | `OpenAICompletionsChatProvider` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/openai-completions.ts:405` |
| 0.1% | 7.5ms | 0.0% | 0us | `reduce` | `[native code]` |
| 0.1% | 7.2ms | 0.0% | 0us | `validateFunctionCode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:21` |
| 0.1% | 7.2ms | 0.0% | 0us | `validateFunction` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:37` |
| 0.1% | 7.2ms | 0.0% | 0us | `func` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:587` |
| 0.1% | 7.2ms | 0.0% | 0us | `topSchemaObjCode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:62` |
| 0.1% | 7.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:70` |
| 0.1% | 7.2ms | 0.0% | 0us | `compileSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:80` |
| 0.1% | 7.2ms | 0.0% | 1.4ms | `async recordEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:159` |
| 0.1% | 7.1ms | 0.0% | 0us | `groupKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:200` |
| 0.1% | 7.1ms | 0.0% | 0us | `subSchemaObjCode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:115` |
| 0.1% | 7.1ms | 0.0% | 0us | `subschemaCode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:91` |
| 0.1% | 7.1ms | 0.0% | 0us | `subschema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:438` |
| 0.1% | 6.5ms | 0.0% | 1.6ms | `countLines` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:69` |
| 0.1% | 6.3ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:774` |
| 0.1% | 6.3ms | 0.0% | 0us | `async main` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:684` |
| 0.1% | 6.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:4` |
| 0.1% | 6.2ms | 0.0% | 0us | `emitStatusUpdated` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:606` |
| 0.1% | 6.1ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/xml2js.js:39` |
| 0.1% | 6.1ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/parse-bmfont-xml@1.1.6/node_modules/parse-bmfont-xml/lib/index.js:1` |
| 0.1% | 6.0ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:181` |
| 0.1% | 6.0ms | 0.0% | 2.6ms | `maskToolResult` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:102` |
| 0.1% | 5.8ms | 0.0% | 0us | `async chatOnce` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:119` |
| 0.1% | 5.8ms | 0.0% | 0us | `async onTextPart` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:320` |
| 0.1% | 5.8ms | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:321` |
| 0.1% | 5.7ms | 0.1% | 5.7ms | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:50` |
| 0.1% | 5.7ms | 0.0% | 0us | `async recordEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:162` |
| 0.1% | 5.7ms | 0.0% | 0us | `async appendTranscriptRecord` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:690` |
| 0.1% | 5.2ms | 0.0% | 0us | `process` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:60` |
| 0.1% | 5.0ms | 0.0% | 0us | `add` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-scheduler.ts:40` |
| 0.1% | 5.0ms | 0.0% | 0us | `async runToolCallBatch` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:136` |
| 0.1% | 5.0ms | 0.0% | 0us | `forEach` | `[native code]` |
| 0.1% | 4.9ms | 0.0% | 0us | `async runModeA` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:560` |
| 0.1% | 4.9ms | 0.0% | 0us | `async main` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:693` |
| 0.1% | 4.9ms | 0.0% | 0us | `createPerfAgent` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:298` |
| 0.1% | 4.9ms | 0.0% | 0us | `async runModeA` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:563` |
| 0.1% | 4.8ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:4` |
| 0.1% | 4.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/index.js:4` |
| 0.1% | 4.7ms | 0.1% | 4.7ms | `structuredClone` | `[native code]` |
| 0.1% | 4.6ms | 0.0% | 2.8ms | `filter` | `[native code]` |
| 0.1% | 4.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:20` |
| 0.1% | 4.5ms | 0.1% | 4.5ms | `estimateTokensForMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` |
| 0.1% | 4.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/builder.js:127` |
| 0.1% | 4.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/builder.js:7` |
| 0.1% | 4.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/index.js:9` |
| 0.1% | 4.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/index.js:65` |
| 0.1% | 4.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/xml2js.js:10` |
| 0.1% | 4.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:242` |
| 0.1% | 4.4ms | 0.0% | 0us | `async afterStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:584` |
| 0.1% | 4.4ms | 0.0% | 0us | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:234` |
| 0.1% | 4.4ms | 0.0% | 0us | `record` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/usage/index.ts:43` |
| 0.1% | 4.4ms | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:585` |
| 0.0% | 4.3ms | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:691` |
| 0.0% | 4.3ms | 0.0% | 1.5ms | `async appendLoopEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:296` |
| 0.0% | 4.3ms | 0.0% | 4.3ms | `countLines` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts` |
| 0.0% | 4.1ms | 0.0% | 0us | `code` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/applicator/properties.js:33` |
| 0.0% | 4.1ms | 0.0% | 0us | `applyPropertySchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/applicator/properties.js:45` |
| 0.0% | 3.6ms | 0.0% | 0us | `ZodObject` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` |
| 0.0% | 3.5ms | 0.0% | 0us | `async start` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:335` |
| 0.0% | 3.5ms | 0.0% | 0us | `start` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-scheduler.ts:66` |
| 0.0% | 3.5ms | 0.0% | 0us | `async runRunnableToolCall` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:435` |
| 0.0% | 3.4ms | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:397` |
| 0.0% | 3.4ms | 0.0% | 3.4ms | `extractTextFromContent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:58` |
| 0.0% | 3.3ms | 0.0% | 0us | `internal:streams/add-abort-signal` | `internal:streams/add-abort-signal:2` |
| 0.0% | 3.3ms | 0.0% | 0us | `internal:streams/readable` | `internal:streams/readable:2` |
| 0.0% | 3.3ms | 0.0% | 0us | `internal:streams/duplex` | `internal:streams/duplex:2` |
| 0.0% | 3.3ms | 0.0% | 0us | `internal:streams/transform` | `internal:streams/transform:2` |
| 0.0% | 3.3ms | 0.0% | 0us | `node:crypto` | `node:crypto:2` |
| 0.0% | 3.3ms | 0.0% | 0us | `internal:streams/lazy_transform` | `internal:streams/lazy_transform:2` |
| 0.0% | 3.2ms | 0.0% | 0us | `clone` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/util.js:251` |
| 0.0% | 3.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/utif2@4.1.0/node_modules/utif2/UTIF.js:1648` |
| 0.0% | 3.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/utif2@4.1.0/node_modules/utif2/UTIF.js:12` |
| 0.0% | 3.2ms | 0.0% | 0us | `test` | `[native code]` |
| 0.0% | 3.1ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png.js:5` |
| 0.0% | 3.1ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:8` |
| 0.0% | 3.1ms | 0.0% | 3.1ms | `applyPruning` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:265` |
| 0.0% | 3.1ms | 0.0% | 0us | `node:events` | `node:events:9` |
| 0.0% | 3.1ms | 0.0% | 0us | `node:fs/promises` | `node:fs/promises:2` |
| 0.0% | 3.1ms | 0.0% | 0us | `project` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:30` |
| 0.0% | 3.1ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/set-function-length@1.2.2/node_modules/set-function-length/index.js:3` |
| 0.0% | 3.1ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:4` |
| 0.0% | 3.1ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/call-bind@1.0.9/node_modules/call-bind/index.js:3` |
| 0.0% | 3.0ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:6` |
| 0.0% | 3.0ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/implementation.js:3` |
| 0.0% | 3.0ms | 0.0% | 0us | `get names` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:235` |
| 0.0% | 3.0ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gcp-metadata@8.1.2/node_modules/gcp-metadata/build/src/index.js:67` |
| 0.0% | 3.0ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-logging-utils@1.1.3/node_modules/google-logging-utils/build/src/index.js:30` |
| 0.0% | 2.9ms | 0.0% | 0us | `dispatchEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:141` |
| 0.0% | 2.9ms | 0.0% | 0us | `schemaKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:185` |
| 0.0% | 2.8ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:30` |
| 0.0% | 2.7ms | 0.0% | 0us | `reportTypeError` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/dataType.js:185` |
| 0.0% | 2.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/dataType.js:50` |
| 0.0% | 2.7ms | 0.0% | 0us | `if` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:466` |
| 0.0% | 2.7ms | 0.0% | 0us | `typeAndKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:127` |
| 0.0% | 2.7ms | 0.0% | 0us | `coerceAndCheckDataType` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/dataType.js:46` |
| 0.0% | 2.7ms | 0.0% | 1.3ms | `async foldLoopEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/wire-fold.ts:159` |
| 0.0% | 2.7ms | 0.0% | 0us | `async appendLoopEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:301` |
| 0.0% | 2.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:5` |
| 0.0% | 2.7ms | 0.0% | 0us | `composeNode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2537` |
| 0.0% | 2.6ms | 0.0% | 0us | `ZodString` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` |
| 0.0% | 2.6ms | 0.0% | 0us | `string` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:159` |
| 0.0% | 2.6ms | 0.0% | 0us | `_string` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js:7` |
| 0.0% | 2.6ms | 0.0% | 0us | `errorObject` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:91` |
| 0.0% | 2.6ms | 0.0% | 0us | `reportError` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:18` |
| 0.0% | 2.6ms | 0.0% | 0us | `errorInstancePath` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:101` |
| 0.0% | 1.8ms | 0.0% | 1.8ms | `addRule` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:567` |
| 0.0% | 1.8ms | 0.0% | 0us | `addVocabulary` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:329` |
| 0.0% | 1.8ms | 0.0% | 0us | `Ajv2019` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/2019.js:14` |
| 0.0% | 1.8ms | 0.0% | 0us | `addKeyword` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:363` |
| 0.0% | 1.8ms | 0.0% | 0us | `eachItem` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/util.js:88` |
| 0.0% | 1.8ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:9` |
| 0.0% | 1.8ms | 0.0% | 0us | `_addVocabularies` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/2019.js:24` |
| 0.0% | 1.8ms | 0.0% | 0us | `Ajv` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:113` |
| 0.0% | 1.8ms | 0.0% | 1.8ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts` |
| 0.0% | 1.8ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js:828` |
| 0.0% | 1.8ms | 0.0% | 0us | `object` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:581` |
| 0.0% | 1.8ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/state/todo-list.ts:41` |
| 0.0% | 1.8ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:551` |
| 0.0% | 1.8ms | 0.0% | 1.8ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js:766` |
| 0.0% | 1.8ms | 0.0% | 0us | `update` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:64` |
| 0.0% | 1.8ms | 0.0% | 1.8ms | `emitStatusUpdated` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:612` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `init` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:20` |
| 0.0% | 1.7ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:719` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:552` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:68` |
| 0.0% | 1.7ms | 0.0% | 0us | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:230` |
| 0.0% | 1.7ms | 0.0% | 0us | `get ReadStream` | `node:fs:578` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `async executeTool` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:535` |
| 0.0% | 1.7ms | 0.0% | 0us | `async runRunnableToolCall` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:450` |
| 0.0% | 1.7ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@3.25.76/node_modules/zod/v3/helpers/util.js:59` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@3.25.76/node_modules/zod/v3/helpers/util.js` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/jpeg-js@0.4.4/node_modules/jpeg-js/index.js:1` |
| 0.0% | 1.7ms | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:402` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/get-intrinsic@1.3.0/node_modules/get-intrinsic/index.js:18` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gifwrap@0.10.1/node_modules/gifwrap/src/gifutil.js:6` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gifwrap@0.10.1/node_modules/gifwrap/src/index.js:7` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `applyCacheStaking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/cache-staking/index.ts:22` |
| 0.0% | 1.7ms | 0.0% | 0us | `initializeBuiltinTools` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/tool/index.ts:365` |
| 0.0% | 1.7ms | 0.0% | 0us | `objectProcessor` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/json-schema-processors.js:287` |
| 0.0% | 1.7ms | 0.0% | 0us | `optionalProcessor` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/json-schema-processors.js:515` |
| 0.0% | 1.7ms | 0.0% | 0us | `toJSONSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/json-schema-processors.js:602` |
| 0.0% | 1.7ms | 0.0% | 0us | `GlobTool` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/glob.ts:123` |
| 0.0% | 1.7ms | 0.0% | 0us | `toInputJsonSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/support/input-schema.ts:27` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/glob.ts:121` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `defaultProcessor` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/json-schema-processors.js` |
| 0.0% | 1.7ms | 0.0% | 0us | `update` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:62` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `async runRunnableToolCall` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:13` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/index.js:6` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/zlib/deflate.js:25` |
| 0.0% | 1.7ms | 0.0% | 1.7ms | `get` | `[native code]` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/deflate.js:4` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/computeclient.js:19` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:24` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/oauth2client.js:18` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/index.js:3` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:6` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:5` |
| 0.0% | 1.7ms | 0.0% | 0us | `shouldBlock` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:259` |
| 0.0% | 1.7ms | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:424` |
| 0.0% | 1.7ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/parser-async.js:8` |
| 0.0% | 1.6ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:822` |
| 0.0% | 1.6ms | 0.0% | 0us | `Type$1` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:255` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:256` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/aos/EncodeForRegExpEscape.js:16` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:12` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `defineProperties` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/define-properties@1.2.1/node_modules/define-properties/index.js` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/pluggable-auth-client.js:18` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/externalclient.js:20` |
| 0.0% | 1.6ms | 0.0% | 0us | `getProperty` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/code.js:141` |
| 0.0% | 1.6ms | 0.0% | 0us | `propertyInData` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/code.js:38` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `/^[a-z$_][a-z$_0-9]*$/i` | `[native code]` |
| 0.0% | 1.6ms | 0.0% | 0us | `code` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/applicator/properties.js:32` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `buildLlmRequestMetadata` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:735` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/parser.js:385` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/parser.js:9` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/xml2js.js:12` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:4` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/boolSchema.js:4` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:4` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:4` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:9` |
| 0.0% | 1.6ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/image-q@4.0.0/node_modules/image-q/dist/esm/image-q.mjs:30` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/image-q@4.0.0/node_modules/image-q/dist/esm/image-q.mjs` |
| 0.0% | 1.6ms | 0.0% | 0us | `maskToolResult` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:105` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `has` | `[native code]` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `isAlreadyMasked` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:94` |
| 0.0% | 1.6ms | 0.0% | 0us | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:195` |
| 0.0% | 1.6ms | 0.0% | 0us | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:111` |
| 0.0% | 1.6ms | 0.0% | 0us | `Realtime` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/realtime/realtime.mjs:10` |
| 0.0% | 1.6ms | 0.0% | 1.6ms | `ClientSecrets` | `[native code]` |
| 0.0% | 1.6ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv-formats@3.0.1/node_modules/ajv-formats/dist/index.js:3` |
| 0.0% | 1.5ms | 0.0% | 0us | `$ZodCheckGreaterThan` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/checks.js:9` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/checks.js:45` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:376` |
| 0.0% | 1.5ms | 0.0% | 0us | `_gte` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js:518` |
| 0.0% | 1.5ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/grep.ts:77` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/define-data-property@1.1.4/node_modules/define-data-property/index.js:8` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:3` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/define-properties@1.2.1/node_modules/define-properties/index.js:8` |
| 0.0% | 1.5ms | 0.0% | 0us | `applyPruning` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:262` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `/^(?:(?:25[0-5]\|2[0-4]\d\|1\d{2}\|[1-9]\d\|\d)\.){3}(?:25[0-5]\|2[0-4]\d\|1\d{2}\|[1-9]\d\|\d)$/u` | `[native code]` |
| 0.0% | 1.5ms | 0.0% | 0us | `groupKeywords` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:208` |
| 0.0% | 1.5ms | 0.0% | 0us | `code` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js:19` |
| 0.0% | 1.5ms | 0.0% | 0us | `parse` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/fast-uri@3.1.0/node_modules/fast-uri/index.js:260` |
| 0.0% | 1.5ms | 0.0% | 0us | `resolveRef` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:133` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/code.js:116` |
| 0.0% | 1.5ms | 0.0% | 0us | `validateUnion` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/code.js:115` |
| 0.0% | 1.5ms | 0.0% | 0us | `getFullPath` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/resolve.js:74` |
| 0.0% | 1.5ms | 0.0% | 0us | `bound test` | `[native code]` |
| 0.0% | 1.5ms | 0.0% | 0us | `resolveSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:177` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `async chatOnce` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:108` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `validate0` | `[native code]` |
| 0.0% | 1.5ms | 0.0% | 0us | `validateSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:261` |
| 0.0% | 1.5ms | 0.0% | 0us | `validate` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:153` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `finally` | `[native code]` |
| 0.0% | 1.5ms | 0.0% | 0us | `start` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-scheduler.ts:76` |
| 0.0% | 1.5ms | 0.0% | 0us | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:215` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:69` |
| 0.0% | 1.5ms | 0.0% | 0us | `applyCacheStaking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/cache-staking/index.ts:29` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/json-bigint@1.0.0/node_modules/json-bigint/index.js:1` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gcp-metadata@8.1.2/node_modules/gcp-metadata/build/src/index.js:65` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `resolveModelCapabilities` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:268` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:19` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLStringWriter.js:7` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLWriterBase.js:428` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocType.js:21` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLWriterBase.js:12` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocType.js:186` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLStringWriter.js:35` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `pipe` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js` |
| 0.0% | 1.5ms | 0.0% | 0us | `get names` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/code.js:47` |
| 0.0% | 1.5ms | 0.0% | 0us | `get names` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:236` |
| 0.0% | 1.5ms | 0.0% | 0us | `optimize` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:597` |
| 0.0% | 1.5ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/collaboration/agent.ts:40` |
| 0.0% | 1.5ms | 0.0% | 1.5ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/code.js:49` |
| 0.0% | 1.5ms | 0.0% | 0us | `compileSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:81` |
| 0.0% | 1.5ms | 0.0% | 0us | `addExprNames` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:643` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gifwrap@0.10.1/node_modules/gifwrap/src/index.js:3` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/zlib/inflate.js:25` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/index.js:7` |
| 0.0% | 1.5ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/inflate.js:4` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:71` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:365` |
| 0.0% | 1.4ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:1374` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:32` |
| 0.0% | 1.4ms | 0.0% | 0us | `ZodNumber` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` |
| 0.0% | 1.4ms | 0.0% | 0us | `applyPruning` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:263` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/parser-async.js:4` |
| 0.0% | 1.4ms | 0.0% | 0us | `node:_http_server` | `node:_http_server:42` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/runtime/uri.js:3` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:22` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/standardwebhooks@1.0.0/node_modules/standardwebhooks/dist/index.js:5` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:9` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `_elseNode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:621` |
| 0.0% | 1.4ms | 0.0% | 0us | `addError` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:60` |
| 0.0% | 1.4ms | 0.0% | 0us | `reportError` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:20` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:141` |
| 0.0% | 1.4ms | 0.0% | 0us | `if` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:463` |
| 0.0% | 1.4ms | 0.0% | 0us | `get hasProvider` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:94` |
| 0.0% | 1.4ms | 0.0% | 0us | `update` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:57` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `driveAsyncFunction` | `[native code]` |
| 0.0% | 1.4ms | 0.0% | 0us | `flatIntoArrayWithCallback` | `[native code]` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `flatIntoArray` | `[native code]` |
| 0.0% | 1.4ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/openai-compat-schema.ts:84` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `set` | `[native code]` |
| 0.0% | 1.4ms | 0.0% | 0us | `resolveModelCapabilities` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:264` |
| 0.0% | 1.4ms | 0.0% | 0us | `get maxContextSize` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:251` |
| 0.0% | 1.4ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:415` |
| 0.0% | 1.4ms | 0.0% | 1.4ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js:498` |
| 0.0% | 1.4ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:958` |
| 0.0% | 1.4ms | 0.0% | 0us | `ZodBoolean` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` |
| 0.0% | 1.4ms | 0.0% | 0us | `_boolean` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js:369` |
| 0.0% | 1.3ms | 0.0% | 0us | `logRecord` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts:40` |
| 0.0% | 1.3ms | 0.0% | 0us | `recordApprovalResult` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/permission/index.ts:75` |
| 0.0% | 1.3ms | 0.0% | 0us | `async requestToolApproval` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/permission/index.ts:193` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `pushHistorySideEffects` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:373` |
| 0.0% | 1.3ms | 0.0% | 0us | `async foldLoopEvent` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/wire-fold.ts:170` |
| 0.0% | 1.3ms | 0.0% | 0us | `async executeLoopStep` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:99` |
| 0.0% | 1.3ms | 0.0% | 0us | `onMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:327` |
| 0.0% | 1.3ms | 0.0% | 0us | `commitMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/wire-fold.ts:295` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/index.js:5` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/draft7.js:4` |
| 0.0% | 1.3ms | 0.0% | 0us | `installMemoryProbe` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:508` |
| 0.0% | 1.3ms | 0.0% | 0us | `async main` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:687` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `setInterval` | `[native code]` |
| 0.0% | 1.3ms | 0.0% | 0us | `composeNode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2536` |
| 0.0% | 1.3ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/default.ts:19` |
| 0.0% | 1.3ms | 0.0% | 0us | `composeNode` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2553` |
| 0.0% | 1.3ms | 0.0% | 0us | `readBlockMapping` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2260` |
| 0.0% | 1.3ms | 0.0% | 0us | `readBlockMapping` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2200` |
| 0.0% | 1.3ms | 0.0% | 0us | `finalizeRawAgentProfileSource` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:67` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `readPlainScalar` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:1631` |
| 0.0% | 1.3ms | 0.0% | 0us | `parseAgentProfileYaml` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:76` |
| 0.0% | 1.3ms | 0.0% | 0us | `load$1` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2810` |
| 0.0% | 1.3ms | 0.0% | 0us | `loadAgentProfilesFromSources` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:20` |
| 0.0% | 1.3ms | 0.0% | 0us | `readBlockSequence` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2104` |
| 0.0% | 1.3ms | 0.0% | 0us | `loadDocuments` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2784` |
| 0.0% | 1.3ms | 0.0% | 0us | `readDocument` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2721` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/applicator/index.js:9` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/draft7.js:5` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:128` |
| 0.0% | 1.3ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/shared/auth.js:171` |
| 0.0% | 1.3ms | 0.0% | 0us | `async (anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:401` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/index.js:15` |
| 0.0% | 1.3ms | 0.0% | 0us | `nextToken` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:36` |
| 0.0% | 1.3ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/read.ts:163` |
| 0.0% | 1.3ms | 0.0% | 0us | `parseNodes` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:988` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `[Symbol.match]` | `[native code]` |
| 0.0% | 1.3ms | 0.0% | 0us | `peekToken` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:42` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `emptyStr` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/code.js:39` |
| 0.0% | 1.3ms | 0.0% | 0us | `parseAnd` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:605` |
| 0.0% | 1.3ms | 0.0% | 0us | `parseNot` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:613` |
| 0.0% | 1.3ms | 0.0% | 0us | `strConcat` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/code.js:121` |
| 0.0% | 1.3ms | 0.0% | 0us | `inlineRefSchema` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js:38` |
| 0.0% | 1.3ms | 0.0% | 0us | `parseInlineIf` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:581` |
| 0.0% | 1.3ms | 0.0% | 0us | `parseOr` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:597` |
| 0.0% | 1.3ms | 0.0% | 0us | `parseAsRoot` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:1005` |
| 0.0% | 1.3ms | 0.0% | 0us | `_compile` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:526` |
| 0.0% | 1.3ms | 0.0% | 0us | `compile` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:518` |
| 0.0% | 1.3ms | 0.0% | 0us | `parseExpression` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:577` |
| 0.0% | 1.3ms | 0.0% | 0us | `render` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:440` |
| 0.0% | 1.3ms | 0.0% | 0us | `nextToken` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/lexer.js:203` |
| 0.0% | 1.3ms | 0.0% | 0us | `compile` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:1023` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/call-bind-apply-helpers@1.0.2/node_modules/call-bind-apply-helpers/index.js:3` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/function-bind@1.1.2/node_modules/function-bind/index.js:3` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/dunder-proto@1.0.1/node_modules/dunder-proto/get.js:3` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/get-intrinsic@1.3.0/node_modules/get-intrinsic/index.js:57` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/get-proto@1.0.1/node_modules/get-proto/index.js:6` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `cloneMessage` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:185` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:25` |
| 0.0% | 1.3ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:1666` |
| 0.0% | 1.3ms | 0.0% | 1.3ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:135` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/getToken.js:17` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/tokenHandler.js:4` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:27` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/jws@4.0.1/node_modules/jws/lib/sign-stream.js:4` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/jwtclient.js:17` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/googleToken.js:18` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/jws@4.0.1/node_modules/jws/index.js:2` |
| 0.0% | 1.3ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/jwsSign.js:18` |
| 0.0% | 1.2ms | 0.0% | 0us | `VectorStores` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/vector-stores/vector-stores.mjs:13` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `Files` | `[native code]` |
| 0.0% | 1.2ms | 0.0% | 0us | `OpenAI` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:99` |
| 0.0% | 1.2ms | 0.0% | 0us | `(module)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@jimp+plugin-resize@1.6.1/node_modules/@jimp/plugin-resize/dist/esm/constants.js:26` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@jimp+plugin-resize@1.6.1/node_modules/@jimp/plugin-resize/dist/esm/constants.js` |
| 0.0% | 1.2ms | 0.0% | 0us | `fail` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:348` |
| 0.0% | 1.2ms | 0.0% | 0us | `error` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:367` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `str` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/code.js:68` |
| 0.0% | 1.2ms | 0.0% | 0us | `_error` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:371` |
| 0.0% | 1.2ms | 0.0% | 0us | `code` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/limitNumber.js:23` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/refs/json-schema-2020-12/index.js:5` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/2020.js:7` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:19` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gaxios@7.1.4/node_modules/gaxios/build/cjs/src/index.js:31` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gaxios@7.1.4/node_modules/gaxios/build/cjs/src/gaxios.js:20` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `countLines` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:67` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-logging-utils@1.1.3/node_modules/google-logging-utils/build/src/logging-utils.js:58` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:238` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/parser-sync.js:5` |
| 0.0% | 1.2ms | 0.0% | 0us | `loadAssertionError` | `node:assert:28` |
| 0.0% | 1.2ms | 0.0% | 0us | `get` | `node:assert:70` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/sync-inflate.js:3` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png-sync.js:3` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png.js:7` |
| 0.0% | 1.2ms | 0.0% | 0us | `assign` | `[native code]` |
| 0.0% | 1.2ms | 0.0% | 0us | `node:assert` | `node:assert:588` |
| 0.0% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/externalclient.js:17` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `push` | `[native code]` |
| 0.0% | 1.2ms | 0.0% | 0us | `applyObservationMasking` | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:184` |

## Function Details

### `estimateTokensForMessage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:52` | Self: 83.3% (3.61s) | Total: 83.6% (3.62s) | Samples: 2389

**Called by:**
- `estimateTokensForMessages` (2397)

**Calls:**
- `stringify` (8)

### `next`
`[native code]` | Self: 4.7% (205.1ms) | Total: 4.7% (205.1ms) | Samples: 134

**Called by:**
- `estimateTokens` (131)
- `countLines` (3)

### `estimateTokensForContentPart`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:59` | Self: 4.2% (182.5ms) | Total: 4.2% (182.5ms) | Samples: 120

**Called by:**
- `estimateTokensForMessage` (120)

### `anonymous`
`[native code]` | Self: 2.2% (96.1ms) | Total: 6.8% (298.6ms) | Samples: 45

**Called by:**
- `require` (132)
- `bound require` (3)
- `node:http` (2)
- `ws` (2)
- `loadAssertionError` (1)
- `node:fs/promises` (1)
- `internal:streams/add-abort-signal` (1)
- `get ReadStream` (1)
- `node:_http_client` (1)
- `internal:streams/transform` (1)
- `node:crypto` (1)
- `internal:streams/duplex` (1)
- `node:_http_server` (1)
- `internal:streams/readable` (1)
- `internal:streams/lazy_transform` (1)
- `node:events` (1)

**Calls:**
- `(anonymous)` (4)
- `(anonymous)` (3)
- `(anonymous)` (3)
- `(anonymous)` (3)
- `(anonymous)` (3)
- `(anonymous)` (3)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `node:http` (2)
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
- `node:_http_server` (1)
- `(anonymous)` (1)
- `node:assert` (1)
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
- `(anonymous)` (1)
- `internal:streams/add-abort-signal` (1)
- `internal:streams/transform` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `node:_http_client` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `internal:streams/duplex` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `internal:streams/readable` (1)
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
- `internal:streams/lazy_transform` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)

### `(anonymous)`
`[native code]` | Self: 0.9% (43.3ms) | Total: 98.8% (4.28s) | Samples: 29

**Called by:**
- `processTicksAndRejections` (2830)

**Calls:**
- `async runTurn` (842)
- `async withProviderRequestAuth` (537)
- `async (anonymous)` (533)
- `async executeLoopStep` (528)
- `async runTurn` (266)
- `async executeLoopStep` (12)
- `async executeLoopStep` (7)
- `async runTurns` (7)
- `(anonymous)` (4)
- `(module)` (4)
- `(anonymous)` (4)
- `async chatOnce` (4)
- `(anonymous)` (3)
- `async runToolCallBatch` (3)
- `async executeLoopStep` (3)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `async (anonymous)` (2)
- `(anonymous)` (1)
- `async (anonymous)` (1)
- `(anonymous)` (1)
- `(module)` (1)
- `async (anonymous)` (1)
- `(anonymous)` (1)
- `(module)` (1)
- `(module)` (1)
- `(module)` (1)
- `(anonymous)` (1)
- `(module)` (1)
- `async (anonymous)` (1)
- `(module)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(module)` (1)
- `async executeLoopStep` (1)
- `(anonymous)` (1)
- `(module)` (1)
- `(module)` (1)
- `(anonymous)` (1)
- `(module)` (1)
- `(module)` (1)
- `(module)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(module)` (1)
- `(module)` (1)
- `(anonymous)` (1)
- `(module)` (1)
- `(module)` (1)
- `async requestToolApproval` (1)

### `estimateTokensForContentPart`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` | Self: 0.4% (20.9ms) | Total: 0.4% (20.9ms) | Samples: 14

**Called by:**
- `estimateTokensForMessage` (14)

### `estimateTokens`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:16` | Self: 0.3% (16.6ms) | Total: 4.9% (216.9ms) | Samples: 11

**Called by:**
- `estimateTokensForContentPart` (96)
- `estimateTokensForMessage` (31)
- `estimateTokensForMessage` (15)

**Calls:**
- `next` (131)

### `cloneObject`
`[native code]` | Self: 0.3% (13.8ms) | Total: 0.3% (13.8ms) | Samples: 9

**Called by:**
- `(anonymous)` (8)
- `logRecord` (1)

### `stringify`
`[native code]` | Self: 0.2% (12.3ms) | Total: 0.2% (12.3ms) | Samples: 8

**Called by:**
- `estimateTokensForMessage` (8)

### `map`
`[native code]` | Self: 0.2% (12.2ms) | Total: 0.9% (39.5ms) | Samples: 8

**Called by:**
- `cloneMessage` (14)
- `async runToolCallBatch` (7)
- `applyCacheStaking` (1)
- `loadAgentProfilesFromSources` (1)
- `async (anonymous)` (1)
- `async (anonymous)` (1)
- `applyPruning` (1)

**Calls:**
- `(anonymous)` (8)
- `preflightToolCall` (7)
- `(anonymous)` (1)
- `structuredClone` (1)
- `finalizeRawAgentProfileSource` (1)

### `estimateTokensForMessage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:50` | Self: 0.1% (5.7ms) | Total: 0.1% (5.7ms) | Samples: 4

**Called by:**
- `estimateTokensForMessages` (4)

### `structuredClone`
`[native code]` | Self: 0.1% (4.7ms) | Total: 0.1% (4.7ms) | Samples: 3

**Called by:**
- `async (anonymous)` (2)
- `map` (1)

### `estimateTokensForMessage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` | Self: 0.1% (4.5ms) | Total: 0.1% (4.5ms) | Samples: 3

**Called by:**
- `estimateTokensForMessages` (3)

### `countLines`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts` | Self: 0.0% (4.3ms) | Total: 0.0% (4.3ms) | Samples: 3

**Called by:**
- `maskToolResult` (3)

### `extractTextFromContent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:58` | Self: 0.0% (3.4ms) | Total: 0.0% (3.4ms) | Samples: 2

**Called by:**
- `maskToolResult` (2)

### `estimateTokensForMessage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:45` | Self: 0.0% (3.3ms) | Total: 1.1% (49.0ms) | Samples: 2

**Called by:**
- `estimateTokensForMessages` (33)

**Calls:**
- `estimateTokens` (31)

### `applyPruning`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:265` | Self: 0.0% (3.1ms) | Total: 0.0% (3.1ms) | Samples: 2

**Called by:**
- `async beforeStep` (2)

### `filter`
`[native code]` | Self: 0.0% (2.8ms) | Total: 0.1% (4.6ms) | Samples: 2

**Called by:**
- `project` (2)
- `applyPruning` (1)

**Calls:**
- `(anonymous)` (1)

### `maskToolResult`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:102` | Self: 0.0% (2.6ms) | Total: 0.1% (6.0ms) | Samples: 2

**Called by:**
- `applyObservationMasking` (4)

**Calls:**
- `extractTextFromContent` (2)

### `addRule`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:567` | Self: 0.0% (1.8ms) | Total: 0.0% (1.8ms) | Samples: 1

**Called by:**
- `eachItem` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts` | Self: 0.0% (1.8ms) | Total: 0.0% (1.8ms) | Samples: 1

**Called by:**
- `filter` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js:766` | Self: 0.0% (1.8ms) | Total: 0.0% (1.8ms) | Samples: 1

**Called by:**
- `init` (1)

### `emitStatusUpdated`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:612` | Self: 0.0% (1.8ms) | Total: 0.0% (1.8ms) | Samples: 1

**Called by:**
- `update` (1)

### `init`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:20` | Self: 0.0% (1.7ms) | Total: 0.0% (1.7ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `OpenAI`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:68` | Self: 0.0% (1.7ms) | Total: 0.0% (1.7ms) | Samples: 1

**Called by:**
- `OpenAICompletionsChatProvider` (1)

### `async executeTool`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:535` | Self: 0.0% (1.7ms) | Total: 0.0% (1.7ms) | Samples: 1

**Called by:**
- `async runRunnableToolCall` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@3.25.76/node_modules/zod/v3/helpers/util.js` | Self: 0.0% (1.7ms) | Total: 0.0% (1.7ms) | Samples: 1

**Called by:**
- `(module)` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts` | Self: 0.0% (1.7ms) | Total: 0.0% (1.7ms) | Samples: 1

**Called by:**
- `map` (1)

### `applyCacheStaking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/cache-staking/index.ts:22` | Self: 0.0% (1.7ms) | Total: 0.0% (1.7ms) | Samples: 1

**Called by:**
- `async executeLoopStep` (1)

### `defaultProcessor`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/json-schema-processors.js` | Self: 0.0% (1.7ms) | Total: 0.0% (1.7ms) | Samples: 1

**Called by:**
- `process` (1)

### `async runRunnableToolCall`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts` | Self: 0.0% (1.7ms) | Total: 0.0% (1.7ms) | Samples: 1

**Called by:**
- `async runRunnableToolCall` (1)

### `get`
`[native code]` | Self: 0.0% (1.7ms) | Total: 0.0% (1.7ms) | Samples: 1

**Called by:**
- `require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:256` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `forEach` (1)

### `countLines`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:69` | Self: 0.0% (1.6ms) | Total: 0.1% (6.5ms) | Samples: 1

**Called by:**
- `maskToolResult` (4)

**Calls:**
- `next` (3)

### `defineProperties`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/define-properties@1.2.1/node_modules/define-properties/index.js` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `/^[a-z$_][a-z$_0-9]*$/i`
`[native code]` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `test` (1)

### `buildLlmRequestMetadata`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:735` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `logLlmRequest` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/image-q@4.0.0/node_modules/image-q/dist/esm/image-q.mjs` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `(module)` (1)

### `isAlreadyMasked`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:94` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `maskToolResult` (1)

### `has`
`[native code]` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `applyObservationMasking` (1)

### `ClientSecrets`
`[native code]` | Self: 0.0% (1.6ms) | Total: 0.0% (1.6ms) | Samples: 1

**Called by:**
- `Realtime` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/checks.js:9` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `init` (1)

### `async appendLoopEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:296` | Self: 0.0% (1.5ms) | Total: 0.0% (4.3ms) | Samples: 1

**Called by:**
- `async (anonymous)` (3)

**Calls:**
- `async appendLoopEvent` (2)

### `/^(?:(?:25[0-5]\|2[0-4]\d\|1\d{2}\|[1-9]\d\|\d)\.){3}(?:25[0-5]\|2[0-4]\d\|1\d{2}\|[1-9]\d\|\d)$/u`
`[native code]` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `test` (1)

### `async chatOnce`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:108` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `async chatOnce` (1)

### `validate0`
`[native code]` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `validate` (1)

### `finally`
`[native code]` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `start` (1)

### `OpenAI`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:69` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `OpenAICompletionsChatProvider` (1)

### `resolveModelCapabilities`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:268` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `resolveRuntimeProvider` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/code.js:49` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `reduce` (1)

### `pipe`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js` | Self: 0.0% (1.5ms) | Total: 0.0% (1.5ms) | Samples: 1

**Called by:**
- `(module)` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:71` | Self: 0.0% (1.4ms) | Total: 0.0% (1.4ms) | Samples: 1

**Called by:**
- `init` (1)

### `async recordEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:159` | Self: 0.0% (1.4ms) | Total: 0.1% (7.2ms) | Samples: 1

**Called by:**
- `dispatchEvent` (2)
- `async (anonymous)` (2)
- `async executeLoopStep` (1)

**Calls:**
- `async recordEvent` (4)

### `OpenAI`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:141` | Self: 0.0% (1.4ms) | Total: 0.0% (1.4ms) | Samples: 1

**Called by:**
- `OpenAICompletionsChatProvider` (1)

### `_elseNode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:621` | Self: 0.0% (1.4ms) | Total: 0.0% (1.4ms) | Samples: 1

**Called by:**
- `if` (1)

### `driveAsyncFunction`
`[native code]` | Self: 0.0% (1.4ms) | Total: 0.0% (1.4ms) | Samples: 1

**Called by:**
- `async appendTranscriptRecord` (1)

### `flatIntoArray`
`[native code]` | Self: 0.0% (1.4ms) | Total: 0.0% (1.4ms) | Samples: 1

**Called by:**
- `flatIntoArrayWithCallback` (1)

### `set`
`[native code]` | Self: 0.0% (1.4ms) | Total: 0.0% (1.4ms) | Samples: 1

**Called by:**
- `resolveModelCapabilities` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js:498` | Self: 0.0% (1.4ms) | Total: 0.0% (1.4ms) | Samples: 1

**Called by:**
- `init` (1)

### `pushHistorySideEffects`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:373` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `onMessage` (1)

### `async foldLoopEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/wire-fold.ts:159` | Self: 0.0% (1.3ms) | Total: 0.0% (2.7ms) | Samples: 1

**Called by:**
- `async appendLoopEvent` (2)

**Calls:**
- `async foldLoopEvent` (1)

### `setInterval`
`[native code]` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `installMemoryProbe` (1)

### `readPlainScalar`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:1631` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `composeNode` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:128` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `init` (1)

### `[Symbol.match]`
`[native code]` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `nextToken` (1)

### `emptyStr`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/code.js:39` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `strConcat` (1)

### `cloneMessage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:185` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `mergeAdjacentUserMessages` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:135` | Self: 0.0% (1.3ms) | Total: 0.0% (1.3ms) | Samples: 1

**Called by:**
- `init` (1)

### `Files`
`[native code]` | Self: 0.0% (1.2ms) | Total: 0.0% (1.2ms) | Samples: 1

**Called by:**
- `VectorStores` (1)

### `mergeAdjacentUserMessages`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:155` | Self: 0.0% (1.2ms) | Total: 0.5% (24.2ms) | Samples: 1

**Called by:**
- `project` (16)

**Calls:**
- `cloneMessage` (14)
- `cloneMessage` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@jimp+plugin-resize@1.6.1/node_modules/@jimp/plugin-resize/dist/esm/constants.js` | Self: 0.0% (1.2ms) | Total: 0.0% (1.2ms) | Samples: 1

**Called by:**
- `(module)` (1)

### `str`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/code.js:68` | Self: 0.0% (1.2ms) | Total: 0.0% (1.2ms) | Samples: 1

**Called by:**
- `errorInstancePath` (1)

### `countLines`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:67` | Self: 0.0% (1.2ms) | Total: 0.0% (1.2ms) | Samples: 1

**Called by:**
- `maskToolResult` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js` | Self: 0.0% (1.2ms) | Total: 0.0% (1.2ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `push`
`[native code]` | Self: 0.0% (1.2ms) | Total: 0.0% (1.2ms) | Samples: 1

**Called by:**
- `applyObservationMasking` (1)

### `start`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-scheduler.ts:76` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `add` (1)

**Calls:**
- `finally` (1)

### `_gte`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js:518` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `$ZodCheckGreaterThan` (1)

### `async chat`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:82` | Self: 0.0% (0us) | Total: 18.4% (799.0ms) | Samples: 0

**Called by:**
- `async chatWithRetry` (528)

**Calls:**
- `async chatOnce` (528)

### `preflightToolCall`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:202` | Self: 0.0% (0us) | Total: 0.2% (10.3ms) | Samples: 0

**Called by:**
- `map` (7)

**Calls:**
- `validateExecutableToolArgs` (7)

### `if`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:466` | Self: 0.0% (0us) | Total: 0.0% (2.7ms) | Samples: 0

**Called by:**
- `coerceAndCheckDataType` (2)

**Calls:**
- `code` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/define-properties@1.2.1/node_modules/define-properties/index.js:8` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `error`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:367` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `fail` (1)

**Calls:**
- `_error` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-logging-utils@1.1.3/node_modules/google-logging-utils/build/src/index.js:30` | Self: 0.0% (0us) | Total: 0.0% (3.0ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:208` | Self: 0.0% (0us) | Total: 0.2% (10.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (7)

**Calls:**
- `async runToolCallBatch` (7)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/implementation.js:3` | Self: 0.0% (0us) | Total: 0.0% (3.0ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:401` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `map` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/pluggable-auth-client.js:18` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:131` | Self: 0.0% (0us) | Total: 18.4% (799.0ms) | Samples: 0

**Called by:**
- `(anonymous)` (528)

**Calls:**
- `async chatWithRetry` (528)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/glob.ts:121` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `GlobTool` (1)

**Calls:**
- `toInputJsonSchema` (1)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:579` | Self: 0.0% (0us) | Total: 38.5% (1.67s) | Samples: 0

**Called by:**
- `async beforeStep` (1108)

**Calls:**
- `async beforeStep` (1108)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/externalclient.js:20` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `addVocabulary`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:329` | Self: 0.0% (0us) | Total: 0.0% (1.8ms) | Samples: 0

**Called by:**
- `forEach` (1)

**Calls:**
- `addKeyword` (1)

### `peekToken`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:42` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `parseNot` (1)

**Calls:**
- `nextToken` (1)

### `objectProcessor`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/json-schema-processors.js:287` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `process` (1)

**Calls:**
- `process` (1)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:69` | Self: 0.0% (0us) | Total: 38.5% (1.67s) | Samples: 0

**Called by:**
- `async executeLoopStep` (1108)

**Calls:**
- `async beforeStep` (1108)

### `$ZodCheckGreaterThan`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `_gte` (1)

**Calls:**
- `init` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/jwsSign.js:18` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `get`
`node:assert:70` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `assign` (1)

**Calls:**
- `loadAssertionError` (1)

### `code`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js:19` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `keywordCode` (1)

**Calls:**
- `resolveRef` (1)

### `processTicksAndRejections`
`[native code]` | Self: 0.0% (0us) | Total: 98.8% (4.28s) | Samples: 0

**Calls:**
- `(anonymous)` (2830)

### `async runToolCallBatch`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:122` | Self: 0.0% (0us) | Total: 0.2% (10.3ms) | Samples: 0

**Called by:**
- `async executeLoopStep` (7)

**Calls:**
- `async runToolCallBatch` (7)

### `ZodNumber`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `clone` (1)

**Calls:**
- `init` (1)

### `async runToolCallBatch`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:136` | Self: 0.0% (0us) | Total: 0.1% (5.0ms) | Samples: 0

**Called by:**
- `(anonymous)` (3)

**Calls:**
- `add` (3)

### `async runModeA`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:560` | Self: 0.0% (0us) | Total: 0.1% (4.9ms) | Samples: 0

**Called by:**
- `async main` (3)

**Calls:**
- `async runModeA` (3)

### `composeNode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2537` | Self: 0.0% (0us) | Total: 0.0% (2.7ms) | Samples: 0

**Called by:**
- `readDocument` (1)
- `readBlockSequence` (1)

**Calls:**
- `readBlockMapping` (1)
- `readBlockMapping` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:24` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `resolveRuntimeProvider`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:120` | Self: 0.0% (0us) | Total: 0.2% (10.6ms) | Samples: 0

**Called by:**
- `tryResolvedProviderConfig` (7)

**Calls:**
- `resolveModelCapabilities` (5)
- `resolveModelCapabilities` (1)
- `resolveModelCapabilities` (1)

### `code`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:439` | Self: 0.0% (0us) | Total: 0.9% (39.2ms) | Samples: 0

**Called by:**
- `block` (15)
- `code` (5)
- `func` (5)
- `if` (2)

**Calls:**
- `(anonymous)` (6)
- `(anonymous)` (6)
- `code` (5)
- `(anonymous)` (5)
- `keywordCode` (2)
- `(anonymous)` (2)
- `forEach` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:30` | Self: 0.0% (0us) | Total: 0.0% (2.8ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `async main`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:687` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `async main` (1)

**Calls:**
- `installMemoryProbe` (1)

### `record`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/usage/index.ts:43` | Self: 0.0% (0us) | Total: 0.1% (4.4ms) | Samples: 0

**Called by:**
- `async (anonymous)` (3)

**Calls:**
- `emitStatusUpdated` (3)

### `update`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:64` | Self: 0.0% (0us) | Total: 0.0% (1.8ms) | Samples: 0

**Called by:**
- `createPerfAgent` (1)

**Calls:**
- `emitStatusUpdated` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/xml2js.js:10` | Self: 0.0% (0us) | Total: 0.1% (4.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (3)

**Calls:**
- `bound require` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/xml2js.js:39` | Self: 0.0% (0us) | Total: 0.1% (6.1ms) | Samples: 0

**Called by:**
- `anonymous` (4)

**Calls:**
- `(anonymous)` (3)
- `(anonymous)` (1)

### `bound test`
`[native code]` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `parse` (1)

**Calls:**
- `test` (1)

### `resolveModelCapabilities`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:264` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `resolveRuntimeProvider` (1)

**Calls:**
- `set` (1)

### `validateFunctionCode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:21` | Self: 0.0% (0us) | Total: 0.1% (7.2ms) | Samples: 0

**Called by:**
- `compileSchema` (5)

**Calls:**
- `topSchemaObjCode` (5)

### `ZodObject`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` | Self: 0.0% (0us) | Total: 0.0% (3.6ms) | Samples: 0

**Called by:**
- `object` (1)
- `clone` (1)

**Calls:**
- `init` (2)

### `internal:streams/transform`
`internal:streams/transform:2` | Self: 0.0% (0us) | Total: 0.0% (3.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/builder.js:7` | Self: 0.0% (0us) | Total: 0.1% (4.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (3)

**Calls:**
- `bound require` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLWriterBase.js:12` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/checks.js:45` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `init` (1)

**Calls:**
- `init` (1)

### `async start`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:335` | Self: 0.0% (0us) | Total: 0.0% (3.5ms) | Samples: 0

**Called by:**
- `start` (2)

**Calls:**
- `async runRunnableToolCall` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/deflate.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:19` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/refs/json-schema-2020-12/index.js:5` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `nextToken`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/lexer.js:203` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `nextToken` (1)

**Calls:**
- `[Symbol.match]` (1)

### `_addSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:461` | Self: 0.0% (0us) | Total: 0.2% (10.3ms) | Samples: 0

**Called by:**
- `compile` (7)

**Calls:**
- `validateSchema` (6)
- `validateSchema` (1)

### `async runRunnableToolCall`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:435` | Self: 0.0% (0us) | Total: 0.0% (3.5ms) | Samples: 0

**Called by:**
- `async start` (2)

**Calls:**
- `async runRunnableToolCall` (1)
- `async runRunnableToolCall` (1)

### `parseInlineIf`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:581` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `parseExpression` (1)

**Calls:**
- `parseOr` (1)

### `keywordCode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:464` | Self: 0.0% (0us) | Total: 0.2% (11.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (6)
- `code` (2)

**Calls:**
- `code` (3)
- `validateUnion` (1)
- `code` (1)
- `inlineRefSchema` (1)
- `code` (1)
- `code` (1)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:200` | Self: 0.0% (0us) | Total: 0.4% (19.7ms) | Samples: 0

**Called by:**
- `applyObservationMasking` (13)

**Calls:**
- `maskToolResult` (8)
- `maskToolResult` (4)
- `maskToolResult` (1)

### `_compileMetaSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:483` | Self: 0.0% (0us) | Total: 0.2% (8.8ms) | Samples: 0

**Called by:**
- `_compileSchemaEnv` (6)

**Calls:**
- `compileSchema` (5)
- `compileSchema` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/collaboration/agent.ts:40` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `pipe` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gifwrap@0.10.1/node_modules/gifwrap/src/index.js:3` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `logLlmRequest`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:403` | Self: 0.0% (0us) | Total: 18.7% (815.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (537)

**Calls:**
- `buildLlmRequestMetadata` (536)
- `buildLlmRequestMetadata` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLWriterBase.js:428` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `(anonymous)` (1)

### `Ajv`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:113` | Self: 0.0% (0us) | Total: 0.0% (1.8ms) | Samples: 0

**Called by:**
- `Ajv2019` (1)

**Calls:**
- `_addVocabularies` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png-sync.js:3` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `subschema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:438` | Self: 0.0% (0us) | Total: 0.1% (7.1ms) | Samples: 0

**Called by:**
- `applyPropertySchema` (3)
- `(anonymous)` (1)
- `inlineRefSchema` (1)

**Calls:**
- `subschemaCode` (5)

### `code`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/applicator/properties.js:33` | Self: 0.0% (0us) | Total: 0.0% (4.1ms) | Samples: 0

**Called by:**
- `keywordCode` (3)

**Calls:**
- `applyPropertySchema` (3)

### `update`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:57` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `createPerfAgent` (1)

**Calls:**
- `get hasProvider` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:365` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `init` (1)

**Calls:**
- `init` (1)

### `process`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js:60` | Self: 0.0% (0us) | Total: 0.1% (5.2ms) | Samples: 0

**Called by:**
- `toJSONSchema` (1)
- `objectProcessor` (1)
- `optionalProcessor` (1)

**Calls:**
- `defaultProcessor` (1)
- `objectProcessor` (1)
- `optionalProcessor` (1)

### `OpenAI`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:99` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `OpenAICompletionsChatProvider` (1)

**Calls:**
- `VectorStores` (1)

### `async onTextPart`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:320` | Self: 0.0% (0us) | Total: 0.1% (5.8ms) | Samples: 0

**Called by:**
- `async chatOnce` (4)

**Calls:**
- `async (anonymous)` (4)

### `groupKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:200` | Self: 0.0% (0us) | Total: 0.1% (7.1ms) | Samples: 0

**Called by:**
- `(anonymous)` (5)

**Calls:**
- `iterateKeywords` (5)

### `applyPruning`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:262` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `async beforeStep` (1)

**Calls:**
- `filter` (1)

### `async chatOnce`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:95` | Self: 0.0% (0us) | Total: 18.3% (797.4ms) | Samples: 0

**Called by:**
- `async chatOnce` (527)

**Calls:**
- `applyCompletionBudget` (527)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/zlib/deflate.js:25` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:5` | Self: 0.0% (0us) | Total: 0.0% (2.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `bound require` (2)

### `node:fs/promises`
`node:fs/promises:2` | Self: 0.0% (0us) | Total: 0.0% (3.1ms) | Samples: 0

**Calls:**
- `anonymous` (1)

### `readBlockMapping`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2200` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `composeNode` (1)

**Calls:**
- `composeNode` (1)

### `get names`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:236` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `addExprNames` (1)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:402` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `map` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:27` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/state/todo-list.ts:41` | Self: 0.0% (0us) | Total: 0.0% (1.8ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `object` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:376` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `_gte` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:238` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (1)

### `internal:streams/readable`
`internal:streams/readable:2` | Self: 0.0% (0us) | Total: 0.0% (3.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `string`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:159` | Self: 0.0% (0us) | Total: 0.0% (2.6ms) | Samples: 0

**Called by:**
- `(module)` (1)
- `(module)` (1)

**Calls:**
- `_string` (2)

### `maskToolResult`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:105` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `applyObservationMasking` (1)

**Calls:**
- `isAlreadyMasked` (1)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:207` | Self: 0.0% (0us) | Total: 17.3% (755.0ms) | Samples: 0

**Called by:**
- `applyObservationMasking` (499)

**Calls:**
- `estimateTokensForMessages` (499)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:4` | Self: 0.0% (0us) | Total: 0.0% (3.1ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `bound require` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:6` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `object`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:581` | Self: 0.0% (0us) | Total: 0.0% (1.8ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `ZodObject` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/call-bind-apply-helpers@1.0.2/node_modules/call-bind-apply-helpers/index.js:3` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `async runTurn`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:539` | Self: 0.0% (0us) | Total: 9.2% (400.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (266)

**Calls:**
- `async runTurn` (266)

### `initializeBuiltinTools`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/tool/index.ts:365` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `update` (1)

**Calls:**
- `GlobTool` (1)

### `get tokenCountWithPending`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:247` | Self: 0.0% (0us) | Total: 0.4% (19.5ms) | Samples: 0

**Called by:**
- `get shouldCompact` (7)
- `get shouldBlock` (6)

**Calls:**
- `get tokenCountWithPending` (13)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png.js:5` | Self: 0.0% (0us) | Total: 0.0% (3.1ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `bound require` (2)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/openai-compat-schema.ts:84` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `flatIntoArrayWithCallback` (1)

### `async runTurn`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/run-turn.ts:46` | Self: 0.0% (0us) | Total: 9.2% (400.9ms) | Samples: 0

**Called by:**
- `async runTurn` (266)

**Calls:**
- `async runTurn` (266)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:552` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `init` (1)

**Calls:**
- `init` (1)

### `assign`
`[native code]` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `node:assert` (1)

**Calls:**
- `get` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/parser.js:9` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

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

### `_addVocabularies`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/2019.js:24` | Self: 0.0% (0us) | Total: 0.0% (1.8ms) | Samples: 0

**Called by:**
- `Ajv` (1)

**Calls:**
- `forEach` (1)

### `toJSONSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/json-schema-processors.js:602` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `toInputJsonSchema` (1)

**Calls:**
- `process` (1)

### `parseExpression`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:577` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `parseNodes` (1)

**Calls:**
- `parseInlineIf` (1)

### `Type$1`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:255` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `forEach` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/draft7.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:99` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `async recordEvent` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLStringWriter.js:35` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `(anonymous)` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLStringWriter.js:7` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `inlineRefSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/core/ref.js:38` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `keywordCode` (1)

**Calls:**
- `subschema` (1)

### `compile`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:1023` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `_compile` (1)

**Calls:**
- `parseAsRoot` (1)

### `resolveSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:177` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `resolveRef` (1)

**Calls:**
- `getFullPath` (1)

### `test`
`[native code]` | Self: 0.0% (0us) | Total: 0.0% (3.2ms) | Samples: 0

**Called by:**
- `getProperty` (1)
- `bound test` (1)

**Calls:**
- `/^[a-z$_][a-z$_0-9]*$/i` (1)
- `/^(?:(?:25[0-5]\|2[0-4]\d\|1\d{2}\|[1-9]\d\|\d)\.){3}(?:25[0-5]\|2[0-4]\d\|1\d{2}\|[1-9]\d\|\d)$/u` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/externalclient.js:17` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/sync-inflate.js:3` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `installMemoryProbe`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:508` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `async main` (1)

**Calls:**
- `setInterval` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:9` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:822` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `Type$1` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/jpeg-js@0.4.4/node_modules/jpeg-js/index.js:1` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `tokenCountWithPending`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:247` | Self: 0.0% (0us) | Total: 0.2% (11.8ms) | Samples: 0

**Called by:**
- `shouldCompact` (6)
- `get shouldBlock` (1)
- `shouldBlock` (1)

**Calls:**
- `get tokenCountWithPending` (8)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:184` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `applyObservationMasking` (1)

**Calls:**
- `push` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:192` | Self: 0.0% (0us) | Total: 0.2% (8.7ms) | Samples: 0

**Called by:**
- `code` (6)

**Calls:**
- `groupKeywords` (5)
- `groupKeywords` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/index.js:31` | Self: 0.0% (0us) | Total: 0.3% (17.2ms) | Samples: 0

**Calls:**
- `bound require` (10)

### `node:assert`
`node:assert:588` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `assign` (1)

### `async beforeStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:273` | Self: 0.0% (0us) | Total: 38.5% (1.67s) | Samples: 0

**Called by:**
- `async (anonymous)` (1108)

**Calls:**
- `async beforeStep` (1059)
- `async beforeStep` (27)
- `async beforeStep` (14)
- `async beforeStep` (8)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:19` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js:828` | Self: 0.0% (0us) | Total: 0.0% (1.8ms) | Samples: 0

**Called by:**
- `init` (1)

**Calls:**
- `init` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:13` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/tokenHandler.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `node:events`
`node:events:9` | Self: 0.0% (0us) | Total: 0.0% (3.1ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `compile`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:518` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `render` (1)

**Calls:**
- `_compile` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/parser.js:385` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `(anonymous)` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/png.js:7` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `async chatWithRetry`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/retry.ts:37` | Self: 0.0% (0us) | Total: 18.4% (799.0ms) | Samples: 0

**Called by:**
- `async executeLoopStep` (528)

**Calls:**
- `async chatWithRetry` (528)

### `compile`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:159` | Self: 0.0% (0us) | Total: 0.2% (10.3ms) | Samples: 0

**Called by:**
- `validateExecutableToolArgs` (7)

**Calls:**
- `_addSchema` (7)

### `checkAutoCompaction`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:313` | Self: 0.0% (0us) | Total: 0.4% (20.4ms) | Samples: 0

**Called by:**
- `async beforeStep` (14)

**Calls:**
- `get shouldCompact` (8)
- `shouldCompact` (6)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gaxios@7.1.4/node_modules/gaxios/build/cjs/src/index.js:31` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:719` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `clone` (1)

### `parseAnd`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:605` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `parseOr` (1)

**Calls:**
- `parseNot` (1)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:215` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `async beforeStep` (1)

**Calls:**
- `get modelCapabilities` (1)

### `strConcat`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/code.js:121` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `errorInstancePath` (1)

**Calls:**
- `emptyStr` (1)

### `loadDocuments`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2784` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `load$1` (1)

**Calls:**
- `readDocument` (1)

### `render`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:440` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `compile` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/picomatch@4.0.4/node_modules/picomatch/index.js:3` | Self: 0.0% (0us) | Total: 0.2% (10.7ms) | Samples: 0

**Calls:**
- `bound require` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/read.ts:163` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `render` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:1374` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (1)

### `iterateKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:219` | Self: 0.0% (0us) | Total: 0.2% (8.7ms) | Samples: 0

**Called by:**
- `groupKeywords` (5)
- `groupKeywords` (1)

**Calls:**
- `block` (6)

### `forEach`
`[native code]` | Self: 0.0% (0us) | Total: 0.1% (5.0ms) | Samples: 0

**Called by:**
- `_addVocabularies` (1)
- `code` (1)
- `Type$1` (1)

**Calls:**
- `(anonymous)` (1)
- `addVocabulary` (1)
- `(anonymous)` (1)

### `applyPruning`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:276` | Self: 0.0% (0us) | Total: 0.4% (19.8ms) | Samples: 0

**Called by:**
- `async beforeStep` (13)

**Calls:**
- `estimateTokensForMessages` (13)

### `parseOr`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:597` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `parseInlineIf` (1)

**Calls:**
- `parseAnd` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/jws@4.0.1/node_modules/jws/index.js:2` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/get-intrinsic@1.3.0/node_modules/get-intrinsic/index.js:57` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `shouldCompact`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:255` | Self: 0.0% (0us) | Total: 0.1% (8.5ms) | Samples: 0

**Called by:**
- `checkAutoCompaction` (6)

**Calls:**
- `tokenCountWithPending` (6)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gcp-metadata@8.1.2/node_modules/gcp-metadata/build/src/index.js:67` | Self: 0.0% (0us) | Total: 0.0% (3.0ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/get-proto@1.0.1/node_modules/get-proto/index.js:6` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:4` | Self: 0.0% (0us) | Total: 0.1% (6.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (4)

**Calls:**
- `bound require` (4)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@jimp+plugin-resize@1.6.1/node_modules/@jimp/plugin-resize/dist/esm/constants.js:26` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:70` | Self: 0.0% (0us) | Total: 0.1% (7.2ms) | Samples: 0

**Called by:**
- `code` (5)

**Calls:**
- `typeAndKeywords` (4)
- `typeAndKeywords` (1)

### `errorObject`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:91` | Self: 0.0% (0us) | Total: 0.0% (2.6ms) | Samples: 0

**Called by:**
- `reportError` (2)

**Calls:**
- `errorInstancePath` (2)

### `async runRunnableToolCall`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:450` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `async runRunnableToolCall` (1)

**Calls:**
- `async executeTool` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/aos/EncodeForRegExpEscape.js:16` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `node:http`
`node:http:2` | Self: 0.0% (0us) | Total: 0.3% (15.1ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `anonymous` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocType.js:186` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `(anonymous)` (1)

### `internal:streams/duplex`
`internal:streams/duplex:2` | Self: 0.0% (0us) | Total: 0.0% (3.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:187` | Self: 0.0% (0us) | Total: 0.2% (12.4ms) | Samples: 0

**Called by:**
- `map` (8)

**Calls:**
- `cloneObject` (8)

### `onMessage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:327` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `commitMessage` (1)

**Calls:**
- `pushHistorySideEffects` (1)

### `optimize`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:597` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `compileSchema` (1)

**Calls:**
- `reduce` (1)

### `get hasProvider`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:94` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `update` (1)

**Calls:**
- `tryResolvedProviderConfig` (1)

### `computeCompletionBudgetCap`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/completion-budget.ts:72` | Self: 0.0% (0us) | Total: 18.3% (797.4ms) | Samples: 0

**Called by:**
- `applyCompletionBudget` (527)

**Calls:**
- `estimateTokensForMessages` (527)

### `typeAndKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:127` | Self: 0.0% (0us) | Total: 0.0% (2.7ms) | Samples: 0

**Called by:**
- `subSchemaObjCode` (1)
- `(anonymous)` (1)

**Calls:**
- `coerceAndCheckDataType` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/gtoken/googleToken.js:18` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `loadAssertionError`
`node:assert:28` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `get` (1)

**Calls:**
- `anonymous` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-logging-utils@1.1.3/node_modules/google-logging-utils/build/src/logging-utils.js:58` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `OpenAICompletionsChatProvider`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/openai-completions.ts:405` | Self: 0.0% (0us) | Total: 0.1% (7.6ms) | Samples: 0

**Called by:**
- `createProvider` (5)

**Calls:**
- `OpenAI` (1)
- `OpenAI` (1)
- `OpenAI` (1)
- `OpenAI` (1)
- `OpenAI` (1)

### `get shouldCompact`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:255` | Self: 0.0% (0us) | Total: 0.2% (11.9ms) | Samples: 0

**Called by:**
- `checkAutoCompaction` (8)

**Calls:**
- `get tokenCountWithPending` (7)
- `get maxContextSize` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js:242` | Self: 0.0% (0us) | Total: 0.1% (4.5ms) | Samples: 0

**Called by:**
- `anonymous` (3)

**Calls:**
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)

### `applyPruning`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:263` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `async beforeStep` (1)

**Calls:**
- `map` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/json-bigint@1.0.0/node_modules/json-bigint/index.js:1` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/define-data-property@1.1.4/node_modules/define-data-property/index.js:8` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

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
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/set-function-length@1.2.2/node_modules/set-function-length/index.js:3` | Self: 0.0% (0us) | Total: 0.0% (3.1ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `async runTurn`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/run-turn.ts:93` | Self: 0.0% (0us) | Total: 38.5% (1.67s) | Samples: 0

**Called by:**
- `(anonymous)` (842)
- `async runTurn` (266)

**Calls:**
- `async executeLoopStep` (1108)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/args-validator.ts:9` | Self: 0.0% (0us) | Total: 0.0% (1.8ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `Ajv2019` (1)

### `async beforeStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:577` | Self: 0.0% (0us) | Total: 38.5% (1.67s) | Samples: 0

**Called by:**
- `async executeLoopStep` (1108)

**Calls:**
- `async (anonymous)` (1108)

### `createPerfAgent`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:298` | Self: 0.0% (0us) | Total: 0.1% (4.9ms) | Samples: 0

**Called by:**
- `async runModeA` (3)

**Calls:**
- `update` (1)
- `update` (1)
- `update` (1)

### `composeNode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2553` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `readBlockMapping` (1)

**Calls:**
- `readPlainScalar` (1)

### `func`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:587` | Self: 0.0% (0us) | Total: 0.1% (7.2ms) | Samples: 0

**Called by:**
- `validateFunction` (5)

**Calls:**
- `code` (5)

### `defaultMeta`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/ajv.js:29` | Self: 0.0% (0us) | Total: 0.2% (8.8ms) | Samples: 0

**Called by:**
- `validateSchema` (6)

**Calls:**
- `_compileSchemaEnv` (6)

### `errorInstancePath`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:101` | Self: 0.0% (0us) | Total: 0.0% (2.6ms) | Samples: 0

**Called by:**
- `errorObject` (2)

**Calls:**
- `strConcat` (1)
- `str` (1)

### `async appendTranscriptRecord`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:690` | Self: 0.0% (0us) | Total: 0.1% (5.7ms) | Samples: 0

**Called by:**
- `async recordEvent` (4)

**Calls:**
- `async (anonymous)` (3)
- `driveAsyncFunction` (1)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:397` | Self: 0.0% (0us) | Total: 0.0% (3.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `structuredClone` (2)

### `createProvider`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/kosong/src/providers/index.ts:24` | Self: 0.0% (0us) | Total: 0.1% (7.6ms) | Samples: 0

**Called by:**
- `resolveModelCapabilities` (5)

**Calls:**
- `OpenAICompletionsChatProvider` (5)

### `getProperty`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/code.js:141` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `propertyInData` (1)

**Calls:**
- `test` (1)

### `readDocument`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2721` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `loadDocuments` (1)

**Calls:**
- `composeNode` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/call-bind@1.0.9/node_modules/call-bind/index.js:3` | Self: 0.0% (0us) | Total: 0.0% (3.1ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:20` | Self: 0.0% (0us) | Total: 0.1% (4.5ms) | Samples: 0

**Called by:**
- `anonymous` (3)

**Calls:**
- `bound require` (3)

### `async appendLoopEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:301` | Self: 0.0% (0us) | Total: 0.0% (2.7ms) | Samples: 0

**Called by:**
- `async appendLoopEvent` (2)

**Calls:**
- `async foldLoopEvent` (2)

### `flatIntoArrayWithCallback`
`[native code]` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `flatIntoArray` (1)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:195` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `applyObservationMasking` (1)

**Calls:**
- `has` (1)

### `ws`
`ws:3` | Self: 0.0% (0us) | Total: 0.3% (15.1ms) | Samples: 0

**Calls:**
- `anonymous` (2)

### `async runModeA`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:563` | Self: 0.0% (0us) | Total: 0.1% (4.9ms) | Samples: 0

**Called by:**
- `async runModeA` (3)

**Calls:**
- `createPerfAgent` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/index.js:65` | Self: 0.0% (0us) | Total: 0.1% (4.5ms) | Samples: 0

**Called by:**
- `anonymous` (3)

**Calls:**
- `(anonymous)` (3)

### `async main`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:693` | Self: 0.0% (0us) | Total: 0.1% (4.9ms) | Samples: 0

**Called by:**
- `async main` (3)

**Calls:**
- `async runModeA` (3)

### `code`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/applicator/properties.js:32` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `keywordCode` (1)

**Calls:**
- `propertyInData` (1)

### `_boolean`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js:369` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `ZodBoolean` (1)

### `get modelCapabilities`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:133` | Self: 0.0% (0us) | Total: 0.2% (9.2ms) | Samples: 0

**Called by:**
- `emitStatusUpdated` (4)
- `get maxContextSize` (1)
- `applyObservationMasking` (1)

**Calls:**
- `tryResolvedProviderConfig` (6)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `estimateTokensForContentPart`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:60` | Self: 0.0% (0us) | Total: 3.3% (143.6ms) | Samples: 0

**Called by:**
- `estimateTokensForMessage` (96)

**Calls:**
- `estimateTokens` (96)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/computeclient.js:19` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/builder.js:127` | Self: 0.0% (0us) | Total: 0.1% (4.5ms) | Samples: 0

**Called by:**
- `anonymous` (3)

**Calls:**
- `(anonymous)` (3)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:321` | Self: 0.0% (0us) | Total: 0.1% (5.8ms) | Samples: 0

**Called by:**
- `async onTextPart` (4)

**Calls:**
- `dispatchEvent` (2)
- `async recordEvent` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xml2js@0.5.0/node_modules/xml2js/lib/xml2js.js:12` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:958` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `_boolean` (1)

### `groupKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:208` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `iterateKeywords` (1)

### `Realtime`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/realtime/realtime.mjs:10` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `OpenAI` (1)

**Calls:**
- `ClientSecrets` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/inflate.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `logRecord`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/records/index.ts:40` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `recordApprovalResult` (1)

**Calls:**
- `cloneObject` (1)

### `bound require`
`[native code]` | Self: 0.0% (0us) | Total: 5.2% (225.8ms) | Samples: 0

**Called by:**
- `(anonymous)` (10)
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

**Calls:**
- `require` (133)
- `anonymous` (3)

### `parseNodes`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:988` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `parseAsRoot` (1)

**Calls:**
- `parseExpression` (1)

### `reportError`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:20` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `reportTypeError` (1)

**Calls:**
- `addError` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/runtime/uri.js:3` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:415` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `init` (1)

**Calls:**
- `init` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/compiler.js:5` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `reportTypeError`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/dataType.js:185` | Self: 0.0% (0us) | Total: 0.0% (2.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `reportError` (1)
- `reportError` (1)

### `applyCompletionBudget`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/completion-budget.ts:105` | Self: 0.0% (0us) | Total: 18.3% (797.4ms) | Samples: 0

**Called by:**
- `async chatOnce` (527)

**Calls:**
- `computeCompletionBudgetCap` (527)

### `get shouldBlock`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:259` | Self: 0.0% (0us) | Total: 0.2% (10.6ms) | Samples: 0

**Called by:**
- `async beforeStep` (7)

**Calls:**
- `get tokenCountWithPending` (6)
- `tokenCountWithPending` (1)

### `readBlockMapping`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2260` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `composeNode` (1)

**Calls:**
- `composeNode` (1)

### `require`
`[native code]` | Self: 0.0% (0us) | Total: 5.1% (221.4ms) | Samples: 0

**Called by:**
- `bound require` (133)

**Calls:**
- `anonymous` (132)
- `get` (1)

### `typeAndKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:128` | Self: 0.0% (0us) | Total: 0.2% (11.6ms) | Samples: 0

**Called by:**
- `subSchemaObjCode` (4)
- `(anonymous)` (4)

**Calls:**
- `schemaKeywords` (6)
- `schemaKeywords` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gifwrap@0.10.1/node_modules/gifwrap/src/index.js:7` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `parseAsRoot`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:1005` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `compile` (1)

**Calls:**
- `parseNodes` (1)

### `async main`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:684` | Self: 0.0% (0us) | Total: 0.1% (6.3ms) | Samples: 0

**Called by:**
- `(module)` (4)

**Calls:**
- `async main` (3)
- `async main` (1)

### `VectorStores`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/resources/vector-stores/vector-stores.mjs:13` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `OpenAI` (1)

**Calls:**
- `Files` (1)

### `commitMessage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/wire-fold.ts:295` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `async foldLoopEvent` (1)

**Calls:**
- `onMessage` (1)

### `coerceAndCheckDataType`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/dataType.js:46` | Self: 0.0% (0us) | Total: 0.0% (2.7ms) | Samples: 0

**Called by:**
- `typeAndKeywords` (2)

**Calls:**
- `if` (2)

### `maskToolResult`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:109` | Self: 0.0% (0us) | Total: 0.2% (12.1ms) | Samples: 0

**Called by:**
- `applyObservationMasking` (8)

**Calls:**
- `countLines` (4)
- `countLines` (3)
- `countLines` (1)

### `code`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/limitNumber.js:23` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `keywordCode` (1)

**Calls:**
- `fail` (1)

### `update`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:62` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `createPerfAgent` (1)

**Calls:**
- `initializeBuiltinTools` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:32` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `clone` (1)

### `addKeyword`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:363` | Self: 0.0% (0us) | Total: 0.0% (1.8ms) | Samples: 0

**Called by:**
- `addVocabulary` (1)

**Calls:**
- `eachItem` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:22` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `block`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:568` | Self: 0.0% (0us) | Total: 0.5% (21.9ms) | Samples: 0

**Called by:**
- `schemaKeywords` (6)
- `iterateKeywords` (6)
- `schemaKeywords` (2)
- `validateUnion` (1)

**Calls:**
- `code` (15)

### `validate`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:153` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `validateSchema` (1)

**Calls:**
- `validate0` (1)

### `get ReadStream`
`node:fs:578` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Calls:**
- `anonymous` (1)

### `async beforeStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:277` | Self: 0.0% (0us) | Total: 36.7% (1.59s) | Samples: 0

**Called by:**
- `async beforeStep` (1059)

**Calls:**
- `applyObservationMasking` (1057)
- `applyObservationMasking` (1)
- `applyObservationMasking` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:222` | Self: 0.0% (0us) | Total: 0.2% (8.7ms) | Samples: 0

**Called by:**
- `code` (6)

**Calls:**
- `keywordCode` (6)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:51` | Self: 0.0% (0us) | Total: 38.5% (1.67s) | Samples: 0

**Called by:**
- `async runTurn` (1108)

**Calls:**
- `async executeLoopStep` (1108)

### `getFullPath`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/resolve.js:74` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `resolveSchema` (1)

**Calls:**
- `parse` (1)

### `node:_http_server`
`node:_http_server:42` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/dunder-proto@1.0.1/node_modules/dunder-proto/get.js:3` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/index.js:3` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `resolveRef`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:133` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `code` (1)

**Calls:**
- `resolveSchema` (1)

### `eachItem`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/util.js:88` | Self: 0.0% (0us) | Total: 0.0% (1.8ms) | Samples: 0

**Called by:**
- `addKeyword` (1)

**Calls:**
- `addRule` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/function-bind@1.1.2/node_modules/function-bind/index.js:3` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `applyPruning`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:244` | Self: 0.0% (0us) | Total: 0.4% (19.9ms) | Samples: 0

**Called by:**
- `async beforeStep` (10)

**Calls:**
- `get tokenCountWithPending` (10)

### `clone`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/util.js:251` | Self: 0.0% (0us) | Total: 0.0% (3.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)
- `(module)` (1)

**Calls:**
- `ZodNumber` (1)
- `ZodObject` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@3.25.76/node_modules/zod/v3/helpers/util.js:59` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (1)

### `internal:streams/add-abort-signal`
`internal:streams/add-abort-signal:2` | Self: 0.0% (0us) | Total: 0.0% (3.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:774` | Self: 0.0% (0us) | Total: 0.1% (6.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (4)

**Calls:**
- `async main` (4)

### `node:_http_client`
`node:_http_client:8` | Self: 0.0% (0us) | Total: 0.3% (13.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `async withProviderRequestAuth`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/request-auth.ts:20` | Self: 0.0% (0us) | Total: 18.7% (815.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (537)

**Calls:**
- `(anonymous)` (537)

### `get maxContextSize`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:251` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `get shouldCompact` (1)

**Calls:**
- `get modelCapabilities` (1)

### `validateExecutableToolArgs`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:234` | Self: 0.0% (0us) | Total: 0.2% (10.3ms) | Samples: 0

**Called by:**
- `preflightToolCall` (7)

**Calls:**
- `compile` (7)

### `async afterStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:584` | Self: 0.0% (0us) | Total: 0.1% (4.4ms) | Samples: 0

**Called by:**
- `async executeLoopStep` (3)

**Calls:**
- `async (anonymous)` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/standardwebhooks@1.0.0/node_modules/standardwebhooks/dist/index.js:5` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:12` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `defineProperties` (1)

### `async beforeStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:298` | Self: 0.0% (0us) | Total: 0.4% (20.4ms) | Samples: 0

**Called by:**
- `async beforeStep` (14)

**Calls:**
- `checkAutoCompaction` (14)

### `tryResolvedProviderConfig`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/config/index.ts:143` | Self: 0.0% (0us) | Total: 0.2% (10.6ms) | Samples: 0

**Called by:**
- `get modelCapabilities` (6)
- `get hasProvider` (1)

**Calls:**
- `resolveRuntimeProvider` (7)

### `validateUnion`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/code.js:115` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `keywordCode` (1)

**Calls:**
- `block` (1)

### `parseAgentProfileYaml`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:76` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `finalizeRawAgentProfileSource` (1)

**Calls:**
- `load$1` (1)

### `finalizeRawAgentProfileSource`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:67` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `map` (1)

**Calls:**
- `parseAgentProfileYaml` (1)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:691` | Self: 0.0% (0us) | Total: 0.0% (4.3ms) | Samples: 0

**Called by:**
- `async appendTranscriptRecord` (3)

**Calls:**
- `async appendLoopEvent` (3)

### `emitStatusUpdated`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:606` | Self: 0.0% (0us) | Total: 0.1% (6.2ms) | Samples: 0

**Called by:**
- `record` (3)
- `applyObservationMasking` (1)

**Calls:**
- `get modelCapabilities` (4)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/utif2@4.1.0/node_modules/utif2/UTIF.js:1648` | Self: 0.0% (0us) | Total: 0.0% (3.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `(anonymous)` (2)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/image-q@4.0.0/node_modules/image-q/dist/esm/image-q.mjs:30` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/jws@4.0.1/node_modules/jws/lib/sign-stream.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `project`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:42` | Self: 0.0% (0us) | Total: 0.5% (24.2ms) | Samples: 0

**Called by:**
- `buildMessages` (9)
- `launch` (7)

**Calls:**
- `mergeAdjacentUserMessages` (16)

### `subSchemaObjCode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:115` | Self: 0.0% (0us) | Total: 0.1% (7.1ms) | Samples: 0

**Called by:**
- `subschemaCode` (5)

**Calls:**
- `typeAndKeywords` (4)
- `typeAndKeywords` (1)

### `ZodString`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` | Self: 0.0% (0us) | Total: 0.0% (2.6ms) | Samples: 0

**Called by:**
- `_string` (2)

**Calls:**
- `init` (2)

### `async chatWithRetry`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/retry.ts:54` | Self: 0.0% (0us) | Total: 18.4% (799.0ms) | Samples: 0

**Called by:**
- `async chatWithRetry` (528)

**Calls:**
- `async chat` (528)

### `GlobTool`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/glob.ts:123` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `initializeBuiltinTools` (1)

**Calls:**
- `(anonymous)` (1)

### `get names`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/code.js:47` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `addExprNames` (1)

**Calls:**
- `reduce` (1)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:234` | Self: 0.0% (0us) | Total: 0.1% (4.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (3)

**Calls:**
- `async afterStep` (3)

### `shouldBlock`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:259` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `async beforeStep` (1)

**Calls:**
- `tokenCountWithPending` (1)

### `get tokenCountWithPending`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:146` | Self: 0.0% (0us) | Total: 1.1% (51.3ms) | Samples: 0

**Called by:**
- `get tokenCountWithPending` (13)
- `applyPruning` (10)
- `tokenCountWithPending` (8)

**Calls:**
- `estimateTokensForMessages` (30)
- `project` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/parser-sync.js:5` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `composeNode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2536` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `readBlockMapping` (1)

**Calls:**
- `readBlockSequence` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/googleauth.js:25` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `readBlockSequence`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2104` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `composeNode` (1)

**Calls:**
- `composeNode` (1)

### `validateSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:255` | Self: 0.0% (0us) | Total: 0.2% (8.8ms) | Samples: 0

**Called by:**
- `_addSchema` (6)

**Calls:**
- `defaultMeta` (6)

### `async chatOnce`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:119` | Self: 0.0% (0us) | Total: 0.1% (5.8ms) | Samples: 0

**Called by:**
- `(anonymous)` (4)

**Calls:**
- `async onTextPart` (4)

### `_compile`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:526` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `compile` (1)

**Calls:**
- `compile` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/index.js:4` | Self: 0.0% (0us) | Total: 0.1% (4.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (3)

**Calls:**
- `bound require` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/jwtclient.js:17` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `async runTurns`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:317` | Self: 0.0% (0us) | Total: 0.2% (11.1ms) | Samples: 0

**Called by:**
- `(anonymous)` (7)

**Calls:**
- `prompt` (7)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/lib/zlib/inflate.js:25` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `addError`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:60` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `reportError` (1)

**Calls:**
- `if` (1)

### `resolveModelCapabilities`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts:254` | Self: 0.0% (0us) | Total: 0.1% (7.6ms) | Samples: 0

**Called by:**
- `resolveRuntimeProvider` (5)

**Calls:**
- `createProvider` (5)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/dataType.js:50` | Self: 0.0% (0us) | Total: 0.0% (2.7ms) | Samples: 0

**Called by:**
- `code` (2)

**Calls:**
- `reportTypeError` (2)

### `schemaKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:185` | Self: 0.0% (0us) | Total: 0.0% (2.9ms) | Samples: 0

**Called by:**
- `typeAndKeywords` (2)

**Calls:**
- `block` (2)

### `reduce`
`[native code]` | Self: 0.0% (0us) | Total: 0.1% (7.5ms) | Samples: 0

**Called by:**
- `get names` (2)
- `optimize` (1)
- `get names` (1)
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (4)
- `(anonymous)` (1)

### `buildMessages`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:552` | Self: 0.0% (0us) | Total: 0.3% (14.4ms) | Samples: 0

**Called by:**
- `async executeLoopStep` (10)

**Calls:**
- `project` (9)
- `project` (1)

### `compileSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:80` | Self: 0.0% (0us) | Total: 0.1% (7.2ms) | Samples: 0

**Called by:**
- `_compileMetaSchema` (5)

**Calls:**
- `validateFunctionCode` (5)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:181` | Self: 0.0% (0us) | Total: 0.1% (6.0ms) | Samples: 0

**Called by:**
- `reduce` (4)

**Calls:**
- `get names` (2)
- `get names` (1)
- `reduce` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:4` | Self: 0.0% (0us) | Total: 0.1% (4.8ms) | Samples: 0

**Called by:**
- `anonymous` (3)

**Calls:**
- `bound require` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/index.js:9` | Self: 0.0% (0us) | Total: 0.1% (4.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (3)

**Calls:**
- `bound require` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:3` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `reportError`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/errors.js:18` | Self: 0.0% (0us) | Total: 0.0% (2.6ms) | Samples: 0

**Called by:**
- `_error` (1)
- `reportTypeError` (1)

**Calls:**
- `errorObject` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js:551` | Self: 0.0% (0us) | Total: 0.0% (1.8ms) | Samples: 0

**Called by:**
- `init` (1)

**Calls:**
- `init` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gifwrap@0.10.1/node_modules/gifwrap/src/gifutil.js:6` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `if`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:463` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `addError` (1)

**Calls:**
- `_elseNode` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/parser-async.js:8` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:216` | Self: 0.0% (0us) | Total: 36.6% (1.59s) | Samples: 0

**Called by:**
- `async beforeStep` (1057)

**Calls:**
- `applyObservationMasking` (543)
- `applyObservationMasking` (499)
- `applyObservationMasking` (13)
- `applyObservationMasking` (1)
- `applyObservationMasking` (1)

### `toInputJsonSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/support/input-schema.ts:27` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `toJSONSchema` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/index.js:15` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:8` | Self: 0.0% (0us) | Total: 0.0% (3.1ms) | Samples: 0

**Called by:**
- `anonymous` (2)

**Calls:**
- `bound require` (2)

### `dispatchEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:141` | Self: 0.0% (0us) | Total: 0.0% (2.9ms) | Samples: 0

**Called by:**
- `async (anonymous)` (2)

**Calls:**
- `async recordEvent` (2)

### `load$1`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs:2810` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `parseAgentProfileYaml` (1)

**Calls:**
- `loadDocuments` (1)

### `async beforeStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:299` | Self: 0.0% (0us) | Total: 0.2% (12.3ms) | Samples: 0

**Called by:**
- `async beforeStep` (8)

**Calls:**
- `get shouldBlock` (7)
- `shouldBlock` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/shared/auth.js:171` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `string` (1)

### `subschemaCode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:91` | Self: 0.0% (0us) | Total: 0.1% (7.1ms) | Samples: 0

**Called by:**
- `subschema` (5)

**Calls:**
- `subSchemaObjCode` (5)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pngjs@7.0.0/node_modules/pngjs/lib/parser-async.js:4` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `async recordEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts:162` | Self: 0.0% (0us) | Total: 0.1% (5.7ms) | Samples: 0

**Called by:**
- `async recordEvent` (4)

**Calls:**
- `async appendTranscriptRecord` (4)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/validation/index.js:5` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `Ajv2019`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/2019.js:14` | Self: 0.0% (0us) | Total: 0.0% (1.8ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `Ajv` (1)

### `addExprNames`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:643` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `get names` (1)

**Calls:**
- `get names` (1)

### `estimateTokensForMessages`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:29` | Self: 0.0% (0us) | Total: 93.6% (4.06s) | Samples: 0

**Called by:**
- `applyObservationMasking` (543)
- `buildLlmRequestMetadata` (536)
- `async (anonymous)` (533)
- `computeCompletionBudgetCap` (527)
- `applyObservationMasking` (499)
- `get tokenCountWithPending` (30)
- `applyPruning` (13)
- `async (anonymous)` (1)

**Calls:**
- `estimateTokensForMessage` (2397)
- `estimateTokensForMessage` (245)
- `estimateTokensForMessage` (33)
- `estimateTokensForMessage` (4)
- `estimateTokensForMessage` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/utif2@4.1.0/node_modules/utif2/UTIF.js:12` | Self: 0.0% (0us) | Total: 0.0% (3.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `bound require` (2)

### `project`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:30` | Self: 0.0% (0us) | Total: 0.0% (3.1ms) | Samples: 0

**Called by:**
- `buildMessages` (1)
- `get tokenCountWithPending` (1)

**Calls:**
- `filter` (2)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/picomatch@4.0.4/node_modules/picomatch/lib/picomatch.js:4` | Self: 0.0% (0us) | Total: 0.2% (10.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `schemaKeywords`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:190` | Self: 0.0% (0us) | Total: 0.2% (8.7ms) | Samples: 0

**Called by:**
- `typeAndKeywords` (6)

**Calls:**
- `block` (6)

### `compileSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/index.js:81` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `_compileMetaSchema` (1)

**Calls:**
- `optimize` (1)

### `_compileSchemaEnv`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:471` | Self: 0.0% (0us) | Total: 0.2% (8.8ms) | Samples: 0

**Called by:**
- `defaultMeta` (6)

**Calls:**
- `_compileMetaSchema` (6)

### `node:crypto`
`node:crypto:2` | Self: 0.0% (0us) | Total: 0.0% (3.3ms) | Samples: 0

**Calls:**
- `anonymous` (1)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts:156` | Self: 0.0% (0us) | Total: 18.7% (815.1ms) | Samples: 0

**Called by:**
- `applyObservationMasking` (543)

**Calls:**
- `estimateTokensForMessages` (543)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/parse-bmfont-xml@1.1.6/node_modules/parse-bmfont-xml/lib/index.js:1` | Self: 0.0% (0us) | Total: 0.1% (6.1ms) | Samples: 0

**Called by:**
- `(anonymous)` (4)

**Calls:**
- `bound require` (4)

### `validateFunction`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:37` | Self: 0.0% (0us) | Total: 0.1% (7.2ms) | Samples: 0

**Called by:**
- `topSchemaObjCode` (5)

**Calls:**
- `func` (5)

### `fail`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:348` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `code` (1)

**Calls:**
- `error` (1)

### `applyPropertySchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/applicator/properties.js:45` | Self: 0.0% (0us) | Total: 0.0% (4.1ms) | Samples: 0

**Called by:**
- `code` (3)

**Calls:**
- `subschema` (3)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/code.js:116` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `forEach` (1)

**Calls:**
- `subschema` (1)

### `_string`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/api.js:7` | Self: 0.0% (0us) | Total: 0.0% (2.6ms) | Samples: 0

**Called by:**
- `string` (2)

**Calls:**
- `ZodString` (2)

### `OpenAI`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs:111` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `OpenAICompletionsChatProvider` (1)

**Calls:**
- `Realtime` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/draft7.js:5` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/get-intrinsic@1.3.0/node_modules/get-intrinsic/index.js:18` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/environment.js:9` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/applicator/index.js:9` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/default.ts:19` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `loadAgentProfilesFromSources` (1)

### `async foldLoopEvent`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/wire-fold.ts:170` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `async foldLoopEvent` (1)

**Calls:**
- `commitMessage` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:258` | Self: 0.0% (0us) | Total: 18.7% (815.9ms) | Samples: 0

**Called by:**
- `async withProviderRequestAuth` (537)

**Calls:**
- `logLlmRequest` (537)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:423` | Self: 0.0% (0us) | Total: 18.6% (810.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (533)

**Calls:**
- `estimateTokensForMessages` (533)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/tools/builtin/file/grep.ts:77` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gaxios@7.1.4/node_modules/gaxios/build/cjs/src/gaxios.js:20` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `async chatOnce`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts:85` | Self: 0.0% (0us) | Total: 18.4% (799.0ms) | Samples: 0

**Called by:**
- `async chat` (528)

**Calls:**
- `async chatOnce` (527)
- `async chatOnce` (1)

### `_error`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:371` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `error` (1)

**Calls:**
- `reportError` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv-formats@3.0.1/node_modules/ajv-formats/dist/index.js:3` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `async beforeStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/compaction/full.ts:289` | Self: 0.0% (0us) | Total: 1.0% (45.9ms) | Samples: 0

**Called by:**
- `async beforeStep` (27)

**Calls:**
- `applyPruning` (13)
- `applyPruning` (10)
- `applyPruning` (2)
- `applyPruning` (1)
- `applyPruning` (1)

### `propertyInData`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/vocabularies/code.js:38` | Self: 0.0% (0us) | Total: 0.0% (1.6ms) | Samples: 0

**Called by:**
- `code` (1)

**Calls:**
- `getProperty` (1)

### `start`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-scheduler.ts:66` | Self: 0.0% (0us) | Total: 0.0% (3.5ms) | Samples: 0

**Called by:**
- `add` (2)

**Calls:**
- `async start` (2)

### `async requestToolApproval`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/permission/index.ts:193` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `recordApprovalResult` (1)

### `estimateTokensForMessage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts:47` | Self: 0.0% (0us) | Total: 8.6% (374.7ms) | Samples: 0

**Called by:**
- `estimateTokensForMessages` (245)

**Calls:**
- `estimateTokensForContentPart` (120)
- `estimateTokensForContentPart` (96)
- `estimateTokens` (15)
- `estimateTokensForContentPart` (14)

### `async executeLoopStep`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/turn-step.ts:82` | Self: 0.0% (0us) | Total: 0.4% (17.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (12)

**Calls:**
- `buildMessages` (10)
- `applyCacheStaking` (1)
- `applyCacheStaking` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/index.js:7` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `loadAgentProfilesFromSources`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/profile/load.ts:20` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `map` (1)

### `recordApprovalResult`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/permission/index.ts:75` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `async requestToolApproval` (1)

**Calls:**
- `logRecord` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/regexp.escape@2.0.1/node_modules/regexp.escape/index.js:6` | Self: 0.0% (0us) | Total: 0.0% (3.0ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `bound require` (2)

### `nextToken`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:36` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `peekToken` (1)

**Calls:**
- `nextToken` (1)

### `launch`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:125` | Self: 0.0% (0us) | Total: 0.2% (11.1ms) | Samples: 0

**Called by:**
- `prompt` (7)

**Calls:**
- `project` (7)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/index.ts:585` | Self: 0.0% (0us) | Total: 0.1% (4.4ms) | Samples: 0

**Called by:**
- `async afterStep` (3)

**Calls:**
- `record` (3)

### `prompt`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:455` | Self: 0.0% (0us) | Total: 0.2% (11.1ms) | Samples: 0

**Called by:**
- `async runTurns` (7)

**Calls:**
- `launch` (7)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/google-auth-library@10.6.2/node_modules/google-auth-library/build/src/auth/oauth2client.js:18` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `cloneMessage`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts:187` | Self: 0.0% (0us) | Total: 0.4% (21.6ms) | Samples: 0

**Called by:**
- `mergeAdjacentUserMessages` (14)

**Calls:**
- `map` (14)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/pako@1.0.11/node_modules/pako/index.js:6` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocType.js:21` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `applyObservationMasking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts:230` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `async beforeStep` (1)

**Calls:**
- `emitStatusUpdated` (1)

### `optionalProcessor`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/json-schema-processors.js:515` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `process` (1)

**Calls:**
- `process` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/2020.js:7` | Self: 0.0% (0us) | Total: 0.0% (1.2ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `bound require` (1)

### `parseNot`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/nunjucks@3.2.4/node_modules/nunjucks/src/parser.js:613` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `parseAnd` (1)

**Calls:**
- `peekToken` (1)

### `validateSchema`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js:261` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `_addSchema` (1)

**Calls:**
- `validate` (1)

### `(module)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@modelcontextprotocol+sdk@1.29.0+3c5d820c62823f0b/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:1666` | Self: 0.0% (0us) | Total: 0.0% (1.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `string` (1)

### `init`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:21` | Self: 0.0% (0us) | Total: 0.4% (18.8ms) | Samples: 0

**Called by:**
- `ZodString` (2)
- `ZodObject` (2)
- `(anonymous)` (1)
- `ZodBoolean` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `ZodNumber` (1)
- `(anonymous)` (1)
- `$ZodCheckGreaterThan` (1)

**Calls:**
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

### `applyCacheStaking`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/cache-staking/index.ts:29` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `async executeLoopStep` (1)

**Calls:**
- `map` (1)

### `add`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-scheduler.ts:40` | Self: 0.0% (0us) | Total: 0.1% (5.0ms) | Samples: 0

**Called by:**
- `async runToolCallBatch` (3)

**Calls:**
- `start` (2)
- `start` (1)

### `(anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/gcp-metadata@8.1.2/node_modules/gcp-metadata/build/src/index.js:65` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `bound require` (1)

### `async runToolCallBatch`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts:126` | Self: 0.0% (0us) | Total: 0.2% (10.3ms) | Samples: 0

**Called by:**
- `async runToolCallBatch` (7)

**Calls:**
- `map` (7)

### `ZodBoolean`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js:40` | Self: 0.0% (0us) | Total: 0.0% (1.4ms) | Samples: 0

**Called by:**
- `_boolean` (1)

**Calls:**
- `init` (1)

### `parse`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/fast-uri@3.1.0/node_modules/fast-uri/index.js:260` | Self: 0.0% (0us) | Total: 0.0% (1.5ms) | Samples: 0

**Called by:**
- `getFullPath` (1)

**Calls:**
- `bound test` (1)

### `get names`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js:235` | Self: 0.0% (0us) | Total: 0.0% (3.0ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `reduce` (2)

### `buildLlmRequestMetadata`
`/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts:741` | Self: 0.0% (0us) | Total: 18.7% (814.3ms) | Samples: 0

**Called by:**
- `logLlmRequest` (536)

**Calls:**
- `estimateTokensForMessages` (536)

### `async (anonymous)`
`/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts:424` | Self: 0.0% (0us) | Total: 0.0% (1.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `estimateTokensForMessages` (1)

### `internal:streams/lazy_transform`
`internal:streams/lazy_transform:2` | Self: 0.0% (0us) | Total: 0.0% (3.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `topSchemaObjCode`
`/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/validate/index.js:62` | Self: 0.0% (0us) | Total: 0.1% (7.2ms) | Samples: 0

**Called by:**
- `validateFunctionCode` (5)

**Calls:**
- `validateFunction` (5)

## Files

| Self% | Self | File |
|------:|-----:|------|
| 88.7% | 3.85s | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/utils/tokens.ts` |
| 9.4% | 411.6ms | `[native code]` |
| 0.3% | 14.8ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/observation-masking.ts` |
| 0.1% | 6.1ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/index.ts` |
| 0.1% | 5.6ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/classic/schemas.js` |
| 0.1% | 4.7ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/openai@6.34.0/node_modules/openai/client.mjs` |
| 0.1% | 4.4ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/projector.ts` |
| 0.0% | 4.1ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/code.js` |
| 0.0% | 3.5ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/tool-call.ts` |
| 0.0% | 3.4ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/index.ts` |
| 0.0% | 3.2ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/schemas.js` |
| 0.0% | 3.0ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs` |
| 0.0% | 1.8ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/core.js` |
| 0.0% | 1.7ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/core.js` |
| 0.0% | 1.7ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@3.25.76/node_modules/zod/v3/helpers/util.js` |
| 0.0% | 1.7ms | `/Users/baifan/Projects/ByronFinn/agents/byf/scripts/perf/load.ts` |
| 0.0% | 1.7ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/cache-staking/index.ts` |
| 0.0% | 1.7ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/json-schema-processors.js` |
| 0.0% | 1.6ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/define-properties@1.2.1/node_modules/define-properties/index.js` |
| 0.0% | 1.6ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/image-q@4.0.0/node_modules/image-q/dist/esm/image-q.mjs` |
| 0.0% | 1.5ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/zod@4.3.6/node_modules/zod/v4/core/checks.js` |
| 0.0% | 1.5ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/turn/kosong-llm.ts` |
| 0.0% | 1.5ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/providers/runtime-provider.ts` |
| 0.0% | 1.4ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/loop/events.ts` |
| 0.0% | 1.4ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/ajv@8.18.0/node_modules/ajv/dist/compile/codegen/index.js` |
| 0.0% | 1.3ms | `/Users/baifan/Projects/ByronFinn/agents/byf/packages/agent-core/src/agent/context/wire-fold.ts` |
| 0.0% | 1.2ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/@jimp+plugin-resize@1.6.1/node_modules/@jimp/plugin-resize/dist/esm/constants.js` |
| 0.0% | 1.2ms | `/Users/baifan/Projects/ByronFinn/agents/byf/node_modules/.bun/xmlbuilder@11.0.1/node_modules/xmlbuilder/lib/XMLDocument.js` |
