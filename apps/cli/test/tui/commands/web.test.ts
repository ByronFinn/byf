import type { WebServerHandle } from '@byfriends/web-server';
import { describe, expect, test, vi, beforeEach } from 'vitest';

import { createMockHost } from './helpers';

const startWebServerMock = vi.hoisted(() => vi.fn());

vi.mock('@byfriends/web-server', () => ({
  startWebServer: startWebServerMock,
}));

const openMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('open', () => ({ default: openMock }));

function makeHandle(port: number): WebServerHandle {
  return {
    host: '127.0.0.1',
    port,
    staticEnabled: true,
    url: `http://127.0.0.1:${String(port)}`,
    close: vi.fn(),
  };
}

/** PRD-0034 R-D2:TUI /web 后台起服务、重复调用幂等、退出钩子关闭。 */
describe('/web command handler (PRD-0034 R-D2)', () => {
  beforeEach(() => {
    startWebServerMock.mockReset();
    openMock.mockClear();
  });

  test('启动服务(默认 4100,占用则递增),showStatus 输出 URL 并打开浏览器', async () => {
    startWebServerMock.mockResolvedValue(makeHandle(4100));
    const { createWebHandlers, __resetWebServerForTest } =
      await import('../../../src/tui/commands/handlers/web');
    __resetWebServerForTest();
    const host = createMockHost();
    const handlers = createWebHandlers(host as never);
    await handlers['web']('');
    expect(startWebServerMock).toHaveBeenCalledWith(expect.objectContaining({ host: '127.0.0.1' }));
    expect(host.showStatus).toHaveBeenCalledWith(expect.stringContaining('http://127.0.0.1:4100'));
    expect(openMock).toHaveBeenCalledWith('http://127.0.0.1:4100', expect.anything());
  });

  test('重复 /web 不再起第二个实例;shutdown 钩子关闭服务', async () => {
    const handle = makeHandle(4100);
    startWebServerMock.mockResolvedValue(handle);
    const { createWebHandlers, __resetWebServerForTest } =
      await import('../../../src/tui/commands/handlers/web');
    __resetWebServerForTest();
    const host = createMockHost();
    const handlers = createWebHandlers(host as never);
    await handlers['web']('');
    await handlers['web']('');
    expect(startWebServerMock).toHaveBeenCalledTimes(1);

    const hook = (host.registerShutdownHook as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
      | (() => void)
      | undefined;
    expect(hook).toBeInstanceOf(Function);
    hook?.();
    expect(handle.close).toHaveBeenCalled();
    // 关闭后可再次启动
    await handlers['web']('');
    expect(startWebServerMock).toHaveBeenCalledTimes(2);
  });

  test('端口占用时递增找空闲端口', async () => {
    startWebServerMock.mockImplementation(async (opts: { port: number }) => {
      // 模拟 4100/4101 被占用
      if (opts.port < 4102) {
        const error = new Error('bind EADDRINUSE address already in use');
        (error as NodeJS.ErrnoException).code = 'EADDRINUSE';
        throw error;
      }
      return makeHandle(opts.port);
    });
    const { createWebHandlers, __resetWebServerForTest } =
      await import('../../../src/tui/commands/handlers/web');
    __resetWebServerForTest();
    const host = createMockHost();
    const handlers = createWebHandlers(host as never);
    await handlers['web']('');
    expect(startWebServerMock).toHaveBeenCalledTimes(3);
    expect(host.showStatus).toHaveBeenCalledWith(expect.stringContaining('4102'));
  });
});
