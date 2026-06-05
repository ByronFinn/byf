---
"@byfriends/agent-core": minor
"@byfriends/sdk": minor
---

Remove Plan Mode residual references (#80)

- **agent-core**: Remove `run command in plan mode` dead entry from `ACTION_TO_PATTERN`; update `task-list.md` and `todo-list.ts` descriptions to no longer reference plan mode
- **node-sdk**: Delete `SetSessionPlanModeRpcInput` interface and `setPlanMode` method from `SDKRpcClient`; delete `Session.setPlanMode`
- **tests**: Remove `ExitPlanMode` approval adapter tests, `ExitPlanMode` action-label tests, and update background task test descriptions
- **cli**: Update editor comment removing plan-mode reference
- **cleanup**: Delete empty `packages/agent-core/src/agent/plan/` directory
