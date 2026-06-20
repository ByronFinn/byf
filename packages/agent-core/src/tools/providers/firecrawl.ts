/**
 * FirecrawlWebSearchProvider — web search via Firecrawl v2 Search API.
 *
 * API docs: https://docs.firecrawl.dev/api-reference/endpoint/search
 *
 * Field mapping (PRD-0012):
 *   data.web[].{ title, url, description, markdown }
 *   → WebSearchResult { title, url, snippet=description, content=markdown }
 *
 * When includeContent is true, the request includes scrapeOptions.formats: ["markdown"]
 * so the API returns full page markdown content.
 *
 * Supports multiple apiKeys with sequential fallback within a single search() call
 * (stateless — each new call resets to the first key).
 */

import type { WebSearchProvider, WebSearchResult } from '../builtin/web/web-search';
import { registerProvider } from './registry';

export interface FirecrawlWebSearchProviderOptions {
  apiKeys: string[];
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface FirecrawlWebResult {
  title?: string;
  url?: string;
  description?: string;
  markdown?: string | null;
}

interface FirecrawlSearchResponse {
  data?: { web?: FirecrawlWebResult[] };
}

export class FirecrawlWebSearchProvider implements WebSearchProvider {
  private readonly apiKeys: string[];
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: FirecrawlWebSearchProviderOptions) {
    this.apiKeys = options.apiKeys;
    this.baseUrl = options.baseUrl ?? 'https://api.firecrawl.dev/v2/search';
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async search(
    query: string,
    options?: { limit?: number; includeContent?: boolean; toolCallId?: string },
  ): Promise<WebSearchResult[]> {
    const limit = options?.limit ?? 5;
    const includeContent = options?.includeContent ?? false;

    // Build request body — include scrapeOptions only when full content is needed.
    // Without scrapeOptions, the API returns only title, url, description.
    // With scrapeOptions.formats: ["markdown"], each result gets a markdown field.
    const requestBody: Record<string, unknown> = { query, limit };
    if (includeContent) {
      requestBody.scrapeOptions = { formats: ['markdown'] };
    }
    const body = JSON.stringify(requestBody);
    let lastError: Error | undefined;

    for (const apiKey of this.apiKeys) {
      try {
        const response = await this.fetchImpl(this.baseUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
        });

        if (!response.ok) {
          const detail = (await response.text().catch(() => '')).slice(0, 200);
          throw new Error(
            `Firecrawl search failed: HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
          );
        }

        const json = (await response.json()) as FirecrawlSearchResponse;
        const raw = Array.isArray(json.data?.web) ? json.data.web : [];

        return raw.map((r): WebSearchResult => {
          const out: WebSearchResult = {
            title: r.title ?? '',
            url: r.url ?? '',
            snippet: r.description ?? '',
          };
          if (includeContent && typeof r.markdown === 'string' && r.markdown.length > 0) {
            out.content = r.markdown;
          }
          return out;
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError ?? new Error('Firecrawl search failed: no API keys configured');
  }
}

// Self-registration
registerProvider('firecrawl', FirecrawlWebSearchProvider);
