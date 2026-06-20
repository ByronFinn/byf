# ADR 0005: Thinking Effort Validation and Provider Clamping

## Status

Accepted

## Context

The `effort` parameter controls the intensity of model thinking/reasoning across providers. The normalized type is `ThinkingEffort = 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'`. Multiple problems existed:

1. **No schema-level validation**: `ThinkingConfigSchema` defined `effort` as `z.string().optional()`, accepting any string. Invalid values silently fell back to `'high'` at runtime with no user feedback.
2. **UI/SDK type split**: The CLI model selector used a separate `ThinkingEffortLevel` with only 4 values (`off | low | medium | high`), missing `xhigh` and `max`. Users who configured `xhigh`/`max` in `config.toml` could not restore those levels through the UI once changed.
3. **Silent provider clamping**: Anthropic clamped `xhigh`/`max` to `high` for non-Opus models, and OpenAI-compatible providers sent `xhigh` regardless of model support, with no logging in either case.
4. **budget_tokens crash on high levels**: `budgetTokensForEffort` threw an error for `xhigh` and `max`, preventing Opus 4.7 from using those levels via Anthropic's extended thinking API.

### Industry context

All three major providers have converged on **categorical effort levels** (not numeric token budgets):

| Provider | Old mechanism | Current mechanism | Status |
|---|---|---|---|
| **Anthropic** | `thinking.budget_tokens` (integer) | `output_config.effort` (`low/medium/high/xhigh/max`) | budget_tokens deprecated; rejected with 400 on Opus 4.7+ |
| **OpenAI** | N/A | `reasoning_effort` (`none/minimal/low/medium/high/xhigh`) | Standard API parameter |
| **Google Gemini** | 2.5: `thinkingBudget` (integer) | 3.x: `thinkingLevel` (`minimal/low/medium/high`) | Transitioning |

BYF's existing `ThinkingEffort` categorical type aligns with this industry direction. The problem is that the Anthropic adapter still uses the deprecated `budget_tokens` mechanism with a hardcoded numeric mapping table.

## Decision

### 1. Enum validation at schema level

Change `effort` from `z.string().optional()` to `z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional()`. Invalid values fail at config parse time with a clear error message instead of silent fallback.

### 2. Expose xhigh/max in the selector UI

Add `xhigh` and `max` to the CLI model selector's effort options, shown only when the selected model's capabilities include support for those levels (e.g., Anthropic Opus 4.7). This closes the gap between config and UI.

### 3. Clamping with warn logging

When a provider clamps an effort level (Anthropic non-Opus: xhigh/max → high; OpenAI-compatible without support: xhigh/max → high), emit a warn-level log message naming the original effort, the clamped effort, and the reason (model name).

### 4. Migrate Anthropic adapter from budget_tokens to effort parameter

Replace the `budgetTokensForEffort` numeric mapping with a direct categorical mapping to Anthropic's `output_config.effort` parameter:

| ThinkingEffort | Anthropic `output_config.effort` | OpenAI `reasoning_effort` |
|---|---|---|
| off | thinking disabled | undefined |
| low | `low` | `low` |
| medium | `medium` | `medium` |
| high | `high` | `high` |
| xhigh | `xhigh` (Opus 4.7/4.8 only) | `xhigh` (if supported, else clamp to `high`) |
| max | `max` (Opus 4.6+) | clamp to `high` or `xhigh` based on model |

This removes the need for a hardcoded budget_tokens mapping table entirely. The effort level is passed directly to the API as a categorical value, and the provider decides how many tokens to allocate.

For older Anthropic models that still require `budget_tokens` (Claude 3.7 Sonnet, etc.), fall back to the numeric mapping as a compatibility path.

### 5. Mark mainstream models with `thinking_effort` capability

The capability registry (`capability-registry.ts`) currently only assigns `thinking` to Anthropic Claude 4.x and OpenAI o-series models, not `thinking_effort`. This means the UI only shows an on/off toggle for these models, not actual effort level selection.

Since these models all support categorical effort control via their respective APIs, they should be marked with `thinking_effort` in the registry. This makes effort level selection available in the UI for all models that support it, not just the few that happen to return `supports_reasoning_effort: true` from an API response.

### 6. Keep "off" in ThinkingEffort type

The `'off'` value is intentionally part of `ThinkingEffort` even though it is not an effort level. It serves as a combined toggle + effort sentinel, simplifying the downstream API to a single value. This is an explicit design choice, not accidental coupling.

### 7. Deprecate `defaultThinking` boolean field

The top-level `defaultThinking = true/false` config field overlaps with the `[thinking]` section: `true` is equivalent to `mode = "on"` with `effort = "high"`, and `false` is equivalent to `mode = "off"`. When both are configured, the `[thinking]` section takes precedence — its `mode` and `effort` are consulted first, and `defaultThinking` is only applied as a fallback when no `[thinking]` value covers the case (see `apps/cli/src/tui/byf-tui.ts:960-969`). This is a correction of the original wording, which stated `defaultThinking` takes precedence silently; the implemented behavior has always been the opposite.

Deprecate `defaultThinking` in favor of the `[thinking]` section which provides full control over both mode and effort. Emit a deprecation warning when `defaultThinking` is present in config.

### 8. Anthropic support scope: Opus 4.7+ only

BYF only supports Anthropic models from Opus 4.7 onwards. This means:
- The `budget_tokens` compatibility path is unnecessary — all supported Anthropic models use `output_config.effort`.
- The `budgetTokensForEffort` function and its numeric mapping table can be removed entirely from the Anthropic adapter.
- The Anthropic adapter only needs to handle `off | low | medium | high | xhigh | max` → `output_config.effort` with clamping for models that don't support `xhigh`/`max`.

### 9. Gemini adapter: no changes needed

The existing Gemini adapter already implements the correct dual-path approach: `thinking_level` for Gemini 3.x models, `thinking_budget` for 2.5 models. Clamping warn logging (decision 3) applies here too but requires no structural changes.

## Consequences

- Users get immediate feedback on invalid `effort` values in config instead of silent behavior changes.
- `xhigh` and `max` are first-class effort levels visible in both config and UI.
- Clamping is transparent: users can see in the terminal when their configured effort is adjusted for a model.
- Migrating from `budget_tokens` to `output_config.effort` makes BYF compatible with current Anthropic models (Opus 4.7+ reject `budget_tokens` with 400 errors) and aligns with the provider's recommended API usage.
- The effort-to-API mapping is now a straightforward categorical pass-through (with clamping), eliminating the need to maintain a numeric budget table that could become stale as providers change limits.
- Marking mainstream models with `thinking_effort` means most users will see effort level selection in the UI, not just an on/off toggle.
- Deprecating `defaultThinking` consolidates thinking configuration into a single `[thinking]` section, reducing confusion.
- Scoping Anthropic support to Opus 4.7+ simplifies the adapter by removing the `budget_tokens` code path entirely.
- Adding effort levels is a breaking change if ever removed, since users may configure them in `config.toml`.
