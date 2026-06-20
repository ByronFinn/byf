import {
  BackgroundConfigSchema,
  ByfConfigSchema,
  LoopControlSchema,
  ModelAliasSchema,
  PermissionConfigSchema,
  ProviderConfigSchema,
  ServicesConfigSchema,
  ThinkingConfigSchema,
  type ByfConfig,
} from '#/config/schema';
import {
  DEPRECATED_FIELD_RULES,
  type Finding,
} from '#/config/update-rules';
import { VALID_CAPABILITIES } from '#/providers/runtime-provider';

/* ------------------------------------------------------------------ */
/*  analyzeConfig                                                       */
/* ------------------------------------------------------------------ */

/**
 * Minimal config shape accepted by {@link analyzeConfig}.
 *
 * All fields are optional so callers — especially tests — don't need to
 * construct a full `ByfConfig`. Backward-compatible: every `ByfConfig` is
 * a valid `UpdateAnalyzeInput`.
 */
export interface UpdateAnalyzeInput {
  readonly raw?: Record<string, unknown>;
  readonly thinking?: { readonly mode?: string; readonly effort?: string };
  readonly models?: Record<
    string,
    { readonly provider: string; readonly capabilities?: readonly string[] }
  >;
  readonly providers?: Record<string, unknown>;
  readonly defaultProvider?: string;
  readonly defaultModel?: string;
}

/**
 * Scan a parsed config (including `config.raw`) and return all Findings
 * for deprecated / renamed / migrated / dangling / unknown / invalid-value
 * fields.
 *
 * This is a **pure** function — no file I/O, no side effects.
 *
 * Detection is based on `config.raw` (the clone of the original TOML data),
 * not on the parsed camelCase schema. This matches the PRD's observation
 * that `raw` is both the protection layer (preserving unknown fields) and
 * the blind spot (retaining stale keys through read→write cycles).
 */
export function analyzeConfig(config: UpdateAnalyzeInput): Finding[] {
  const raw = config.raw;
  const findings: Finding[] = [];

  // Raw-based detection for deprecated / renamed / migrated fields.
  // When raw is missing or an unexpected type there is nothing to scan,
  // but we still proceed to the dangling-reference check below.
  if (isRecord(raw)) {
    for (const rule of DEPRECATED_FIELD_RULES) {
      if (pathExistsInRaw(raw, rule.pathParts)) {
        findings.push({
          kind: rule.kind,
          path: rule.path,
          detail: rule.detail,
          deprecatedSince: rule.deprecatedSince,
        });
      }
    }

    // Upgrade default_thinking from 'migrated' to 'removed' when the [thinking]
    // block already has mode or effort configured — the migration is already done.
    const defaultThinkingFinding = findings.find(
      (f) => f.path === 'default_thinking',
    );
    if (defaultThinkingFinding) {
      const thinking = config.thinking;
      if (thinking && (thinking.mode !== undefined || thinking.effort !== undefined)) {
        defaultThinkingFinding.kind = 'removed';
        defaultThinkingFinding.detail = 'Already superseded by [thinking] block.';
      }
    }

    // ── Unknown field detection (C1) ─────────────────────────────
    //
    // Detect keys in config.raw that don't match any ByfConfigSchema
    // shape key (in either camelCase or snake_case). Deprecated field
    // paths are skipped because they produce their own findings.

    const UNKNOWN_SKIP_PATHS = new Set(
      DEPRECATED_FIELD_RULES.map((r) => r.pathParts.join('.')),
    );
    const byfShapeKeys = new Set<string>();
    for (const key of Object.keys(ByfConfigSchema.shape)) {
      byfShapeKeys.add(key);
      byfShapeKeys.add(camelToSnakeStatic(key));
    }
    for (const rawKey of Object.keys(raw)) {
      // Skip `raw` itself (programmatically added)
      if (rawKey === 'raw') continue;
      // Skip deprecated fields (already reported)
      if (UNKNOWN_SKIP_PATHS.has(rawKey)) continue;

      const camelKey = snakeToCamelStatic(rawKey);
      if (!byfShapeKeys.has(camelKey) && !byfShapeKeys.has(rawKey)) {
        findings.push({
          kind: 'unknown',
          path: rawKey,
          detail: `Field "${rawKey}" is not recognized by the current schema. Its value has been ignored. This may be a typo or a field from a previous version.`,
        });
      }
    }

    // ── Nested unknown field detection (C1) ─────────────────────────
    //
    // Scan known container keys (models.<alias>.*, providers.<name>.*,
    // services.*, background.*, etc.) for sub-keys that don't match the
    // corresponding schema shape. This catches e.g.
    // `models.x.max_context_tokns` (typo in a model alias field).

    const nestedFindings = scanNestedUnknowns(raw, UNKNOWN_SKIP_PATHS);
    findings.push(...nestedFindings);
  }

  // ── Invalid-value detection (C2): capabilities ────────────────
  //
  // Check that every capability in every model alias is one of the
  // valid capability names. To preserve case-insensitive parsing
  // (matching runtime-provider.ts behaviour), the check is done
  // case-insensitively, but the reported path always shows the
  // original value.

  if (config.models) {
    const validCapsLower = new Set(VALID_CAPABILITIES.map((c) => c.toLowerCase()));
    for (const [alias, modelConfig] of Object.entries(config.models)) {
      if (modelConfig.capabilities) {
        for (let i = 0; i < modelConfig.capabilities.length; i++) {
          const cap = modelConfig.capabilities[i];
          if (cap === undefined) continue;
          if (!validCapsLower.has(cap.toLowerCase())) {
            findings.push({
              kind: 'invalid-value',
              path: `models.${alias}.capabilities[${i}]`,
              detail: `"${cap}" is not a valid capability. Valid values: ${VALID_CAPABILITIES.join(', ')}.`,
            });
          }
        }
      }
    }
  }

  // ── Dangling reference detection ──────────────────────────────────
  //
  // After detecting deprecated/renamed/migrated fields, check the PARSED
  // config for references that point to non-existent providers or models.
  //
  // These are only reported, never auto-fixed. Dangling findings do not
  // carry a deprecatedSince annotation.

  const providerKeys = Object.keys(config.providers ?? {});

  // 1. Dangling model alias — model references a provider that doesn't exist
  if (config.models) {
    for (const [alias, modelConfig] of Object.entries(config.models)) {
      if (!providerKeys.includes(modelConfig.provider)) {
        findings.push({
          kind: 'dangling',
          path: `models.${alias}.provider`,
          detail: `Model alias "${alias}" references provider "${modelConfig.provider}", which does not exist in [providers].`,
        });
      }
    }
  }

  // 2. Dangling default_provider — defaultProvider references a provider that doesn't exist
  if (config.defaultProvider !== undefined && !providerKeys.includes(config.defaultProvider)) {
    findings.push({
      kind: 'dangling',
      path: 'default_provider',
      detail: `Default provider "${config.defaultProvider}" does not exist in [providers].`,
    });
  }

  // 3. Dangling default_model — defaultModel references a model alias that doesn't exist
  const modelKeys = Object.keys(config.models ?? {});
  if (config.defaultModel !== undefined && !modelKeys.includes(config.defaultModel)) {
    findings.push({
      kind: 'dangling',
      path: 'default_model',
      detail: `Default model "${config.defaultModel}" does not exist in [models].`,
    });
  }

  return findings;
}

/* ------------------------------------------------------------------ */
/*  applyFixes                                                         */
/* ------------------------------------------------------------------ */

/**
 * Apply automatic fixes to a `ByfConfig` by deleting every path registered in
 * `DEPRECATED_FIELD_RULES` from `config.raw`.
 *
 * The `_findings` parameter is intentionally **not consulted** — deletion is
 * driven exclusively by the whitelist in `DEPRECATED_FIELD_RULES`. This ensures
 * that a call to `applyFixes` always produces a clean config regardless of
 * what analysis step previously ran.
 *
 * This is a **pure** function — it returns a new config object without
 * mutating the input.
 */
export function applyFixes(
  config: ByfConfig,
  findings: readonly Finding[],
): ByfConfig & { raw: Record<string, unknown> } {
  const newRaw = rawShallowClone(config.raw);

  // 1. Delete all deprecated paths from raw (existing behavior)
  for (const rule of DEPRECATED_FIELD_RULES) {
    deletePath(newRaw, rule.pathParts);
  }

  // 2. Handle default_thinking migration
  let newConfig = { ...config, raw: newRaw };
  const migratedFinding = findings.find(
    (f) => f.kind === 'migrated' && f.path === 'default_thinking',
  );
  if (migratedFinding) {
    const rawValue = config.raw?.['default_thinking'];
    const isTruthy = rawValue === true || rawValue === 'true' || rawValue === 1;
    newConfig = {
      ...newConfig,
      thinking: isTruthy
        ? { mode: 'on' as const, effort: 'high' as const }
        : { mode: 'off' as const },
    };
  }

  return newConfig;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/** Convert snake_case to camelCase (static helper for unknown detection). */
function snakeToCamelStatic(str: string): string {
  return str.replaceAll(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

/** Convert camelCase to snake_case (static helper for unknown detection). */
function camelToSnakeStatic(str: string): string {
  return str.replaceAll(/[A-Z]/g, (ch: string) => `_${ch.toLowerCase()}`);
}

/** True when `value` is a non-null, non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Walk `root` along `pathParts` checking that **every** segment exists.
 *
 * Returns `true` iff all parts exist as own keys (or inherited keys — TOML
 * parse results are plain objects so the distinction doesn't matter here).
 */
function pathExistsInRaw(root: Record<string, unknown>, pathParts: readonly string[]): boolean {
  let current: unknown = root;
  for (const part of pathParts) {
    if (!isRecord(current) || !(part in current)) {
      return false;
    }
    current = current[part];
  }
  return true;
}

/**
 * Delete a leaf (or entire sub-tree) from `root` following `pathParts`.
 *
 * If the parent after deletion becomes empty it is cleaned up as well
 * (recursive upward), so that a service table cleared of all deprecated
 * keys does not leave behind an empty `{}`.
 */
function deletePath(root: Record<string, unknown>, pathParts: readonly string[]): void {
  if (pathParts.length === 0) return;

  // Walk down to the parent of the final segment
  const parentParts = pathParts.slice(0, -1);
  const leafKey = pathParts.at(-1)!;

  let current: Record<string, unknown> | undefined;
  if (parentParts.length === 0) {
    current = root;
  } else {
    current = traverseTo(root, parentParts);
  }

  if (current === undefined) return;

  const keyExisted = leafKey in current;
  delete current[leafKey];

  // Clean up empty parent objects (recursive upward) — only when the
  // deletion actually removed a key (otherwise an already-empty parent
  // like `services: {}` should not be cleaned up).
  if (keyExisted && parentParts.length > 0 && Object.keys(current).length === 0) {
    deletePath(root, parentParts);
  }
}

/**
 * Walk `root` along `pathParts` returning the penultimate record, or
 * `undefined` if any segment is missing.
 */
function traverseTo(
  root: Record<string, unknown>,
  pathParts: readonly string[],
): Record<string, unknown> | undefined {
  let current: unknown = root;
  for (const part of pathParts) {
    if (!isRecord(current) || !(part in current)) return undefined;
    current = current[part];
  }
  return isRecord(current) ? current : undefined;
}

/**
 * Shallow-clone `raw`: each nested record is also shallow-cloned so that
 * mutations in `applyFixes` do not affect the original object.
 */
function rawShallowClone(raw: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!isRecord(raw)) return {};
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    clone[key] = isRecord(value) ? { ...value } : value;
  }
  return clone;
}

/* ------------------------------------------------------------------ */
/*  Nested unknown scanning (C1)                                        */
/* ------------------------------------------------------------------ */

/**
 * Build a set of all valid keys (camelCase + snake_case) from a zod
 * object schema's `.shape`.
 */
function getShapeKeySet(schema: { readonly shape: Record<string, unknown> }): Set<string> {
  const keys = new Set<string>();
  for (const key of Object.keys(schema.shape)) {
    keys.add(key);
    keys.add(camelToSnakeStatic(key));
  }
  return keys;
}

interface NestedScanEntry {
  readonly rawKey: string;
  readonly isRecord: boolean;
  readonly schema: { readonly shape: Record<string, unknown> };
  /**
   * Sub-keys that are not in the zod `.shape` but are still actively
   * consumed by a TOML transform (legacy shorthand). These must not be
   * reported as `unknown`. e.g. `[permission]` still folds `deny`/`allow`/
   * `ask` arrays into `rules` via `transformPermissionData`.
   */
  readonly legacyKeys?: readonly string[];
}

/**
 * Scan known container keys in `raw` for sub-keys that don't match the
 * corresponding schema shape.  Unknown paths that overlap with
 * `skipPaths` (e.g. already reported deprecated fields) are skipped.
 *
 * Detects e.g. `models.gpt4.max_context_tokns` (typo) or
 * `providers.anthropic.api_kei` (typo).
 */
function scanNestedUnknowns(
  raw: Record<string, unknown>,
  skipPaths: ReadonlySet<string>,
): Finding[] {
  const findings: Finding[] = [];

  const containers: NestedScanEntry[] = [
    { rawKey: 'models', isRecord: true, schema: ModelAliasSchema },
    { rawKey: 'providers', isRecord: true, schema: ProviderConfigSchema },
    { rawKey: 'services', isRecord: false, schema: ServicesConfigSchema },
    { rawKey: 'background', isRecord: false, schema: BackgroundConfigSchema },
    { rawKey: 'loop_control', isRecord: false, schema: LoopControlSchema },
    { rawKey: 'thinking', isRecord: false, schema: ThinkingConfigSchema },
    {
      rawKey: 'permission',
      isRecord: false,
      schema: PermissionConfigSchema,
      // `deny`/`allow`/`ask` are legacy shorthand still consumed by
      // transformPermissionData (toml.ts) and folded into `rules`.
      legacyKeys: ['deny', 'allow', 'ask'],
    },
  ];

  // Pre-compute valid key sets to avoid repeated camel ↔ snake conversion.
  // A separate map keyed by entry index accommodates the optional
  // `legacyKeys` so each container's effective allowlist is cached once.
  const schemaKeySets = new Map<number, Set<string>>();
  containers.forEach((entry, index) => {
    const base = getShapeKeySet(entry.schema);
    if (entry.legacyKeys) {
      for (const k of entry.legacyKeys) base.add(k);
    }
    schemaKeySets.set(index, base);
  });

  for (const [entryIndex, entry] of containers.entries()) {
    if (!(entry.rawKey in raw)) continue;
    const rawValue = raw[entry.rawKey];
    if (!isRecord(rawValue)) continue;

    if (entry.isRecord) {
      // z.record — each entry's value is a schema-shaped object
      for (const [itemKey, itemValue] of Object.entries(rawValue)) {
        if (!isRecord(itemValue)) continue;
        const validKeys = schemaKeySets.get(entryIndex)!;
        for (const subKey of Object.keys(itemValue)) {
          if (!validKeys.has(subKey)) {
            const path = `${entry.rawKey}.${itemKey}.${subKey}`;
            if (!skipPaths.has(path)) {
              findings.push({
                kind: 'unknown',
                path,
                detail: `Field "${subKey}" is not recognized in ${entry.rawKey}.${itemKey}. This may be a typo or a field from a previous version.`,
              });
            }
          }
        }
      }
    } else {
      // Direct object — keys correspond to schema fields
      const validKeys = schemaKeySets.get(entryIndex)!;
      for (const subKey of Object.keys(rawValue)) {
        if (!validKeys.has(subKey)) {
          const path = `${entry.rawKey}.${subKey}`;
          if (!skipPaths.has(path)) {
            findings.push({
              kind: 'unknown',
              path,
              detail: `Field "${subKey}" is not recognized in [${entry.rawKey}]. This may be a typo or a field from a previous version.`,
            });
          }
        }
      }
    }
  }

  return findings;
}