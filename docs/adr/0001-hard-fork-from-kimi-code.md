# ADR 0001: Hard Fork from Kimi Code

## Status

Accepted

## Context

BYF (Be Your Friend) originated as a fork of Kimi Code, an AI coding agent CLI by Moonshot AI. We need to decide the relationship with the upstream project going forward.

Options considered:
1. **Periodic sync** — Continue cherry-picking/merging upstream changes
2. **Hard fork** — Completely independent, remove all upstream references

## Decision

We chose a hard fork. BYF will not merge or cherry-pick any future upstream changes. All Moonshot AI / Kimi branding, infrastructure dependencies (OAuth, telemetry, CDN), and upstream-specific code paths will be completely removed.

## Consequences

- **Positive:** Full control over direction, no dependency on upstream release cadence, cleaner codebase without dead abstraction points.
- **Negative:** Must maintain all bug fixes and features independently. No access to upstream improvements.
- **Neutral:** This is a one-way door — once upstream code paths are removed, resyncing would require a full rewrite of those modules.
