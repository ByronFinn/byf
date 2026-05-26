import { readConfigFile, writeConfigFile, type KimiConfig, type OAuthRef } from '@moonshot-ai/agent-core';
import {
  applyManagedKimiCodeConfig,
  applyManagedKimiCodeLogoutConfig,
  KIMI_CODE_PROVIDER_NAME,
  KimiOAuthToolkit,
  type AuthManagedUsageResult,
  type AuthStatus,
  type BearerTokenProvider,
  type FetchSubmitFeedbackResult,
  type KimiHostIdentity,
  type KimiOAuthLoginOptions,
  type ManagedKimiConfigShape,
  type OAuthRefreshOutcome,
} from '@moonshot-ai/kimi-code-oauth';

export interface KimiAuthSubmitFeedbackInput {
  readonly content: string;
  readonly sessionId: string;
  readonly version: string;
  readonly os: string;
  readonly model: string | null;
}

export type KimiAuthLoginOptions = Omit<KimiOAuthLoginOptions, 'provisionConfig'>;

export interface KimiAuthLoginResult {
  readonly providerName: string;
  readonly ok: true;
  readonly defaultModel: string;
  readonly defaultThinking: boolean;
  readonly configPath?: string | undefined;
}

export interface KimiAuthLogoutResult {
  readonly providerName: string;
  readonly ok: true;
}

export interface KimiAuthFacadeOptions {
  readonly homeDir: string;
  readonly configPath: string;
  readonly identity?: KimiHostIdentity | undefined;
  readonly onConfigUpdated?: ((config: KimiConfig) => void) | undefined;
  readonly onRefresh?: ((outcome: OAuthRefreshOutcome) => void) | undefined;
}

type SDKManagedConfig = KimiConfig & ManagedKimiConfigShape;

export class KimiAuthFacade {
  private readonly toolkit: KimiOAuthToolkit<SDKManagedConfig>;

  constructor(private readonly options: KimiAuthFacadeOptions) {
    this.toolkit = new KimiOAuthToolkit<SDKManagedConfig>({
      homeDir: options.homeDir,
      identity: options.identity,
      onRefresh: options.onRefresh,
      configAdapter: {
        configPath: options.configPath,
        read: () => readConfigFile(options.configPath) as SDKManagedConfig,
        write: async (config) => {
          await writeConfigFile(options.configPath, config);
        },
        apply: applyManagedKimiCodeConfig,
        remove: applyManagedKimiCodeLogoutConfig,
      },
    });
  }

  async status(providerName?: string | undefined): Promise<AuthStatus> {
    return this.toolkit.status(providerName);
  }

  async login(
    providerName: string | undefined = KIMI_CODE_PROVIDER_NAME,
    options: KimiAuthLoginOptions = {},
  ): Promise<KimiAuthLoginResult> {
    const result = await this.toolkit.login(providerName, { ...options, provisionConfig: true });
    if (result.provision === undefined) {
      throw new Error('Kimi auth login did not provision model config.');
    }
    const updated = readConfigFile(this.options.configPath);
    this.options.onConfigUpdated?.(updated);
    return {
      providerName: result.providerName,
      ok: true,
      defaultModel: result.provision.defaultModel,
      defaultThinking: result.provision.defaultThinking,
      configPath: result.provision.configPath,
    };
  }

  async logout(providerName?: string | undefined): Promise<KimiAuthLogoutResult> {
    const result = await this.toolkit.logout(providerName);
    const updated = readConfigFile(this.options.configPath);
    this.options.onConfigUpdated?.(updated);
    return {
      providerName: result.providerName,
      ok: result.ok,
    };
  }

  async getManagedUsage(providerName?: string | undefined): Promise<AuthManagedUsageResult> {
    return this.toolkit.getManagedUsage(providerName);
  }

  async submitFeedback(
    input: KimiAuthSubmitFeedbackInput,
    providerName?: string | undefined,
  ): Promise<FetchSubmitFeedbackResult> {
    return this.toolkit.submitFeedback(
      {
        session_id: input.sessionId,
        content: input.content,
        version: input.version,
        os: input.os,
        model: input.model,
      },
      providerName,
    );
  }

  async getCachedAccessToken(providerName?: string): Promise<string | undefined> {
    return this.toolkit.getCachedAccessToken(providerName);
  }

  readonly resolveOAuthTokenProvider = (
    providerName: string,
    oauthRef?: OAuthRef | undefined,
  ): BearerTokenProvider => {
    return this.toolkit.tokenProvider(providerName, oauthRef);
  };
}
