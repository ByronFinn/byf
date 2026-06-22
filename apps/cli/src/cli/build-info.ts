declare const __BYF_CODE_VERSION__: string | undefined;
declare const __BYF_CODE_CHANNEL__: string | undefined;
declare const __BYF_CODE_COMMIT__: string | undefined;
declare const __BYF_CODE_BUILD_TARGET__: string | undefined;

export interface ByfBuildInfo {
  readonly version?: string;
  readonly channel?: string;
  readonly commit?: string;
  readonly buildTarget?: string;
}

function optionalBuildString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export const BYF_BUILD_INFO: ByfBuildInfo = {
  version:
    typeof __BYF_CODE_VERSION__ === 'string'
      ? optionalBuildString(__BYF_CODE_VERSION__)
      : undefined,
  channel:
    typeof __BYF_CODE_CHANNEL__ === 'string'
      ? optionalBuildString(__BYF_CODE_CHANNEL__)
      : undefined,
  commit:
    typeof __BYF_CODE_COMMIT__ === 'string' ? optionalBuildString(__BYF_CODE_COMMIT__) : undefined,
  buildTarget:
    typeof __BYF_CODE_BUILD_TARGET__ === 'string'
      ? optionalBuildString(__BYF_CODE_BUILD_TARGET__)
      : undefined,
};
