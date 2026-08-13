import { ChatProviderError } from '#/errors';
import type { ProviderRequestAuth } from '#/provider';

export function requireProviderApiKey(
  providerName: string,
  auth: ProviderRequestAuth | undefined,
  defaultApiKey?: string,
): string {
  const apiKey = auth?.apiKey ?? defaultApiKey;
  if (apiKey === undefined || apiKey.length === 0) {
    throw new ChatProviderError(
      `${providerName}: apiKey is required. Provide it via the constructor options, the provider's API-key environment variable, options.auth.apiKey on each request, or an OAuth login.`,
    );
  }
  return apiKey;
}

export function mergeRequestHeaders(
  defaultHeaders: Record<string, string> | undefined,
  requestHeaders: Record<string, string> | undefined,
): Record<string, string> | undefined {
  const merged: Record<string, string> = {};
  if (defaultHeaders !== undefined) {
    Object.assign(merged, defaultHeaders);
  }
  if (requestHeaders !== undefined) {
    Object.assign(merged, requestHeaders);
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * 解析单个 provider 请求要使用的 SDK 客户端,应用每个 provider 适配器
 * 共享的标准优先级:
 *
 * 1. 若提供了 `clientFactory`,委托给它(它接收每次请求的
 *    {@link ProviderRequestAuth},默认为 `{}`)。
 * 2. 否则,若无需每次请求的认证**且**构造时客户端已缓存,复用缓存实例。
 * 3. 否则,调用 `build(auth)` 为本次请求构造全新客户端——通常使用
 *    `requireProviderApiKey` 加 `mergeRequestHeaders`。
 *
 * 注意:提供每次请求 `auth` 时(如在每次调用前立即解析的 OAuth bearer
 * token),步骤 3 触发,每次请求构造全新 SDK 客户端。这是有意的——把
 * 短命凭据移出任何长命共享状态,并避免在可变客户端上竞争并发请求。
 * 代价是 SDK 客户端内的连接池 / keep-alive 状态在 OAuth 路径上不跨请求
 * 复用。对当前 agent-CLI 负载(每 turn 一步一次 LLM 调用)这没问题;
 * 若未来宿主需要高吞吐的每次请求认证,显而易见的优化是以
 * `(apiKey, headers digest)` 为键的小型 LRU。
 */
export function resolveAuthBackedClient<TClient>(
  state: {
    readonly cachedClient: TClient | undefined;
    readonly clientFactory: ((auth: ProviderRequestAuth) => TClient) | undefined;
  },
  auth: ProviderRequestAuth | undefined,
  build: (auth: ProviderRequestAuth | undefined) => TClient,
): TClient {
  if (state.clientFactory !== undefined) {
    return state.clientFactory(auth ?? {});
  }
  if (auth === undefined && state.cachedClient !== undefined) {
    return state.cachedClient;
  }
  return build(auth);
}
