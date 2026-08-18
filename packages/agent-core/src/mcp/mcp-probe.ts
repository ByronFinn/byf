/**
 * MCP 连接自检(web 设置页「测试连接」)。
 *
 * 与 {@link McpConnectionManager.connectOne} 不同的临时通道:使用调用方
 * 提交的 config(编辑模式先做掩码还原)拉起客户端,握手 + listTools 成功后
 * 立即关闭。失败信息优先取子进程 stderr 尾部,方便用户定位 stdio 配置。
 */
import type { McpServerConfig } from '#/config/schema';

import { HttpMcpClient } from './client-http';
import { SseMcpClient } from './client-sse';
import { StdioMcpClient } from './client-stdio';

export interface McpConnectionProbeOptions {
  /** 父级日志;未传时探测过程静默。 */
  readonly log?: { error: (...args: unknown[]) => void };
}

export interface McpConnectionTestResult {
  readonly ok: boolean;
  readonly toolCount: number;
  readonly error?: string;
}

const DEFAULT_PROBE_TIMEOUT_MS = 15_000;

export async function probeMcpConnection(
  config: McpServerConfig,
  options: McpConnectionProbeOptions = {},
): Promise<McpConnectionTestResult> {
  const timeoutMs = config.startupTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  let client: StdioMcpClient | HttpMcpClient | SseMcpClient | undefined;
  try {
    const probe = createProbeClient(config);
    client = probe;
    const tools = await withTimeout(connectAndListTools(probe), timeoutMs, () => {
      void probe.close();
    });
    return { ok: true, toolCount: tools.length };
  } catch (error) {
    const message = formatProbeError(config, error, client);
    options.log?.error('mcp connection test failed', {
      transport: config.transport,
      reason: message,
    });
    return { ok: false, toolCount: 0, error: message };
  } finally {
    if (client !== undefined) {
      try {
        await client.close();
      } catch {
        // 探测通道关闭失败不影响结果。
      }
    }
  }
}

function createProbeClient(config: McpServerConfig): StdioMcpClient | HttpMcpClient | SseMcpClient {
  if (config.transport === 'stdio') {
    return new StdioMcpClient(config);
  }
  if (config.transport === 'sse') {
    return new SseMcpClient(config);
  }
  return new HttpMcpClient(config);
}

async function connectAndListTools(client: StdioMcpClient | HttpMcpClient | SseMcpClient) {
  await client.connect();
  return client.listTools();
}

function formatProbeError(
  config: McpServerConfig,
  error: unknown,
  client: StdioMcpClient | HttpMcpClient | SseMcpClient | undefined,
): string {
  const base = error instanceof Error ? error.message : String(error);
  if (config.transport !== 'stdio' || !(client instanceof StdioMcpClient)) return base;
  const snapshot = client.stderrSnapshot();
  if (snapshot.length === 0) return base;
  return `${base}\nstderr: ${snapshot.trimEnd()}`;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        onTimeout();
        reject(new Error(`连接超时(超过 ${timeoutMs}ms)`));
      }, timeoutMs);
      promise.then(resolve, reject);
    });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
