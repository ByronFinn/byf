import type { Agent } from '..';

import type { EphemeralInjection } from '../context/projector';

export abstract class DynamicInjector {
  protected injectedAt: number | null = null;

  constructor(protected readonly agent: Agent) {}

  onContextClear(): void {
    this.injectedAt = null;
  }

  onContextCompacted(compactedCount: number): void {
    if (this.injectedAt !== null) {
      const newInjectedAt = this.injectedAt - compactedCount + 1;
      this.injectedAt = newInjectedAt >= 0 ? newInjectedAt : null;
    }
  }

  async inject(): Promise<void> {
    const injection = await this.getInjection();
    if (injection) {
      this.injectedAt = this.agent.context.history.length;
      this.agent.context.appendSystemReminder(injection, {
        kind: 'injection',
        variant: this.injectionVariant,
      });
    }
  }

  protected abstract readonly injectionVariant: string;

  protected abstract getInjection(): string | Promise<string | undefined> | undefined;

  /**
   * If implemented, produces ephemeral injections rendered fresh each step
   * at request time. Unlike persistent injections (via {@link inject}),
   * ephemeral injections are not stored in history and do not pollute the
   * cached prefix when placed at the `'before_user'` position.
   */
  getEphemeral?(): readonly EphemeralInjection[];
}
