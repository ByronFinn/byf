import {
  createProvider,
  UNKNOWN_CAPABILITY,
  type ChatProvider,
  type ModelCapability,
  type ProviderConfig,
} from '@byfriends/kosong';

import type { Agent } from '..';
import type { ResolvedRuntimeProvider } from '../../providers/runtime-provider';
import type { RecordRestoreHandler } from '../restore-handler';
import { resolveThinkingEffort, type ThinkingEffort } from './thinking';
import type { AgentConfigData, AgentConfigUpdateData } from './types';

export * from './types';
export { resolveThinkingEffort, type ThinkingEffort } from './thinking';

export class ConfigState implements RecordRestoreHandler {
  private _cwd: string = '';
  private _additionalDirs: readonly string[] = [];
  private _modelAlias: string | undefined;
  private _profileName: string | undefined;
  private _thinkingLevel: ThinkingEffort = 'off';
  private _systemPrompt: string = '';

  constructor(protected readonly agent: Agent) {}

  update(input: AgentConfigUpdateData): void {
    const changed = { ...input };
    if (Object.keys(changed).length === 0) return;

    if (changed.thinkingLevel !== undefined) {
      changed.thinkingLevel = resolveThinkingEffort(
        changed.thinkingLevel,
        this.agent.providerManager?.config.thinking,
      );
    }
    this.agent.records.logRecord({
      type: 'config.update',
      ...changed,
    });
    this.agent.replayBuilder.push({
      type: 'config_updated',
      config: changed,
    });
    if (changed.cwd !== undefined) this._cwd = changed.cwd;
    if (changed.additionalDirs !== undefined) this._additionalDirs = changed.additionalDirs;
    if (Object.hasOwn(changed, 'modelAlias')) {
      this._modelAlias = changed.modelAlias ?? undefined;
    }
    if (Object.hasOwn(changed, 'profileName')) this._profileName = changed.profileName;
    if (changed.thinkingLevel !== undefined)
      this._thinkingLevel = changed.thinkingLevel as ThinkingEffort;
    if (changed.systemPrompt !== undefined) this._systemPrompt = changed.systemPrompt;
    if (
      this.hasProvider &&
      (changed.cwd !== undefined ||
        changed.additionalDirs !== undefined ||
        Object.hasOwn(changed, 'modelAlias'))
    ) {
      this.agent.tools.initializeBuiltinTools();
    }
    this.agent.emitStatusUpdated();
  }

  data(): AgentConfigData {
    const resolved = this.tryResolvedProviderConfig();
    return {
      cwd: this.cwd,
      additionalDirs: this._additionalDirs,
      provider: resolved?.provider,
      modelAlias: this._modelAlias,
      modelCapabilities: resolved?.modelCapabilities ?? UNKNOWN_CAPABILITY,
      profileName: this.profileName,
      thinkingLevel: this.thinkingLevel,
      systemPrompt: this.systemPrompt,
    };
  }

  get cwd(): string {
    return this._cwd;
  }

  get additionalDirs(): readonly string[] {
    return this._additionalDirs;
  }

  get hasModel(): boolean {
    return this._modelAlias !== undefined;
  }

  get hasProvider(): boolean {
    return this.tryResolvedProviderConfig() !== undefined;
  }

  get providerConfig(): ProviderConfig {
    const provider = this.resolvedProviderConfig?.provider;
    if (provider === undefined) {
      throw new Error('Provider not set');
    }
    return provider;
  }

  get provider(): ChatProvider {
    return createProvider(this.providerConfig);
  }

  get model(): string {
    if (this._modelAlias === undefined) {
      throw new Error('Model not set');
    }
    return this._modelAlias;
  }

  get modelAlias(): string | undefined {
    return this._modelAlias;
  }

  get thinkingLevel(): ThinkingEffort {
    return this._thinkingLevel;
  }

  get profileName(): string | undefined {
    return this._profileName;
  }

  get systemPrompt(): string {
    return this._systemPrompt;
  }

  get modelCapabilities(): ModelCapability {
    return this.tryResolvedProviderConfig()?.modelCapabilities ?? UNKNOWN_CAPABILITY;
  }

  private get resolvedProviderConfig(): ResolvedRuntimeProvider | undefined {
    if (this._modelAlias === undefined) return undefined;
    return this.agent.providerManager?.resolveProviderConfigForModel(this._modelAlias);
  }

  private tryResolvedProviderConfig(): ResolvedRuntimeProvider | undefined {
    try {
      return this.resolvedProviderConfig;
    } catch {
      return undefined;
    }
  }

  restoreRecord(record: import('../records/types').AgentRecord): void {
    // oxlint-disable-next-line typescript(switch-exhaustiveness-check) -- restoreRecord only restores config.* records; other record types are handled by sibling subsystems
    switch (record.type) {
      case 'config.update':
        // During restore, we call the normal update method but it should not log
        // because the restoring flag prevents logging
        this.update(record);
        break;
    }
  }
}
