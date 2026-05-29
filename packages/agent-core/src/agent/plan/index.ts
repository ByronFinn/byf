import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

import type { Agent } from '..';
import { generateHeroSlug } from '../../utils/hero-slug';

export type PlanData = null | {
  id: string;
  exists: boolean;
  content: string;
  path: string;
};
export type PlanFilePath = string | null;

export class PlanMode {
  protected _isActive = false;
  protected _planId: null | string = null;
  protected _planFilePath: PlanFilePath = null;

  constructor(protected readonly agent: Agent) {}

  createPlanId(): string {
    return generateHeroSlug(randomUUID(), new Set());
  }

  async enter(id = this.createPlanId(), createFile = false, emitStatus = true): Promise<void> {
    if (this._isActive) {
      throw new Error('Already in plan mode');
    }

    this._isActive = true;
    this._planId = id;
    this._planFilePath = null;

    let enterRecorded = false;
    try {
      const planFilePath = this.planFilePathFor(id);
      this._planFilePath = planFilePath;
      this.agent.records.logRecord({ type: 'plan_mode.enter', id });
      enterRecorded = true;
      if (createFile) {
        await this.materializePlanFile(planFilePath);
      }
    } catch (error) {
      if (enterRecorded) {
        this.cancel(id);
      } else {
        this._isActive = false;
        this._planId = null;
        this._planFilePath = null;
      }
      throw error;
    }

    this.trackPlanLifecycle('entered');
    if (emitStatus) this.agent.emitStatusUpdated();
  }

  restoreEnter({ id }: { readonly id: string }): void {
    this.agent.replayBuilder.push({
      type: 'plan_updated',
      enabled: true,
    });

    this._isActive = true;
    this._planId = id;
    this._planFilePath = this.planFilePathFor(id);
  }

  cancel(id?: string): void {
    this.agent.records.logRecord({ type: 'plan_mode.cancel', id });
    this.agent.replayBuilder.push({
      type: 'plan_updated',
      enabled: false,
    });
    this._isActive = false;
    this._planId = null;
    this._planFilePath = null;
    this.agent.emitStatusUpdated();
  }

  async clear(): Promise<void> {
    if (!this._planFilePath) return;
    if (!(await this.planFileExists(this._planFilePath))) return;
    await this.agent.runtime.kaos.writeText(this._planFilePath, '');
  }

  exit(id?: string): void {
    this.agent.records.logRecord({ type: 'plan_mode.exit', id });
    this.agent.replayBuilder.push({
      type: 'plan_updated',
      enabled: false,
    });
    this._isActive = false;
    this._planId = null;
    this._planFilePath = null;
    this.trackPlanLifecycle('exited');
    this.agent.emitStatusUpdated();
  }

  get isActive() {
    return this._isActive;
  }

  get planFilePath(): PlanFilePath {
    return this._planFilePath;
  }

  async data(): Promise<PlanData> {
    if (!this._planId || !this._planFilePath) return null;
    let content = '';
    let exists = true;
    try {
      content = await this.agent.runtime.kaos.readText(this._planFilePath);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
      exists = false;
    }
    return {
      id: this._planId,
      exists,
      content,
      path: this._planFilePath,
    };
  }

  async materializeCurrentPlanFile(): Promise<void> {
    if (this._planFilePath === null) return;
    await this.materializePlanFile(this._planFilePath);
  }

  private async materializePlanFile(path: string): Promise<void> {
    if (await this.planFileExists(path)) return;
    await this.ensurePlanDirectory(path);
    await this.agent.runtime.kaos.writeText(path, '');
    this.trackPlanLifecycle('materialized');
  }

  private async ensurePlanDirectory(path: string): Promise<void> {
    await this.agent.runtime.kaos.mkdir(dirname(path), {
      parents: true,
      existOk: true,
    });
  }

  private planFilePathFor(id: string): string {
    const plansDir =
      this.agent.homedir === undefined
        ? join(this.agent.config.cwd || this.agent.runtime.kaos.getcwd(), 'plan')
        : join(this.agent.homedir, 'plans');
    return join(plansDir, `${id}.md`);
  }

  private async planFileExists(path: string): Promise<boolean> {
    try {
      await this.agent.runtime.kaos.readText(path);
      return true;
    } catch (error) {
      if (isMissingFileError(error)) return false;
      throw error;
    }
  }

  private trackPlanLifecycle(stage: 'entered' | 'materialized' | 'exited'): void {
    this.agent.telemetry?.track?.('plan_file_lifecycle', { stage });
  }
}

function isMissingFileError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const code = (error as { readonly code?: unknown }).code;
  return code === 'ENOENT';
}
