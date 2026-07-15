import { createControlledPromise, objectMap } from '@antfu/utils';

import type { PromisableMethods, Promisify } from '#/utils/types';

import { fromByfErrorPayload, type ByfErrorPayload, toByfErrorPayload } from '../errors';
import { abortable } from '../utils/abort';
import type { CoreAPI } from './core-api';
import type { SDKAPI } from './sdk-api';

export interface RPCCallOptions {
  signal?: AbortSignal;
}

type RpcResponse =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: ByfErrorPayload };

export type RPCMethods<T> = {
  [K in keyof T]: T[K] extends (payload: infer Payload) => infer Return
    ? (payload: Payload, options?: RPCCallOptions) => Promisify<Return>
    : never;
};

export type RPCClient<Self, Other> = (self: PromisableMethods<Self>) => Promise<RPCMethods<Other>>;

export function createRPC<Left, Right>(): [RPCClient<Left, Right>, RPCClient<Right, Left>] {
  const left = createControlledPromise<PromisableMethods<Left>>();
  const right = createControlledPromise<PromisableMethods<Right>>();

  function simulateNetwork<T>(data: T): Promise<T> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const serialized = JSON.stringify(data);
        resolve(serialized === undefined ? (undefined as T) : JSON.parse(serialized));
      }, 0);
    });
  }

  function abortableRpc<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    return signal === undefined ? promise : abortable(promise, signal);
  }

  function mapRpcFunction(
    fn: (payload: unknown) => unknown,
  ): (payload: unknown, options?: RPCCallOptions) => Promise<unknown> {
    return async (payload: unknown, options?: RPCCallOptions) => {
      const signal = options?.signal;
      const rpcPayload = await simulateNetwork(payload);
      signal?.throwIfAborted();
      let response: RpcResponse;
      try {
        const value = await abortableRpc(Promise.resolve(fn(rpcPayload)), signal);
        response = { ok: true, value };
      } catch (error) {
        signal?.throwIfAborted();
        response = { ok: false, error: toByfErrorPayload(error) };
      }
      const remoteResponse = await simulateNetwork(response);
      if (remoteResponse.ok) return remoteResponse.value;
      throw fromByfErrorPayload(remoteResponse.error);
    };
  }

  function bindAllFunctions<T extends object>(obj: T): T {
    const bound: Record<string, unknown> = {};
    let current: object | null = obj;

    while (current !== null && current !== Object.prototype) {
      for (const key of Object.getOwnPropertyNames(current)) {
        if (key === 'constructor' || Object.hasOwn(bound, key)) {
          continue;
        }

        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (typeof descriptor?.value === 'function') {
          bound[key] = descriptor.value.bind(obj);
        }
      }

      current = Object.getPrototypeOf(current);
    }

    return bound as T;
  }

  async function leftClient(self: PromisableMethods<Left>): Promise<RPCMethods<Right>> {
    left.resolve(bindAllFunctions(self));
    return objectMap(await right, (key, fn) => [key, mapRpcFunction(fn)]) as RPCMethods<Right>;
  }

  async function rightClient(self: PromisableMethods<Right>): Promise<RPCMethods<Left>> {
    right.resolve(bindAllFunctions(self));
    return objectMap(await left, (key, fn) => [key, mapRpcFunction(fn)]) as RPCMethods<Left>;
  }

  return [leftClient, rightClient];
}

export type CoreRPCClient = RPCClient<CoreAPI, SDKAPI>;
export type SDKRPCClient = RPCClient<SDKAPI, CoreAPI>;

export type CoreRPC = RPCMethods<CoreAPI>;
