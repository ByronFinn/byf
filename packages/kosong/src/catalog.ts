import type { ModelCapability } from './capability';
import type { ProviderType } from './providers';
import { resolveCapabilityFromRegistry } from './providers/capability-registry';

/**
 * models.dev 风格目录:provider / 模型元数据的公共映射。调用方消费此形态
 * 的快照来填充 provider + 模型配置,而无需手写上下文窗口或能力。
 */
export interface CatalogModelEntry {
  readonly id?: string;
  readonly name?: string;
  readonly family?: string;
  readonly limit?: { readonly context?: number; readonly output?: number };
  readonly tool_call?: boolean;
  readonly reasoning?: boolean;
  readonly interleaved?: boolean | { readonly field?: string };
  readonly modalities?: {
    readonly input?: readonly string[];
    readonly output?: readonly string[];
  };
}

export interface CatalogProviderEntry {
  readonly id?: string;
  readonly name?: string;
  /** provider 的 base URL;可能为空(部分 SDK 硬编码它)。 */
  readonly api?: string;
  /** 携带凭据的环境变量名——作为提示呈现给调用方。 */
  readonly env?: readonly string[];
  /** models.dev SDK package id; used to infer the wire type when `type` is absent. */
  readonly npm?: string;
  /** Explicit wire type extension; inferred from `npm`/`id` when absent. */
  readonly type?: string;
  readonly models?: Record<string, CatalogModelEntry>;
}

/** 顶层目录:`{ [providerId]: ProviderEntry }`(如 models.dev/api.json)。 */
export type Catalog = Record<string, CatalogProviderEntry>;

/** 归一化目录模型:身份加其 {@link ModelCapability}。 */
export interface CatalogModel {
  readonly id: string;
  readonly name?: string;
  readonly maxOutputSize?: number;
  readonly reasoningKey?: string;
  readonly capability: ModelCapability;
}

const KNOWN_WIRE_TYPES = [
  'anthropic',
  'openai-completions',
  'google-genai',
  'openai_responses',
  'vertexai',
] as const satisfies readonly ProviderType[];

function isWireType(value: unknown): value is ProviderType {
  return typeof value === 'string' && (KNOWN_WIRE_TYPES as readonly string[]).includes(value);
}

function hasEmbeddingMarker(value: string | undefined): boolean {
  if (value === undefined) return false;
  const lower = value.toLowerCase();
  return lower.includes('embedding') || /(?:^|[-_/])embed(?:$|[-_/])/.test(lower);
}

function isUsableChatModel(model: CatalogModelEntry): boolean {
  const outputModalities = model.modalities?.output;
  if (outputModalities !== undefined && !outputModalities.includes('text')) return false;
  return (
    !hasEmbeddingMarker(model.family) &&
    !hasEmbeddingMarker(model.id) &&
    !hasEmbeddingMarker(model.name)
  );
}

/**
 * 把目录 provider 条目解析为受支持的 wire type。尊重显式 `type`,
 * 否则从 `npm`/`id` 推断。未知 provider 返回 `undefined`,
 * 使调用方可省略它们,而非写入无效配置。
 */
export function inferWireType(entry: CatalogProviderEntry): ProviderType | undefined {
  if (isWireType(entry.type)) return entry.type;
  const npm = (entry.npm ?? '').toLowerCase();
  const id = (entry.id ?? '').toLowerCase();
  if (npm.includes('anthropic') || id.includes('anthropic') || id.includes('claude')) {
    return 'anthropic';
  }
  if (id.includes('vertex')) return 'vertexai';
  if (npm.includes('google') || id.includes('google') || id.includes('gemini')) {
    return 'google-genai';
  }
  if (npm.includes('openai') || id.includes('openai')) return 'openai-completions';
  return undefined;
}

/**
 * 解析要存储的目录 provider base URL,把目录的 `api` 适配到 wire 的 SDK
 * 约定。
 *
 * models.dev 的 `api` URL 是为 `npm` 中命名的 SDK(如 `@ai-sdk/anthropic`)
 * 编写的,其 base 已含 `/v1` 版本段。我们把 `anthropic` wire 路由到官方
 * `@anthropic-ai/sdk`——它自身会追加 `/v1/messages`,因此以 `/v1` 结尾的
 * 目录 `api` 会 POST 到 `/v1/v1/messages`(404)。对 anthropic 剥离尾部
 * `/v1`。OpenAI 家族 SDK 向 `/v1` base 追加 `/chat/completions`,
 * 因此那些原样透传。
 */
export function catalogBaseUrl(
  entry: CatalogProviderEntry,
  wire: ProviderType,
): string | undefined {
  const api = entry.api;
  if (typeof api !== 'string' || api.length === 0) return undefined;
  if (wire === 'anthropic') return api.replace(/\/v1\/?$/, '');
  return api;
}

/** 把一条目录模型条目归一化为 {@link CatalogModel};跳过无效条目。 */
export function catalogModelToCapability(model: CatalogModelEntry): CatalogModel | undefined {
  if (typeof model.id !== 'string' || model.id.length === 0) return undefined;
  const context = model.limit?.context;
  if (typeof context !== 'number' || !Number.isInteger(context) || context <= 0) return undefined;
  if (!isUsableChatModel(model)) return undefined;
  const inputs = model.modalities?.input ?? [];
  const output = model.limit?.output;
  const base: ModelCapability = {
    image_in: inputs.includes('image'),
    video_in: inputs.includes('video'),
    audio_in: inputs.includes('audio'),
    thinking: Boolean(model.reasoning),
    tool_use: model.tool_call ?? true,
    thinking_effort: false,
    thinking_xhigh: false,
    thinking_max: false,
    max_context_tokens: context,
  };
  const registry = resolveCapabilityFromRegistry(model.id);
  const capability =
    registry !== undefined ? { ...base, ...registry, max_context_tokens: context } : base;
  return {
    id: model.id,
    name: typeof model.name === 'string' && model.name.length > 0 ? model.name : undefined,
    maxOutputSize: typeof output === 'number' && output > 0 ? output : undefined,
    reasoningKey: catalogReasoningKey(model.interleaved),
    capability,
  };
}

function catalogReasoningKey(interleaved: CatalogModelEntry['interleaved']): string | undefined {
  // models.dev allows `interleaved: true` as "general support" — read it as
  // the default `reasoning_content` field so providers without an explicit
  // field name (e.g. some openai-compatible gateways) still round-trip.
  if (interleaved === true) return 'reasoning_content';
  if (typeof interleaved !== 'object' || interleaved === null) return undefined;
  const field = interleaved.field?.trim();
  return field !== undefined && field.length > 0 ? field : undefined;
}

/** 从目录 provider 条目提取有效、归一化的模型。 */
export function catalogProviderModels(entry: CatalogProviderEntry): CatalogModel[] {
  const models = entry.models ?? {};
  return Object.values(models)
    .map((model) => catalogModelToCapability(model))
    .filter((model): model is CatalogModel => model !== undefined);
}
