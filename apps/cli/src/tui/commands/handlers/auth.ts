// Auth slash commands: login / logout / connect.
// Calls flows/login-flow.ts and flows/connect-flow.ts directly (PRD-0021 AC15).

import { applyProviderConfig, fetchModelsByType } from '@byfriends/sdk';

import { ConnectFlow } from '#/tui/flows/connect-flow';
import { promptConfiguredProviderSelection } from '#/tui/flows/dialog-prompts';
import { LoginFlow } from '#/tui/flows/login-flow';

import type { SlashCommandHandler } from '../handler-registry';
import type { SlashCommandHost } from './slash-host';

export function createAuthHandlers(
  host: SlashCommandHost,
): Record<'login' | 'logout' | 'connect', SlashCommandHandler> {
  return {
    login: async () => {
      const flow = new LoginFlow({
        colors: host.getThemeColors(),
        dialogHost: host.dialogHost,
        getConfig: () => host.getConfig(),
        setConfig: (cfg) => host.setConfig(cfg),
        fetchModels: (type, baseUrl, apiKey) => fetchModelsByType(type, baseUrl, apiKey),
        applyProviderConfig,
        refreshConfigAfterLogin: () => host.refreshConfigAfterLogin(),
        showStatus: (msg, color?) => {
          host.showStatus(msg, color);
        },
        showError: (msg) => {
          host.showError(msg);
        },
        showLoginProgressSpinner: (label) => host.showLoginProgressSpinner(label),
        track: (event, props?) => {
          host.track(event, props);
        },
        builtInCatalogJson: host.getBuiltInCatalogJson(),
      });
      await flow.run();
    },

    logout: async () => {
      const config = await host.getConfig();
      const providerName = await promptConfiguredProviderSelection(
        host.dialogHost,
        host.getThemeColors(),
        config,
        (msg) => {
          host.showError(msg);
        },
      );
      if (providerName === undefined) {
        return;
      }

      const app = host.getAppState();
      const activeProvider = app.availableModels[app.model]?.provider;
      const wasActiveModel = activeProvider === providerName;

      await host.removeProvider(providerName);
      await host.refreshConfigAfterLogin();

      if (wasActiveModel) {
        host.setAppState({ model: '', maxContextTokens: 0 });
      }

      host.showStatus(`Provider "${providerName}" removed.`, host.getThemeColors().success);

      if (wasActiveModel) {
        host.showStatus('No active model. Run /login or /connect to configure a provider.');
      }
    },

    connect: async (args) => {
      const flow = new ConnectFlow({
        builtInCatalogJson: host.getBuiltInCatalogJson(),
        colors: host.getThemeColors(),
        dialogHost: host.dialogHost,
        getConfig: () => host.getConfig(),
        setConfig: (cfg) => host.setConfig(cfg),
        removeProvider: (id) => host.removeProvider(id),
        refreshConfigAfterLogin: () => host.refreshConfigAfterLogin(),
        showStatus: (msg, color?) => {
          host.showStatus(msg, color);
        },
        showError: (msg) => {
          host.showError(msg);
        },
        showSpinner: (label) => host.showLoginProgressSpinner(label),
        setCancelInFlight: (cancel) => {
          host.setCancelInFlight(cancel);
        },
        clearCancelInFlight: (cancel) => {
          host.clearCancelInFlight(cancel);
        },
        track: (event, props?) => {
          host.track(event, props);
        },
      });
      await flow.run(args);
    },
  };
}
