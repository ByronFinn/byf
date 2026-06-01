import { applyProviderConfig } from '@byfriends/oauth';
import type { ModelInfo as OAuthModelInfo } from '@byfriends/oauth';
import type {
  ByfConfig,
  ByfConfigPatch,
  ModelAlias,
  ProviderConfig,
} from '@byfriends/sdk';

import type { ColorPalette } from '#/tui/theme/colors';
import type { ThinkingEffortLevel } from '#/tui/types';

export interface ModelSelection {
  alias: string;
  thinkingEffort: ThinkingEffortLevel;
}

export interface SpinnerHandle {
  stop(opts: { ok: boolean; label: string }): void;
}

export interface LoginFlowDeps {
  readonly colors: ColorPalette;
  getConfig(): Promise<ByfConfig>;
  setConfig(config: ByfConfigPatch): Promise<unknown>;
  fetchModels(baseUrl: string, apiKey: string): Promise<OAuthModelInfo[]>;
  applyProviderConfig: typeof applyProviderConfig;
  refreshConfigAfterLogin(): Promise<void>;
  showStatus(message: string, color?: string): void;
  showError(message: string): void;
  showLoginProgressSpinner(label: string): SpinnerHandle;
  track(event: string, properties?: Record<string, string | number | boolean | null>): void;
  promptTextInput(opts: {
    title: string;
    subtitle: string;
    initialValue?: string;
    placeholder?: string;
  }): Promise<string | undefined>;
  promptApiKey(providerName: string): Promise<string | undefined>;
  runModelSelector(modelDict: Record<string, ModelAlias>): Promise<ModelSelection | undefined>;
}

export class LoginFlow {
  constructor(private readonly deps: LoginFlowDeps) {}

  async run(): Promise<void> {
    const name = await this.deps.promptTextInput({
      title: 'Provider name',
      subtitle: 'A short name for this provider (e.g. deepseek, openrouter)',
    });
    if (name === undefined) return;

    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      this.deps.showError('Provider name must contain only letters, numbers, hyphens, and underscores.');
      return;
    }

    const existingConfig = await this.deps.getConfig();
    if (existingConfig.providers[name] !== undefined) {
      this.deps.showError(`Provider "${name}" already exists. Use a different name or /logout ${name} first.`);
      return;
    }

    const baseUrl = await this.deps.promptTextInput({
      title: 'Base URL',
      subtitle: 'The OpenAI-compatible API endpoint',
      initialValue: 'https://api.openai.com/v1',
      placeholder: 'https://api.openai.com/v1',
    });
    if (baseUrl === undefined) return;

    const apiKey = await this.deps.promptApiKey(name);
    if (apiKey === undefined) return;

    let models: OAuthModelInfo[];
    try {
      const spinner = this.deps.showLoginProgressSpinner(`Fetching models from ${baseUrl}`);
      models = await this.deps.fetchModels(baseUrl, apiKey);
      spinner.stop({ ok: true, label: `Found ${String(models.length)} model(s).` });
    } catch (error: unknown) {
      if (isProviderApiError(error)) {
        this.deps.showError(`Failed to fetch models (HTTP ${String(error.status)}): ${error.message}`);
      } else {
        this.deps.showError(`Failed to fetch models: ${formatErrorMessage(error)}`);
      }
      return this.handleManualModelEntry(name, baseUrl, apiKey);
    }

    if (models.length === 0) {
      this.deps.showStatus('No models found at this endpoint. Enter model ID manually.');
      return this.handleManualModelEntry(name, baseUrl, apiKey);
    }

    const modelDict: Record<string, ModelAlias> = {};
    for (const m of models) {
      modelDict[`${name}/${m.id}`] = {
        provider: name,
        model: m.id,
        maxContextSize: m.contextLength,
        capabilities: capabilitiesForModel(m),
        displayName: m.displayName,
      };
    }

    const selection = await this.deps.runModelSelector(modelDict);
    if (selection === undefined) {
      return this.handleManualModelEntry(name, baseUrl, apiKey);
    }

    const selectedId = selection.alias.split('/').slice(1).join('/');
    const selectedModel = models.find((m) => m.id === selectedId);
    if (selectedModel === undefined) return;

    await this.applyConfig(name, baseUrl, apiKey, models, selectedModel, selection.thinkingEffort !== 'off');
    this.deps.track('login', { provider: name, model: selectedModel.id });
    this.deps.showStatus(`Connected: ${name} · ${selectedModel.id}`);
  }

  private async handleManualModelEntry(
    name: string,
    baseUrl: string,
    apiKey: string,
  ): Promise<void> {
    const manualModel = await this.deps.promptTextInput({
      title: 'Enter model ID manually',
      subtitle: 'Could not detect models. Enter the model ID (e.g. gpt-4o).',
    });
    if (manualModel === undefined) return;

    const contextSize = await this.deps.promptTextInput({
      title: 'Context window size',
      subtitle: 'Max context size in tokens for this model',
      initialValue: '128000',
      placeholder: '128000',
    });
    if (contextSize === undefined) return;

    const parsedSize = Number.parseInt(contextSize, 10);
    if (!Number.isFinite(parsedSize) || parsedSize <= 0) {
      this.deps.showError('Invalid context size. Must be a positive number.');
      return;
    }

    const manualModelInfo: OAuthModelInfo = {
      id: manualModel,
      contextLength: parsedSize,
      supportsReasoning: false,
      supportsImageIn: false,
      supportsVideoIn: false,
    };

    await this.applyConfig(name, baseUrl, apiKey, [manualModelInfo], manualModelInfo, false);
    this.deps.track('login', { provider: name, model: manualModel });
    this.deps.showStatus(`Connected: ${name} · ${manualModel}`);
  }

  private async applyConfig(
    name: string,
    baseUrl: string,
    apiKey: string,
    models: readonly OAuthModelInfo[],
    selectedModel: OAuthModelInfo,
    thinking: boolean,
  ): Promise<void> {
    const config = await this.deps.getConfig();
    this.deps.applyProviderConfig(config, {
      name,
      baseUrl,
      apiKey,
      models,
      selectedModel,
      thinking,
    });
    await this.deps.setConfig({
      providers: config.providers as Record<string, ProviderConfig>,
      models: config.models,
      defaultModel: config.defaultModel,
      defaultThinking: config.defaultThinking,
    });
    await this.deps.refreshConfigAfterLogin();
  }
}

function capabilitiesForModel(m: OAuthModelInfo): string[] {
  const caps: string[] = [];
  if (m.supportsReasoning) caps.push('thinking');
  if (m.supportsImageIn) caps.push('image');
  if (m.supportsVideoIn) caps.push('video');
  return caps;
}

function isProviderApiError(error: unknown): error is { status: number; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    'message' in error
  );
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
