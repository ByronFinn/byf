import { describe, expect, it, vi } from 'vitest';

import { ErrorCodes, KimiError, type KimiConfig, type Logger } from '#/index';

import { resolveRuntimeProviderWithOAuth } from '../../agent-core/src/providers/runtime-provider';

function managedConfig(): KimiConfig {
  return {
    providers: {
      'managed:kimi-code': {
        type: 'kimi',
        baseUrl: 'https://api.kimi.com/coding/v1',
        apiKey: '',
        oauth: { storage: 'file', key: 'oauth/kimi-code' },
      },
    },
    models: {
      'kimi-code/kimi-for-coding': {
        provider: 'managed:kimi-code',
        model: 'kimi-for-coding',
        maxContextSize: 262144,
      },
    },
    defaultModel: 'kimi-code/kimi-for-coding',
  };
}

describe('resolveRuntimeProviderWithOAuth', () => {
  it('returns request-scoped OAuth auth without storing the initial access token in provider config', async () => {
    const tokens = ['initial-oauth-token', 'rotated-oauth-token', 'force-refreshed-oauth-token'];
    const getAccessToken = vi.fn().mockImplementation(async () => {
      const token = tokens.shift();
      if (token === undefined) throw new Error('unexpected token request');
      return token;
    });

    const resolved = await resolveRuntimeProviderWithOAuth({
      config: managedConfig(),
      resolveOAuthTokenProvider: (_providerName, oauthRef) => {
        expect(oauthRef).toEqual({ storage: 'file', key: 'oauth/kimi-code' });
        return { getAccessToken };
      },
    });

    expect(resolved.providerName).toBe('managed:kimi-code');
    expect(resolved.provider).toMatchObject({
      type: 'kimi',
      model: 'kimi-for-coding',
      baseUrl: 'https://api.kimi.com/coding/v1',
    });
    expect(resolved.provider.apiKey).toBeUndefined();
    await expect(resolved.resolveAuth?.()).resolves.toEqual({ apiKey: 'rotated-oauth-token' });
    await expect(resolved.resolveAuth?.({ forceRefresh: true })).resolves.toEqual({
      apiKey: 'force-refreshed-oauth-token',
    });
    expect(getAccessToken.mock.calls).toEqual([[undefined], [undefined], [{ force: true }]]);
  });

  it('throws a clear login-required error when no token provider exists', async () => {
    await expect(
      resolveRuntimeProviderWithOAuth({
        config: managedConfig(),
      }),
    ).rejects.toThrow(/requires login/);
  });

  it('rejects providers that set both apiKey and oauth on the same config', async () => {
    const conflicting: KimiConfig = {
      ...managedConfig(),
      providers: {
        'managed:kimi-code': {
          type: 'kimi',
          baseUrl: 'https://api.kimi.com/coding/v1',
          apiKey: 'static-key',
          oauth: { storage: 'file', key: 'oauth/kimi-code' },
        },
      },
    };

    await expect(
      resolveRuntimeProviderWithOAuth({
        config: conflicting,
        resolveOAuthTokenProvider: () => ({
          getAccessToken: vi.fn().mockResolvedValue('unused'),
        }),
      }),
    ).rejects.toThrow(/mutually exclusive/);
  });

  it('wraps token provider failures as login-required errors', async () => {
    await expect(
      resolveRuntimeProviderWithOAuth({
        config: managedConfig(),
        resolveOAuthTokenProvider: () => ({
          getAccessToken: vi.fn().mockRejectedValue(new Error('missing token')),
        }),
      }),
    ).rejects.toMatchObject({
      name: 'KimiError',
      code: 'auth.login_required',
    });
  });

  it('logs token provider failures except plain login-required errors', async () => {
    const log = testLogger();
    await expect(
      resolveRuntimeProviderWithOAuth({
        config: managedConfig(),
        log,
        resolveOAuthTokenProvider: () => ({
          getAccessToken: vi.fn().mockRejectedValue(new Error('token endpoint down')),
        }),
      }),
    ).rejects.toMatchObject({ code: 'auth.login_required' });
    expect(log.warn).toHaveBeenCalledWith(
      'oauth token fetch failed',
      expect.objectContaining({
        providerName: 'managed:kimi-code',
        error: expect.any(Error),
      }),
    );

    vi.clearAllMocks();
    await expect(
      resolveRuntimeProviderWithOAuth({
        config: managedConfig(),
        log,
        resolveOAuthTokenProvider: () => ({
          getAccessToken: vi.fn().mockRejectedValue(
            new KimiError(ErrorCodes.AUTH_LOGIN_REQUIRED, 'not logged in'),
          ),
        }),
      }),
    ).rejects.toMatchObject({ code: 'auth.login_required' });
    expect(log.warn).not.toHaveBeenCalled();
  });
});

function testLogger(): Logger {
  const logger: Logger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    createChild: () => logger,
  };
  return logger;
}
