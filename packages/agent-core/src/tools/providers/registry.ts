/**
 * webSearchProviderRegistry — single source of truth for web search provider types.
 *
 * Each entry maps a provider type (TOML `type` enum) to its default base URL.
 * The Zod `type` enum is derived from this registry's keys.
 * Provider implementation classes are registered via `registerProvider()`.
 */

import type { WebSearchProvider } from '../builtin/web/web-search';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProviderConstructor = new (...args: any[]) => WebSearchProvider;

const providerClassMap = new Map<ProviderType, ProviderConstructor>();

export function registerProvider(type: ProviderType, cls: ProviderConstructor): void {
  providerClassMap.set(type, cls);
}

export function createProvider(
  type: ProviderType,
  options: Record<string, unknown>,
): WebSearchProvider {
  const cls = providerClassMap.get(type);
  if (cls === undefined) {
    throw new Error(
      `WebSearch provider type "${type}" is not registered. Did you import the provider module?`,
    );
  }
  return new cls(options);
}
