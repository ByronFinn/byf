// 由 JS 发布构建中的 build define(`__BYF_CODE_BUILT_IN_CATALOG__`)填充。
// compile 发布路径在 main 加载前经 `globalThis.__BYF_COMPILE_CATALOG__`
// 注入(见 scripts/compile/build.mjs)——目录太大,不适合放进
// `bun build --define` CLI 参数(ARG_MAX)。
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
