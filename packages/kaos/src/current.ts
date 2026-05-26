import { AsyncLocalStorage } from 'node:async_hooks';

import type { Kaos } from './kaos';
import { localKaos } from './local';

const kaosStorage = new AsyncLocalStorage<Kaos>();

function getDefaultKaos(): Kaos {
  return localKaos;
}

/**
 * Return the {@link Kaos} instance for the current async context.
 *
 * If {@link runWithKaos} has bound an instance for this context it is
 * returned; otherwise a lazily-created {@link LocalKaos} default is used.
 */
export function getCurrentKaos(): Kaos {
  return kaosStorage.getStore() ?? getDefaultKaos();
}

export function runWithKaos<T>(kaos: Kaos, fn: () => T): T {
  return kaosStorage.run(kaos, fn);
}

/**
 * Token returned by setCurrentKaos, used to restore the previous instance.
 * Mirrors Python's ContextVar Token pattern.
 */
export interface KaosToken {
  readonly previousKaos: Kaos | null;
}

/**
 * Set the current kaos instance and return a token for restoring the previous one.
 *
 * Unlike a plain module-level global, this binds the override to the current
 * async context so concurrent tasks do not pollute each other. The returned
 * token can later be passed to {@link resetCurrentKaos} to restore the
 * previously-visible instance, mirroring Python's ContextVar token pattern.
 */
export function setCurrentKaos(kaos: Kaos): KaosToken {
  const token: KaosToken = { previousKaos: getCurrentKaos() };
  kaosStorage.enterWith(kaos);
  return token;
}

export function resetCurrentKaos(token: KaosToken): void {
  kaosStorage.enterWith(token.previousKaos ?? getDefaultKaos());
}
