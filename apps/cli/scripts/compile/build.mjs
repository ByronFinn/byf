#!/usr/bin/env bun
import { readdir, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
/**
 * Official native binary path: `bun build --compile` (PRD-0020 / #219–#221).
 *
 * Release path for MVP platforms:
 *   - darwin-arm64
 *   - linux-x64
 *
 * Output layout under dist-native/; package.mjs / smoke.mjs / sign / verify
 * under scripts/native/ are shared helpers (not a Node SEA pipeline).
 *
 * Clipboard N-API: Bun only embeds `.node` when the path is statically
 * `require()`d. We generate a thin entry that requires the target platform
 * `.node`, sets `NAPI_RS_NATIVE_LIBRARY_PATH` (napi-rs host loader hook), then
 * imports `src/main.ts`.
 *
 * Usage:
 *   bun scripts/compile/build.mjs --profile=local
 *   bun scripts/compile/build.mjs --profile=release
 *
 * Env:
 *   BYF_CODE_BUILD_TARGET   e.g. darwin-arm64 (default: host platform-arch)
 *   BYF_CODE_CHANNEL        optional channel define
 *   BYF_CODE_COMMIT         optional commit define
 *   BYF_CODE_BUILT_IN_CATALOG_FILE  catalog JSON path (release auto-generates)
 *   APPLE_SIGNING_IDENTITY  codesign identity (release darwin; default ad-hoc '-')
 *   APPLE_KEYCHAIN_PATH     optional keychain for identity
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { BUILT_IN_CATALOG_DEFINE, BUILT_IN_CATALOG_ENV } from '../built-in-catalog.mjs';
import { runSignStep } from '../native/04-sign.mjs';
import { runVerifyStep } from '../native/05-verify.mjs';
import { run } from '../native/exec.mjs';
import { resolveTargetDeps } from '../native/native-deps.mjs';
import {
  appRoot,
  executableName,
  nativeBinDir,
  nativeBinPath,
  nativeIntermediatesDir,
  targetTriple,
} from '../native/paths.mjs';

/** Built SPA assets shipped inside `@byfriends/vis-server`'s `dist/public`. */
const visServerPublicDir = resolve(appRoot, '../../apps/vis/server/dist/public');

/** MVP platforms only (#219). Expand with later follow-ups if needed. */
const MVP_BUN_TARGETS = Object.freeze({
  'darwin-arm64': 'bun-darwin-arm64',
  'linux-x64': 'bun-linux-x64',
});

/**
 * napi-rs optional package → expected `.node` basename (relative to package root).
 * Mirrors `@mariozechner/clipboard` platform packages used by native-deps.
 */
const CLIPBOARD_NODE_BASENAME = Object.freeze({
  'darwin-arm64': 'clipboard.darwin-arm64.node',
  'linux-x64': 'clipboard.linux-x64-gnu.node',
});

const { values } = parseArgs({
  options: {
    profile: { type: 'string', default: 'local' },
  },
});

const profile = values.profile;
if (!['local', 'release'].includes(profile)) {
  console.error(`Unknown profile: ${profile}. Expected 'local' or 'release'.`);
  process.exit(1);
}

function resolveBunTarget(target) {
  const bunTarget = MVP_BUN_TARGETS[target];
  if (bunTarget === undefined) {
    console.error(
      `Compile MVP supports only: ${Object.keys(MVP_BUN_TARGETS).join(', ')}. Got: ${target}. ` +
        `Other platforms are deferred (PRD-0020).`,
    );
    process.exit(1);
  }
  return bunTarget;
}

async function ensureReleaseCatalog() {
  if (process.env[BUILT_IN_CATALOG_ENV] !== undefined) return;
  const catalogPath = resolve(nativeIntermediatesDir(), 'built-in-catalog.json');
  await mkdir(dirname(catalogPath), { recursive: true });
  await run(process.execPath, [
    resolve(appRoot, 'scripts/update-catalog.mjs'),
    '--out',
    catalogPath,
  ]);
  process.env[BUILT_IN_CATALOG_ENV] = catalogPath;
}

async function readPackageVersion() {
  const pkg = JSON.parse(await readFile(resolve(appRoot, 'package.json'), 'utf-8'));
  return pkg.version;
}

/**
 * Resolve the absolute path of the platform clipboard `.node` so Bun can embed it.
 * Must be resolvable on the build host (CI builds host==target for MVP matrix).
 */
function resolveClipboardNodePath(target) {
  const deps = resolveTargetDeps(target);
  const hostName = deps.find((dep) => dep.id === 'clipboard-host')?.resolvedName;
  const clipboardPackage = deps.find((dep) => dep.id === 'clipboard-target')?.resolvedName;
  const basename = CLIPBOARD_NODE_BASENAME[target];
  if (hostName === undefined || clipboardPackage === undefined || basename === undefined) {
    throw new Error(`No clipboard native mapping for target ${target}`);
  }

  // Isolated linker: platform optionalDeps are nested under the host package,
  // not hoisted to apps/cli. Resolve host first, then the platform package.
  const requireFromApp = createRequire(join(appRoot, 'package.json'));
  let hostRoot;
  try {
    hostRoot = dirname(requireFromApp.resolve(`${hostName}/package.json`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot resolve ${hostName} from apps/cli. Is @mariozechner/clipboard installed?\n${message}`,
    );
  }

  const requireFromHost = createRequire(join(hostRoot, 'package.json'));
  let packageRoot;
  try {
    packageRoot = dirname(requireFromHost.resolve(`${clipboardPackage}/package.json`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot resolve ${clipboardPackage} for target ${target} under ${hostName}. ` +
        `Install optional native deps on the build host (CI matrix builds host==target).\n${message}`,
    );
  }

  return join(packageRoot, basename);
}

/**
 * Catalog JSON is ~1MB+ — too large for `bun build --define` argv (ARG_MAX).
 * Inline the string into a generated module (file-based; no argv limit).
 * Entry stashes it on globalThis before dynamically importing main.
 */
async function writeCatalogInjectModule(catalogFilePath, outPath) {
  if (catalogFilePath === null) {
    await writeFile(
      outPath,
      `/** AUTO-GENERATED — no catalog for this build. */\nexport default undefined;\n`,
      'utf-8',
    );
    return;
  }
  const catalogText = await readFile(catalogFilePath, 'utf-8');
  await writeFile(
    outPath,
    `/**
 * AUTO-GENERATED by scripts/compile/build.mjs — do not edit.
 * Embeds built-in catalog JSON for release compile binaries.
 */
export default ${JSON.stringify(catalogText)};
`,
    'utf-8',
  );
}

/**
 * Recursively collect files under `dir`, returning `[posixRelativePath, absPath]`
 * pairs. The relative key is what the server uses to match request paths
 * (e.g. `index.html`, `assets/index-Abc.js`).
 */
async function collectPublicFiles(dir) {
  const out = [];
  async function walk(d, prefix) {
    const entries = await readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      const rel = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(join(d, entry.name), rel);
      } else if (entry.isFile()) {
        out.push([rel, join(d, entry.name)]);
      }
    }
  }
  await walk(dir, '');
  out.sort((a, b) => a[0].localeCompare(b[0]));
  return out;
}

/**
 * Generate a module that statically imports every SPA asset with
 * `with { type: "file" }` so `bun build --compile` embeds them into the binary,
 * and exports a `Map<relativePath, embeddedVirtualPath>`.
 *
 * At runtime each value is a string like `/$bunfs/root/<name>.<ext>`; the server
 * wraps it with `Bun.file()` to read the embedded bytes. Returns `null` when the
 * SPA bundle is absent (dev builds) so the caller can skip embedding.
 */
async function writeEmbeddedAssetsEntry(publicDir, outPath) {
  let exists = true;
  try {
    const s = await stat(publicDir);
    exists = s.isDirectory();
  } catch {
    exists = false;
  }
  if (!exists) return null;

  const files = await collectPublicFiles(publicDir);
  if (files.length === 0) return null;

  const importLines = [];
  const mapEntries = [];
  files.forEach(([rel, abs], i) => {
    const ident = `asset_${i}`;
    // Absolute paths keep the bundler resolution static regardless of cwd.
    importLines.push(`import ${ident} from ${JSON.stringify(abs)} with { type: "file" };`);
    mapEntries.push(`  [${JSON.stringify(rel)}, ${ident}],`);
  });

  const source = `/**
 * AUTO-GENERATED by scripts/compile/build.mjs — do not edit.
 * Statically imports every SPA asset so \`bun build --compile\` embeds them.
 * Values are embedded virtual paths (e.g. /$bunfs/root/<name>.<ext>); wrap with
 * Bun.file() at runtime to read the bytes.
 */
${importLines.join('\n')}

export const embeddedAssets: Map<string, string> = new Map([
${mapEntries.join('\n')}
]);
`;
  await writeFile(outPath, source, 'utf-8');
  return outPath;
}

/**
 * Thin entry: embed `.node`, set napi-rs env hook, inject catalog, boot CLI.
 * Generated into intermediates so paths stay absolute and static for the bundler.
 */
async function writeCompileEntry({
  clipboardNodePath,
  mainEntryPath,
  catalogInjectPath,
  assetsEntryPath,
  outPath,
}) {
  // main.ts only auto-starts when import.meta.main — true for a direct entry,
  // false when imported as a dependency. Call main() explicitly.
  // Catalog must be on globalThis *before* main's module graph evaluates
  // built-in-catalog.ts, so use dynamic import after the assignment.
  const assetsImport =
    assetsEntryPath === null
      ? ''
      : `\nimport { embeddedAssets } from ${JSON.stringify(assetsEntryPath)};`;
  const assetsAssign =
    assetsEntryPath === null
      ? ''
      : `\n(globalThis as Record<string, unknown>).__BYF_VIS_EMBEDDED_ASSETS__ = embeddedAssets;`;
  const source = `/**
 * AUTO-GENERATED by scripts/compile/build.mjs — do not edit.
 * Embeds the platform clipboard N-API addon and boots src/main.ts.
 */
import { createRequire } from 'node:module';
import catalogJson from ${JSON.stringify(catalogInjectPath)};${assetsImport}

const require = createRequire(import.meta.url);
const clipboardNodePath = ${JSON.stringify(clipboardNodePath)};

// Force Bun to embed this .node into the standalone binary.
require(clipboardNodePath);
// napi-rs host package (@mariozechner/clipboard) checks this env first.
process.env.NAPI_RS_NATIVE_LIBRARY_PATH = clipboardNodePath;

if (typeof catalogJson === 'string' && catalogJson.length > 0) {
  (globalThis as Record<string, unknown>).__BYF_COMPILE_CATALOG__ = catalogJson;
}${assetsAssign}

const { main } = await import(${JSON.stringify(mainEntryPath)});
main();
`;
  await writeFile(outPath, source, 'utf-8');
}

function buildDefines({ version, target }) {
  // Do NOT put the catalog on --define: release catalog exceeds OS ARG_MAX.
  // Catalog is embedded via catalog-inject.ts + globalThis (see writeCompileEntry).
  return {
    [BUILT_IN_CATALOG_DEFINE]: 'undefined',
    __BYF_CODE_VERSION__: JSON.stringify(version),
    __BYF_CODE_CHANNEL__: JSON.stringify(process.env.BYF_CODE_CHANNEL ?? ''),
    __BYF_CODE_COMMIT__: JSON.stringify(process.env.BYF_CODE_COMMIT ?? ''),
    __BYF_CODE_BUILD_TARGET__: JSON.stringify(target),
    // Marks native distribution binary for runtime native-module paths.
    __BYF_CODE_NATIVE_BUNDLE__: 'true',
  };
}

async function runCompile({ bunTarget, outfile, defines, entryPath }) {
  const args = [
    'build',
    '--compile',
    `--target=${bunTarget}`,
    `--outfile=${outfile}`,
    // Avoid host .env leaking into release/smoke (e.g. BYF_CODE_NATIVE_ASSET_SMOKE).
    '--no-compile-autoload-dotenv',
    ...(profile === 'release' ? ['--minify'] : []),
  ];

  for (const [key, value] of Object.entries(defines)) {
    args.push(`--define=${key}=${value}`);
  }

  args.push(entryPath);

  console.log(`==> bun ${args.join(' ')}`);
  await run('bun', args, { cwd: appRoot });
}

const target = targetTriple();
const bunTarget = resolveBunTarget(target);
const outfile = nativeBinPath(target);
const binDir = nativeBinDir(target);
const intermediates = nativeIntermediatesDir();
const compileEntryPath = resolve(intermediates, 'compile-entry.ts');
const mainEntryPath = resolve(appRoot, 'src/main.ts');

console.log(`==> Compile native build (profile=${profile}, target=${target}, bun=${bunTarget})`);

if (profile === 'release') {
  await ensureReleaseCatalog();
}

const version = await readPackageVersion();
const defines = buildDefines({ version, target });
const clipboardNodePath = resolveClipboardNodePath(target);
console.log(`==> Clipboard native: ${clipboardNodePath}`);

const catalogFile =
  process.env[BUILT_IN_CATALOG_ENV] !== undefined && process.env[BUILT_IN_CATALOG_ENV].length > 0
    ? process.env[BUILT_IN_CATALOG_ENV]
    : null;
if (catalogFile !== null) {
  console.log(`==> Built-in catalog: ${catalogFile}`);
}

const catalogInjectPath = resolve(intermediates, 'catalog-inject.ts');
const assetsEntryPath = resolve(intermediates, 'vis-embedded-assets.ts');

await mkdir(binDir, { recursive: true });
await mkdir(intermediates, { recursive: true });
await writeCatalogInjectModule(catalogFile, catalogInjectPath);
// Embed the vis SPA assets so `byf vis` can serve the UI from the native binary.
const embeddedAssetsPath = await writeEmbeddedAssetsEntry(visServerPublicDir, assetsEntryPath);
if (embeddedAssetsPath !== null) {
  console.log(`==> Embedded vis SPA assets from ${visServerPublicDir}`);
} else {
  console.log(`==> vis SPA assets not found at ${visServerPublicDir} (byf vis will be API-only)`);
}
await writeCompileEntry({
  clipboardNodePath,
  mainEntryPath,
  catalogInjectPath,
  assetsEntryPath: embeddedAssetsPath,
  outPath: compileEntryPath,
});
await rm(outfile, { force: true });

await runCompile({ bunTarget, outfile, defines, entryPath: compileEntryPath });

if (process.platform !== 'win32') {
  await run('chmod', ['+x', outfile]);
}

const identity = profile === 'release' ? (process.env.APPLE_SIGNING_IDENTITY ?? '-') : '-';
const keychainPath = profile === 'release' ? (process.env.APPLE_KEYCHAIN_PATH ?? null) : null;
await runSignStep({ identity, keychainPath });
await runVerifyStep({ requireGatekeeper: false });

console.log(`==> Compile complete: ${outfile} (${executableName()})`);
