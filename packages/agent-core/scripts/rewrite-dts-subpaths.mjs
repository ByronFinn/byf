#!/usr/bin/env node
/**
 * Rewrite development-time `#/...` subpath imports that leaked into the bundled
 * `.d.mts` output of @byfriends/agent-core.
 *
 * Why this exists:
 *   Source files use `#/rpc`, `#/config`, ... via the package's `imports` map
 *   (`#/* -> ./src/*.ts`). `tsdown`'s runtime bundler rewrites those imports to
 *   relative paths inside `dist/*.mjs`, but its declaration emitter leaves the
 *   `#/...` specifiers untouched. Since `files: ["dist"]` excludes `src/` from
 *   the published tarball, those specifiers cannot resolve, so attw reports
 *   InternalResolutionError when it follows the entrypoint into the chunk.
 *
 * What this does:
 *   The dts bundler already inlined every referenced module into the chunk and
 *   declared it locally as `<Name>$<N>` (e.g. `interface Foo$1`). So each leaked
 *   `import { Foo } from "#/mod"` is fully redundant — the type exists locally.
 *   For every such import we:
 *     1. ensure the chunk exports the original name by appending
 *        `export { Foo$1 as Foo }` (only when not already exported under that
 *        name), and
 *     2. rewrite the import specifier to the chunk itself
 *        (`import { Foo } from "./<same-chunk>.mjs"`).
 *   No other tokens in the file change, so the public type surface is identical;
 *   consumers still import from the package entrypoints which contain no `#/`.
 *
 * Run after `tsdown` as part of the package build.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'dist');

const subpathImportRe = /^(\s*import\s+(?:type\s+)?\{[^}]*\}\s+from\s+)"#\/([^"]+)";\s*$/gm;
const exportListRe = /^export\s+\{([^}]*)\};\s*$/m;
// Local inlined definitions: `type Foo$1`, `interface Bar$2`, `class Baz$1`
const definitionRe =
  /^\s*(?:declare\s+)?(?:abstract\s+)?(?:type|interface|class|enum)\s+([A-Za-z_$][\w$]*)/gm;

async function listDtsFiles() {
  const entries = await readdir(distDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.d.mts'))
    .map((e) => path.join(distDir, e.name));
}

function collectDefinitions(content) {
  // baseName -> Set<suffix> where suffix is "" or "$1", "$2", ...
  const defs = new Map();
  let m;
  definitionRe.lastIndex = 0;
  while ((m = definitionRe.exec(content)) !== null) {
    const mm = m[1].match(/^([A-Za-z_$][\w$]*?)(\$\d+)?$/);
    if (!mm) continue;
    const base = mm[1];
    const suffix = mm[2] ?? '';
    if (!defs.has(base)) defs.set(base, new Set());
    defs.get(base).add(suffix);
  }
  return defs;
}

function collectExportedNames(exportClause) {
  const names = new Set();
  for (const part of exportClause.split(',')) {
    const seg = part.trim();
    if (!seg) continue;
    const asIdx = seg.lastIndexOf(' as ');
    names.add(asIdx >= 0 ? seg.slice(asIdx + 4).trim() : seg);
  }
  return names;
}

function pickDefinitionName(defs, base) {
  const suffixes = defs.get(base);
  if (!suffixes) return null;
  if (suffixes.has('$1')) return `${base}$1`;
  if (suffixes.has('')) return base;
  const nums = [...suffixes].filter((s) => s).map((s) => Number(s.slice(1)));
  return nums.length ? `${base}$${Math.min(...nums)}` : base;
}

async function rewrite() {
  const files = await listDtsFiles();
  if (files.length === 0) {
    console.log('rewrite-dts-subpaths: no .d.mts found, skipping');
    return;
  }

  let totalRewritten = 0;
  let hadError = false;

  for (const file of files) {
    let content = await readFile(file, 'utf8');
    const base = path.basename(file);
    const matches = [...content.matchAll(subpathImportRe)];
    if (matches.length === 0) continue;

    const defs = collectDefinitions(content);
    const exportMatch = content.match(exportListRe);
    const exportedNames = exportMatch ? collectExportedNames(exportMatch[1]) : new Set();

    // Names the chunk must additionally export so each leaked import can be
    // rewritten to a self-reference: originalName -> localDefinitionName.
    const toExport = new Map();
    const missing = [];

    for (const match of matches) {
      const [fullLine, prefix, subpathName] = match;
      const block = prefix.match(/\{([^}]*)\}/)[1];
      const names = block
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((b) => {
          const asIdx = b.lastIndexOf(' as ');
          return asIdx >= 0 ? b.slice(0, asIdx).trim() : b;
        });

      for (const name of names) {
        if (exportedNames.has(name)) continue; // already exported under this name
        if (toExport.has(name)) continue;
        const defName = pickDefinitionName(defs, name);
        if (!defName) {
          missing.push(`"#/${subpathName}" -> ${name}`);
          continue;
        }
        toExport.set(name, defName);
      }
    }

    if (missing.length > 0) {
      for (const m of missing) console.error(`  ✗ ${base}: no local definition for ${m}`);
      hadError = true;
    }

    // Rewrite each leaked import to a self-reference (same chunk).
    let rewritten = content;
    const selfPath = `./${base.replace(/\.d\.mts$/, '.mjs')}`;
    for (const match of matches) {
      const [fullLine, prefix] = match;
      const replacement = `${prefix}"${selfPath}";`;
      rewritten = rewritten.replace(fullLine, replacement);
      totalRewritten += 1;
    }

    // Append a supplementary export block for names the chunk doesn't already
    // export under their original form, so the self-referencing imports resolve.
    if (toExport.size > 0) {
      const entries = [...toExport.entries()]
        .filter(([name, def]) => name !== def)
        .map(([name, def]) => `${def} as ${name}`);
      if (entries.length > 0) {
        // Insert before the final `export { ... };` aggregate, or append at end.
        const exportClause = exportMatch ? exportMatch[0] : null;
        const newExport = `export { ${entries.join(', ')} };`;
        if (exportClause) {
          rewritten = rewritten.replace(exportClause, `${exportClause}\n${newExport}`);
        } else {
          rewritten = `${rewritten.trimEnd()}\n${newExport}\n`;
        }
      }
    }

    if (rewritten !== content) {
      await writeFile(file, rewritten, 'utf8');
      console.log(`  rewrote ${base} (self-referenced ${matches.length} import(s), added ${toExport.size} export(s))`);
    }
  }

  console.log(`rewrite-dts-subpaths: rewrote ${totalRewritten} import statement(s)`);
  if (hadError) process.exit(1);
}

rewrite().catch((error) => {
  console.error(error);
  process.exit(1);
});
