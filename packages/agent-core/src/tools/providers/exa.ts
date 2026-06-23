/**
 * ExaWebSearchProvider — web search via Exa (exa.ai) API.
 *
 * API docs: https://docs.exa.ai/reference/search
 *
 * Field mapping (PRD-0012):
 *   results[].{ title, url, text, publishedDate }
 *   → WebSearchResult { title, url, snippet=text[:300], content=text(full), date=publishedDate }
 *
 * Supports multiple apiKeys with sequential fallback within a single search() call
 * (stateless — each new call resets to the first key).
 */

import type { WebSearchProvider, WebSearchResult } from '../builtin/web/web-search';

export interface ExaWebSearchProviderOptions {
  apiKeys: string[];
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface ExaSearchContents {
  text?: { maxCharacters: number };
  highlights?: { query: string; maxCharacters: number };
}

interface ExaSearchResult {
  title?: string;
  url?: string;
  text?: string;
  publishedDate?: string;
  highlights?: string[];
  highlightScores?: number[];
}

interface ExaSearchResponse {
  results?: ExaSearchResult[];
}

export class ExaWebSearchProvider implements WebSearchProvider {
  private readonly apiKeys: string[];
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ExaWebSearchProviderOptions) {
    this.apiKeys = options.apiKeys;
    this.baseUrl = options.baseUrl ?? 'https://api.exa.ai/search';
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async search(
    query: string,
    options?: { limit?: number; includeContent?: boolean; toolCallId?: string },
  ): Promise<WebSearchResult[]> {
    const limit = options?.limit ?? 5;
    const includeContent = options?.includeContent ?? false;

    // Build the request body with conditional contents based on what we need.
    // includeContent=false → request highlights only (cheaper, query-relevant snippets)
    // includeContent=true  → request full text (for both snippet + content)
    const contents: ExaSearchContents = {};
    if (includeContent) {
      contents.text = { maxCharacters: 10000 };
    } else {
      contents.highlights = { query, maxCharacters: 300 };
    }
    const body = JSON.stringify({ query, numResults: limit, contents });
    let lastError: Error | undefined;

    for (const apiKey of this.apiKeys) {
      try {
        const response = await this.fetchImpl(this.baseUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
        });

        if (!response.ok) {
          const detail = (await response.text().catch(() => '')).slice(0, 200);
          throw new Error(
            `Exa search failed: HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
          );
        }

        const json = (await response.json()) as ExaSearchResponse;
        const raw = Array.isArray(json.results) ? json.results : [];

        return raw.map((r): WebSearchResult => {
          const out: WebSearchResult = {
            title: r.title ?? '',
            url: r.url ?? '',
            snippet: '',
          };

          if (includeContent && typeof r.text === 'string') {
            // Full text requested — snippet from truncated text, content from full text
            out.snippet = r.text.slice(0, 300);
            if (r.text.length > 0) out.content = r.text;
          } else if (Array.isArray(r.highlights) && r.highlights.length > 0) {
            // Highlights requested — snippet from first highlight
            out.snippet = r.highlights[0]!.slice(0, 300);
          }
          // else: no content available → snippet stays ''

          if (typeof r.publishedDate === 'string' && r.publishedDate.length > 0) {
            out.date = r.publishedDate;
          }
          return out;
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError ?? new Error('Exa search failed: no API keys configured');
  }
}
