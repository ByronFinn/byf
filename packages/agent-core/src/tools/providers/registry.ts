/**
 * webSearchProviderRegistry — single source of truth for web search provider types.
 *
 * Each entry maps a provider type (TOML `type` enum) to its default base URL.
 * The Zod `type` enum is derived from this registry's keys.
 * Provider implementation classes are registered via `registerBuiltinWebSearchProviders()`.
 */

import type { WebSearchProvider } from '../builtin/web/web-search';
import { BraveWebSearchProvider } from './brave';
import { ExaWebSearchProvider } from './exa';
import { FirecrawlWebSearchProvider } from './firecrawl';

/** Static entry for one search provider type. */
export interface WebSearchProviderRegistryEntry {
  readonly defaultBaseUrl: string;
}

export const webSearchProviderRegistry = {
  exa: { defaultBaseUrl: 'https://api.exa.ai/search' },
  brave: { defaultBaseUrl: 'https://api.search.brave.com/res/v1/web/search' },
  firecrawl: { defaultBaseUrl: 'https://api.firecrawl.dev/v2/search' },
} as const;

export type ProviderType = keyof typeof webSearchProviderRegistry;

/** The Zod `z.enum` literal inferred from registry keys. */
export const PROVIDER_TYPE_VALUES = Object.keys(webSearchProviderRegistry) as [
  ProviderType,
  ...ProviderType[],
];

// ── Runtime provider class registry ──────────────────────────────────

/**
 * Constructor options shared by every builtin web-search provider. Each
 * provider's own options interface is structurally identical to this, so the
 * concrete classes satisfy {@link ProviderConstructor} without `any`.
 */
export interface WebSearchProviderOptions {
  apiKeys: string[];
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

type ProviderConstructor = new (options: WebSearchProviderOptions) => WebSearchProvider;

const providerClassMap = new Map<ProviderType, ProviderConstructor>();

export function registerProvider(type: ProviderType, cls: ProviderConstructor): void {
  providerClassMap.set(type, cls);
}

export function createProvider(
  type: ProviderType,
  options: WebSearchProviderOptions,
): WebSearchProvider {
  const cls = providerClassMap.get(type);
  if (cls === undefined) {
    throw new Error(
      `WebSearch provider type "${type}" is not registered. Did you import the provider module?`,
    );
  }
  return new cls(options);
}

/**
 * Register all builtin web-search provider implementations.
 *
 * Called once at core startup (`core-impl.ts`) so that provider classes are
 * available through {@link createProvider}. Keeping this explicit (rather than
 * relying on import side effects in each provider module) makes registration
 * order-independent and isolates the provider modules from the registry's
 * runtime state.
 */
export function registerBuiltinWebSearchProviders(): void {
  registerProvider('exa', ExaWebSearchProvider);
  registerProvider('brave', BraveWebSearchProvider);
  registerProvider('firecrawl', FirecrawlWebSearchProvider);
}
