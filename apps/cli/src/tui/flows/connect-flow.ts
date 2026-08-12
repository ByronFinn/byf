import type { ByfConfig, ByfConfigPatch, Catalog, CatalogModel } from '@byfriends/sdk';
import {
  applyCatalogProvider,
  catalogBaseUrl,
  catalogProviderModels,
  inferWireType,
  loadBuiltInCatalog,
} from '@byfriends/sdk';

import {
  promptProviderSelection as promptProviderSelectionViaHost,
  promptModelSelectionForCatalog as promptModelSelectionViaHost,
  promptApiKey as promptApiKeyViaHost,
} from '#/tui/flows/dialog-prompts';
import type { ColorPalette } from '#/tui/theme/colors';
import type { DialogHost, ThinkingEffortLevel } from '#/tui/types';
import { fetchCatalogWithFallback, type SpinnerHandle } from '#/tui/utils/catalog-fetch';
import { resolveConnectCatalogRequest } from '#/tui/utils/connect-catalog';

export interface ModelSelection {
  model: CatalogModel;
  thinkingEffort: ThinkingEffortLevel;
}

export type { SpinnerHandle } from '#/tui/utils/catalog-fetch';

export interface ConnectFlowDeps {
  readonly builtInCatalogJson: string | undefined;
  readonly catalogFetchTimeoutMs?: number;
  readonly dialogHost: DialogHost;
  readonly colors: ColorPalette;
  getConfig(): Promise<ByfConfig>;
  setConfig(config: ByfConfigPatch): Promise<unknown>;
  removeProvider(providerId: string): Promise<unknown>;
  refreshConfigAfterLogin(): Promise<void>;
  showStatus(message: string, color?: string): void;
  showError(message: string): void;
  showSpinner(label: string): SpinnerHandle;
  setCancelInFlight(cancel: (() => void) | undefined): void;
  clearCancelInFlight(cancel: () => void): void;
  track(event: string, properties?: Record<string, string | number | boolean | null>): void;
}

export class ConnectFlow {
  constructor(private readonly deps: ConnectFlowDeps) {}

  async run(args: string): Promise<void> {
    const resolution = resolveConnectCatalogRequest(args);
    if (resolution.kind === 'error') {
      this.deps.showError(resolution.message);
      return;
    }
    const { url, preferBuiltIn, allowBuiltInFallback } = resolution.request;

    let catalog: Catalog | undefined;

    if (preferBuiltIn) {
      const builtIn = loadBuiltInCatalog(this.deps.builtInCatalogJson);
      if (builtIn !== undefined) {
        this.deps.showStatus('Loaded built-in catalog. Run /connect refresh for the latest.');
        catalog = builtIn;
      }
    }

    if (catalog === undefined) {
      const result = await fetchCatalogWithFallback({
        url,
        allowBuiltInFallback,
        builtInCatalogJson: this.deps.builtInCatalogJson,
        timeoutMs: this.deps.catalogFetchTimeoutMs,
        reportUnavailable: true, // the catalog is essential for /connect; surface failures
        showSpinner: (label) => {
          return this.deps.showSpinner(label);
        },
        setCancelInFlight: (cancel) => {
          this.deps.setCancelInFlight(cancel);
        },
        clearCancelInFlight: (cancel) => {
          this.deps.clearCancelInFlight(cancel);
        },
        showError: (msg) => {
          this.deps.showError(msg);
        },
      });
      if (result.kind !== 'catalog') return;
      catalog = result.catalog;
    }

    const providerId = await promptProviderSelectionViaHost(
      this.deps.dialogHost,
      this.deps.colors,
      catalog,
      (msg) => {
        this.deps.showError(msg);
      },
    );
    if (providerId === undefined) return;
    const entry = catalog[providerId];
    if (entry === undefined) return;

    const models = catalogProviderModels(entry);
    if (models.length === 0) {
      this.deps.showError(`Provider "${providerId}" has no usable models in this catalog.`);
      return;
    }

    const selection = await promptModelSelectionViaHost(
      this.deps.dialogHost,
      this.deps.colors,
      providerId,
      models,
    );
    if (selection === undefined) return;

    const apiKey = await promptApiKeyViaHost(
      this.deps.dialogHost,
      this.deps.colors,
      entry.name ?? providerId,
    );
    if (apiKey === undefined) return;

    const wire = inferWireType(entry);
    if (wire === undefined) return;
    const baseUrl = catalogBaseUrl(entry, wire);

    const existingConfig = await this.deps.getConfig();
    if (existingConfig.providers[providerId] !== undefined) {
      await this.deps.removeProvider(providerId);
    }

    const config = await this.deps.getConfig();
    applyCatalogProvider(config, {
      providerId,
      wire,
      baseUrl,
      apiKey,
      models,
      selectedModelId: selection.model.id,
      thinking: selection.thinkingEffort !== 'off',
    });

    await this.deps.setConfig({
      providers: config.providers,
      models: config.models,
      defaultModel: config.defaultModel,
      defaultThinking: config.defaultThinking,
    });

    await this.deps.refreshConfigAfterLogin();
    this.deps.track('connect', { provider: providerId, model: selection.model.id });
    this.deps.showStatus(`Connected: ${entry.name ?? providerId} · ${selection.model.id}`);
  }
}
