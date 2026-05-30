# Merge `openai` and `openai-compat` into `openai-completions`

The codebase had two nearly identical provider types for OpenAI Chat Completions API: `openai` (hardcoded to OpenAI official) and `openai-compat` (flexible, for any compatible endpoint). Both use the same OpenAI SDK, same streaming protocol, same message format. The differences are small but scattered: reasoning key scanning, tool message handling, max_tokens normalization, file uploads, etc. We merge them into a single `openai-completions` type that takes the best of both implementations.

## Status

Accepted

## Considered Options

1. **Keep separate** — Maintain two providers, each with its own edge-case handling
2. **Merge into `openai-compat`** — Keep the compat name, fold `openai` features in
3. **Merge into `openai-completions`** — New name reflecting the API protocol used (Chat Completions)

## Decision

Option 3. A single `openai-completions` provider with these design choices:

- **Default base URL**: empty string, user must configure explicitly. No hardcoded OpenAI default.
- **Reasoning extraction**: multi-key scan (`reasoning_content` > `reasoning_details` > `reasoning`), configurable via `reasoningKey`
- **Tool messages**: preserve multimodal protection (force `extract_text` for non-text content)
- **Empty content omission**: skip `content` field on assistant messages with tool_calls and whitespace-only text
- **Model capability**: registry-based lookup for known models, `UNKNOWN_CAPABILITY` fallback
- **File uploads**: include `OpenAICompatFiles` for video upload via `/files` endpoint
- **Tool schema**: normalize via `normalizeOpenAICompatToolSchema`, support `$`-prefix builtin functions
- **Thinking**: dual config of `reasoning_effort` parameter + `extra_body.thinking`
- **Thinking effort key**: configurable via `thinkingEffortKey`, default `reasoning_effort`
- **Max tokens**: normalize `max_tokens` to `max_completion_tokens` on the wire
- **Usage extraction**: read both top-level `usage` and `choices[0].usage`
- **Tool call extras**: preserve `extras` field on tool calls
- **Auto reasoning_effort**: when ThinkParts detected in history without explicit reasoning_effort, auto-set to `high`

No backward compatibility aliases needed — project is in development with no external users.

## Consequences

- **Positive**: One implementation to maintain, one set of features for all OpenAI-compatible APIs. Less code, fewer divergent bug fixes.
- **Negative**: Users must explicitly set `base_url` even for OpenAI official (no default shortcut).
