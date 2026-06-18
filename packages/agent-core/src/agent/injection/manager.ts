import type { Agent } from '..';
import type { EphemeralInjection } from '../context/projector';
import type { DynamicInjector } from './injector';
import { PermissionModeInjector } from './permission-mode';
import { TimestampInjector } from './timestamp';

export class InjectionManager {
  private readonly injectors: DynamicInjector[];

  constructor(protected readonly agent: Agent) {
    this.injectors = [new PermissionModeInjector(agent), new TimestampInjector(agent)];
  }

  async inject(): Promise<void> {
    for (const injector of this.injectors) {
      await injector.inject();
    }
  }

  getEphemeralInjections(): readonly EphemeralInjection[] {
    return this.injectors.flatMap((injector) => {
      try {
        return injector.getEphemeral?.() ?? [];
      } catch {
        return [];
      }
    });
  }

  onContextClear(): void {
    for (const injector of this.injectors) {
      injector.onContextClear();
    }
  }

  onContextCompacted(compactedCount: number): void {
    for (const injector of this.injectors) {
      try {
        injector.onContextCompacted(compactedCount);
      } catch {
        continue;
      }
    }
  }
}
