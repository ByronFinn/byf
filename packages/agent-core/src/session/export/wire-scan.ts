import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface SessionWireScan {
  readonly firstActivityMs?: number;
  readonly lastActivityMs?: number;
  readonly lastUserMessageMs?: number;
  readonly firstUserInput?: string;
}

export async function scanSessionWire(sessionDir: string): Promise<SessionWireScan> {
  let raw: string;
  try {
    raw = await readFile(join(sessionDir, 'wire.jsonl'), 'utf-8');
  } catch {
    return {};
  }

  let firstActivityMs: number | undefined;
  let lastActivityMs: number | undefined;
  let lastUserMessageMs: number | undefined;
  let firstUserInput: string | undefined;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null) continue;
    const record = parsed as {
      type?: unknown;
      time?: unknown;
      input?: unknown;
      origin?: unknown;
    };
    const timeMs = typeof record.time === 'number' ? normalizeTimestampMs(record.time) : undefined;
    if (timeMs !== undefined) {
      firstActivityMs ??= timeMs;
      lastActivityMs = timeMs;
    }
    // User prompts are recorded as `turn.prompt` / `turn.steer` with `origin.kind === 'user'`
    // (see CONTEXT.md 「upToMessage」). The legacy `turn_begin` shape with a flat `userInput`
    // string predates the current wire protocol and is no longer emitted; matching it produced
    // phantom firstUserInput on historical wires.
    if (
      (record.type === 'turn.prompt' || record.type === 'turn.steer') &&
      isUserOrigin(record.origin)
    ) {
      if (timeMs !== undefined) {
        lastUserMessageMs = timeMs;
      }
      if (firstUserInput === undefined) {
        const text = extractUserInputText(record.input);
        if (text !== undefined && text.trim().length > 0) {
          firstUserInput = text;
        }
      }
    }
  }

  return {
    firstActivityMs,
    lastActivityMs,
    lastUserMessageMs,
    firstUserInput,
  };
}

function isUserOrigin(origin: unknown): boolean {
  return (
    typeof origin === 'object' && origin !== null && (origin as { kind?: unknown }).kind === 'user'
  );
}

/**
 * Concatenate the text parts of a `turn.prompt` / `turn.steer` input.
 * Mirrors the text-extraction intent of `promptPartText` (kept inline so wire-scan
 * stays a dependency-free reader of raw JSONL rather than importing runtime types).
 */
function extractUserInputText(input: unknown): string | undefined {
  if (!Array.isArray(input)) return undefined;
  const parts: string[] = [];
  for (const part of input) {
    if (
      typeof part === 'object' &&
      part !== null &&
      (part as { type?: unknown }).type === 'text' &&
      typeof (part as { text?: unknown }).text === 'string'
    ) {
      parts.push((part as { text: string }).text);
    }
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}

export function normalizeTimestampMs(value: number): number | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value > 1e12 ? Math.floor(value) : Math.floor(value * 1000);
}
