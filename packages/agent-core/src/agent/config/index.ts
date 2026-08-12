import {
  createProvider,
  UNKNOWN_CAPABILITY,
  type ChatProvider,
  type ModelCapability,
  type ProviderConfig,
} from '@byfriends/kosong';

import type { Agent } from '..';
import type { ResolvedRuntimeProvider } from '../../providers/runtime-provider';
import { isAgentRecordOfPrefix } from '../records/types';
import { configModel, configUpdate } from '../wire/ops/config';
import { resolveThinkingEffort, type ThinkingEffort } from './thinking';
import type { AgentConfigData, AgentConfigUpdateData } from './types';

export * from './types';
export { resolveThinkingEffort, type ThinkingEffort } from './thinking';

export class ConfigState {
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
    this.agent.wire.dispatch(configUpdate(changed));
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
    if (!isAgentRecordOfPrefix(record, 'config')) return;
    switch (record.type) {
      case 'config.update':
        // Test-only entry point (restore-handler unit tests). Production restore
        // uses the pure wire reducer (wire.restore → apply → syncFromWire) and
        // never reaches this method.
        this.update(record);
        break;
    }
  }

  /**
   * restore 后从 wire reducer model 同步持久化状态（PRD-0027 Phase 1 Facade）。
   * 6 个字段由 config.update 的纯 apply 重建。initializeBuiltinTools 副作用已外提
   * 为 Agent 的 onDidRestore hook（本方法只同步状态，不触发工具初始化）。
   */
  syncFromWire(): void {
    // 无条件赋值 + 构造默认值兜底：model 的 undefined 可能是「显式清除」
    // （config.update 的 Object.hasOwn 语义，如 modelAlias: undefined），
    // `!== undefined` 守卫会跳过它导致残留 stale 值。model 是 restore 权威。
    const model = this.agent.wire.getModel(configModel);
    this._cwd = model.cwd ?? '';
    this._additionalDirs = model.additionalDirs ?? [];
    this._modelAlias = model.modelAlias;
    this._profileName = model.profileName;
    this._thinkingLevel = (model.thinkingLevel as ThinkingEffort) ?? 'off';
    this._systemPrompt = model.systemPrompt ?? '';
  }
}
