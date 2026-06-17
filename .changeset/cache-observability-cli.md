---
'@byfriends/cli': minor
---

Cache observability: display cache hit-rate across four CLI surfaces

Add cache hit-rate visibility so users can see prompt cache efficiency at a glance:

- `/usage` panel: per-model and total-row `(cache XX%)` suffix when hit rate > 0
- Footer line 2: `cache: XX%` badge (per-turn, from `currentTurn` usage)
- `/status` panel: `Cache` section with session-cumulative hit rate + read/write breakdown
- Subagent chip: `(XX%)` suffix when `inputCacheRead > 0`

New shared helpers in `usage-format.ts`:
- `computeCacheHitRate(inputOther, inputCacheRead, inputCacheCreation)` — pure function, returns `undefined` for zero denominator
- `formatCacheHitRate(rate)` — integer percentage with banker's rounding, returns `undefined` for rates that round to 0%
- `safeNumber(value)` — defensive coercion for RPC/serialized token values

All surfaces degrade gracefully: no cache data → no cache display (identical to previous behavior).
