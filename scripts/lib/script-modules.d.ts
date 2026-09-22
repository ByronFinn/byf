/**
 * Ambient type surface for the untyped `.mjs` gate scripts under `scripts/lib/`
 * that their sibling `*.test.ts` files import directly.
 *
 * The scripts themselves are plain JS and `allowJs` is off for the test project,
 * so `tsc -p tsconfig.test.json` reports TS7016 on every one of these imports and
 * the whole file becomes `any` — which is the "被 cast 兜住的类型等于没有类型"
 * failure mode in a different spelling. `build/run-tests.mjs` really executes the
 * scripts tests in CI (`roots = ['packages','apps','scripts']`), so the surface
 * they type against is not optional.
 *
 * Same shape as the existing precedent, `apps/cli/test/helpers/build-scripts.d.ts`:
 * one wildcard module declaration per script, naming only the members tests use.
 * A pattern whose first characters are a star and a slash is what makes a
 * *relative* import (`'./check-app-layering.mjs'`) match an ambient declaration.
 *
 * Keep this surface small and honest. When a script changes an export, this file
 * must change in the same commit; `scripts/lib/script-modules.test.ts` is the
 * guard that makes an unnoticed rename loud instead of silently `undefined`.
 */

declare module '*/check-app-layering.mjs' {
  export interface AppFile {
    absolute: string;
    relative: string;
    scope: 'src' | 'test' | null;
  }

  export interface LayeringViolation extends AppFile {
    specifier: string;
    line: number;
    snippet: string;
    forbidden: string;
  }

  export interface LayeringException {
    file: string;
    specifier?: string;
    reason: string;
  }

  export interface LayeringResult {
    filesScanned: number;
    srcViolations: LayeringViolation[];
    testViolations: LayeringViolation[];
    exceptioned: LayeringViolation[];
    staleExceptions: string[];
    tableProblems: string[];
  }

  export const FORBIDDEN_PACKAGES: readonly string[];
  export const FORBIDDEN_RELATIVE_DIRS: readonly string[];
  export const LAYERING_EXCEPTIONS: readonly LayeringException[];
  export const APP_TEST_VIOLATION_BUDGET: number;

  export function collectAppFiles(repoRoot: string): Promise<AppFile[]>;
  /** All module specifiers a source text references, with line numbers. */
  export function extractSpecifiers(
    text: string,
  ): Array<{ specifier: string; line: number; snippet: string }>;
  export function classifySpecifier(
    specifier: string,
    fileAbsolute: string,
    repoRoot: string,
  ): string | null;
  export function findForbiddenImportsInText(
    text: string,
    file: { absolute: string; relative: string },
    repoRoot: string,
  ): LayeringViolation[];
  export function validateExceptionTable(exceptions: readonly LayeringException[]): string[];
  export function checkAppLayering(
    repoRoot: string,
    options?: { exceptions?: ReadonlyArray<LayeringException> },
  ): Promise<LayeringResult>;
}

declare module '*/check-agent-core-surface.mjs' {
  export interface BarrelNamedExport {
    from: string;
    name: string;
    aliased: boolean;
    typeOnly: boolean;
  }

  export interface ParsedBarrel {
    starFrom: string[];
    named: BarrelNamedExport[];
  }

  export interface Surface extends ParsedBarrel {
    nested: Record<string, ParsedBarrel>;
    unresolved: string[];
  }

  export interface SurfaceVerdict {
    ok: boolean;
    missing: string[];
    added: string[];
    detail: string[];
  }

  /**
   * What `compareSurface` really accepts. The diff reads `starFrom` / `named` off both
   * arguments and guards `nested` / `unresolved` with `?? {}` / `?? []`, because
   * comparing a freshly `parseBarrel`-ed barrel against the snapshot is a supported
   * call. Declaring both parameters as the full `Surface` claimed a requirement the
   * script never had.
   */
  export type SurfaceInput = ParsedBarrel & Partial<Surface>;

  /**
   * The document on disk at `SURFACE_SNAPSHOT_RELATIVE`, i.e. what
   * `snapshotDocument` writes and `readSnapshot` returns. It deliberately has no
   * `unresolved`: that field is a *current-tree* scanner diagnostic (an
   * unresolved star target must not degrade into "nothing to compare, gate
   * green"), and `compareSurface` only ever reads it off `current`. Pinning it
   * would record a transient scan state as an intended surface.
   */
  export interface SurfaceSnapshot {
    starFrom: string[];
    named: BarrelNamedExport[];
    nested: Record<string, ParsedBarrel>;
    note: string;
  }

  export const SURFACE_SNAPSHOT_RELATIVE: string;

  export function recursionTargets(barrel: ParsedBarrel): string[];
  export function parseBarrel(source: string): ParsedBarrel;
  export function moduleFile(repoRoot: string, specifier: string): string | null;
  export function readSnapshot(repoRoot: string): Promise<SurfaceSnapshot>;
  export function readBarrel(repoRoot: string): Promise<ParsedBarrel>;
  export function readSurface(repoRoot: string): Promise<Surface>;
  export function compareSurface(current: SurfaceInput, snapshot: SurfaceInput): SurfaceVerdict;
  export function snapshotDocument(surface: Surface): SurfaceSnapshot;
}

declare module '*/check-dependency-audit.mjs' {
  export interface LockedPackage {
    name: string;
    version: string;
    source: string;
  }

  export interface OsvAdvisory {
    id: string;
    aliases?: string[];
    severity?: unknown[];
    summary?: string;
    [key: string]: unknown;
  }

  export interface OsvResult {
    advisories: OsvAdvisory[];
    errors: number;
  }

  export interface OsvFetchResponse {
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }

  export interface OsvQueryOptions {
    /** The implementation's own default is `fetch`; tests pass a stub. */
    fetchImpl?: (url: string, init?: Record<string, unknown>) => Promise<OsvFetchResponse>;
    concurrency?: number;
    /** Injectable backoff (AC-5.2 retry tests assert the schedule, not wall clock). */
    sleep?: (ms: number) => Promise<void>;
  }

  export function parseLockfile(text: string): LockedPackage[];
  export function sourceHost(source: string): string | null;
  export function osvQuery(pkg: LockedPackage): unknown;
  export function queryOsv(
    locked: readonly LockedPackage[],
    options?: OsvQueryOptions,
  ): Promise<OsvResult>;
  export function advisoryKey(advisory: OsvAdvisory): string;
}

declare module '*/list-publishable-packages.mjs' {
  /** A package.json `exports` value: a target, a condition map, or a list of either. */
  export type ExportCondition =
    | string
    | ExportCondition[]
    | { [condition: string]: ExportCondition };

  /**
   * The part of a package.json `describePublishability` actually reads. Deliberately
   * closed (no index signature): a fixture that invents a field must not typecheck.
   */
  export interface PackageManifest {
    name?: string;
    version?: string;
    private?: boolean;
    files?: string[];
    scripts?: Record<string, string>;
    exports?: ExportCondition;
    /** Opaque on purpose: an empty object counts as "no intent", a non-object too. */
    publishConfig?: unknown;
  }

  export interface PublishabilityVerdict {
    publishable: boolean;
    reasons: string[];
  }

  /** What `listPublishablePackages` / `inspectPublishablePackages` really yield. */
  export interface IncludedPackage {
    name: string;
    path: string;
    version: string;
  }

  export interface PublishableReport {
    included: IncludedPackage[];
    excluded: Array<{ name: string; path: string; reasons: string[] }>;
  }

  export function describePublishability(manifest: PackageManifest): PublishabilityVerdict;
  export function listPublishablePackages(): Promise<IncludedPackage[]>;
  export function inspectPublishablePackages(): Promise<PublishableReport>;
}

declare module '*/publish-manifest.mjs' {
  export const PUBLISH_CONFIG_OVERLAY_KEYS: readonly string[];

  /** A `package.json` dependency section: package name → spec. */
  export type DependencySection = Record<string, string>;

  export interface PublishRewriteContext {
    packagesByName: Map<string, { version: string }>;
    catalog: Record<string, string>;
  }

  /**
   * The manifest the publish rewrite walks. Typed against the fields the script
   * reads and the tests read back — not `Record<string, any>`, which turned every
   * `result.dependencies`-style read into an untyped index access.
   */
  export interface Manifest {
    name?: string;
    version?: string;
    main?: string;
    dependencies?: DependencySection;
    peerDependencies?: DependencySection;
    optionalDependencies?: DependencySection;
    devDependencies?: DependencySection;
    /** Copied verbatim from `publishConfig`, so its shape is not this script's business. */
    exports?: unknown;
    /** Non-object values (even a bare string) are legal input: they mean "no overlay". */
    publishConfig?: unknown;
  }

  export function expandPublishConfig(manifest: Manifest): Manifest;
  export function rewriteDependencyProtocols(
    manifest: Manifest,
    ctx: PublishRewriteContext,
    options?: { includeDevDependencies?: boolean },
  ): Manifest;
  export function preparePublishManifest(manifest: Manifest, ctx: PublishRewriteContext): Manifest;
  export function loadPublishRewriteContext(rootDir: string): Promise<PublishRewriteContext>;
}
