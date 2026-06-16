---
'@byfriends/agent-core': minor
---

Prompt cache optimization: three-tier overhaul

Tier 1 — Remove DirectoryTreeInjector:
- Deleted `DirectoryTreeInjector` and its test file
- The model discovers project structure via tools (Glob, Bash) when needed
- Eliminates persistent `<system-reminder>` pollution in conversation history

Tier 2 — System prompt cache block restructuring:
- Reordered `system.md`: `# Project Information` now precedes `# Working Environment`
- Added `# Working Environment` to `IMPLICIT_BOUNDARY_HEADERS` in prompt-plan builder
- Creates 4 cache blocks: base (global), projectInstructions (project), workingEnvironment (session), sessionContext (session)
- Block 0 (global) is now truly session-independent — no per-session variables (BYF_OS, BYF_WORK_DIR) in the cache key hash

Tier 3 — Activate ephemeral injection pipeline:
- Implemented `before_user` position in `project()` — appends dynamic content after history, zero cache prefix impact
- Added optional `getEphemeral?()` to `DynamicInjector` base class
- New `TimestampInjector`: fresh ISO timestamp each step at `before_user` position
- Converted `PermissionModeInjector` from persistent transition-based to ephemeral state-based — always reflects current mode, survives compaction
- Wired `InjectionManager.getEphemeralInjections()` through `buildMessages` in turn loop
