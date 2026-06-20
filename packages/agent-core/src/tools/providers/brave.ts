/**
 * BraveWebSearchProvider — web search via Brave Search API.
 *
 * API docs: https://api.search.brave.com/app/documentation/web-search
 *
 * Field mapping (PRD-0012):
 *   web.results[].{ title, url, description, age }
 *   → WebSearchResult { title, url, snippet=description, date=age, content=undefined }
 *
 * Supports multiple apiKeys with sequential fallback within a single search() call
 * (stateless — each new call resets to the first key).
 */

import type { WebSearchProvider, WebSearchResult } from '../builtin/web/web-search';
import { registerProvider } from './registry';

export interface BraveWebSearchProviderOptions {
  apiKeys: string[];
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
}

interface BraveSearchResponse {
  web?: { results?: BraveWebResult[] };
}

export class BraveWebSearchProvider implements WebSearchProvider {
  private readonly apiKeys: string[];
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: BraveWebSearchProviderOptions) {
    this.apiKeys = options.apiKeys;
    this.baseUrl = options.baseUrl ?? 'https://api.search.brave.com/res/v1/web/search';
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async search(
    query: string,
    options?: { limit?: number; includeContent?: boolean; toolCallId?: string },
  ): Promise<WebSearchResult[]> {
    const limit = options?.limit ?? 5;
    const url = new URL(this.baseUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(limit));
    let lastError: Error | undefined;

    for (const apiKey of this.apiKeys) {
      try {
        const response = await this.fetchImpl(url.toString(), {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': apiKey,
          },
        });

        if (!response.ok) {
          const detail = (await response.text().catch(() => '')).slice(0, 200);
          throw new Error(
            `Brave search failed: HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
          );
        }

        const json = (await response.json()) as BraveSearchResponse;
        const raw = Array.isArray(json.web?.results) ? json.web.results : [];

        return raw.map((r): WebSearchResult => {
          const out: WebSearchResult = {
            title: r.title ?? '',
            url: r.url ?? '',
            snippet: r.description ?? '',
          };
          if (typeof r.age === 'string' && r.age.length > 0) {
            out.date = r.age;
          }
          return out;
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError ?? new Error('Brave search failed: no API keys configured');
  }
}

// Self-registration
registerProvider('brave', BraveWebSearchProvider);
