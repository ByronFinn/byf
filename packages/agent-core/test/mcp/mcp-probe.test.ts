import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { probeMcpConnection } from '../../src/mcp/mcp-probe';

const fixture = join(import.meta.dirname, 'fixtures', 'mock-stdio-server.mjs');

describe('probeMcpConnection', () => {
  it('reports ok with toolCount for a reachable stdio server', async () => {
    const result = await probeMcpConnection({
      transport: 'stdio',
      command: process.execPath,
      args: [fixture],
    });
    expect(result.ok).toBe(true);
    expect(result.toolCount).toBe(3);
    expect(result.error).toBeUndefined();
  }, 15000);

  it('reports failure with stderr tail when the child cannot start', async () => {
    const result = await probeMcpConnection({
      transport: 'stdio',
      command: 'definitely-not-a-real-command-xyz',
    });
    expect(result.ok).toBe(false);
    expect(result.toolCount).toBe(0);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('definitely-not-a-real-command-xyz');
  }, 15000);

  it('reports failure for a stdio server that exits during the handshake', async () => {
    const result = await probeMcpConnection({
      transport: 'stdio',
      command: 'sh',
      args: ['-c', 'echo only-stderr >&2; exit 1'],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    // stderr 尾部拼接,方便用户在表单里定位启动失败原因。
    expect(result.error).toContain('only-stderr');
  }, 15000);

  it('reports failure when the probe times out', async () => {
    const result = await probeMcpConnection(
      {
        transport: 'stdio',
        command: process.execPath,
        // fixture 支持 BYF_TEST_MCP_START_DELAY_MS 延迟启动;探测超时更短。
        args: [fixture],
        startupTimeoutMs: 200,
        env: { BYF_TEST_MCP_START_DELAY_MS: '3000' },
      },
      {},
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('超时');
  }, 15000);
});
