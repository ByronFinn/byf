# @byfriends/vis-server

## 0.1.2

### Patch Changes

- Updated dependencies [77387fa]
- Updated dependencies [ef167a8]
- Updated dependencies [8b7b3e2]
  - @byfriends/agent-core@0.3.0

## 0.1.1

### Patch Changes

- fa5a6bd: Codebase cleanup: remove dead code, telemetry, legacy artifacts, and align with ADRs (#58)

  - **Remove telemetry package entirely** — delete `packages/telemetry`, remove all telemetry bootstrap from CLI and SDK, keep minimal `noopTelemetryClient` in agent-core
  - **Remove Kaos SSH orphan** — delete `ssh.ts` and all SSH test files, remove ssh2 dependency
  - **Fix kosong wire types** — use `'openai-completions'` in catalog tests, rename `kimi-*` test files
  - **Remove 16 unused imports** across CLI and kosong
  - **Delete dead code** — unused barrel files, already-deleted components confirmed
  - **Clean up skipped tests** — remove 14 disabled test blocks, fix `managed:byf` fixture references
  - **Re-export OAuth through SDK seam** — CLI no longer imports `@byfriends/oauth` directly (ADR 0006)
  - **Extract vis shared types** — vis-web typechecks independently, no longer imports from vis-server source

- Updated dependencies [0a9bb30]
- Updated dependencies [68987f7]
- Updated dependencies [fa5a6bd]
- Updated dependencies [0a9bb30]
- Updated dependencies [0a9bb30]
- Updated dependencies [1b35310]
- Updated dependencies [0a9bb30]
- Updated dependencies [0a9bb30]
- Updated dependencies [0a9bb30]
- Updated dependencies [1d06a98]
- Updated dependencies [0a9bb30]
  - @byfriends/agent-core@0.2.0

## 0.0.2

### Patch Changes

- Updated dependencies [eb5f4fc]
  - @byfriends/agent-core@0.1.0
