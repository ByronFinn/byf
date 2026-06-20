/**
 * PriorityRouter — tries search providers in priority order with automatic fallback.
 *
 * Any thrown error triggers fallback to the next provider. Empty results (`[]`)
 * do NOT trigger fallback — the provider returned a valid "nothing found" answer.
 */

import type { WebSearchProvider, WebSearchResult } from '../builtin/web/web-search';

export class AllProvidersFailedError extends Error {
  constructor(public readonly lastError: string | undefined) {
    super(`All search providers failed. Last error: ${lastError ?? 'unknown'}`);
    this.name = 'AllProvidersFailedError';
  }
}

export class PriorityRouter implements WebSearchProvider {
  constructor(private readonly providers: WebSearchProvider[]) {}

  async search(
    query: string,
    options?: {
      limit?: number;
      includeContent?: boolean;
      toolCallId?: string;
    },
  ): Promise<WebSearchResult[]> {
    let lastError: string | undefined;

    for (const provider of this.providers) {
      try {
        const results = await provider.search(query, options);
        // Empty results are a valid response — do NOT fall back
        return results;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        // Fall through to next provider
      }
    }

    throw new AllProvidersFailedError(lastError);
  }
}
