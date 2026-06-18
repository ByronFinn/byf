import type { ByfErrorPayload } from '@byfriends/sdk';

/**
 * Convert a ByfErrorPayload to a JSON-RPC error object.
 */
export function byfErrorToJsonRpc(payload: ByfErrorPayload): { code: number; message: string; data?: unknown } {
  return {
    code: -32603,
    message: payload.message ?? 'Internal error',
    data: payload,
  };
}

/**
 * Convert an arbitrary thrown value to a JSON-RPC error.
 */
export function toJsonRpcError(err: unknown): { code: number; message: string; data?: unknown } {
  if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
    return byfErrorToJsonRpc(err as ByfErrorPayload);
  }
  const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  return { code: -32603, message };
}

/**
 * Standard JSON-RPC error codes.
 */
export const JSONRPC_ERROR_PARSE = { code: -32700, message: 'Parse error' } as const;
export const JSONRPC_ERROR_INVALID_REQUEST = { code: -32600, message: 'Invalid Request' } as const;
export const JSONRPC_ERROR_METHOD_NOT_FOUND = { code: -32601, message: 'Method not found' } as const;
export const JSONRPC_ERROR_INTERNAL = { code: -32603, message: 'Internal error' } as const;