import type { WebServerHandle } from '@byfriends/web-server';
import { describe, expect, test, vi } from 'vitest';

import { handleWeb, type WebDeps } from '../../src/cli/sub/web';

interface TestDeps extends WebDeps {
  stdoutText: () => string;
  stderrText: () => string;
}

function makeDeps(overrides: Partial<WebDeps> = {}): TestDeps {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const handle: WebServerHandle = {
    host: '0.0.0.0',
    port: 4100,
    staticEnabled: true,
    url: 'http://0.0.0.0:4100',
    close: () => {},
  };
  const deps: TestDeps = {
    startServer: vi.fn().mockResolvedValue(handle),
    openUrl: vi.fn().mockResolvedValue(undefined),
    waitForShutdown: async (onClose) => {
      onClose();
    },
    collectLanIps: () => ['192.168.1.5'],
    stdout: { write: (chunk: string) => stdout.push(chunk) === true } as never,
    stderr: { write: (chunk: string) => stderr.push(chunk) === true } as never,
    exit: (code) => {
      throw new Error(`exit:${code}`);
    },
    stdoutText: () => stdout.join(''),
    stderrText: () => stderr.join(''),
  };
  return { ...deps, ...overrides, stdoutText: deps.stdoutText, stderrText: deps.stderrText };
}

/** handleWeb 以 deps.exit(0) 收尾;视为正常完成。 */
async function expectExit(promise: Promise<void>, code: number): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error && error.message === `exit:${code}`) return;
    throw error;
  }
}

/** PRD-0034 R-D1:LAN banner 与 localhost 打开行为。 */
describe('byf web LAN banner (PRD-0034 R-D1)', () => {
  test('非回环绑定:banner 含各 LAN IP 完整 URL(带 token)与轮换提示;浏览器打开 localhost', async () => {
    process.env['WEB_AUTH_TOKEN'] = 'tok-lan';
    try {
      const deps = makeDeps();
      await expectExit(handleWeb(deps, undefined, { host: '0.0.0.0', port: 4100, open: true }), 0);
      const banner = deps.stdoutText();
      expect(banner).toContain('http://192.168.1.5:4100/?token=tok-lan');
      expect(banner).toContain('轮换');
      expect(deps.openUrl).toHaveBeenCalledWith('http://127.0.0.1:4100/');
    } finally {
      delete process.env['WEB_AUTH_TOKEN'];
    }
  });

  test('回环绑定:banner 无 LAN 行与 token,且不收集 LAN IP', async () => {
    const collectLanIps = vi.fn(() => ['192.168.1.5']);
    const deps = makeDeps({
      collectLanIps,
      startServer: vi.fn().mockResolvedValue({
        host: '127.0.0.1',
        port: 4100,
        staticEnabled: true,
        url: 'http://127.0.0.1:4100',
        close: () => {},
      } satisfies WebServerHandle),
    });
    await expectExit(handleWeb(deps, undefined, { host: '127.0.0.1', port: 4100, open: false }), 0);
    const banner = deps.stdoutText();
    expect(banner).toContain('listening on http://127.0.0.1:4100');
    expect(banner).not.toContain('?token=');
    expect(banner).not.toContain('] lan ');
    expect(collectLanIps).not.toHaveBeenCalled();
  });

  test('回环别名(localhost/IPv6/完整 IPv6/bracket 写法)同样不收集 LAN IP', async () => {
    for (const host of ['localhost', '::1', '[::1]', '0:0:0:0:0:0:0:1']) {
      const collectLanIps = vi.fn(() => ['192.168.1.5']);
      const deps = makeDeps({
        collectLanIps,
        startServer: vi.fn().mockResolvedValue({
          host,
          port: 4100,
          staticEnabled: true,
          url: `http://${host}:4100`,
          close: () => {},
        } satisfies WebServerHandle),
      });
      await expectExit(handleWeb(deps, undefined, { host, port: 4100, open: false }), 0);
      expect(deps.stdoutText()).not.toContain('] lan ');
      expect(collectLanIps).not.toHaveBeenCalled();
    }
  });
});
