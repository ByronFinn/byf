---
'@byfriends/agent-core': minor
'@byfriends/sdk': minor
'@byfriends/cli': minor
---

feat: add `byf update-config` command for config.toml schema migration

- **agent-core**: New `config/update-rules.ts` with `Finding` type (removed/renamed/migrated/dangling/unknown/invalid-value) and `DEPRECATED_FIELD_RULES` whitelist
- **agent-core**: New `config/update.ts` with `analyzeConfig` (scans config.raw for deprecated fields) and `applyFixes` (cleans up and migrates)
- **agent-core**: Added `CAPABILITY_DEFINITIONS` / `VALID_CAPABILITIES` exports from runtime-provider.ts (single source of truth for capability validation and resolution)
- **agent-core**: Detection of 6 finding categories (the PRD's `ghost` category is deferred):
  - `removed`: `default_yolo`/`defaultYolo`, `byf_search`, `byf_fetch`
  - `renamed`: `loop_control.max_steps_per_run` → `max_steps_per_turn`
  - `migrated`: `default_thinking` → `[thinking]` block (mode="on"/"off" + effort="high")
  - `dangling`: model aliases/defaults referencing nonexistent providers/models
  - `unknown`: schema-unrecognized fields (via zod `.shape`, non-hardcoded; includes nested container scanning)
  - `invalid-value`: invalid capability values in model aliases
- **SDK**: New `ByfHarness.updateConfig({ fix?, configPath? })` method with automatic backup (chmod 0o600), validation, and rollback
- **CLI**: New `byf update-config` subcommand with `--fix`, `--config <path>`, `--output-format <pretty|json>` flags
- **CLI**: Pretty-printed categorized report in dry-run mode; JSON output for pipeline integration
- **TUI**: New `/update-config` slash command (alias `/uc`) for in-TUI config auditing
- **Tests**: 97+ tests across all layers (agent-core 72 new / 105 total, SDK 11, CLI 14 + TUI resolve tests)
