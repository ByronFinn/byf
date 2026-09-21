import { vi } from 'bun:test';

/**
 * Providers type their injectable fetch as the global `typeof fetch`, which in
 * Bun carries a `preconnect` static on top of the call signature. A
 * `vi.fn<typeof fetch>()` mock is callable and exposes `.mock.*`, but drops the
 * non-callable `preconnect` member, so it is not assignable to `typeof fetch`.
 * Attaching a no-op `preconnect` keeps the mock's `.mock.calls` usable while
 * making it structurally assignable to `typeof fetch`.
 */
export type FetchMock = ReturnType<typeof vi.fn<typeof fetch>> & { preconnect(): void };

export function fetchMock(): FetchMock {
  return Object.assign(vi.fn<typeof fetch>(), { preconnect(): void {} });
}

/** Wrap an already-built fetch mock (or any object) with the `preconnect` static. */
export function withPreconnect<M extends object>(mock: M): M & { preconnect(): void } {
  return Object.assign(mock, { preconnect(): void {} });
}
