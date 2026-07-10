import type { Kaos } from '@byfriends/kaos';

import type { UrlFetcher, WebSearchProvider } from './tools/builtin';
import type { Environment } from './utils/environment';

export interface RuntimeConfig {
  readonly kaos: Kaos;
  readonly osEnv: Environment;
  readonly urlFetcher?: UrlFetcher;
  readonly webSearcher?: WebSearchProvider;
  /**
   * ProxiedFetch — a `typeof fetch` wrapper that retries through an
   * HTTP/SOCKS proxy when the direct attempt fails with a retryable error.
   * Used by MCP HTTP connections, URL fetcher, and web search.
   */
  readonly fetch?: typeof fetch;
}
