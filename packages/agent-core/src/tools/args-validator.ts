import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import Ajv2019 from 'ajv/dist/2019';
import Ajv2020 from 'ajv/dist/2020';

const DRAFT_07_AJV = new Ajv({ strict: false, allErrors: true });
addFormats(DRAFT_07_AJV);

const DRAFT_2019_AJV = new Ajv2019({ strict: false, allErrors: true });
addFormats(DRAFT_2019_AJV);

const DRAFT_2020_AJV = new Ajv2020({ strict: false, allErrors: true });
addFormats(DRAFT_2020_AJV);

const DRAFT_2019_KEYWORDS = new Set([
  'dependentRequired',
  'dependentSchemas',
  'maxContains',
  'minContains',
  'unevaluatedItems',
  'unevaluatedProperties',
  '$recursiveAnchor',
  '$recursiveRef',
]);

const DRAFT_2020_KEYWORDS = new Set(['prefixItems', '$dynamicAnchor', '$dynamicRef']);

// Mixing JSON Schema dialects in a single Ajv instance is unsafe because
// keyword semantics differ, e.g. draft-07 tuple `items` vs 2020-12 `prefixItems`.
function ajvFor(schema: Record<string, unknown>): Ajv | Ajv2019 | Ajv2020 {
  const $schema = schema['$schema'];
  if (typeof $schema === 'string') {
    if ($schema.includes('2020-12')) return DRAFT_2020_AJV;
    if ($schema.includes('2019-09')) return DRAFT_2019_AJV;
    return DRAFT_07_AJV;
  }
  if (containsSchemaKeyword(schema, DRAFT_2020_KEYWORDS)) return DRAFT_2020_AJV;
  if (containsSchemaKeyword(schema, DRAFT_2019_KEYWORDS)) return DRAFT_2019_AJV;
  return DRAFT_07_AJV;
}

function containsSchemaKeyword(value: unknown, keywords: ReadonlySet<string>): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsSchemaKeyword(item, keywords));
  }
  if (typeof value !== 'object' || value === null) return false;
  for (const [key, child] of Object.entries(value)) {
    if (keywords.has(key)) return true;
    if (containsSchemaKeyword(child, keywords)) return true;
  }
  return false;
}

export type JsonType = null | number | string | boolean | JsonArray | JsonObject;

/** @internal */
export interface JsonArray extends Array<JsonType> {}

/** @internal */
export interface JsonObject extends Record<string, JsonType> {}

export type ToolArgsValidator = ValidateFunction<JsonType>;

// ── Schema-aware argument coercion ─────────────────────────────────────────

const EMPTY_STRING_SET: ReadonlySet<string> = new Set();

/**
 * Coerce model-provided tool arguments to match declared schema types before
 * AJV validation.
 *
 * LLMs occasionally emit integers as strings (`"5"` instead of `5`) or pass
 * `null` for optional fields they mean to omit. Both are harmless serialization
 * differences, not semantic errors — this pass normalizes them so the validator
 * sees the intended value:
 *
 * - String values for `type: "integer"` / `type: "number"` properties are
 *   parsed; if the result matches the expected type, the value is replaced.
 *   Non-numeric strings and type-mismatched values (e.g. `"5.5"` for an integer
 *   field) are left untouched so AJV rejects them.
 * - `null` on optional properties (not listed in `required`) is removed,
 *   equivalent to omitting the key.
 * - Boolean and string properties are never modified.
 *
 * The function is schema-driven: only properties whose JSON Schema declares a
 * numeric type are touched. Boolean coercion is deliberately excluded because
 * AJV's boolean coercion has surprising semantics (`0` → `false`, `1` → `true`)
 * that could mask genuinely malformed calls.
 */
export function coerceToolArgs(schema: Record<string, unknown>, args: JsonType): JsonType {
  if (!isRecord(args)) return args;
  return coerceObjectProperties(schema, args);
}

function coerceObjectProperties(
  schema: Record<string, unknown>,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const properties = schema['properties'];
  if (!isRecord(properties)) return args;

  const required = collectRequiredPropertyNames(schema);
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    const propSchema = properties[key];
    if (!isRecord(propSchema)) {
      result[key] = value;
      continue;
    }

    // Drop null on optional fields — equivalent to omitting the key.
    if (value === null && !required.has(key)) {
      continue;
    }

    const type = propSchema['type'];

    // Coerce string-encoded numbers for integer/number fields.
    if ((type === 'integer' || type === 'number') && typeof value === 'string') {
      const parsed = tryParseCoercibleNumber(value, type);
      result[key] = parsed ?? value;
      continue;
    }

    // Recurse into nested objects.
    if (type === 'object' && isRecord(value)) {
      result[key] = coerceObjectProperties(propSchema, value);
      continue;
    }

    // Recurse into arrays of objects.
    if (type === 'array' && Array.isArray(value)) {
      result[key] = coerceArrayItems(propSchema, value);
      continue;
    }

    result[key] = value;
  }
  return result;
}

function coerceArrayItems(schema: Record<string, unknown>, items: unknown[]): unknown[] {
  const itemSchema = schema['items'];
  if (!isRecord(itemSchema) || itemSchema['type'] !== 'object') return items;
  return items.map((item) => (isRecord(item) ? coerceObjectProperties(itemSchema, item) : item));
}

function collectRequiredPropertyNames(schema: Record<string, unknown>): ReadonlySet<string> {
  const required = schema['required'];
  if (!Array.isArray(required)) return EMPTY_STRING_SET;
  const names = new Set<string>();
  for (const name of required) {
    if (typeof name === 'string') names.add(name);
  }
  return names;
}

/**
 * Parse a string into a number suitable for the declared schema type.
 * Returns `undefined` when the string does not cleanly represent the expected
 * type, so the caller can leave the original value for AJV to reject.
 */
function tryParseCoercibleNumber(value: string, expectedType: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (expectedType === 'integer' && !Number.isInteger(parsed)) return undefined;
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatValidationError(error: ErrorObject): string {
  if (error.keyword === 'required' && 'missingProperty' in error.params) {
    return `must have required property '${String(error.params['missingProperty'])}'`;
  }

  if (error.keyword === 'additionalProperties' && 'additionalProperty' in error.params) {
    return `must NOT have additional property '${String(error.params['additionalProperty'])}'`;
  }

  const path = error.instancePath ? `${error.instancePath} ` : '';
  return `${path}${error.message ?? 'is invalid'}`;
}

export function compileToolArgsValidator(schema: Record<string, unknown>): ToolArgsValidator {
  return ajvFor(schema).compile(schema) as ToolArgsValidator;
}

export function validateToolArgs(validator: ToolArgsValidator, args: JsonType): string | null {
  const valid = validator(args);
  if (valid) {
    return null;
  }

  const errors = validator.errors ?? [];
  if (errors.length === 0) {
    return 'Tool parameter validation failed';
  }

  return errors.map((error) => formatValidationError(error)).join('; ');
}
