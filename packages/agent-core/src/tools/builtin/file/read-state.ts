/**
 * ReadFileTracker — session-scoped record of which files the agent has Read.
 *
 * Edit and Write consult this before mutating a file, so a stale
 * `old_string` (typed from memory or a truncated context) fails fast at
 * the contract boundary instead of after a wasted disk read. Mirrors the
 * Claude Code rule: "You must Read the file before editing, or the call
 * will fail."
 *
 * Storage: a `readonly string[]` lives in the agent-level tool store
 * (`readFiles` key), so it participates in wire replay exactly like `todo`.
 * The array — not a `Set` — is stored deliberately: store writes flow through
 * `tools.update_store` records that are persisted with `JSON.stringify`, and a
 * `Set` serialises to `{}`, which then throws on restore when `.has()` is
 * called. An array round-trips natively. The tracker is a thin wrapper over
 * `ToolStore` — it holds no state of its own.
 */

import type { ToolStore } from '../../store';

declare module '../../store' {
  interface ToolStoreData {
    /** Canonical absolute paths of files Read in the current session. */
    readFiles?: readonly string[];
  }
}

/**
 * Coerce whatever sits behind the `readFiles` key into a plain array of
 * strings. The value is normally a `readonly string[]`, but it may also be:
 *  - `undefined` (nothing Read yet), or
 *  - a plain object `{}` — a legacy `Set` that lost its members during a
 *    `JSON.stringify` wire round-trip (`JSON.stringify(new Set()) === '{}'`).
 * Restoring such a session must not throw here; treat any non-array shape as
 * "nothing Read", which is always safe: the worst case is a redundant Read.
 */
function coerceReadFiles(value: readonly string[] | undefined): readonly string[] {
  return Array.isArray(value) ? value : [];
}

export class ReadFileTracker {
  constructor(private readonly store: ToolStore) {}

  /** Record that `canonicalPath` has been Read. Idempotent. */
  markRead(canonicalPath: string): void {
    const current = coerceReadFiles(this.store.get('readFiles'));
    if (current.includes(canonicalPath)) return;
    this.store.set('readFiles', [...current, canonicalPath]);
  }

  /** Whether `canonicalPath` has been Read in this session. */
  hasRead(canonicalPath: string): boolean {
    return coerceReadFiles(this.store.get('readFiles')).includes(canonicalPath);
  }
}
