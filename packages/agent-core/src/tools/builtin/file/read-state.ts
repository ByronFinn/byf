/**
 * ReadFileTracker — session-scoped record of which files the agent has Read.
 *
 * Edit and Write consult this before mutating a file, so a stale
 * `old_string` (typed from memory or a truncated context) fails fast at
 * the contract boundary instead of after a wasted disk read. Mirrors the
 * Claude Code rule: "You must Read the file before editing, or the call
 * will fail."
 *
 * Storage: the set lives in the agent-level tool store (`readFiles` key),
 * so it participates in wire replay exactly like `todo`. The tracker is
 * a thin wrapper over `ToolStore` — it holds no state of its own.
 */

import type { ToolStore } from '../../store';

declare module '../../store' {
  interface ToolStoreData {
    /** Canonical absolute paths of files Read in the current session. */
    readFiles?: ReadonlySet<string>;
  }
}

export class ReadFileTracker {
  constructor(private readonly store: ToolStore) {}

  /** Record that `canonicalPath` has been Read. Idempotent. */
  markRead(canonicalPath: string): void {
    const current = this.store.get('readFiles');
    if (current !== undefined && current.has(canonicalPath)) return;
    this.store.set('readFiles', new Set([...(current ?? []), canonicalPath]));
  }

  /** Whether `canonicalPath` has been Read in this session. */
  hasRead(canonicalPath: string): boolean {
    return this.store.get('readFiles')?.has(canonicalPath) ?? false;
  }
}
