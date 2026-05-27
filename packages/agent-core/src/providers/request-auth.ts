import { APIStatusError, type ProviderRequestAuth } from '@byf/kosong';

import { ErrorCodes, KimiError } from '#/errors';

export interface ProviderRequestAuthOptions {
  readonly forceRefresh?: boolean;
}

export type ProviderRequestAuthResolver = (
  options?: ProviderRequestAuthOptions,
) => Promise<ProviderRequestAuth>;

export async function withProviderRequestAuth<T>(
  resolveAuth: ProviderRequestAuthResolver | undefined,
  request: (auth: ProviderRequestAuth | undefined) => Promise<T>,
): Promise<T> {
  let auth = await resolveAuth?.();
  for (let refreshed = false; ; refreshed = true) {
    try {
      return await request(auth);
    } catch (error) {
      if (
        auth === undefined ||
        !(error instanceof APIStatusError) ||
        error.statusCode !== 401
      ) {
        throw error;
      }
      if (!refreshed && resolveAuth !== undefined) {
        auth = await resolveAuth({ forceRefresh: true });
        continue;
      }
      throw new KimiError(
        ErrorCodes.AUTH_LOGIN_REQUIRED,
        'OAuth provider credentials were rejected. Send /login to login.',
        {
          cause: error,
          details: {
            statusCode: error.statusCode,
            requestId: error.requestId,
          },
        },
      );
    }
  }
}
