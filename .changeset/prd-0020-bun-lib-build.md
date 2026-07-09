---
'@byfriends/agent-core': patch
'@byfriends/kaos': patch
'@byfriends/kosong': patch
'@byfriends/oauth': patch
'@byfriends/sdk': patch
'@byfriends/cli': patch
'@byfriends/vis-server': patch
---

Migrate published package builds from tsdown to `bun build` with a separate declaration pipeline (`tsc` / api-extractor), matching ADR 0028.
