import { CatalogFetchError, fetchCatalog, loadBuiltInCatalog, type Catalog } from '@byfriends/sdk';

export interface SpinnerHandle {
  stop(opts: { ok: boolean; label: string }): void;
}

export type CatalogFetchResult =
  | { readonly kind: 'catalog'; readonly catalog: Catalog }
  | { readonly kind: 'canceled' }
  | { readonly kind: 'unavailable' };

export const DEFAULT_CATALOG_FETCH_TIMEOUT_MS = 8_000;

export interface CatalogFetchOptions {
  readonly url: string;
  readonly allowBuiltInFallback: boolean;
  readonly builtInCatalogJson: string | undefined;
  readonly timeoutMs?: number;
  readonly reportUnavailable: boolean;
  showSpinner(label: string): SpinnerHandle;
  setCancelInFlight(cancel: (() => void) | undefined): void;
  clearCancelInFlight(cancel: () => void): void;
  showError(message: string): void;
}

/**
 * 带硬超时与取消进行中请求接线的 models.dev 目录获取,允许时回退到内置
 * 目录。/login(尽力增强,ADR 0012)与 /connect(目录是必需的,错误被
 * 呈现)共享。
 */
export async function fetchCatalogWithFallback(
  opts: CatalogFetchOptions,
): Promise<CatalogFetchResult> {
  const userAbort = new AbortController();
  const cancel = (): void => {
    userAbort.abort();
  };
  opts.setCancelInFlight(cancel);

  const combined = AbortSignal.any([
    userAbort.signal,
    AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_CATALOG_FETCH_TIMEOUT_MS),
  ]);
  const spinner = opts.showSpinner(`Fetching catalog from ${opts.url}`);
  try {
    const catalog = await fetchCatalog(opts.url, combined);
    spinner.stop({ ok: true, label: 'Catalog loaded.' });
    return { kind: 'catalog', catalog };
  } catch (error: unknown) {
    if (userAbort.signal.aborted) {
      spinner.stop({ ok: false, label: 'Aborted.' });
      return { kind: 'canceled' };
    }
    const hint = error instanceof CatalogFetchError ? ` (HTTP ${error.status})` : '';
    const reason = combined.aborted ? 'timed out' : formatErrorMessage(error);
    const fallback = loadBuiltInCatalog(opts.builtInCatalogJson);
    if (opts.allowBuiltInFallback && fallback !== undefined) {
      spinner.stop({ ok: true, label: 'Using built-in catalog (offline mode).' });
      return { kind: 'catalog', catalog: fallback };
    }
    spinner.stop({ ok: false, label: 'Failed to load catalog.' });
    if (opts.reportUnavailable) {
      opts.showError(`Failed to fetch catalog${hint}: ${reason}`);
    }
    return { kind: 'unavailable' };
  } finally {
    opts.clearCancelInFlight(cancel);
  }
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
