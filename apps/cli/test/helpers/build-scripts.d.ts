/**
 * Ambient types for the untyped `.mjs` build scripts under `apps/cli/scripts/`
 * that tests (and `src/native/native-assets.ts`) import directly.
 *
 * The scripts themselves are plain JS (`allowJs` is off for the test project),
 * so `tsc -p tsconfig.test.json` reports TS7016 on every import. These
 * declarations mirror the actual runtime exports of each script; keep them in
 * sync when a script changes.
 */

declare module '*/scripts/native/exec.mjs' {
  import type { ExecFileOptions } from 'node:child_process';

  export interface ExecFileCommand {
    command: string;
    args: string[];
    options?: { windowsVerbatimArguments: boolean };
  }

  export function commandForExecFile(
    command: string,
    args: string[],
    platform?: string,
    env?: Record<string, string | undefined>,
  ): ExecFileCommand;

  export function fail(message: string): never;

  export function run(command: string, args: string[], options?: ExecFileOptions): Promise<void>;

  export function tryRun(command: string, args: string[], options?: ExecFileOptions): Promise<void>;
}

declare module '*/scripts/native/paths.mjs' {
  export const appRoot: string;

  export interface TargetTripleInput {
    platform?: string;
    arch?: string;
    env?: Record<string, string | undefined>;
  }

  export function targetTriple(input?: TargetTripleInput): string;
  export function executableName(platform?: string): string;
  export function nativeDistRoot(): string;
  export function nativeIntermediatesDir(): string;
  export function nativeBinDir(target?: string): string;
  export function nativeBinPath(target?: string, platform?: string): string;
  export function nativeManifestDir(target?: string): string;
  export function nativeArtifactsDir(): string;
  export function nativeSmokeHome(): string;
  export function nativeManifestKey(target?: string): string;
}

declare module '*/scripts/native/manifest.mjs' {
  export const NATIVE_ASSET_MANIFEST_VERSION: number;
  export function buildManifestKey(target: string): string;
  export function isManifestVersionSupported(version: number): boolean;
  export function buildAssetKey(target: string, packageRoot: string, relativePath: string): string;
}

declare module '*/scripts/native/native-deps.mjs' {
  export interface NativeDepDescriptor {
    readonly id: string;
    readonly name: (target: string) => string;
    readonly collect: 'js-only' | 'native-files' | 'js-and-native-file' | 'virtual';
    readonly parent: string | null;
    readonly nativeFileRelatives?: (target: string) => string[];
  }

  export interface ResolvedNativeDep {
    readonly id: string;
    readonly name: (target: string) => string;
    readonly collect: 'js-only' | 'native-files' | 'js-and-native-file' | 'virtual';
    readonly parent: string | null;
    readonly resolvedName: string;
    readonly nativeFileRelatives: string[];
    readonly parentName: string | null;
  }

  export const SUPPORTED_TARGETS: readonly string[];
  export const nativeDeps: readonly NativeDepDescriptor[];
  export function isSupportedTarget(target: string): boolean;
  export function resolveTargetDeps(target: string): ResolvedNativeDep[];
}

declare module '*/scripts/native/04-sign.mjs' {
  export interface CodesignArgsInput {
    identity: string;
    executable: string;
    entitlementsPath: string;
    keychainPath: string | null;
  }

  export function buildCodesignArgs(input: CodesignArgsInput): string[];
  export function runSignStep(input?: {
    identity?: string;
    keychainPath?: string | null;
  }): Promise<void>;
}

declare module '*/scripts/npm/platform-packages.mjs' {
  export interface PlatformPackage {
    packageName: string;
    target: string;
    os: string;
    cpu: string;
    subpath: string;
  }

  export const PLATFORM_PACKAGES: readonly PlatformPackage[];
  export function platformPackageForHost(opts?: {
    platform?: string;
    arch?: string;
  }): PlatformPackage | null;
  export function platformPackageForTarget(target: string): PlatformPackage | null;
  export function supportedPlatformSummary(): string;
  export function isCliPlatformPackageName(name: string): boolean;
}

declare module '*/scripts/built-in-catalog.mjs' {
  export const BUILT_IN_CATALOG_ENV: string;
  export const BUILT_IN_CATALOG_DEFINE: string;
  export function builtInCatalogDefine(env?: Record<string, string | undefined>): string;
}

declare module '*/scripts/compile/compile-entry-source.mjs' {
  export const CATALOG_GLOBAL_NAME: string;

  export interface CompileEntryInput {
    clipboardRelativeRequire: string;
    mainEntryPath: string;
    catalogInjectPath: string;
    assetSets: ReadonlyArray<{ entryPath: string | null; globalName: string }>;
  }

  export function buildCompileEntrySource(input: CompileEntryInput): string;
}
