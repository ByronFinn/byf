---
'@byfriends/cli': patch
---

fix: remove unused type imports in byf-tui.ts and add missing handler unit tests

Removes 4 unused type imports (`AgentStatusUpdatedEvent`, `ErrorEvent`,
`SessionMetaUpdatedEvent`, `WarningEvent`) that were left behind after
the ADR-0017 Phase 2 event handler extraction. Adds unit tests for
`BackgroundTaskHandler` and `handleSkillActivated` which previously had
no dedicated coverage. Updates ADR 0017 module map to reflect the
extraction of background task lifecycle.
