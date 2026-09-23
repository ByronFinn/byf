import { vi as bunVi } from 'bun:test';
import type { Mock } from 'bun:test';

/**
 * Bun's `bun:test` runtime ships a Vitest-compatible `vi` object that provides
 * more members than `bun-types` declares (e.g. `waitFor`, `mocked`,
 * `setSystemTime`, `stubEnv`, and the async timer helpers). Our ported Vitest
 * suites rely on that surface, so we re-export the *same* runtime object with
 * the extra members typed against the published Vitest signatures. This keeps
 * runtime behaviour identical to `import { vi } from 'bun:test'` while giving
 * the type checker the declarations `bun-types` omits — it is a single,
 * framework-level augmentation instead of a cast at every call site.
 */
type VitestViExtras = {
  waitFor(
    condition: () => void | Promise<void>,
    options?: { timeout?: number; interval?: number },
  ): Promise<void>;
  setSystemTime(time?: number | Date): void;
  stubEnv(name: string, value: string | undefined): void;
  unstubAllEnvs(): void;
  stubGlobal(name: string | Partial<Record<string, unknown>>, value?: unknown): void;
  unstubAllGlobals(): void;
  resetModules(): void;
  doMock(
    path: string,
    factory?: () => unknown,
    options?: { factory?: boolean; spy?: boolean },
  ): void;
  doUnmock(path: string): void;
  advanceTimersByTimeAsync(ms: number): Promise<void>;
  runAllTimersAsync(): Promise<void>;
  // Mirrors `Mock<T>`'s own `(...args: any[]) => any` constraint (bun-types);
  // `vi.mocked` is a compile-time identity helper that re-types a mock so its
  // `.mock.*` state is reachable.
  mocked<T extends (...args: any[]) => any>(item: T, options?: { deep?: boolean }): Mock<T>;
};

export const vi: typeof bunVi & VitestViExtras = bunVi as typeof bunVi & VitestViExtras;
