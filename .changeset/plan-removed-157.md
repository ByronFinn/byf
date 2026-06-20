---
'@byfriends/sdk': major
---

Remove plan-related public API (getPlan, clearPlan, SessionPlan, PlanInfo), per ADR 0008. Plan mode was removed from the engine earlier; these were vestigial passthrough methods and types that still threw/returned null. Breaking change for any consumer calling them at the type level.