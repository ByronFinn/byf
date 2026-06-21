# ADR 0019: Replace update-config command with a builtin skill

## Status

Accepted

## Context

`byf update-config` shipped as a CLI subcommand plus a `/update-config` (`/uc`) slash command. It audited `~/.byf/config.toml` against the current schema via a deterministic analyzer/fixer (`packages/agent-core/src/config/update-rules.ts` and `update.ts`), exposed through `ByfHarness.updateConfig()` in the SDK and a Commander subcommand in the CLI. It guaranteed idempotence (`--fix` twice → 0 changes the second time), machine-readable JSON output for CI, timestamped backup with rollback, and unit-testable pure functions.

During a redesign review we evaluated whether the deterministic approach fits the real config-governance gap:

- **What the command could do** was bounded by hardcoded rules: a deprecated-field whitelist (`default_yolo`, `byf_search`, `max_steps_per_run`, …), a `default_thinking` → `[thinking]` migration, dangling-reference detection, and a single capability-enum check. Adding any check meant editing `update-rules.ts`.
- **What it could not do** was the part that actually needs understanding intent: a provider configured with both `api_key` and `oauth`; `thinking.mode = "off"` yet `effort` set; a `maxContextSize` that contradicts the model's real limit; redundant or stale providers; cross-field semantic conflicts. These are open-ended and cannot be enumerated in a rule table.

A builtin skill (`mcp-config`) already exists in the repo and demonstrates the alternative pattern: its body is markdown injected into the LLM context, it points the agent at source files as the source of truth (`schema.ts`), and it relies on the Write/Edit permission prompt as the safety gate rather than backup/rollback. That precedent makes a skill-based config governance flow a natural fit here.

The trade-off is concrete: a skill gives up idempotence, deterministic output, JSON-for-CI, and backup/rollback, in exchange for semantic understanding and conversational optimization. We judged the deterministic guarantees to be low-value in practice — there is no CI pipeline consuming `--output-format json`, the backup/rollback was defense-in-depth on a file users rarely break, and the idempotence contract existed mainly to satisfy the rule engine's own raw-passthrough quirk.

## Decision

Delete the entire `byf update-config` command subsystem and replace it with a single builtin skill `update-config`:

- **New builtin skill** at `packages/agent-core/src/skill/builtin/` (`update-config.md` body + `update-config.ts` wrapper), registered via `registerBuiltinSkills`, `disableModelInvocation: true` (user-only, like `mcp-config`). Invoked as `/skill:update-config`.
- **Governance knowledge is inlined into the skill body.** The deprecated-field table, `default_thinking` migration semantics, raw-passthrough blind-spot explanation, and capability reference all live inside `update-config.md`. An earlier plan called for a separate `update-config-rules.md` sibling file (cold/hot knowledge separation), but a builtin skill's `dir` is the pseudo-path `builtin://update-config`, so `${BYF_SKILL_DIR}` does not resolve to a real disk location the LLM can `Read` — a sibling rules file could not be loaded. Inlining keeps the body at ~100 lines (comparable to `mcp-config`'s 96) and avoids the pseudo-path problem.
- **Governance knowledge** (deprecated-field table, `default_thinking` migration semantics, raw-passthrough blind-spot explanation) moves from `update-rules.ts` into `update-config-rules.md` as natural language. Field-level validity is not duplicated: the skill body points the agent at `schema.ts` (`ByfConfigSchema`) and at `runtime-provider.ts` (`VALID_CAPABILITIES`) as the single sources of truth.
- **Deletion** of `update-rules.ts`, `update.ts`, the CLI subcommand, the `/update-config` (`/uc`) slash command, the SDK `ByfHarness.updateConfig()` method, and the public types `Finding` / `UpdateConfigInput` / `UpdateConfigResult`. This is a **major** breaking change for `@byfriends/agent-core` and `@byfriends/sdk`.
- **Secret handling**: config.toml stores `api_key` in plaintext. The skill body carries a light instruction to never echo `api_key` / `oauth.key` values in its output (state presence/absence only). We accept the residual risk that the key enters the conversation history when the agent reads the file; this is consistent with the existing design where config.toml is a plaintext local file.
- **Path override** via the `$ARGUMENTS` skill argument (default `~/.byf/config.toml`).

## Consequences

- **Positive**: Config governance gains semantic understanding — cross-field conflicts, redundant entries, and intent-level checks that hardcoded rules could never enumerate. The rule set evolves by editing a markdown document instead of TypeScript.
- **Positive**: Removes the deterministic analyzer/fixer, the SDK method, two test files, the CLI subcommand, and the TUI slash command — a meaningful reduction in surface area, consistent with ADR-0008's rationale.
- **Positive**: No wire-record compatibility concern — the command path never touched the agent/wire system, so deletion is cleaner than ADR-0008's plan-mode removal.
- **Negative**: Breaking change. `byf update-config` and `/uc` disappear with no alias period (aligned with ADR-0008). Users scripting against the command must switch to `/skill:update-config`. Requires a major version bump.
- **Negative**: Idempotence, JSON output, backup/rollback, and pure-function unit tests are lost. The skill's behavior is validated structurally (registration, activation, body injection) following the `mcp-config` test precedent, not by deterministic assertions on output.
- **Negative**: `api_key` plaintext may enter the conversation history when the agent reads config.toml; mitigated only by a prompt-level instruction, not enforced.
