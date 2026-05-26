import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  KIMI_CODE_PROVIDER_NAME,
  KimiOAuthToolkit,
  resolveKimiTokenStorageName,
  type TokenInfo,
  type TokenStorage,
} from '../src';

class MemoryTokenStorage implements TokenStorage {
  readonly tokens = new Map<string, TokenInfo>();

  async load(name: string): Promise<TokenInfo | undefined> {
    return this.tokens.get(name);
  }

  async save(name: string, token: TokenInfo): Promise<void> {
    this.tokens.set(name, token);
  }

  async remove(name: string): Promise<void> {
    this.tokens.delete(name);
  }

  async list(): Promise<string[]> {
    return [...this.tokens.keys()];
  }
}

function token(accessToken: string): TokenInfo {
  return {
    accessToken,
    refreshToken: `refresh-${accessToken}`,
    expiresAt: 10_000,
    scope: '',
    tokenType: 'Bearer',
    expiresIn: 3600,
  };
}

const TEST_IDENTITY = {
  userAgentProduct: 'kimi-code-cli',
  version: '0.0.0-test',
} as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveKimiTokenStorageName', () => {
  it('maps config oauth keys to the file storage token name', () => {
    expect(
      resolveKimiTokenStorageName({
        providerName: KIMI_CODE_PROVIDER_NAME,
        oauthKey: 'oauth/kimi-code',
      }),
    ).toBe('kimi-code');
    expect(resolveKimiTokenStorageName({ oauthKey: 'kimi-code' })).toBe('kimi-code');
  });

  it('rejects unsupported providers and unsafe token keys', () => {
    expect(() =>
      resolveKimiTokenStorageName({
        providerName: 'custom',
        oauthKey: 'kimi-code',
      }),
    ).toThrow(/No OAuth manager/);
    expect(() => resolveKimiTokenStorageName({ oauthKey: '../kimi-code' })).toThrow(/Invalid/);
  });
});

describe('KimiOAuthToolkit', () => {
  it('can be constructed without host identity', async () => {
    const storage = new MemoryTokenStorage();
    storage.tokens.set('kimi-code', token('access-1'));
    const toolkit = new KimiOAuthToolkit({
      homeDir: join('/tmp', 'kimi-oauth-toolkit-test'),
      storage,
      now: () => 100,
    });

    await expect(toolkit.tokenProvider().getAccessToken()).resolves.toBe('access-1');
  });

  it('reports status and exposes a bearer token provider', async () => {
    const storage = new MemoryTokenStorage();
    storage.tokens.set('kimi-code', token('access-1'));
    const toolkit = new KimiOAuthToolkit({
      homeDir: join('/tmp', 'kimi-oauth-toolkit-test'),
      identity: TEST_IDENTITY,
      storage,
      now: () => 100,
    });

    await expect(toolkit.status()).resolves.toEqual({
      providers: [{ providerName: KIMI_CODE_PROVIDER_NAME, hasToken: true }],
    });
    await expect(toolkit.tokenProvider().getAccessToken()).resolves.toBe('access-1');
  });

  it('resolves bearer token providers using the configured oauth key', async () => {
    const storage = new MemoryTokenStorage();
    storage.tokens.set('custom-kimi-code', token('custom-access'));
    const toolkit = new KimiOAuthToolkit({
      homeDir: join('/tmp', 'kimi-oauth-toolkit-test'),
      identity: TEST_IDENTITY,
      storage,
      now: () => 100,
    });

    await expect(
      toolkit
        .tokenProvider(KIMI_CODE_PROVIDER_NAME, { key: 'oauth/custom-kimi-code' })
        .getAccessToken(),
    ).resolves.toBe('custom-access');
  });

  it('returns the cached access token without refreshing it', async () => {
    const storage = new MemoryTokenStorage();
    storage.tokens.set('kimi-code', {
      ...token('cached-access'),
      expiresAt: 1,
    });
    const toolkit = new KimiOAuthToolkit({
      homeDir: join('/tmp', 'kimi-oauth-toolkit-test'),
      identity: TEST_IDENTITY,
      storage,
      now: () => 10_000,
    });

    await expect(toolkit.getCachedAccessToken()).resolves.toBe('cached-access');
  });

  it('resolves cached access tokens using the configured oauth key', async () => {
    const storage = new MemoryTokenStorage();
    storage.tokens.set('custom-kimi-code', token('custom-cached-access'));
    const toolkit = new KimiOAuthToolkit({
      homeDir: join('/tmp', 'kimi-oauth-toolkit-test'),
      identity: TEST_IDENTITY,
      storage,
      now: () => 100,
    });

    await expect(
      toolkit.getCachedAccessToken(KIMI_CODE_PROVIDER_NAME, { key: 'oauth/custom-kimi-code' }),
    ).resolves.toBe('custom-cached-access');
  });

  it('returns undefined when no cached access token exists', async () => {
    const toolkit = new KimiOAuthToolkit({
      homeDir: join('/tmp', 'kimi-oauth-toolkit-test'),
      identity: TEST_IDENTITY,
      storage: new MemoryTokenStorage(),
      now: () => 100,
    });

    await expect(toolkit.getCachedAccessToken()).resolves.toBeUndefined();
  });

  it('provisions managed config after login when an adapter is configured', async () => {
    const storage = new MemoryTokenStorage();
    const write = vi.fn();
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'kimi-for-coding',
                context_length: 262144,
                supports_reasoning: true,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    ) as unknown as typeof fetch;
    const config = { providers: {} };
    const toolkit = new KimiOAuthToolkit({
      homeDir: join('/tmp', 'kimi-oauth-toolkit-test'),
      identity: TEST_IDENTITY,
      storage,
      now: () => 100,
      fetchImpl,
      configAdapter: {
        read: () => config,
        write,
        apply: (target, input) => {
          target.providers[KIMI_CODE_PROVIDER_NAME] = {
            type: 'kimi',
            apiKey: '',
          };
          return {
            defaultModel: `kimi-code/${input.models[0]?.id ?? 'unknown'}`,
            defaultThinking: true,
          };
        },
      },
    });

    storage.tokens.set('kimi-code', token('access-1'));
    await expect(toolkit.login()).resolves.toMatchObject({
      providerName: KIMI_CODE_PROVIDER_NAME,
      ok: true,
      provision: {
        defaultModel: 'kimi-code/kimi-for-coding',
      },
    });
    expect(write).toHaveBeenCalledWith(config);
  });

  it('starts a new device flow when the stored refresh token is invalid', async () => {
    const storage = new MemoryTokenStorage();
    storage.tokens.set('kimi-code', {
      ...token('stale-access'),
      refreshToken: 'revoked-refresh',
      expiresAt: 101,
    });
    const onDeviceCode = vi.fn();
    const fetchImpl = vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (typeof init?.body !== 'string') throw new TypeError('expected form body');
      const body = new URLSearchParams(init.body);
      if (body.get('grant_type') === 'refresh_token') {
        return new Response(
          JSON.stringify({
            error: 'invalid_grant',
            error_description: 'The provided authorization grant is invalid',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (body.get('grant_type') === 'urn:ietf:params:oauth:grant-type:device_code') {
        return new Response(
          JSON.stringify({
            access_token: 'fresh-access',
            refresh_token: 'fresh-refresh',
            expires_in: 3600,
            scope: '',
            token_type: 'Bearer',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          user_code: 'WDJB-MJHT',
          device_code: 'device-code',
          verification_uri: 'https://auth.test/verify',
          verification_uri_complete: 'https://auth.test/verify?user_code=WDJB-MJHT',
          expires_in: 600,
          interval: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchImpl);
    const toolkit = new KimiOAuthToolkit({
      homeDir: join('/tmp', 'kimi-oauth-toolkit-test'),
      identity: TEST_IDENTITY,
      storage,
      now: () => 100,
      flowConfig: {
        name: 'kimi-code',
        oauthHost: 'https://auth.test',
        clientId: 'test-client-id',
      },
    });

    await expect(toolkit.login(undefined, { onDeviceCode })).resolves.toMatchObject({
      providerName: KIMI_CODE_PROVIDER_NAME,
      ok: true,
    });
    expect(onDeviceCode).toHaveBeenCalledTimes(1);
    expect((await storage.load('kimi-code'))?.accessToken).toBe('fresh-access');
  });

  it('removes managed config on logout when an adapter supports cleanup', async () => {
    const storage = new MemoryTokenStorage();
    storage.tokens.set('kimi-code', token('access-1'));
    const config = { providers: { [KIMI_CODE_PROVIDER_NAME]: { type: 'kimi' } } };
    const write = vi.fn();
    const remove = vi.fn();
    const toolkit = new KimiOAuthToolkit({
      homeDir: join('/tmp', 'kimi-oauth-toolkit-test'),
      identity: TEST_IDENTITY,
      storage,
      now: () => 100,
      configAdapter: {
        read: () => config,
        write,
        apply: () => ({ defaultModel: 'kimi-code/kimi-for-coding', defaultThinking: true }),
        remove,
      },
    });

    await expect(toolkit.logout()).resolves.toMatchObject({
      providerName: KIMI_CODE_PROVIDER_NAME,
      ok: true,
    });
    expect(remove).toHaveBeenCalledWith(config);
    expect(write).toHaveBeenCalledWith(config);
    await expect(storage.load('kimi-code')).resolves.toBeUndefined();
  });
});
