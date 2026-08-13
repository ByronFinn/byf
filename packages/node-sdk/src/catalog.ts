import type { ByfConfig, ModelAlias } from '@byfriends/agent-core';
import {
  catalogBaseUrl,
  catalogProviderModels,
  inferWireType,
  type Catalog,
  type CatalogModel,
  type CatalogProviderEntry,
  type ModelCapability,
  type ProviderType,
} from '@byfriends/kosong';

export { catalogBaseUrl, catalogProviderModels, inferWireType };
export type { Catalog, CatalogModel, CatalogProviderEntry };

export const DEFAULT_CATALOG_URL = 'https://models.dev/api.json';

export class CatalogFetchError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** 获取 models.dev 风格目录。公开端点,无需凭据。 */
export async function fetchCatalog(
  url: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<Catalog> {
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal });
  if (!res.ok) {
    throw new CatalogFetchError(`Failed to fetch catalog (HTTP ${res.status}).`, res.status);
  }
  const payload: unknown = await res.json();
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error(`Unexpected catalog response from ${url}.`);
  }
  return payload as Catalog;
}

function capabilityToStrings(capability: ModelCapability): string[] | undefined {
  const caps: string[] = [];
  if (capability.image_in) caps.push('image_in');
  if (capability.video_in) caps.push('video_in');
  if (capability.audio_in) caps.push('audio_in');
  if (capability.thinking) caps.push('thinking');
  if (capability.thinking_effort) caps.push('thinking_effort');
  if (capability.thinking_xhigh) caps.push('thinking_xhigh');
  if (capability.thinking_max) caps.push('thinking_max');
  if (capability.tool_use) caps.push('tool_use');
  return caps.length > 0 ? caps : undefined;
}

/** 由归一化目录模型构建 byf 模型别名。 */
export function catalogModelToAlias(providerId: string, model: CatalogModel): ModelAlias {
  return {
    provider: providerId,
    model: model.id,
    maxContextSize: model.capability.max_context_tokens,
    maxOutputSize: model.maxOutputSize,
    capabilities: capabilityToStrings(model.capability),
    displayName: model.name,
    reasoningKey: model.reasoningKey,
  };
}

export interface ApplyCatalogProviderOptions {
  readonly providerId: string;
  readonly wire: ProviderType;
  readonly baseUrl?: string;
  readonly apiKey: string;
  readonly models: readonly CatalogModel[];
  readonly selectedModelId: string;
  readonly thinking: boolean;
}

/**
 * 解析可选的精简 models.dev 目录字符串——通常是构建时注入的
 * `__BYF_CODE_BUILT_IN_CATALOG__` 常量(`bun build` define)。
 * 参数缺失或无效时返回 `undefined`。
 */
export function loadBuiltInCatalog(text?: string): Catalog | undefined {
  if (typeof text !== 'string' || text.length === 0) return undefined;
  try {
    return JSON.parse(text) as Catalog;
  } catch {
    return undefined;
  }
}

/**
 * 把目录选定的 provider 及其模型别名写入 `config`,并标记为默认。
 * 模型元数据(上下文、输出上限、能力)来自目录,用户无需手写。
 * 返回默认模型键。
 *
 * 注意:下面的同 provider 清理只变更传入的 `config`。仅当调用方整体
 * 覆盖 config 时,磁盘上的过期别名才会被清除。经 `setConfig` 持久化的
 * 调用方——一种无法删除键的深合并补丁——必须先调用 `removeProvider`,
 * 否则被移除的别名会在合并后重现。
 */
export function applyCatalogProvider(
  config: ByfConfig,
  options: ApplyCatalogProviderOptions,
): { defaultModel: string } {
  config.providers[options.providerId] = {
    type: options.wire,
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
  };

  const models = config.models ?? {};
  for (const [key, alias] of Object.entries(models)) {
    if (alias.provider === options.providerId) delete models[key];
  }
  for (const model of options.models) {
    models[`${options.providerId}/${model.id}`] = catalogModelToAlias(options.providerId, model);
  }
  config.models = models;

  const defaultModel = `${options.providerId}/${options.selectedModelId}`;
  config.defaultModel = defaultModel;
  config.defaultThinking = options.thinking;
  return { defaultModel };
}

// ---------------------------------------------------------------------------
// Login-time catalog enrichment
// ---------------------------------------------------------------------------

/**
 * 测试 `candidate` 是否为 `modelId` 的前缀,其后紧跟字符串结尾或 `-`
 * 分隔符。这使 `gpt-5.5` 能匹配 `gpt-5.5-2025-06-01`,但不匹配
 * `gpt-5.5-turbo`(不同段)。
 */
export function catalogIdMatchesModelId(candidate: string, modelId: string): boolean {
  if (modelId === candidate) return true;
  if (modelId.startsWith(candidate) && modelId[candidate.length] === '-') return true;
  return false;
}

/**
 * 在目录的全部 provider 中搜索 ID 匹配 `modelId`(前缀 + 分隔符边界)
 * 的模型。返回首个匹配。
 */
export function findCatalogModel(catalog: Catalog, modelId: string): CatalogModel | undefined {
  for (const entry of Object.values(catalog)) {
    const models = catalogProviderModels(entry);
    for (const model of models) {
      if (catalogIdMatchesModelId(model.id, modelId)) return model;
    }
  }
  return undefined;
}

export interface EnrichedModelAlias {
  readonly maxContextSize: number;
  readonly maxOutputSize?: number;
  readonly capabilities?: string[];
  readonly displayName?: string;
  readonly reasoningKey?: string;
}

/**
 * 合并目录元数据(优先)与 provider 提供的值(回退)。
 * 目录提供:capabilities、maxContextSize、maxOutputSize、reasoningKey。
 * Provider 提供:displayName(用户选择了此 provider,保留其命名)。
 */
export function enrichWithCatalog(
  providerModel: {
    readonly id: string;
    readonly contextLength: number;
    readonly displayName?: string;
  },
  catalogModel: CatalogModel,
): EnrichedModelAlias {
  return {
    maxContextSize: catalogModel.capability.max_context_tokens || providerModel.contextLength,
    maxOutputSize: catalogModel.maxOutputSize,
    capabilities: capabilityToStrings(catalogModel.capability),
    displayName: providerModel.displayName,
    reasoningKey: catalogModel.reasoningKey,
  };
}
