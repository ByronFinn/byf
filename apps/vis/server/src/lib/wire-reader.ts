import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import {
  isNewerWireVersion,
  migrateWireRecord,
  resolveWireMigrations,
  type WireMigration,
} from '@byfriends/agent-core/agent/records/migration';

import type { AgentRecord, WireEntry } from './agent-record-types';

export interface WireReadResult {
  metadata: { protocolVersion: string; createdAt: number };
  records: ReadonlyArray<WireEntry>;
  warnings: string[];
}

/** Best-effort fallback when a wire file declares a protocol_version that
 *  `agent-core` does not know about (e.g. the historic "2.2" alias that
 *  pre-dates the 1.x renumber). We try to apply the chain *starting* from
 *  the oldest known version (1.0) and warn the caller. If even that fails
 *  we just pass records through unchanged. */
function bestEffortMigrations(): readonly WireMigration[] {
  try {
    return resolveWireMigrations('1.0');
  } catch {
    return [];
  }
}

/** 读取单个 agent 的 `wire.jsonl`。
 *
 *  每条记录以 `WireEntry` 返回,同时含磁盘解析形态(`raw`)与迁移后的
 *  当前协议形态(`data`)。对声明 `agent-core` 不认识的协议版本
 *  (历史 2.x 标签,或真正未来的版本)的 wire,读取器回退到尽力路径:
 *  记录经 1.0 起的迁移链运行,并向 `warnings[]` 添加警告,使 UI 能
 *  呈现该注意事项。 */
export async function readAgentWire(path: string): Promise<WireReadResult> {
  const stream = createReadStream(path, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNo = 0;
  let metadata: WireReadResult['metadata'] | null = null;
  let migrations: readonly WireMigration[] = [];
  const records: WireEntry[] = [];
  const warnings: string[] = [];

  for await (const line of rl) {
    lineNo += 1;
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      warnings.push(`line ${lineNo}: invalid JSON (${(error as Error).message})`);
      continue;
    }
    if (!isObject(parsed) || typeof parsed['type'] !== 'string') {
      warnings.push(`line ${lineNo}: missing 'type' field`);
      continue;
    }
    if (metadata === null) {
      if (parsed['type'] !== 'metadata') {
        throw new Error(`Wire file missing metadata header at line ${lineNo}`);
      }
      const pv = parsed['protocol_version'];
      const ca = parsed['created_at'];
      if (typeof pv !== 'string' || typeof ca !== 'number') {
        throw new TypeError(`Wire metadata malformed at line ${lineNo}`);
      }
      // Newer-than-supported versions return [] from resolveWireMigrations
      // without throwing (agent-core replays them unmigrated). Vis still wants
      // a best-effort 1.0→current chain + warning so historic labels like "2.2"
      // surface in the UI.
      if (isNewerWireVersion(pv)) {
        warnings.push(
          `unrecognised protocol_version "${pv}" — parsing as best-effort (newer than supported)`,
        );
        migrations = bestEffortMigrations();
      } else {
        try {
          migrations = resolveWireMigrations(pv);
        } catch (error) {
          warnings.push(
            `unrecognised protocol_version "${pv}" — parsing as best-effort (${(error as Error).message})`,
          );
          migrations = bestEffortMigrations();
        }
      }
      metadata = { protocolVersion: pv, createdAt: ca };
      continue;
    }
    const raw = parsed;
    let migrated: Record<string, unknown>;
    try {
      migrated =
        migrations.length === 0
          ? raw
          : (migrateWireRecord(
              raw as Record<string, unknown> & { type: string },
              migrations,
            ) as Record<string, unknown>);
    } catch (error) {
      // A single record that won't migrate is not fatal — keep the raw
      // payload so the UI can still render whatever fields it understands.
      warnings.push(
        `line ${lineNo}: migration failed (${(error as Error).message}); using raw record`,
      );
      migrated = raw;
    }
    records.push({ lineNo, data: migrated as AgentRecord, raw });
  }
  if (metadata === null) {
    throw new Error('Wire file is empty (no metadata)');
  }
  return { metadata, records, warnings };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
