---
"@byfriends/agent-core": minor
"@byfriends/sdk": minor
"@byfriends/cli": minor
"@byfriends/kaos": minor
"@byfriends/kosong": patch
"@byfriends/vis-web": patch
"@byfriends/vis-server": patch
---

Codebase cleanup: remove dead code, telemetry, legacy artifacts, and align with ADRs (#58)

- **Remove telemetry package entirely** — delete `packages/telemetry`, remove all telemetry bootstrap from CLI and SDK, keep minimal `noopTelemetryClient` in agent-core
- **Remove Kaos SSH orphan** — delete `ssh.ts` and all SSH test files, remove ssh2 dependency
- **Fix kosong wire types** — use `'openai-completions'` in catalog tests, rename `kimi-*` test files
- **Remove 16 unused imports** across CLI and kosong
- **Delete dead code** — unused barrel files, already-deleted components confirmed
- **Clean up skipped tests** — remove 14 disabled test blocks, fix `managed:byf` fixture references
- **Re-export OAuth through SDK seam** — CLI no longer imports `@byfriends/oauth` directly (ADR 0006)
- **Extract vis shared types** — vis-web typechecks independently, no longer imports from vis-server source
