/**
 * Update-rules for `byf update-config`.
 *
 * Each rule corresponds to a deprecated / renamed / migrated field that
 * `analyzeConfig` can detect in `config.raw` and (where applicable) that
 * `applyFixes` can clean up.
 *
 * **Principles** (from PRD-0013 grill decisions):
 * - G2 — Whitelist approach: only fields explicitly registered here are removed.
 * - Every rule carries a `deprecatedSince` version annotation so the report
 *   tells the user *when* the field became obsolete.
 */

/* ------------------------------------------------------------------ */
/*  Finding                                                            */
/* ------------------------------------------------------------------ */

export interface Finding {
  kind:
    | 'removed'
    | 'renamed'
    | 'migrated'
    | 'dangling'
    | 'unknown'
    | 'invalid-value';
  /** TOML dotted path, e.g. `'services.byf_search'`, `'loop_control.max_steps_per_run'`. */
  path: string;
  /** Human-readable description of what was found and what will happen. */
  detail: string;
  /** Version when this field was deprecated (optional — may be unknown for very old fields). */
  deprecatedSince?: string;
}

/* ------------------------------------------------------------------ */
/*  Rule                                                               */
/* ------------------------------------------------------------------ */

export interface DeprecatedFieldRule {
  /** TOML dotted path, same format as `Finding.path`. */
  path: string;
  /** Path split into segments for traversing `config.raw`. */
  pathParts: readonly string[];
  /** Which kind of Finding this rule produces. */
  kind: Finding['kind'];
  /** Human-readable description. */
  detail: string;
  deprecatedSince?: string;
}

/* ------------------------------------------------------------------ */
/*  Rule tables — only these fields are recognised                     */
/* ------------------------------------------------------------------ */

const REMOVED_RULES: DeprecatedFieldRule[] = [
  {
    path: 'default_yolo',
    pathParts: ['default_yolo'],
    kind: 'removed',
    detail: 'Top-level field default_yolo is removed. Use yolo instead.',
    deprecatedSince: 'pre-0.1.0',
  },
  {
    path: 'defaultYolo',
    pathParts: ['defaultYolo'],
    kind: 'removed',
    detail: 'Top-level field defaultYolo is removed. Use yolo instead.',
    deprecatedSince: 'pre-0.1.0',
  },
  {
    path: 'services.byf_search',
    pathParts: ['services', 'byf_search'],
    kind: 'removed',
    detail: 'Deprecated service byf_search is removed.',
    deprecatedSince: 'pre-0.1.0',
  },
  {
    path: 'services.byf_fetch',
    pathParts: ['services', 'byf_fetch'],
    kind: 'removed',
    detail: 'Deprecated service byf_fetch is removed. Use services.fetch_url instead.',
    deprecatedSince: 'pre-0.1.0',
  },
];

const RENAMED_RULES: DeprecatedFieldRule[] = [
  {
    path: 'loop_control.max_steps_per_run',
    pathParts: ['loop_control', 'max_steps_per_run'],
    kind: 'renamed',
    detail: 'Renamed to max_steps_per_turn.',
    deprecatedSince: 'pre-0.1.0',
  },
];

const MIGRATED_RULES: DeprecatedFieldRule[] = [
  {
    path: 'default_thinking',
    pathParts: ['default_thinking'],
    kind: 'migrated',
    detail: 'Migrate default_thinking to [thinking] block.',
    deprecatedSince: 'pre-0.1.0',
  },
];

/**
 * Combined list of all deprecated-field rules.
 *
 * Order within the list does not affect correctness (the CLI groups by kind
 * at display time), but a stable order helps test expectations.
 */
export const DEPRECATED_FIELD_RULES: readonly DeprecatedFieldRule[] = [
  ...REMOVED_RULES,
  ...RENAMED_RULES,
  ...MIGRATED_RULES,
];