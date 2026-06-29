/**
 * Loop-local error helpers.
 */

import { isAbortError } from '@byfriends/kosong';

import { ErrorCodes, ByfError, isByfError } from '#/errors';

export { isAbortError };

export function createMaxStepsExceededError(maxSteps: number, message?: string): ByfError {
  return new ByfError(
    ErrorCodes.LOOP_MAX_STEPS_EXCEEDED,
    message ?? `Turn exceeded maxSteps=${maxSteps}`,
    {
      details: { maxSteps },
    },
  );
}

export function isMaxStepsExceededError(error: unknown): boolean {
  return isByfError(error) && error.code === ErrorCodes.LOOP_MAX_STEPS_EXCEEDED;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
