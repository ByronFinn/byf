---
'@byfriends/agent-core': patch
---

refactor: remove dead `background` route in AgentRecords handler map

The `getHandlerKey` mapping table in `AgentRecords` declared a
`background → 'background'` entry, but no `background` restore handler
was ever registered (background tasks restore through a separate
persistence path in `BackgroundProcessManager`). The dead entry made
ADR 0010's distributed-restore contract appear broader than it is.
Removed the entry and documented why `background.*` records are
intentionally skipped on replay.
