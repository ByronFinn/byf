---
"@byfriends/agent-core": minor
---

Refactor system prompt and add DirectoryTreeInjector (Issue #81)

- **System prompt compression**: Removed the `BYF_WORK_DIR_LS` directory tree from `system.md`, compressed the Research & Data Processing guidelines to 5 bullet points, added a "First Principles" meta-cognition section, added an AGENTS.md budget warning (>4,000 tokens), and streamlined the Skills and Ultimate Reminders sections.
- **Skill listing compression**: `getModelSkillListing()` now outputs only name + one-line description (truncated to ~100 chars) instead of full metadata. Scope grouping is preserved.
- **DirectoryTreeInjector**: New `DynamicInjector` that builds a 2-level directory tree with exclusions (node_modules, .git, dist, build, etc.) and a hidden-dir whitelist (.github, .byf, .agents, .changeset, .husky). It injects once at session start and refreshes when the tree changes.
- **InjectionManager**: Registers `DirectoryTreeInjector` alongside `PermissionModeInjector`.
- **Template variables**: Removed `BYF_WORK_DIR_LS` from `buildTemplateVars`. Added `BYF_AGENTS_MD_TOO_LONG` which renders a budget warning when merged AGENTS.md exceeds 4,000 tokens.
- **Cleanup**: Removed `cwdListing` from `SystemPromptContext`, `PreparedSystemPromptContext`, and `Agent.useProfile` since the directory tree now lives in the injection layer.
