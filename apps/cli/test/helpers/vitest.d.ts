/**
 * Ambient type surface for the `vitest` module used by `apps/cli/test/**`.
 *
 * The CLI test suite runs on `bun test`, which rewrites `vitest` imports to
 * Bun's built-in Vitest compatibility layer (see `docs/` and the
 * `mock as bunMock` pattern in several files). The package itself is not a
 * dependency, so `tsc -p tsconfig.test.json` cannot resolve it. This file
 * declares the *exact* API surface the suite consumes, typed as faithfully
 * as the runtime allows, so mock drift fails at compile time instead of
 * silently becoming `any`.
 *
 * Keep this surface small: if a test needs another member of the real
 * Vitest API, add its precise signature here (or migrate the call to
 * `bun:test`).
 */
declare module 'vitest' {
  type AnyProcedure = (...args: never[]) => unknown;

  type ArgsOf<T> = T extends (...args: infer A) => unknown ? A : never;
  type RetOf<T> = T extends (...args: never[]) => infer R ? R : unknown;

  interface MockResultReturn<TReturn> {
    type: 'return';
    value: TReturn;
  }

  interface MockResultThrow {
    type: 'throw';
    value: unknown;
  }

  type MockResult<TReturn> = MockResultReturn<TReturn> | MockResultThrow;

  interface MockContext<TArgs extends readonly unknown[], TReturn> {
    readonly calls: Array<[...TArgs]>;
    readonly instances: unknown[];
    readonly contexts: unknown[];
    readonly results: Array<MockResult<TReturn>>;
    readonly invocationCallOrder: number[];
    readonly lastCall: [...TArgs] | undefined;
  }

  interface MockInstance<TArgs extends readonly unknown[], TReturn> {
    readonly mock: MockContext<TArgs, TReturn>;
    getMockName(): string;
    mockName(name: string): this;
    mockClear(): this;
    mockReset(): this;
    mockRestore(): void;
    mockImplementation(impl: (...args: TArgs) => TReturn): this;
    mockImplementationOnce(impl: (...args: TArgs) => TReturn): this;
    mockReturnValue(value: TReturn): this;
    mockReturnValueOnce(value: TReturn): this;
    mockResolvedValue(value: Awaited<TReturn>): this;
    mockResolvedValueOnce(value: Awaited<TReturn>): this;
    mockRejectedValue(value: unknown): this;
    mockRejectedValueOnce(value: unknown): this;
  }

  type Mock<T extends AnyProcedure> = T & MockInstance<Parameters<T>, ReturnType<T>>;

  type ConstructorLike = abstract new (...args: never[]) => unknown;

  type ExpectedConstructor = abstract new (...args: never[]) => Error;

  interface Assertion<TActual> {
    // value matchers
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toStrictEqual(expected: unknown): void;
    toContain(expected: unknown): void;
    toContainEqual(expected: unknown): void;
    toMatch(expected: string | RegExp): void;
    toMatchObject(expected: object): void;
    toHaveProperty(key: PropertyKey, value?: unknown): void;
    toBeInstanceOf(expected: ConstructorLike): void;
    // number matchers
    toBeGreaterThan(expected: number | bigint): void;
    toBeGreaterThanOrEqual(expected: number | bigint): void;
    toBeLessThan(expected: number | bigint): void;
    toBeLessThanOrEqual(expected: number | bigint): void;
    toBeCloseTo(expected: number, precision?: number): void;
    // presence / type matchers
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toBeNaN(): void;
    toBeTypeOf(
      expected:
        | 'bigint'
        | 'boolean'
        | 'function'
        | 'number'
        | 'object'
        | 'string'
        | 'symbol'
        | 'undefined',
    ): void;
    toHaveLength(expected: number): void;
    // error matchers
    toThrow(expected?: string | RegExp | Error | ExpectedConstructor): void;
    toThrowError(expected?: string | RegExp | Error | ExpectedConstructor): void;
    // mock matchers
    toHaveBeenCalled(): void;
    toHaveBeenCalledTimes(expected: number): void;
    toHaveBeenCalledWith(...args: unknown[]): void;
    toHaveBeenLastCalledWith(...args: unknown[]): void;
    toHaveBeenNthCalledWith(nthCall: number, ...args: unknown[]): void;
    toHaveBeenCalledOnce(): void;
    // modifiers
    readonly not: Assertion<TActual>;
    readonly resolves: Assertion<TActual>;
    readonly rejects: Assertion<TActual>;
  }

  interface ExpectStatic {
    <TActual>(actual: TActual): Assertion<TActual>;
    // Bun's compatibility `expect` additionally accepts a failure message.
    <TActual>(actual: TActual, message: string): Assertion<TActual>;
    any(expected: ConstructorLike): unknown;
    anything(): unknown;
    arrayContaining(sample: readonly unknown[]): unknown;
    objectContaining(sample: object): unknown;
    stringContaining(expected: string): unknown;
    stringMatching(expected: string | RegExp): unknown;
  }

  type TestFn = () => void | Promise<void>;
  type TestCallback = TestFn | ((...args: never[]) => void | Promise<void>);
  interface TestEachable {
    (name: string, fn?: TestCallback, timeout?: number): void;
    each<T>(cases: readonly T[]): (name: string, fn?: (value: T) => void | Promise<void>) => void;
  }
  interface SuiteFn {
    (name: string, fn?: TestFn): void;
    skipIf(condition: boolean): (name: string, fn?: TestFn) => void;
  }

  interface FakeTimersConfig {
    loop?: 'legacy' | 'modern';
    toFake?: string[];
    advanceTimeTo?: number | string | Date;
  }

  interface WaitUntilOptions {
    timeout?: number;
    interval?: number;
  }

  interface MockUtils {
    fn(): Mock<(...args: unknown[]) => unknown>;
    fn<T extends AnyProcedure>(impl?: T): Mock<T>;
    mocked<T>(original: T): T extends AnyProcedure ? Mock<T> : T;
    mock(path: string, factory?: () => unknown, options?: { factory?: boolean }): void;
    unmock(path: string): void;
    hoisted<T>(factory: () => T): T;
    spyOn<
      T extends object,
      K extends { [P in keyof T]: T[P] extends AnyProcedure ? P : never }[keyof T],
    >(
      obj: T,
      methodKey: K,
    ): MockInstance<ArgsOf<T[K]>, RetOf<T[K]>> & T[K];
    clearAllMocks(): void;
    resetAllMocks(): void;
    restoreAllMocks(): void;
    useFakeTimers(config?: FakeTimersConfig | number | string | Date): void;
    useRealTimers(): void;
    advanceTimersByTime(ms: number): void;
    advanceTimersByTimeAsync(ms: number): Promise<void>;
    advanceTimers(ms: number): Promise<void>;
    runAllTimers(): void;
    runAllTimersAsync(): Promise<void>;
    runOnlyPendingTimers(): void;
    runOnlyPendingTimersAsync(): Promise<void>;
    setSystemTime(time?: number | string | Date): void;
    getSystemTime(): number;
    waitFor<T>(assertion: () => T | Promise<T>, options?: WaitUntilOptions): Promise<Awaited<T>>;
    stubGlobal(name: string | symbol, value: unknown): void;
    unstubAllGlobals(): void;
    stubEnv(name: string, value: string | undefined): void;
    unstubAllEnvs(): void;
  }

  export type { Mock, MockInstance, MockContext, MockResult };
  export const vitest: MockUtils;
  export const vi: MockUtils;
  export const expect: ExpectStatic;
  export const it: TestEachable;
  export const test: TestEachable;
  export const describe: SuiteFn;
  export const beforeAll: (fn: TestFn, timeout?: number) => void;
  export const beforeEach: (fn: TestFn, timeout?: number) => void;
  export const afterAll: (fn: TestFn, timeout?: number) => void;
  export const afterEach: (fn: TestFn, timeout?: number) => void;
}
