import { readApiErrorMessage } from './api-error';
import { isRecord } from './utils';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface ModelInfo {
  readonly id: string;
  readonly contextLength: number;
  readonly supportsReasoning: boolean;
  readonly supportsReasoningEffort?: boolean | undefined;
  readonly reasoningEffortKey?: string | undefined;
  readonly supportsImageIn: boolean;
  readonly supportsVideoIn: boolean;
  readonly supportsToolUse?: boolean | undefined;
  readonly displayName?: string | undefined;
}

export interface ModelAlias {
  provider: string;
  model: string;
  maxContextSize: number;
  capabilities?: string[] | undefined;
  displayName?: string | undefined;
  readonly [key: string]: unknown;
}

export interface ProviderConfig {
  type: string;
  baseUrl?: string | undefined;
  apiKey?: string | undefined;
  readonly [key: string]: unknown;
}

export interface ServicesConfig {
  readonly [key: string]: unknown;
}

export interface ConfigShape {
  providers: Record<string, ProviderConfig | Record<string, unknown>>;
  models?: Record<string, ModelAlias | Record<string, unknown>> | undefined;
  defaultModel?: string | undefined;
  defaultThinking?: boolean | undefined;
  services?: ServicesConfig | undefined;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Provider API error
// ---------------------------------------------------------------------------

export class ProviderApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Model fetching
// ---------------------------------------------------------------------------

function toModelInfo(item: unknown): ModelInfo | undefined {
  if (!isRecord(item) || typeof item['id'] !== 'string' || item['id'].length === 0) {
    return undefined;
  }
  const rawContextLength = Number(item['context_length']);
  const contextLength = Number.isInteger(rawContextLength) && rawContextLength > 0
    ? rawContextLength
    : 200_000;
  const displayName = item['display_name'];
  const normalizedDisplayName =
    typeof displayName === 'string' && displayName.length > 0 ? displayName : undefined;
  const supportsToolUse = Object.hasOwn(item, 'supports_tool_use')
    ? Boolean(item['supports_tool_use'])
    : true;
  const reasoningEffortKey = firstNonEmptyString(item, [
    'reasoning_effort_key',
    'thinking_effort_key',
    'reasoning_effort_param',
    'thinking_effort_param',
  ]);
  const supportsReasoningEffort = Object.hasOwn(item, 'supports_reasoning_effort')
    ? Boolean(item['supports_reasoning_effort'])
    : reasoningEffortKey !== undefined;
  return {
    id: item['id'],
    contextLength,
    supportsReasoning: Object.hasOwn(item, 'supports_reasoning')
      ? Boolean(item['supports_reasoning'])
      : true,
    supportsReasoningEffort,
    reasoningEffortKey,
    supportsImageIn: Boolean(item['supports_image_in']),
    supportsVideoIn: Boolean(item['supports_video_in']),
    supportsToolUse,
    displayName: normalizedDisplayName,
  };
}

function firstNonEmptyString(
  source: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (normalized.length > 0) return normalized;
  }
  return undefined;
}

export async function fetchModels(
  baseUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ModelInfo[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`;
  const res = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    signal,
  });
  if (!res.ok) {
    throw new ProviderApiError(
      await readApiErrorMessage(res, `Failed to list models (HTTP ${res.status}).`),
      res.status,
    );
  }
  const payload: unknown = await res.json();
  if (!isRecord(payload) || !Array.isArray(payload['data'])) {
    throw new Error(`Unexpected models response for ${baseUrl}.`);
  }
  return payload['data']
    .map((item) => toModelInfo(item))
    .filter((item): item is ModelInfo => item !== undefined);
}

// ---------------------------------------------------------------------------
// Model filtering
// ---------------------------------------------------------------------------

export function filterModelsByPrefix(
  models: ModelInfo[],
  prefixes?: readonly string[] | undefined,
): ModelInfo[] {
  if (!prefixes || prefixes.length === 0) {
    return models;
  }
  return models.filter((m) => prefixes.some((p) => m.id.startsWith(p)));
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export function capabilitiesForModel(model: ModelInfo): string[] | undefined {
  const caps = new Set<string>();
  if (model.supportsReasoning) caps.add('thinking');
  if (model.supportsReasoningEffort === true) caps.add('thinking_effort');
  if (model.supportsImageIn) caps.add('image_in');
  if (model.supportsVideoIn) caps.add('video_in');
  if (model.supportsToolUse ?? true) caps.add('tool_use');
  return caps.size > 0 ? [...caps] : undefined;
}

// ---------------------------------------------------------------------------
// Config application
// ---------------------------------------------------------------------------

export interface ApplyProviderResult {
  readonly defaultModel: string;
  readonly defaultThinking: boolean;
}

export function applyProviderConfig(
  config: ConfigShape,
  options: {
    readonly name: string;
    readonly baseUrl: string;
    readonly apiKey: string;
    readonly models: readonly ModelInfo[];
    readonly selectedModel: ModelInfo;
    readonly thinking: boolean;
  },
): ApplyProviderResult {
  const providerKey = options.name;
  const modelKey = `${providerKey}/${options.selectedModel.id}`;

  config.providers[providerKey] = {
    type: 'openai-compat',
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    thinkingEffortKey: options.selectedModel.reasoningEffortKey,
  };

  const existingModels = config.models ?? {};
  for (const [key, model] of Object.entries(existingModels)) {
    if (isRecord(model) && model['provider'] === providerKey) {
      delete existingModels[key];
    }
  }

  for (const model of options.models) {
    const aliasKey = `${providerKey}/${model.id}`;
    existingModels[aliasKey] = {
      provider: providerKey,
      model: model.id,
      maxContextSize: model.contextLength,
      capabilities: capabilitiesForModel(model),
      displayName: model.displayName,
    };
  }

  config.models = existingModels;
  config.defaultModel = modelKey;
  config.defaultThinking = options.thinking;

  return { defaultModel: modelKey, defaultThinking: options.thinking };
}

// ---------------------------------------------------------------------------
// Config removal
// ---------------------------------------------------------------------------

export function removeProviderConfig(config: ConfigShape, providerName: string): void {
  delete config.providers[providerName];

  let removedDefault = false;
  const existingModels = config.models ?? {};
  for (const [key, model] of Object.entries(existingModels)) {
    if (!isRecord(model) || model['provider'] !== providerName) continue;
    delete existingModels[key];
    if (config.defaultModel === key) removedDefault = true;
  }
  config.models = existingModels;

  if (removedDefault) {
    config.defaultModel = undefined;
  }

  if (config['defaultProvider'] === providerName) {
    config['defaultProvider'] = undefined;
  }
}
