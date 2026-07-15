import { describe, expect, it } from 'vitest';

import type { EphemeralInjection } from '../../../src/agent/context/projector';
import { DynamicInjector } from '../../../src/agent/injection/injector';
import { InjectionManager } from '../../../src/agent/injection/manager';
import { PermissionModeInjector } from '../../../src/agent/injection/permission-mode';
import { TimestampInjector } from '../../../src/agent/injection/timestamp';
import { testAgent } from '../harness/agent';

class RecordingInjector extends DynamicInjector {
  override readonly injectionVariant = 'recording_test';
  compactionCalls = 0;
  clearCalls = 0;

  override onContextClear(): void {
    this.clearCalls += 1;
    super.onContextClear();
  }

  override onContextCompacted(compactedCount: number): void {
    this.compactionCalls += 1;
    super.onContextCompacted(compactedCount);
  }

  protected override getInjection(): string | undefined {
    return undefined;
  }
}

class BoomInjector extends DynamicInjector {
  override readonly injectionVariant = 'boom_test';

  override onContextCompacted(_compactedCount: number): void {
    throw new Error('boom-compact');
  }

  protected override getInjection(): string | undefined {
    return undefined;
  }
}

function installInjectors(manager: InjectionManager, injectors: DynamicInjector[]): void {
  (manager as unknown as { injectors: DynamicInjector[] }).injectors = injectors;
}

describe('InjectionManager.onContextCompacted', () => {
  it('notifies every registered injector when compaction occurs', () => {
    const ctx = testAgent();
    ctx.configure();
    const a = new RecordingInjector(ctx.agent);
    const b = new RecordingInjector(ctx.agent);
    installInjectors(ctx.agent.injection, [a, b]);

    ctx.agent.injection.onContextCompacted(3);

    expect(a.compactionCalls).toBe(1);
    expect(b.compactionCalls).toBe(1);
  });

  it('isolates compaction hook failures so later injectors still receive the notification', () => {
    const ctx = testAgent();
    ctx.configure();
    const recorder = new RecordingInjector(ctx.agent);
    installInjectors(ctx.agent.injection, [new BoomInjector(ctx.agent), recorder]);

    expect(() => {
      ctx.agent.injection.onContextCompacted(2);
    }).not.toThrow();
    expect(recorder.compactionCalls).toBe(1);
  });

  it('continues notifying surviving injectors on later compactions', () => {
    const ctx = testAgent();
    ctx.configure();
    const recorder = new RecordingInjector(ctx.agent);
    installInjectors(ctx.agent.injection, [new BoomInjector(ctx.agent), recorder]);

    expect(() => {
      ctx.agent.injection.onContextCompacted(1);
    }).not.toThrow();
    expect(recorder.compactionCalls).toBe(1);

    ctx.agent.injection.onContextCompacted(1);
    expect(recorder.compactionCalls).toBe(2);
  });

  it('replays context lifecycle records through ContextMemory only once', () => {
    const ctx = testAgent();
    ctx.configure();
    const recorder = new RecordingInjector(ctx.agent);
    installInjectors(ctx.agent.injection, [recorder]);

    ctx.agent.records.restore({ type: 'context.clear' });
    ctx.agent.records.restore({
      type: 'context.apply_compaction',
      summary: 'Compacted summary.',
      compactedCount: 2,
      tokensBefore: 10,
      tokensAfter: 4,
    });

    expect(recorder.clearCalls).toBe(1);
    expect(recorder.compactionCalls).toBe(1);
  });
});

describe('InjectionManager.getEphemeralInjections', () => {
  it('collects ephemeral injections from injectors that implement getEphemeral', () => {
    const ctx = testAgent();
    ctx.configure();

    class EphemeralTestInjector extends DynamicInjector {
      override readonly injectionVariant = 'ephemeral_test';

      protected override getInjection(): undefined {
        return undefined;
      }

      override getEphemeral(): readonly EphemeralInjection[] {
        return [
          {
            kind: 'system_reminder',
            content: 'test ephemeral content',
            position: 'before_user',
          },
        ];
      }
    }

    const ephemeralInjector = new EphemeralTestInjector(ctx.agent);
    const plainInjector = new RecordingInjector(ctx.agent);
    installInjectors(ctx.agent.injection, [plainInjector, ephemeralInjector]);

    const result = ctx.agent.injection.getEphemeralInjections();

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('test ephemeral content');
    expect(result[0].position).toBe('before_user');
  });

  it('returns empty when no injectors implement getEphemeral', () => {
    const ctx = testAgent();
    ctx.configure();

    const recorder = new RecordingInjector(ctx.agent);
    installInjectors(ctx.agent.injection, [recorder]);

    expect(ctx.agent.injection.getEphemeralInjections()).toHaveLength(0);
  });

  it('includes timestamp injection from TimestampInjector', () => {
    const ctx = testAgent();
    ctx.configure();

    const ts = new TimestampInjector(ctx.agent);
    installInjectors(ctx.agent.injection, [ts]);

    const result = ctx.agent.injection.getEphemeralInjections();

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('system_reminder');
    expect(result[0].position).toBe('before_user');
    expect(result[0].content).toMatch(/ISO format/);
  });
});

describe('PermissionModeInjector (ephemeral)', () => {
  it('produces no injection when auto mode is inactive', () => {
    const ctx = testAgent();
    ctx.configure();

    const injector = new PermissionModeInjector(ctx.agent);

    expect(injector.getEphemeral()).toHaveLength(0);
  });

  it('produces injection when auto mode is active', () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.agent.permission.mode = 'auto';

    const injector = new PermissionModeInjector(ctx.agent);
    const result = injector.getEphemeral();

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('system_reminder');
    expect(result[0].position).toBe('before_user');
    expect(result[0].content).toContain('Auto permission mode is active');
  });
});
