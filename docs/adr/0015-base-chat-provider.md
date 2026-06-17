# ADR 0015: BaseChatProvider Abstract Base Class

## Status

Accepted

## Context

`packages/kosong` has four LLM provider adapters — `anthropic.ts` (1042 lines), `openai-responses.ts` (1006), `google-genai.ts` (899), `openai-completions.ts` (669). Each `implements ChatProvider` (an interface, no base class).

The `improve-architecture` scan (2026-06-17, finding H4) identified **14 duplicated patterns** across these adapters. The four most pervasive are 4-way near-identical copies:

1. **`StreamedMessage` class skeleton** — fields, getters, `[Symbol.asyncIterator]`, constructor branching (`anthropic.ts:525-584`, `openai-responses.ts:496-529`, `google-genai.ts:453-493`, `openai-completions.ts:282-325`).
2. **`_clone()` + `withGenerationKwargs`** — `Object.assign(Object.create(proto), this)` + deep-copy `_generationKwargs` (4 copies).
3. **`_createClient(auth)` wrapper** + accessor quartet (`modelName`/`modelParameters`/`getCapability`) — 4 copies each.
4. **`normalizeXxxFinishReason`** — structurally identical null-guard → switch → return, differing only in case labels (4 copies).

The existing shared module `openai-common.ts` serves only 2 of 4 adapters (the OpenAI family). Anthropic and Google are fully independent — they don't use it at all.

### Origin (why the design started this way)

Git history (`git log --diff-filter=A`) confirms all four providers arrived in the initial commit `f4a0872` — a fork of Kimi Code (Moonshot AI). The upstream design was inherited, not chosen by BYF. Three real reasons explain the upstream structure:

1. Each adapter wraps a **different official SDK** (`@anthropic-ai/sdk`, `openai`, `@google/genai`) with incompatible client types and constructors.
2. Upstream Kimi was itself OpenAI-compatible, so `openai-common.ts` was an OpenAI-family-internal toolkit, never a cross-provider abstraction.
3. BYF is a hard fork (CONTEXT.md: no upstream merges). Subsequent work (caching, observability) added fields by copy-pasting across 4 files because per-change cost was lower than refactor cost — debt accumulated silently.

### Why act now

The duplication is not static — it grows. The `cache-observability-cli.md` PRD added `inputCacheRead`/`inputCacheCreation` parsing by editing each adapter's `_extractUsage` independently. ADR 0011's stated goal ("adding a new provider requires only a new adapter") is undermined: a new provider today must copy-paste all 14 patterns.

A key grill insight: the duplication splits cleanly into two categories — **SDK-agnostic boilerplate** (`_clone`, accessors, `StreamedMessage` skeleton — nothing to do with which SDK is wrapped) and **protocol-specific logic** (`generate()`, message mapping, streaming parsing, cache-control injection — genuinely different per provider). Only the former should be shared.

## Decision

Introduce `abstract class BaseChatProvider implements ChatProvider` and `abstract class BaseStreamedMessage implements StreamedMessage`. Move SDK-agnostic boilerplate up; leave protocol-specific logic in subclasses.

### What moves up to the base class

- `_clone()` / `withGenerationKwargs()` — pure boilerplate, SDK-independent.
- Accessors: `modelName`, `modelParameters`, `getCapability` — return stored fields.
- `StreamedMessage` skeleton: fields, `[Symbol.asyncIterator]` forwarding, getter quartet.
- `_createClient(auth)` shell — delegates the actual SDK construction to a new abstract `createRawClient(auth, defaultHeaders)`.

### What stays in subclasses

- `generate()` — the streaming/dispatch loop, protocol-specific.
- Message mapping (`convertMessage`, content-part flattening) — protocol-specific.
- `createRawClient()` — `new OpenAI(...)` vs `new Anthropic(...)` vs `new GoogleGenAI(...)`.
- `thinkingEffort` getter — mapping logic differs per provider.

### Normalization: config-driven, in a new `provider-common.ts`

Structurally-identical-but-field-name-different logic becomes config-driven, placed in a new `provider-common.ts` (separate from `openai-common.ts`, which keeps OpenAI-family wire-format conversion):

- `makeFinishReasonNormalizer(mapping)` — shared switch skeleton, per-provider case-label table.
- `extractCacheUsage(total, cached, output)` — the `inputOther = input - cached` formula (the cache-observability parsing).
- `convertProviderError(error, opts?)` — the error-classification ladder (`NETWORK_RE`/`TIMEOUT_RE` + status normalization).

**Google's fetch handling is not pure duplication** (grill correction): `google-genai.ts:637` adds `| fetch failed` and `:655` checks `error instanceof TypeError && msg.includes('fetch')` because the Google SDK throws `TypeError` on network failures. `convertProviderError` accepts an optional `extraNetworkMatchers` hook so Google supplies its fetch-specific matcher rather than diverging the whole function.

### Migration order (grill decision 6)

1. Migrate `openai-completions` (establishes the base-class skeleton) **and** `anthropic` (validates the base class works across protocols, not just the OpenAI family) together as a tracer bullet.
2. Then batch-migrate `openai-responses` and `google-genai`.

This ensures the base-class design is proven on the most dissimilar consumer before being propagated, rather than discovering a design flaw on the third provider.

## Alternatives Considered

### A. Pure-function shared module (extend `openai-common.ts`)

No base class; extract duplicated code into pure functions in a shared module. Providers keep `implements ChatProvider` and call the functions.

**Rejected**: the boilerplate (`_clone`, accessors, `StreamedMessage` skeleton) is stateful and tied to instance fields (`_model`, `_generationKwargs`, `_client`). Pure-function sharing would still leave each provider declaring the same instance fields and wiring them to the shared functions — most of the copy-paste remains, just redirected. New providers still copy the field/boilerplate surface. The base class makes "extend and get the boilerplate for free" real.

### B. Extract only the core three (StreamedMessage + finish-reason + usage + error)

Don't touch `_clone`/`_createClient` (they're coupled to per-SDK client types).

**Rejected**: `_clone` is pure `Object.assign(Object.create(proto), this)` + deep-copy `_generationKwargs` — the SDK client type is irrelevant to the clone mechanics. `_createClient`'s shell (`resolveAuthBackedClient` + `mergeRequestHeaders`) is identical; only the inner `new XxxSDK(...)` differs, which is exactly what `createRawClient()` abstracts. Stopping at "core three" leaves the highest-copy-count patterns (4× each) in place.

## Consequences

- **Positive**: Adding a provider (Mistral, Cohere, etc.) now means `extends BaseChatProvider` + implementing `generate()`/`createRawClient()`/`thinkingEffort` — boilerplate is inherited. This finally realizes ADR 0011's "new provider = new adapter only" goal.
- **Positive**: `_clone`, accessors, `StreamedMessage` skeleton, and the three normalization functions each have a single implementation. Drift across providers becomes impossible for these.
- **Positive**: `createProvider` factory and `ProviderConfig` union are unchanged — no external API impact.
- **Positive**: `google-genai`'s fetch-specific error handling is preserved via the `extraNetworkMatchers` hook rather than silently dropped.
- **Negative**: Introduces an inheritance layer. Each provider now extends a base class rather than directly implementing an interface. Reverting would require changing all four providers back — moderately hard to reverse (one of the three ADR conditions).
- **Negative**: Subclass-specific clone cleanup (e.g. `openai-completions`'s `clone._files = undefined`) needs an override or a `_resetCloneState` hook — minor per-subclass boilerplate.
- **Negative**: Anthropic's `StreamedMessage._usage` initializes to a non-null default while the other three use `undefined`; the base unifies to `undefined` and Anthropic overrides in its constructor — a small behavioral alignment.

## Related

- PRD: `docs/prd/design-debt-cleanup-high-priority.md` (H4)
- Source scan: `improve-architecture` report (2026-06-17), finding H4
- Supersedes-none, complements: ADR 0011 (turn-boundary cache staking — benefits from consistent cross-provider normalization)
