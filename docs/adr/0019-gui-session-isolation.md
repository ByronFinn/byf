# ADR 0019: GUI Session Isolation with Shared Config

## Status

Accepted

## Context

PRD-0009's first instinct was "GUI and CLI share `~/.byf`" for session/config/auth. During `/grill`, a code cross-check exposed that this creates a concurrency hazard: `wire.jsonl` is an append-only single file per agent with **no file lock** (`FileSystemAgentRecordPersistence` only does fsync+dirsync). If the CLI and GUI open the **same** session simultaneously, both append to the same `wire.jsonl` and corrupt it. The original PRD proposed a process-level lease mechanism to guard this.

A simpler alternative surfaced: `ByfCore` resolves `homeDir` (where `sessions/` lives) and `configPath` (where `config.toml` lives) as **two independent paths** (`resolveByfHome` and `resolveConfigPath` in `agent-core/src/config/path.ts`). `ByfHarnessOptions` exposes both. We can give the GUI its own `homeDir` while pointing both hosts at the same `configPath`.

The decisive question: what does the user actually want shared vs isolated?

- **Shared**: provider config, API keys, auth, model aliases. The user configures these once (e.g. via CLI `/login`) and expects them in both hosts. Re-configuring per host is a bad experience.
- **Isolated**: conversation sessions. A TUI session and a GUI session are different work streams; mixing them in one list is noise, and simultaneous writes to the same `wire.jsonl` are actively dangerous.

## Decision

**Isolate sessions, share config.**

- **GUI `homeDir`**: `~/Library/Application Support/byfDesktop/` (macOS convention for app data; hidden from the user's home). All GUI sessions, `session_index.jsonl`, and `wire.jsonl` live here.
- **GUI `configPath`**: unchanged — `~/.byf/config.toml`. Shared with the CLI.
- The GUI host constructs `new ByfHarness({ homeDir: guiHomeDir, configPath: sharedConfigPath, uiMode: 'gui', identity, … })`.
- The CLI continues to use `homeDir = ~/.byf` (default) with the same shared `configPath`.

This **eliminates the concurrency hazard entirely**: GUI and CLI never touch the same `wire.jsonl` because their session trees are in different directories. The entire lease/lock/occupancy-detection mechanism proposed earlier is deleted — not deferred, deleted. The problem does not exist.

## Consequences

- **Positive**: No file-locking/lease mechanism needed. No risk of `wire.jsonl` corruption from concurrent hosts. Simpler, safer.
- **Positive**: Provider/auth configured once, usable in both hosts (shared `configPath`).
- **Positive**: Clean separation matches the user's mental model (different work streams in different surfaces).
- **Negative**: A session created in the CLI is not visible in the GUI and vice versa. This is acceptable: sessions are surface-specific work streams. Cross-host session visibility (e.g. "open this CLI session in the GUI") can be added later via `exportSession`/`forkSession` if demanded — but the default is isolation.
- **Negative**: Two `homeDir`s on disk for what is one product. Documented; the GUI path follows macOS convention.
- **Forward link**: This decision keeps the future remote-kaos path (PRD-0009 Long-term Design) clean — runtime injection is orthogonal to where sessions are stored.
