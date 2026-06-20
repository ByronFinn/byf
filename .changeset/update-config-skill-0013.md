---
'@byfriends/agent-core': major
'@byfriends/sdk': major
'@byfriends/cli': major
---

feat!: replace `byf update-config` command with a builtin skill

The `byf update-config` CLI subcommand, the `/update-config` (`/uc`) slash command, and their deterministic analyzer/fixer have been **removed** and replaced by a single builtin skill invoked as `/skill:update-config`. See ADR-0019 for the rationale.

### Breaking changes

- **Removed public API** (major bump): `Finding`, `UpdateConfigInput`, `UpdateConfigResult` types and `ByfHarness.updateConfig()` from `@byfriends/sdk`; `analyzeConfig`, `applyFixes`, `DEPRECATED_FIELD_RULES`, `UpdateAnalyzeInput`, and the `Finding` type from `@byfriends/agent-core`.
- **Removed files**: `packages/agent-core/src/config/update-rules.ts`, `packages/agent-core/src/config/update.ts`, `apps/cli/src/cli/sub/update-config.ts`.
- **Removed CLI subcommand**: `byf update-config` no longer exists (no alias period, aligned with ADR-0008).
- **Removed slash command**: `/update-config` and `/uc` no longer exist. Use `/skill:update-config` instead.

### What replaces it

A builtin skill at `packages/agent-core/src/skill/builtin/update-config.md` (`disableModelInvocation: true`, user-only). The agent reads `~/.byf/config.toml` (path overridable via the skill argument), cross-references the governance rules embedded in its body plus `schema.ts`/`runtime-provider.ts` as the single sources of truth, flags deprecated fields, migrates `default_thinking`, and points out semantic conflicts a deterministic linter cannot catch (e.g. a provider with both `api_key` and `oauth`). Edits are applied via Write/Edit, gated by the permission prompt — there is no automatic backup/rollback (consistent with the existing `mcp-config` skill).

### Trade-offs accepted

Idempotence, deterministic output, JSON-for-CI (`--output-format json`), automatic backup/rollback, and pure-function unit tests are **no longer guaranteed**, because the skill is LLM-driven. In exchange, config governance gains semantic understanding and conversational optimization that hardcoded rules could never enumerate.
