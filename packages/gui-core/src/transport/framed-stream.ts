/**
 * Parse an NDJSON frame from a raw string, returning the parsed JSON object.
 * Throws if the frame is empty or not valid JSON.
 */
export function parseFrame(raw: string): unknown {
  if (raw.length === 0) {
    throw new Error('Empty NDJSON frame');
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid NDJSON frame: ${(e as Error).message}`);
  }
}

/**
 * Serialize a value to an NDJSON frame string.
 * Guarantees no bare newline in the output (JSON.stringify escapes them).
 */
export function serializeFrame(value: unknown): string {
  return JSON.stringify(value);
}