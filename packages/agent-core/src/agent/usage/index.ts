import { addUsage, cacheHitRate, type TokenUsage } from '@byfriends/kosong';

import type { UsageStatus } from '#/rpc';

import type { Agent } from '..';
import { isAgentRecordOfPrefix } from '../records/types';
import type { RecordRestoreHandler } from '../restore-handler';

export type UsageRecordScope = 'session' | 'turn';

function copyUsage(usage: TokenUsage): TokenUsage {
  return { ...usage };
}

export class UsageRecorder implements RecordRestoreHandler {
  private readonly byModel: Record<string, TokenUsage> = {};
  private currentTurn: TokenUsage | undefined;

  constructor(protected readonly agent?: Agent) {}

  beginTurn(): void {
    this.currentTurn = undefined;
  }

  endTurn(): void {
    this.currentTurn = undefined;
  }

  record(model: string, usage: TokenUsage, scope: UsageRecordScope = 'session'): void {
    this.agent?.records.logRecord({
      type: 'usage.record',
      model,
      usage,
      usageScope: scope,
    });
    const current = this.byModel[model];
    this.byModel[model] = current === undefined ? copyUsage(usage) : addUsage(current, usage);

    if (scope === 'turn') {
      this.currentTurn =
        this.currentTurn === undefined ? copyUsage(usage) : addUsage(this.currentTurn, usage);
    }
    this.agent?.emitStatusUpdated();
  }

  data(): UsageStatus {
    const byModel = this.byModelSnapshot();
    const hasByModel = Object.keys(byModel).length > 0;
    const currentTurn = this.currentTurn;
    const total = hasByModel ? totalUsage(byModel) : undefined;
    return {
      byModel: hasByModel ? byModel : undefined,
      total,
      currentTurn: currentTurn === undefined ? undefined : copyUsage(currentTurn),
      cacheHitRate: total !== undefined ? cacheHitRate(total) : undefined,
    };
  }

  status(): UsageStatus | undefined {
    const status = this.data();
    if (
      status.byModel === undefined &&
      status.total === undefined &&
      status.currentTurn === undefined
    ) {
      return undefined;
    }
    return status;
  }

  private byModelSnapshot(): Record<string, TokenUsage> {
    return Object.fromEntries(
      Object.entries(this.byModel).map(([model, usage]) => [model, copyUsage(usage)]),
    );
  }

  restoreRecord(record: import('../records/types').AgentRecord): void {
    if (!isAgentRecordOfPrefix(record, 'usage')) return;
    switch (record.type) {
      case 'usage.record':
        // During restore, we always use 'session' scope regardless of the original scope
        // This matches the old restoration behavior and ensures currentTurn is not set
        // The restoring flag prevents logging
        this.record(record.model, record.usage, 'session');
        break;
    }
  }
}

function totalUsage(byModel: Record<string, TokenUsage>): TokenUsage | undefined {
  let total: TokenUsage | undefined;
  for (const usage of Object.values(byModel)) {
    total = total === undefined ? copyUsage(usage) : addUsage(total, usage);
  }
  return total;
}
