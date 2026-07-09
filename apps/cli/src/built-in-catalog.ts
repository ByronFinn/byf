// Filled by build define (`__BYF_CODE_BUILT_IN_CATALOG__`) in JS release builds.
// Compile release path injects via `globalThis.__BYF_COMPILE_CATALOG__` before
// main loads (see scripts/compile/build.mjs) — catalog is too large for
// `bun build --define` CLI args (ARG_MAX).
declare const __BYF_CODE_BUILT_IN_CATALOG__: string | undefined;

const COMPILE_CATALOG_KEY = '__BYF_COMPILE_CATALOG__';

function readBuiltInCatalogJson(): string | undefined {
  if (typeof __BYF_CODE_BUILT_IN_CATALOG__ === 'string') {
    return __BYF_CODE_BUILT_IN_CATALOG__;
  }
  try {
    const injected = (globalThis as Record<string, unknown>)[COMPILE_CATALOG_KEY];
    if (typeof injected === 'string' && injected.length > 0) return injected;
  } catch {
    // ignore
  }
  return undefined;
}

export const BUILT_IN_CATALOG_JSON: string | undefined = readBuiltInCatalogJson();
