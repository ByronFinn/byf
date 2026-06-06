import type { Agent } from '..';
import {
  AGENT_WIRE_PROTOCOL_VERSION,
  isNewerWireVersion,
  migrateWireRecord,
  resolveWireMigrations,
  type WireMigration,
  type WireMigrationRecord,
} from './migration';
import type { AgentRecord, AgentRecordPersistence } from './types';

export * from './types';
export { AGENT_WIRE_PROTOCOL_VERSION } from './migration';
export {
  FileSystemAgentRecordPersistence,
  InMemoryAgentRecordPersistence,
} from './persistence';
export type { FileSystemAgentRecordPersistenceOptions } from './persistence';

export class AgentRecords {
  private _restoring = false;
  private metadataInitialized = false;
  private handlers: Record<string, import('../restore-handler').RecordRestoreHandler> = {};

  constructor(
    private readonly agent: Agent,
    private readonly persistence?: AgentRecordPersistence,
  ) {}

  get restoring() {
    return this._restoring;
  }

  registerHandlers(handlers: Record<string, import('../restore-handler').RecordRestoreHandler>): void {
    this.handlers = { ...handlers };
  }

  logRecord(record: AgentRecord): void {
    if (this._restoring) return;
    const stamped: AgentRecord =
      record.time !== undefined ? record : { ...record, time: Date.now() };
    if (
      this.persistence !== undefined &&
      !this.metadataInitialized &&
      stamped.type !== 'metadata'
    ) {
      this.persistence.append({
        type: 'metadata',
        protocol_version: AGENT_WIRE_PROTOCOL_VERSION,
        created_at: Date.now(),
      });
      this.metadataInitialized = true;
    }
    if (stamped.type === 'metadata') {
      this.metadataInitialized = true;
    }
    this.persistence?.append(stamped);
  }

  restore(record: AgentRecord): void {
    this._restoring = true;
    try {
      this.routeToHandler(record);
    } finally {
      this._restoring = false;
    }
  }

  private routeToHandler(record: AgentRecord): void {
    const handlerKey = this.getHandlerKey(record.type);
    if (handlerKey === null || this.handlers[handlerKey] === undefined) {
      // Silently skip unregistered record types
      return;
    }

    const handler = this.handlers[handlerKey];
    handler.restoreRecord(record);
  }

  private getHandlerKey(recordType: string): string | null {
    // Special case: metadata is handled directly
    if (recordType === 'metadata') {
      return null;
    }

    // Extract the prefix from the record type
    const prefix = recordType.split('.')[0];

    // Map prefixes to handler keys
    const mapping: Record<string, string> = {
      context: 'context',
      config: 'config',
      turn: 'turn',
      permission: 'permission',
      tools: 'tools',
      usage: 'usage',
      background: 'background',
      full_compaction: 'fullCompaction',
      plan_mode: 'planMode',
    };

    return mapping[prefix] ?? null;
  }

  async replay(): Promise<{ warning?: string }> {
    if (!this.persistence) throw new Error('No persistence provided for AgentRecords');
    let migrations: readonly WireMigration[] = [];
    let hasMetadata = false;
    let shouldRewrite = false;
    let warning: string | undefined;
    const replayedRecords: AgentRecord[] = [];
    for await (const record of this.persistence.read()) {
      if (!hasMetadata) {
        if (record.type !== 'metadata') {
          throw new Error('AgentRecords replay expected metadata as the first record');
        }
        hasMetadata = true;
        this.metadataInitialized = true;
        const readVersion = record.protocol_version;
        if (isNewerWireVersion(readVersion)) {
          warning = `Session wire protocol version ${readVersion} is newer than the current version ${AGENT_WIRE_PROTOCOL_VERSION}. Records will be replayed without migration.`;
          shouldRewrite = false;
        } else {
          migrations = resolveWireMigrations(readVersion);
          shouldRewrite = readVersion !== AGENT_WIRE_PROTOCOL_VERSION;
        }
      }
      let migratedRecord = migrateWireRecord(
        record as WireMigrationRecord,
        migrations,
      ) as AgentRecord;
      if (migratedRecord.type === 'metadata') {
        migratedRecord = {
          ...migratedRecord,
          protocol_version: AGENT_WIRE_PROTOCOL_VERSION,
        };
      }
      replayedRecords.push(migratedRecord);
      this.restore(migratedRecord);
    }
    if (shouldRewrite) {
      this.persistence.rewrite(replayedRecords);
      await this.persistence.flush();
    }
    return { warning };
  }

  async flush(): Promise<void> {
    await this.persistence?.flush();
  }
}
