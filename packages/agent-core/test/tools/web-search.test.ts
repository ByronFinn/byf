/**
 * Covers: WebSearchTool, PriorityRouter, and provider implementations.
 *
 * Uses a fake WebSearchProvider to test tool behaviour in isolation.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  WebSearchInputSchema,
  WebSearchTool,
  type WebSearchProvider,
} from '../../src/tools/builtin/web/web-search';
import {
  webSearchProviderRegistry,
  registerProvider,
  createProvider,
  type ProviderType,
} from '../../src/tools/providers/registry';
import { PriorityRouter, AllProvidersFailedError } from '../../src/tools/providers/router';
import { toolContentString } from './fixtures/fake-kaos';
import { executeTool } from './fixtures/execute-tool';

const signal = new AbortController().signal;

function fakeProvider(
  results: Awaited<ReturnType<WebSearchProvider['search']>> = [],
): WebSearchProvider {
  return { search: vi.fn().mockResolvedValue(results) };
}

describe('WebSearchTool', () => {
  it('has name "WebSearch" and a non-empty description', () => {
    const tool = new WebSearchTool(fakeProvider());
    expect(tool.name).toBe('WebSearch');
    expect(tool.description.length).toBeGreaterThan(0);
  });

  it('parameters are generated from the current input schema', () => {
    const tool = new WebSearchTool(fakeProvider());
    expect(WebSearchInputSchema.safeParse({ query: 'test' }).success).toBe(true);
    expect(tool.parameters).toMatchObject({
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
    });
  });

  it('limit description guides toward refining the query instead of raising limit', () => {
    const tool = new WebSearchTool(fakeProvider());
    const limit = (tool.parameters as { properties: Record<string, { description?: string }> })
      .properties['limit'];
    expect(limit?.description).toContain('Typically you do not need to set this value');
    expect(limit?.description).toContain('more concrete query');
  });

  it('include_content description warns about token cost at large limits', () => {
    const tool = new WebSearchTool(fakeProvider());
    const includeContent = (
      tool.parameters as { properties: Record<string, { description?: string }> }
    ).properties['include_content'];
    expect(includeContent?.description).toContain('consume a large amount of tokens');
    expect(includeContent?.description).toContain('avoid enabling this when `limit` is set');
    // Use the TS/JSON boolean literal, not Python's capitalized `True`.
    expect(includeContent?.description).toContain('set to true');
    expect(includeContent?.description).not.toContain('True');
  });

  it('returns formatted results from provider', async () => {
    const provider = fakeProvider([
      { title: 'Result 1', url: 'https://example.com/1', snippet: 'Snippet 1' },
      { title: 'Result 2', url: 'https://example.com/2', snippet: 'Snippet 2', date: '2024-01-01' },
    ]);
    const tool = new WebSearchTool(provider);
    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c1',
      args: { query: 'test query' },
      signal,
    });
    expect(result.isError).toBe(false);
    const content = toolContentString(result);
    expect(content).toContain('Result 1');
    expect(content).toContain('https://example.com/1');
    expect(content).toContain('Result 2');
    expect(content).toContain('2024-01-01');
  });

  it('renders the snippet under a "Snippet:" label consistent with the schema term', async () => {
    const provider = fakeProvider([
      { title: 'Result 1', url: 'https://example.com/1', snippet: 'Snippet 1' },
    ]);
    const tool = new WebSearchTool(provider);
    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c-snippet',
      args: { query: 'test query' },
      signal,
    });
    const content = toolContentString(result);
    expect(content).toContain('Snippet: Snippet 1');
    expect(content).not.toContain('Summary:');
  });

  it('describes every returned field (date and content) in the tool description', () => {
    const tool = new WebSearchTool(fakeProvider());
    const description = tool.description.toLowerCase();
    expect(description).toContain('title');
    expect(description).toContain('url');
    expect(description).toContain('snippet');
    expect(description).toContain('date');
    expect(description).toContain('content');
  });

  it('does not promise page content unconditionally for every result', () => {
    // Page content is rendered only when the provider returns it (`include_content`
    // is merely forwarded to the provider). The description must not claim it is
    // appended for every result, or it repeats the overpromise this PR fixes.
    const tool = new WebSearchTool(fakeProvider());
    const description = tool.description.toLowerCase();
    expect(description).not.toContain('for each result');
  });

  it('returns no results message when provider returns empty', async () => {
    const tool = new WebSearchTool(fakeProvider([]));
    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c2',
      args: { query: 'nothing' },
      signal,
    });
    expect(result.isError).toBe(false);
    expect(toolContentString(result)).toContain('No search results found');
  });

  it('truncates oversized result content through the shared builder', async () => {
    const tool = new WebSearchTool(
      fakeProvider([
        {
          title: 'Large result',
          url: 'https://example.com/large',
          snippet: 'Large snippet',
          content: 'x'.repeat(60_000),
        },
      ]),
    );

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c-large',
      args: { query: 'large', include_content: true },
      signal,
    });

    const content = toolContentString(result);
    expect(result.isError).toBe(false);
    expect(content).toContain('[...truncated]');
    expect(content).toContain('Output is truncated');
    expect(content.length).toBeLessThan(60_000);
    expect((result as { message?: string }).message).toContain('Output is truncated');
  });

  it('returns error when provider throws', async () => {
    const provider: WebSearchProvider = {
      search: vi.fn().mockRejectedValue(new Error('network error')),
    };
    const tool = new WebSearchTool(provider);
    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c3',
      args: { query: 'fail' },
      signal,
    });
    expect(result.isError).toBe(true);
    expect(toolContentString(result)).toContain('network error');
  });

  it('classifies authentication failures', async () => {
    const provider: WebSearchProvider = {
      search: vi
        .fn()
        .mockRejectedValue(
          new Error('Byf search request failed: HTTP 401 (auth/unauthorized).'),
        ),
    };
    const tool = new WebSearchTool(provider);
    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c-auth',
      args: { query: 'fail' },
      signal,
    });
    expect(result.isError).toBe(true);
    const content = toolContentString(result);
    // Assert the classification prefix, not text that already appears in the raw error.
    expect(content).toContain('Search failed (authentication):');
    // The original error text is preserved alongside the prefix.
    expect(content).toContain('HTTP 401');
  });

  it('classifies timeout failures', async () => {
    const err = new Error('request timed out');
    err.name = 'TimeoutError';
    const provider: WebSearchProvider = { search: vi.fn().mockRejectedValue(err) };
    const tool = new WebSearchTool(provider);
    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c-timeout',
      args: { query: 'fail' },
      signal,
    });
    expect(result.isError).toBe(true);
    const content = toolContentString(result);
    // Assert the classification prefix, which does not overlap with the raw error text.
    expect(content).toContain('Search timed out:');
    // The original error text is preserved alongside the prefix.
    expect(content).toContain('request timed out');
  });

  it('classifies aborted requests', async () => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    const provider: WebSearchProvider = { search: vi.fn().mockRejectedValue(err) };
    const tool = new WebSearchTool(provider);
    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c-abort',
      args: { query: 'fail' },
      signal,
    });
    expect(result.isError).toBe(true);
    const content = toolContentString(result);
    // Assert the classification prefix, not text that already appears in the raw error.
    expect(content).toContain('Search cancelled:');
    // The original error text is preserved alongside the prefix.
    expect(content).toContain('The operation was aborted');
  });

  it('passes limit and includeContent to provider', async () => {
    const provider = fakeProvider([]);
    const tool = new WebSearchTool(provider);
    await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c4',
      args: { query: 'test', limit: 10, include_content: true },
      signal,
    });
    expect(provider.search).toHaveBeenCalledWith('test', {
      limit: 10,
      includeContent: true,
      toolCallId: 'c4',
    });
  });

  it('resolveExecution description truncates long queries', () => {
    const tool = new WebSearchTool(fakeProvider());
    const execution = tool.resolveExecution({ query: 'a'.repeat(60) });
    expect(execution.isError).toBeFalsy();
    if (execution.isError === true) throw new Error('expected runnable execution');
    const desc = execution.description;
    const text = desc ?? '';
    expect(text.length).toBeLessThanOrEqual(55);
    expect(text).toContain('…');
  });

  it('description names internet search as the tool surface', () => {
    const tool = new WebSearchTool(fakeProvider());
    expect(tool.description.toLowerCase()).toMatch(/internet|search the web/);
    expect(tool.description.toLowerCase()).toContain('search');
  });
});

// ── webSearchProviderRegistry ─────────────────────────────────────────

describe('webSearchProviderRegistry', () => {
  it('has entries for exa, brave, and firecrawl', () => {
    expect(webSearchProviderRegistry).toHaveProperty('exa');
    expect(webSearchProviderRegistry).toHaveProperty('brave');
    expect(webSearchProviderRegistry).toHaveProperty('firecrawl');
  });

  it('each entry has a defaultBaseUrl', () => {
    for (const [type, entry] of Object.entries(webSearchProviderRegistry)) {
      expect(typeof entry.defaultBaseUrl).toBe('string');
      expect(entry.defaultBaseUrl).toMatch(/^https?:\/\//);
    }
  });

  it('ProviderType is derived from registry keys', () => {
    const types: ProviderType[] = ['exa', 'brave', 'firecrawl'];
    for (const t of types) {
      expect(webSearchProviderRegistry).toHaveProperty(t);
    }
  });

  it('does not contain unexpected provider types', () => {
    const keys = Object.keys(webSearchProviderRegistry);
    expect(keys).toEqual(['exa', 'brave', 'firecrawl']);
    const allowed: readonly string[] = keys;
    for (const key of keys) {
      expect(allowed).toContain(key);
    }
  });

  it('createProvider creates an instance of the registered class', () => {
    class MockExaProvider implements WebSearchProvider {
      search = vi.fn().mockResolvedValue([]);
    }
    registerProvider('exa', MockExaProvider);

    const instance = createProvider('exa', {}) as MockExaProvider;
    expect(instance).toBeInstanceOf(MockExaProvider);
  });
});

// ── PriorityRouter ────────────────────────────────────────────────────

describe('PriorityRouter', () => {
  it('returns results from the first provider when it succeeds', async () => {
    const p1: WebSearchProvider = {
      search: vi.fn().mockResolvedValue([{ title: 'From P1', url: 'https://p1', snippet: 'p1' }]),
    };
    const p2: WebSearchProvider = {
      search: vi.fn().mockResolvedValue([{ title: 'From P2', url: 'https://p2', snippet: 'p2' }]),
    };
    const router = new PriorityRouter([p1, p2]);
    const results = await router.search('test');
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe('From P1');
    expect(p2.search).not.toHaveBeenCalled();
  });

  it('falls back to next provider when the first throws', async () => {
    const p1: WebSearchProvider = {
      search: vi.fn().mockRejectedValue(new Error('Exa search failed: HTTP 503')),
    };
    const p2: WebSearchProvider = {
      search: vi.fn().mockResolvedValue([{ title: 'Fallback', url: 'https://fb', snippet: 'ok' }]),
    };
    const router = new PriorityRouter([p1, p2]);
    const results = await router.search('test');
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe('Fallback');
    expect(p1.search).toHaveBeenCalledTimes(1);
    expect(p2.search).toHaveBeenCalledTimes(1);
  });

  it('does NOT fall back on empty results (no throw)', async () => {
    const p1: WebSearchProvider = {
      search: vi.fn().mockResolvedValue([]),
    };
    const p2: WebSearchProvider = {
      search: vi.fn().mockResolvedValue([{ title: 'ShouldNotReach', url: 'https://x', snippet: 'x' }]),
    };
    const router = new PriorityRouter([p1, p2]);
    const results = await router.search('nothing');
    expect(results).toEqual([]);
    expect(p2.search).not.toHaveBeenCalled();
  });

  it('throws AllProvidersFailedError when all providers fail', async () => {
    const p1: WebSearchProvider = {
      search: vi.fn().mockRejectedValue(new Error('Provider 1 failed')),
    };
    const p2: WebSearchProvider = {
      search: vi.fn().mockRejectedValue(new Error('Provider 2 failed')),
    };
    const router = new PriorityRouter([p1, p2]);
    await expect(router.search('test')).rejects.toThrow(AllProvidersFailedError);
    await expect(router.search('test')).rejects.toThrow(/All search providers failed/);
  });

  it('preserves last error in AllProvidersFailedError', async () => {
    const p1: WebSearchProvider = {
      search: vi.fn().mockRejectedValue(new Error('Exa search failed: HTTP 503')),
    };
    const p2: WebSearchProvider = {
      search: vi.fn().mockRejectedValue(new Error('Brave search failed: HTTP 429')),
    };
    const router = new PriorityRouter([p1, p2]);
    try {
      await router.search('test');
      throw new Error('expected exception');
    } catch (err) {
      expect(err).toBeInstanceOf(AllProvidersFailedError);
      expect((err as AllProvidersFailedError).lastError).toContain('Brave search failed');
    }
  });

  it('tries providers in ascending priority order', async () => {
    const p10: WebSearchProvider = {
      search: vi.fn().mockRejectedValue(new Error('P10 fail')),
    };
    const p5: WebSearchProvider = {
      search: vi.fn().mockResolvedValue([{ title: 'P5 wins', url: 'https://p5', snippet: 'low priority' }]),
    };
    // PriorityRouter uses the order of the array it receives. The caller sorts by priority.
    const router = new PriorityRouter([p5, p10]);
    const results = await router.search('test');
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe('P5 wins');
  });
});

// ── ExaWebSearchProvider ─────────────────────────────────────────────

import { ExaWebSearchProvider } from '../../src/tools/providers/exa';

function exaFetchOk(results: unknown[]): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ results }), { status: 200 }),
  );
}

describe('ExaWebSearchProvider', () => {
  it('sends POST with query, numResults, and contents.highlights by default', async () => {
    const fetchImpl = exaFetchOk([]);
    const provider = new ExaWebSearchProvider({
      apiKeys: ['test-key'],
      fetchImpl,
    });
    await provider.search('hello', { limit: 3 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.exa.ai/search');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      query: 'hello',
      numResults: 3,
      contents: { highlights: { query: 'hello', maxCharacters: 300 } },
    });
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-key');
  });

  it('sends POST with contents.text when includeContent=true', async () => {
    const fetchImpl = exaFetchOk([]);
    const provider = new ExaWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    await provider.search('hello', { includeContent: true });
    const body = JSON.parse((fetchImpl.mock.calls[0] as [string, RequestInit])[1]!.body as string);
    expect(body.contents).toEqual({ text: { maxCharacters: 10000 } });
  });

  it('maps response fields with includeContent=true (text → snippet + content)', async () => {
    const fetchImpl = exaFetchOk([
      {
        title: 'Exa Result',
        url: 'https://exa.example/page',
        text: 'Full content text for checking snippet and content mapping',
        publishedDate: '2025-03-15',
      },
    ]);
    const provider = new ExaWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    const results = await provider.search('test', { includeContent: true });
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe('Exa Result');
    expect(results[0]!.url).toBe('https://exa.example/page');
    expect(results[0]!.snippet).toBe('Full content text for checking snippet and content mapping');
    expect(results[0]!.content).toBe('Full content text for checking snippet and content mapping');
    expect(results[0]!.date).toBe('2025-03-15');
  });

  it('maps highlights[0] to snippet when includeContent=false', async () => {
    const fetchImpl = exaFetchOk([
      {
        title: 'Exa Result',
        url: 'https://exa.example/page',
        highlights: ['Highlighted relevant snippet'],
        publishedDate: '2025-03-15',
      },
    ]);
    const provider = new ExaWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    const results = await provider.search('test', { includeContent: false });
    expect(results).toHaveLength(1);
    expect(results[0]!.snippet).toBe('Highlighted relevant snippet');
    expect(results[0]!.content).toBeUndefined();
    expect(results[0]!.date).toBe('2025-03-15');
  });

  it('snippet from highlights is truncated to 300 chars', async () => {
    const longHighlight = 'x'.repeat(500);
    const fetchImpl = exaFetchOk([
      { title: 'Long', url: 'https://exa.example/long', highlights: [longHighlight] },
    ]);
    const provider = new ExaWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    const results = await provider.search('test');
    expect(results).toHaveLength(1);
    expect(results[0]!.snippet!.length).toBe(300);
  });

  it('snippet from text is truncated to 300 chars when includeContent=true', async () => {
    const longText = 'x'.repeat(500);
    const fetchImpl = exaFetchOk([
      { title: 'Long', url: 'https://exa.example/long', text: longText },
    ]);
    const provider = new ExaWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    const results = await provider.search('test', { includeContent: true });
    expect(results).toHaveLength(1);
    expect(results[0]!.snippet!.length).toBe(300);
    expect(results[0]!.content!.length).toBe(500);
  });

  it('snippet is empty string when highlights array is empty', async () => {
    const fetchImpl = exaFetchOk([
      { title: 'Empty', url: 'https://exa.example/empty', highlights: [] },
    ]);
    const provider = new ExaWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    const results = await provider.search('test');
    expect(results[0]!.snippet).toBe('');
  });

  it('snippet is empty string when highlights is undefined', async () => {
    const fetchImpl = exaFetchOk([
      { title: 'No Highlights', url: 'https://exa.example/no' },
    ]);
    const provider = new ExaWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    const results = await provider.search('test');
    expect(results[0]!.snippet).toBe('');
  });

  it('throws errors with convention: "Exa search failed: HTTP {status}"', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('rate limited', { status: 429 }));
    const provider = new ExaWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    await expect(provider.search('test')).rejects.toThrow('Exa search failed: HTTP 429');
  });

  it('throws on network errors', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const provider = new ExaWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    await expect(provider.search('test')).rejects.toThrow('fetch failed');
  });
});

// ── BraveWebSearchProvider ────────────────────────────────────────────

import { BraveWebSearchProvider } from '../../src/tools/providers/brave';

function braveFetchOk(results: unknown[]): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ web: { results } }), { status: 200 }),
  );
}

describe('BraveWebSearchProvider', () => {
  it('sends GET request with q and count parameters', async () => {
    const fetchImpl = braveFetchOk([]);
    const provider = new BraveWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    await provider.search('hello', { limit: 3 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.hostname).toContain('brave.com');
    expect(parsed.searchParams.get('q')).toBe('hello');
    expect(parsed.searchParams.get('count')).toBe('3');
  });

  it('maps response fields (snippet=description, date=age)', async () => {
    const fetchImpl = braveFetchOk([
      { title: 'Brave Result', url: 'https://brave.example/page', description: 'A description', age: '2025-03-15' },
    ]);
    const provider = new BraveWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    const results = await provider.search('test');
    expect(results[0]!.title).toBe('Brave Result');
    expect(results[0]!.snippet).toBe('A description');
    expect(results[0]!.date).toBe('2025-03-15');
  });

  it('content is always undefined (Brave does not return full text)', async () => {
    const fetchImpl = braveFetchOk([
      { title: 'No Content', url: 'https://brave.example/page', description: 'snippet' },
    ]);
    const provider = new BraveWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    const results = await provider.search('test', { includeContent: true });
    expect(results[0]!.content).toBeUndefined();
  });

  it('throws errors with convention: "Brave search failed: HTTP {status}"', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('rate limited', { status: 429 }));
    const provider = new BraveWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    await expect(provider.search('test')).rejects.toThrow('Brave search failed: HTTP 429');
  });
});

// ── FirecrawlWebSearchProvider ────────────────────────────────────────

import { FirecrawlWebSearchProvider } from '../../src/tools/providers/firecrawl';

function firecrawlFetchOk(results: unknown[]): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ data: { web: results } }), { status: 200 }),
  );
}

describe('FirecrawlWebSearchProvider', () => {
  it('sends POST request with query and limit (no scrapeOptions by default)', async () => {
    const fetchImpl = firecrawlFetchOk([]);
    const provider = new FirecrawlWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    await provider.search('hello', { limit: 3 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('firecrawl.dev');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ query: 'hello', limit: 3 });
    expect(body).not.toHaveProperty('scrapeOptions');
  });

  it('includes scrapeOptions.formats when includeContent is true', async () => {
    const fetchImpl = firecrawlFetchOk([]);
    const provider = new FirecrawlWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    await provider.search('hello', { limit: 3, includeContent: true });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      query: 'hello',
      limit: 3,
      scrapeOptions: { formats: ['markdown'] },
    });
  });

  it('maps response fields (snippet=description, no date, no content by default)', async () => {
    const fetchImpl = firecrawlFetchOk([
      { title: 'FC Result', url: 'https://fc.example/page', description: 'FC snippet' },
    ]);
    const provider = new FirecrawlWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    const results = await provider.search('test');
    expect(results[0]!.title).toBe('FC Result');
    expect(results[0]!.snippet).toBe('FC snippet');
    expect(results[0]!.date).toBeUndefined();
    expect(results[0]!.content).toBeUndefined();
  });

  it('maps markdown to content when includeContent is true', async () => {
    const fetchImpl = firecrawlFetchOk([
      {
        title: 'FC Content',
        url: 'https://fc.example/page',
        description: 'FC snippet',
        markdown: '# Full\n\nMarkdown content',
      },
    ]);
    const provider = new FirecrawlWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    const results = await provider.search('test', { includeContent: true });
    expect(results[0]!.title).toBe('FC Content');
    expect(results[0]!.snippet).toBe('FC snippet');
    expect(results[0]!.content).toBe('# Full\n\nMarkdown content');
  });

  it('markdown null does not set content (even with includeContent=true)', async () => {
    const fetchImpl = firecrawlFetchOk([
      {
        title: 'FC NoMd',
        url: 'https://fc.example/page',
        description: 'snippet only',
        markdown: null,
      },
    ]);
    const provider = new FirecrawlWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    const results = await provider.search('test', { includeContent: true });
    expect(results[0]!.content).toBeUndefined();
    expect(results[0]!.snippet).toBe('snippet only');
  });

  it('markdown undefined does not set content (even with includeContent=true)', async () => {
    const fetchImpl = firecrawlFetchOk([
      {
        title: 'FC NoMd',
        url: 'https://fc.example/page',
        description: 'snippet only',
      },
    ]);
    const provider = new FirecrawlWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    const results = await provider.search('test', { includeContent: true });
    expect(results[0]!.content).toBeUndefined();
  });

  it('throws errors with convention: "Firecrawl search failed: HTTP {status}"', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('rate limited', { status: 429 }));
    const provider = new FirecrawlWebSearchProvider({ apiKeys: ['test-key'], fetchImpl });
    await expect(provider.search('test')).rejects.toThrow('Firecrawl search failed: HTTP 429');
  });
});
