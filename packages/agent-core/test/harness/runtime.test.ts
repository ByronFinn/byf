import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRPC, ByfCore, type ApprovalResponse, type CoreAPI, type SDKAPI } from '../../src';
import type { OAuthTokenProviderResolver } from '../../src/providers/runtime-provider';

describe('ByfCore runtime config', () => {
  let tmp: string;

  afterEach(async () => {
    if (tmp !== undefined) {
      await rm(tmp, { recursive: true, force: true });
    }
    vi.unstubAllGlobals();
  });

  it('uses the shared OAuth resolver for Byf service tokens', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'byf-core-runtime-'));
    const homeDir = join(tmp, 'home');
    const workDir = join(tmp, 'work');
    await mkdir(homeDir, { recursive: true });
    await mkdir(workDir, { recursive: true });
    await writeFile(
      join(homeDir, 'config.toml'),
      `
	[services.fetch_url]
	base_url = "https://fetch.example/v1"
	oauth = { storage = "file", key = "oauth/custom-byf" }
	custom_headers = { "X-Test" = "1" }
	`,
    );

    const getAccessToken = vi.fn().mockResolvedValue('service-token');
    const resolveOAuthTokenProvider = vi.fn<OAuthTokenProviderResolver>(() => ({
      getAccessToken,
    }));
    const fetchImpl = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);

    const [coreRpc, sdkRpc] = createRPC<CoreAPI, SDKAPI>();
    const core = new ByfCore(coreRpc, {
      homeDir,
      byfRequestHeaders: {
        'User-Agent': 'byf-cli/0.0.0-test',
        'X-Msh-Version': '0.0.0-test',
      },
      resolveOAuthTokenProvider,
    });
    const rpc = await sdkRpc({
      emitEvent: vi.fn(),
      requestApproval: vi.fn(async (): Promise<ApprovalResponse> => ({ decision: 'rejected' })),
      requestQuestion: vi.fn(async () => null),
      toolCall: vi.fn(async () => ({ output: '' })),
    });

    const created = await rpc.createSession({ id: 'ses_runtime_service_oauth', workDir });
    const session = core.sessions.get(created.id);

    expect(resolveOAuthTokenProvider).toHaveBeenCalledWith('byf', {
      storage: 'file',
      key: 'oauth/custom-byf',
    });
    expect(session?.config.runtime.urlFetcher).toBeDefined();

    // The fetch triggers the RemoteFetchURLProvider's remote call, which
    // sets up the OAuth bearer token and custom/default request headers.
    await session!.config.runtime.urlFetcher!.fetch('https://example.com/page');

    expect(getAccessToken).toHaveBeenCalledWith();
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer service-token',
      'User-Agent': 'byf-cli/0.0.0-test',
      'X-Msh-Version': '0.0.0-test',
      'X-Test': '1',
    });
  });
});
