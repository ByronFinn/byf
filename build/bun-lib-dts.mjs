#!/usr/bin/env bun
import { spawn } from 'node:child_process';
/**
 * Library type-declaration helper (ADR 0028 / PRD-0020 R18).
 *
 * `bun build` does not emit `.d.ts`, so declarations are produced by `tsc`
 * (`--emitDeclarationOnly`) and then post-processed to match the ESM
 * `publishConfig.exports` layout and Node16 resolution rules used by attw:
 *
 *   1. `tsc -p tsconfig.build.json` → tree of dist/ .d.ts files
 *   2. Rewrite package-internal `#/...` imports to relative paths (tsc leaves
 *      them as `#/` because they come from package `imports`; the published
 *      tarball has no `src/`, so those must not ship)
 *   3. Rename `*.d.ts` → `*.d.mts` so they line up with the `.mjs` JS entries
 *   4. Rewrite relative import/export specifiers to include the `.mjs`
 *      extension (required for Node16 resolution of `.d.mts` files)
 *
 * Usage: bun ../../build/bun-lib-dts.mjs
 *        (run from the package directory; expects tsconfig.build.json)
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const cwd = process.cwd();
const outDir = 'dist';
const outAbs = path.join(cwd, outDir);

const tsconfigPath = path.join(cwd, 'tsconfig.build.json');
if (!existsSync(tsconfigPath)) {
  console.error('bun-lib-dts: tsconfig.build.json not found in', cwd);
  process.exit(1);
}

// 1. Emit declarations via tsc.
await new Promise((resolve, reject) => {
  const child = spawn('bun', ['x', 'tsc', '-p', 'tsconfig.build.json'], {
    cwd,
    stdio: 'inherit',
  });
  child.on('close', (code) =>
    code === 0 ? resolve(undefined) : reject(new Error(`tsc exited ${code}`)),
  );
});

// 2. Rewrite `#/` imports to relative paths while files are still `.d.ts`.
const dtsFiles = await findFiles(outAbs, (name) => name.endsWith('.d.ts'));
let rewrittenHash = 0;
for (const file of dtsFiles) {
  const text = await readFile(file, 'utf8');
  const updated = rewriteHashImports(text, file, outAbs);
  if (updated.text !== text) {
    await writeFile(file, updated.text, 'utf8');
    rewrittenHash += updated.count;
  }
}

// 3. Rename *.d.ts → *.d.mts (and *.d.ts.map → *.d.mts.map if present).
let renamed = 0;
for (const file of await findFiles(
  outAbs,
  (name) => name.endsWith('.d.ts') || name.endsWith('.d.ts.map'),
)) {
  const target = file.endsWith('.d.ts.map')
    ? file.replace(/\.d\.ts\.map$/, '.d.mts.map')
    : file.replace(/\.d\.ts$/, '.d.mts');
  await rm(target, { force: true }).catch(() => {});
  await rename(file, target);
  renamed += 1;
}

// 4. Node16 requires relative import paths in .d.mts to carry a full extension.
let rewrittenRelative = 0;
for (const file of await findFiles(outAbs, (name) => name.endsWith('.d.mts'))) {
  const text = await readFile(file, 'utf8');
  const updated = rewriteRelativeSpecifiers(text, file);
  if (updated.text !== text) {
    await writeFile(file, updated.text, 'utf8');
    rewrittenRelative += updated.count;
  }
}

console.log(
  `bun-lib-dts: renamed ${renamed} declaration file(s), rewrote ${rewrittenHash} #/ import(s), ${rewrittenRelative} relative specifier(s)`,
);

/**
 * Rewrite every `"#/..."| '#/...'` specifier to a relative path from `fromFile`
 * into `distRoot`, matching the package `imports` resolution order:
 *   #/foo → dist/foo.d.ts  OR  dist/foo/index.d.ts
 */
function rewriteHashImports(text, fromFile, distRoot) {
  let count = 0;
  const next = text.replaceAll(/(["'])#\/([^"']+)\1/g, (match, quote, subpath) => {
    const resolved = resolveHashSubpath(distRoot, subpath);
    if (resolved === undefined) {
      throw new Error(`bun-lib-dts: cannot resolve ${match} from ${path.relative(cwd, fromFile)}`);
    }
    count += 1;
    // Emit extensionless for now; step 4 rewrites all relatives to `.mjs`.
    return `${quote}${relativeSpecifier(fromFile, resolved, false)}${quote}`;
  });
  return { text: next, count };
}

function rewriteRelativeSpecifiers(text, fromFile) {
  let count = 0;
  const next = text.replaceAll(/(["'])(\.[^'"]+)\1/g, (match, quote, spec) => {
    if (hasRuntimeExtension(spec)) return match;
    const resolved = resolveRelativeDts(fromFile, spec);
    if (resolved === undefined) {
      console.warn(
        `bun-lib-dts: unresolved relative specifier "${spec}" in ${path.relative(cwd, fromFile)} — left as-is`,
      );
      return match;
    }
    count += 1;
    return `${quote}${relativeSpecifier(fromFile, resolved, true)}${quote}`;
  });
  return { text: next, count };
}

function hasRuntimeExtension(spec) {
  return /\.(mjs|cjs|js|json|node|d\.mts|d\.ts)$/.test(spec);
}

function resolveHashSubpath(distRoot, subpath) {
  const direct = path.join(distRoot, `${subpath}.d.ts`);
  if (existsSync(direct)) return direct;
  const index = path.join(distRoot, subpath, 'index.d.ts');
  if (existsSync(index)) return index;
  const directMts = path.join(distRoot, `${subpath}.d.mts`);
  if (existsSync(directMts)) return directMts;
  const indexMts = path.join(distRoot, subpath, 'index.d.mts');
  if (existsSync(indexMts)) return indexMts;
  return undefined;
}

function resolveRelativeDts(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    `${base}.d.mts`,
    `${base}.d.ts`,
    path.join(base, 'index.d.mts'),
    path.join(base, 'index.d.ts'),
  ];
  for (const cand of candidates) {
    if (existsSync(cand)) return cand;
  }
  return undefined;
}

function relativeSpecifier(fromFile, toFile, withMjsExtension) {
  const fromDir = path.dirname(fromFile);
  const withoutExt = toFile.replace(/\.d\.mts$/, '').replace(/\.d\.ts$/, '');
  let relative = path.relative(fromDir, withoutExt).replaceAll(path.sep, '/');
  if (!relative.startsWith('.')) {
    relative = `./${relative}`;
  }
  return withMjsExtension ? `${relative}.mjs` : relative;
}

async function findFiles(dir, predicate) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await findFiles(full, predicate)));
    } else if (predicate(entry.name)) {
      out.push(full);
    }
  }
  return out;
}
