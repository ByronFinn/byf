import type { RPCMethods } from './client';

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

type WithExtraPayload<T, U> = {
  [K in keyof T]: T[K] extends (payload: infer P) => infer R
    ? (payload: Prettify<P & U>) => R
    : never;
};

export type WithAgentId<T> = WithExtraPayload<T, { readonly agentId: string }>;
export type WithSessionId<T> = WithExtraPayload<T, { readonly sessionId: string }>;

export function proxyWithExtraPayload<T, U>(
  methods: RPCMethods<WithExtraPayload<T, U>>,
  extraPayload: U,
): RPCMethods<T> {
  // The Proxy transforms each method's payload signature (injects `extraPayload`),
  // so its return type differs from the target's. Keep the target typed so the
  // handler's `target` parameter stays type-checked; assert only the result.
  const proxyTarget: RPCMethods<WithExtraPayload<T, U>> = methods;
  return new Proxy(proxyTarget, {
    get(target, prop) {
      const origMethod = target[prop as keyof typeof target];
      if (typeof origMethod !== 'function') {
        return origMethod;
      }
      return (payload: object, ...args: unknown[]) =>
        origMethod({ ...payload, ...extraPayload } as never, ...(args as never[]));
    },
  }) as unknown as RPCMethods<T>;
}
