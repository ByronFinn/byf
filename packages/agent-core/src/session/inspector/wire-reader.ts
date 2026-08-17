/**
 * Wire 读取（按 agent 读取 `wire.jsonl`，迁移 + 尽力路径）。
 *
 * 由 `apps/vis/server/src/lib/wire-reader.ts` 上移（PRD-0035 R-A1）：
 * 迁移链是 core 内部实现（`agent/records/migration`），上移后依赖方向
 * 更自然（原 app 层经包子路径 import core 内部）。
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import {
  isNewerWireVersion,
  migrateWireRecord,
  resolveWireMigrations,
  type WireMigration,
} from '#/agent/records/migration';

import type { AgentRecord, WireEntry } from './types';

export interface WireReadResult {
  metadata: { protocolVersion: string; createdAt: number };
  records: ReadonlyArray<WireEntry>;
  warnings: string[];
}

/** 尽力回退：wire 声明了 agent-core 不认识的协议版本（如历史 "2.2" 别名）
 *  时，尝试从最旧已知版本（1.0）起跑迁移链并告警。仍失败则原样透传。 */
function bestEffortMigrations(): readonly WireMigration[] {
  try {
    return resolveWireMigrations('1.0');
  } catch {
    return [];
  }
}

/** 读取单个 agent 的 `wire.jsonl`。
 *
 *  每条记录以 `WireEntry` 返回，同时含磁盘解析形态（`raw`）与迁移后的
 *  当前协议形态（`data`）。对声明未知协议版本的 wire 走尽力路径并向
 *  `warnings[]` 添加警告，使 UI 能呈现该注意事项。 */
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
      // 比支持版本更新时 resolveWireMigrations 返回 []（agent-core 原样
      // 重放）；Inspector 仍想要 1.0→current 尽力链 + 警告，让历史标签
      // 如 "2.2" 在 UI 中可见。
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
      // 单条无法迁移不致命：保留 raw 载荷让 UI 仍能渲染它认识的字段。
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
