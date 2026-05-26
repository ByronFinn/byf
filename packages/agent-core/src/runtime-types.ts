import type { Kaos } from '@moonshot-ai/kaos';

import type { UrlFetcher, WebSearchProvider } from './tools/builtin';
import type { Environment } from './utils/environment';

export interface RuntimeConfig {
  readonly kaos: Kaos;
  readonly osEnv: Environment;
  readonly urlFetcher?: UrlFetcher | undefined;
  readonly webSearcher?: WebSearchProvider | undefined;
}
