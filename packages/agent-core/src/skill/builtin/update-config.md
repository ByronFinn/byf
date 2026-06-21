---
name: update-config
description: Audit and fix ~/.byf/config.toml — remove deprecated fields, migrate legacy settings, and flag semantic conflicts.
---

# Audit and fix config.toml

The user invoked this skill via `/update-config` or `/skill:update-config`.
The goal is to bring `~/.byf/config.toml` in line with the current BYF schema:
remove deprecated fields, migrate legacy settings, and point out semantic
conflicts that a deterministic linter cannot catch. The work is small and
local — handle it on this turn yourself, no agents or planning todos.

## Read the config

1. **Resolve the path.** Default: `~/.byf/config.toml` (or
   `$BYF_HOME/config.toml` if that env var is set). If the user passed a path
   as an argument, use that instead.
2. **Read the file.** If it does not exist, say so and stop — there is nothing
   to update. If the TOML fails to parse, surface the parse error verbatim and
   **stop** — do not overwrite a broken file, that could destroy the user's
   work.
3. **Never echo secrets.** `config.toml` stores `api_key` secret values, and
   `oauth` references (a `{ storage, key }` handle that points at a
   file/keyring entry — not the token itself). When you describe what you
   found or plan to change, state only that a credential is present or
   absent — never quote the `api_key` value itself, not even partially.

## What to check for

Field-level validity (which keys exist, what types and enums are allowed) is
**not** something to reproduce here. The single source of truth is
`ByfConfigSchema` in `packages/agent-core/src/config/schema.ts` — read it when
you need to confirm whether a field is recognized and what values it accepts.

The checks below fall into three groups. Report findings from all three before
making any change.

### 1. Deprecated, renamed, and migrated fields

These are historical fields that the schema no longer accepts or has replaced.
Delete them, except where the table says to rename or migrate:

| Field | Action |
|---|---|
| `default_yolo` / `defaultYolo` (top-level) | Remove. Use `yolo` instead. |
| `services.byf_search` | Remove. (Legacy service, superseded by `[services.web_search]`.) |
| `services.byf_fetch` | Remove. Use `[services.fetch_url]` instead. |
| `loop_control.max_steps_per_run` | **Rename** to `max_steps_per_turn`, preserving the value. First check whether `max_steps_per_turn` is already present: if so, the old key is a stale duplicate — just delete it; if not, write `max_steps_per_turn` with the old value, then delete `max_steps_per_run`. (The runtime auto-copies the value on read, but this skill edits the file directly and skips that roundtrip — so you must perform the rename yourself to avoid losing the limit.) |
| `default_thinking` (top-level boolean) | Migrate — see below. |

**`default_thinking` migration** (matches the runtime precedence in
`byf-tui.ts`: a `[thinking]` block wins over `default_thinking`):

- If `[thinking]` already has `mode` or `effort` set, `default_thinking` was
  never effective — just remove it.
- Otherwise migrate by value: `true` → write `[thinking]` with
  `mode = "on"` and `effort = "high"`; `false` → `[thinking]` with
  `mode = "off"`. Then remove `default_thinking`.

> **Raw-passthrough blind spot.** Fields stripped by the schema (like
> `byf_search`, `byf_fetch`) survive inside `config.raw` and get written back
> on every read→write roundtrip, so they linger in the file even though they
> have no effect. Deleting them here is the only way to clear them — that is
> the core value of this skill.

### 2. Semantic conflicts (the part a linter cannot enumerate)

Look for cross-field problems that require understanding intent:

- A provider with **both** `api_key` and `oauth` configured — these are
  mutually exclusive; ask which one the user meant.
- `thinking.mode = "off"` **and** a non-empty `thinking.effort` — the effort
  is ignored; suggest removing it or flipping the mode.
- `models.<alias>.capabilities` containing a value not in the valid set. The
  valid set is the single source of truth: read `CAPABILITY_DEFINITIONS` (or
  the derived `VALID_CAPABILITIES`) in
  `packages/agent-core/src/providers/runtime-provider.ts`. Comparison is
  case-insensitive at runtime, so flag only genuine mismatches.
- A model alias, `default_provider`, or `default_model` that points at a
  provider or model that does not exist — a dangling reference. Report it; do
  **not** delete it, the user may be mid-edit.

### 3. Housekeeping

- Top-level keys that are not in `ByfConfigSchema` (and not a deprecated key
  above) — likely typos or leftovers from an old version. Report them; only
  remove with user confirmation. Note that legitimate unknown keys (e.g.
  `theme`, `notifications`) are preserved by design through `config.raw`, so
  do not touch keys the user clearly added on purpose.
- **Nested keys inside containers** (`[providers.<name>]`, `[models.<alias>]`,
  `[services]`, `[background]`, `[loop_control]`, `[thinking]`,
  `[permission]`). A key that the corresponding section of `ByfConfigSchema`
  does not recognize is silently dropped by the parser and has no effect — a
  common cause is a typo (e.g. `max_context_tokns` instead of
  `max_context_size`). Cross-check each sub-key against the schema and flag
  any mismatch; fix only with user confirmation. Note that `[permission]`
  still accepts the legacy `deny`/`allow`/`ask` array shorthand, so do not
  report those as unknown.

## Make changes

For each change, show the user **what is currently there → what you plan to
write** before editing. Then apply edits with Write/Edit. The Edit/Write
permission prompt is the real safety gate — your summary is what gives the
user context when that prompt appears. There is no automatic backup; if the
user wants one, suggest they copy the file first.

After editing, tell the user to start a new session (e.g. `/new`) or restart
BYF for the config change to take effect.
