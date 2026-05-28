import { readConfigFile, writeConfigFile, type ByfConfig } from '@byf/agent-core';

export interface AuthProviderStatus {
  readonly providerName: string;
  readonly hasConfig: boolean;
}

export interface AuthStatus {
  readonly providers: readonly AuthProviderStatus[];
}

export interface ByfAuthFacadeOptions {
  readonly homeDir: string;
  readonly configPath: string;
  readonly onConfigUpdated?: ((config: ByfConfig) => void) | undefined;
}

export class ByfAuthFacade {
  constructor(private readonly options: ByfAuthFacadeOptions) {}

  async status(providerName: string): Promise<AuthStatus> {
    const config = readConfigFile(this.options.configPath);
    const provider = config.providers[providerName];
    const hasConfig = provider !== undefined;
    return {
      providers: [{ providerName, hasConfig }],
    };
  }

  async removeProvider(providerName: string): Promise<void> {
    const config = readConfigFile(this.options.configPath);
    delete config.providers[providerName];

    const models = config.models ?? {};
    for (const [key, model] of Object.entries(models)) {
      if (model?.provider === providerName) {
        delete models[key];
      }
    }

    if (config.defaultModel !== undefined) {
      const defaultModel = models[config.defaultModel];
      if (defaultModel === undefined) {
        config.defaultModel = undefined;
      }
    }

    await writeConfigFile(this.options.configPath, config);
    const updated = readConfigFile(this.options.configPath);
    this.options.onConfigUpdated?.(updated);
  }
}
