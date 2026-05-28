import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { EnrichedTelemetryEvent, TelemetryPrimitive } from './types';
import { isTelemetryPrimitive } from './types';

export const SERVER_EVENT_PREFIX = 'byf_';
export const USER_ID_PREFIX = 'byf_device_id_';
export const DISK_EVENT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface AsyncTransportOptions {
  readonly homeDir: string;
  readonly deviceId: string;
}

export interface TelemetryPayload {
  readonly user_id: string;
  readonly events: readonly Record<string, TelemetryPrimitive>[];
}

export class AsyncTransport {
  private readonly homeDir: string;
  private readonly deviceId: string;

  constructor(options: AsyncTransportOptions) {
    this.homeDir = options.homeDir;
    this.deviceId = options.deviceId;
  }

  async send(events: readonly EnrichedTelemetryEvent[], signal?: AbortSignal): Promise<void> {
    if (events.length === 0) return;
    try {
      buildPayload(events, this.deviceId);
    } catch {
      return;
    }

    this.saveToDisk(events);

    if (signal?.aborted === true) {
      throw abortError();
    }
  }

  saveToDisk(events: readonly EnrichedTelemetryEvent[]): void {
    if (events.length === 0) return;
    const path = join(this.telemetryDir(), `failed_${randomBytes(6).toString('hex')}.jsonl`);
    const text = events.map((event) => JSON.stringify(event)).join('\n') + '\n';
    writeFileSync(path, text, { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
    try {
      chmodSync(path, 0o600);
    } catch {
      // best effort on platforms that do not support chmod.
    }
  }

  async retryDiskEvents(): Promise<void> {
    return;
  }

  private telemetryDir(): string {
    const path = join(this.homeDir, 'telemetry');
    mkdirSync(path, { recursive: true, mode: 0o700 });
    try {
      chmodSync(path, 0o700);
    } catch {
      // best effort on platforms that do not support chmod.
    }
    return path;
  }
}

export function buildUserId(deviceId: string): string {
  return USER_ID_PREFIX + deviceId;
}

export function buildPayload(
  events: readonly EnrichedTelemetryEvent[],
  deviceId: string,
): TelemetryPayload {
  return {
    user_id: buildUserId(deviceId),
    events: events.map((event) => flattenEvent(applyServerPrefix(event))),
  };
}

export function applyServerPrefix(event: EnrichedTelemetryEvent): EnrichedTelemetryEvent {
  const name: unknown = event.event;
  if (typeof name !== 'string' || name.length === 0 || name.startsWith(SERVER_EVENT_PREFIX)) {
    return event;
  }
  return { ...event, event: SERVER_EVENT_PREFIX + name };
}

export function flattenEvent(event: EnrichedTelemetryEvent): Record<string, TelemetryPrimitive> {
  const out: Record<string, TelemetryPrimitive> = {};
  for (const [key, value] of Object.entries(event)) {
    if (key === 'properties') {
      flattenNested(out, 'property', value);
    } else if (key === 'context') {
      flattenNested(out, 'context', value);
    } else {
      assertPrimitive(key, value);
      out[key] = value;
    }
  }
  return out;
}

function flattenNested(target: Record<string, TelemetryPrimitive>, prefix: string, value: unknown) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [key, nestedValue] of Object.entries(value)) {
    assertPrimitive(`${prefix}.${key}`, nestedValue);
    target[`${prefix}_${key}`] = nestedValue;
  }
}

function assertPrimitive(key: string, value: unknown): asserts value is TelemetryPrimitive {
  if (isTelemetryPrimitive(value)) return;
  throw new TypeError(`telemetry ${key} must be primitive`);
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}
