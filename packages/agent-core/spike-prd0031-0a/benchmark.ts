// PROTOTYPE / SPIKE — PRD-0031 PR1-0a-spike runner. THROWAWAY.
//
// Run:          bun run spike-prd0031-0a            (full benchmark report)
//               bun run spike-prd0031-0a '<cmd>'    (parse one arbitrary command)
//
// Benchmarks ~35 real coding-scenario commands. Each is scored:
//   narrow          — concrete (op, path) extracted            (counts toward coverage)
//   broad           — op with path=any (build/test/network)    (counts, by design)
//   force-approval  — eval/source/interpreter -c: cannot statically resolve (by design)
//   missed          — static command the parser could NOT handle (GAP)
//
// GO gate (grill Q5): (narrow+broad+force-approval) / total >= 80% → GO.
// The interesting number is missed / total — the real gap.

import { parseCommand, type ParsedPath, type ParsedSubcommand } from './decompose';

interface BenchCase {
  cmd: string;
  scenario: string;
  /** expected verdict — marks what "correct" means for this case */
  expect: 'narrow' | 'broad' | 'force-approval';
  note?: string;
}

const BENCH: BenchCase[] = [
  // ── git (read) ──
  { cmd: 'git status', scenario: 'git status', expect: 'narrow' },
  { cmd: 'git status --short', scenario: 'git status --short', expect: 'narrow' },
  { cmd: 'git log --oneline -5', scenario: 'git log', expect: 'narrow' },
  { cmd: 'git diff HEAD~1 -- src/', scenario: 'git diff with path', expect: 'narrow' },
  { cmd: 'git show abc1234', scenario: 'git show', expect: 'narrow' },
  // ── git (write) ──
  { cmd: 'git add src/foo.ts', scenario: 'git add file', expect: 'narrow' },
  { cmd: 'git add -A', scenario: 'git add -A (no path)', expect: 'narrow' },
  { cmd: 'git commit -m "fix the bug"', scenario: 'git commit -m', expect: 'narrow' },
  { cmd: 'git push', scenario: 'git push', expect: 'narrow' },
  { cmd: 'git checkout -b feat/x', scenario: 'git checkout -b', expect: 'narrow' },
  // ── file read ──
  { cmd: 'cat .env', scenario: 'SENSITIVE: cat .env', expect: 'narrow' },
  { cmd: 'cat ~/.ssh/id_rsa', scenario: 'SENSITIVE: cat id_rsa', expect: 'narrow' },
  { cmd: 'head -n 20 README.md', scenario: 'head with flag', expect: 'narrow' },
  { cmd: 'tail -f logs/app.log', scenario: 'tail -f', expect: 'narrow' },
  // ── file write/delete ──
  { cmd: 'rm src/old.ts', scenario: 'rm file', expect: 'narrow' },
  { cmd: 'rm -rf dist/', scenario: 'rm -rf dir', expect: 'narrow' },
  { cmd: 'mv a.txt b.txt', scenario: 'mv (two paths)', expect: 'narrow' },
  { cmd: 'mkdir -p src/components', scenario: 'mkdir -p', expect: 'narrow' },
  { cmd: 'cp src/a.ts dest/b.ts', scenario: 'cp (two paths)', expect: 'narrow' },
  // ── build/test ──
  { cmd: 'bun test', scenario: 'bun test', expect: 'broad' },
  { cmd: 'bun install', scenario: 'bun install', expect: 'broad' },
  { cmd: 'npm test', scenario: 'npm test', expect: 'broad' },
  { cmd: 'cargo build', scenario: 'cargo build', expect: 'broad' },
  { cmd: 'bun test test/foo.test.ts', scenario: 'bun test <specific file>', expect: 'narrow' },
  // ── inspect/search ──
  { cmd: 'grep -r "TODO" src/', scenario: 'grep -r (path after pattern)', expect: 'narrow' },
  { cmd: 'grep "error" logs/app.log', scenario: 'grep pattern + file', expect: 'narrow' },
  { cmd: 'find . -name "*.ts"', scenario: 'find .', expect: 'narrow' },
  { cmd: 'ls -la src/', scenario: 'ls dir', expect: 'narrow' },
  // ── network ──
  { cmd: 'curl https://example.com/api', scenario: 'curl URL', expect: 'broad' },
  // ── compound / pipe / redirect ──
  { cmd: 'echo hi; rm x', scenario: 'COMPOUND: echo hi; rm x (PRD AC)', expect: 'narrow' },
  { cmd: 'cd src && git status', scenario: 'cd && git status', expect: 'narrow' },
  {
    cmd: 'cat file.txt | grep error',
    scenario: 'pipe: cat | grep (grep reads stdin — correct)',
    expect: 'broad',
  },
  { cmd: 'npm test 2>&1 | tail -20', scenario: 'pipe with redirect', expect: 'broad' },
  { cmd: 'echo "done" > result.txt', scenario: 'redirect write', expect: 'narrow' },
  { cmd: 'bun run build || echo "build failed"', scenario: '|| operator', expect: 'broad' },
  // ── glob ──
  { cmd: 'rm *.tmp', scenario: 'glob: rm *.tmp', expect: 'narrow' },
  // ── bash -c wrapper ──
  { cmd: 'bash -c "git status && git log"', scenario: 'bash -c wrapper', expect: 'narrow' },
  { cmd: 'sh -c "cat .env"', scenario: 'sh -c wrapper (SENSITIVE inner)', expect: 'narrow' },
  // ── interpreter (known bypass → force-approval) ──
  { cmd: 'python -c "print(1+1)"', scenario: 'python -c (known bypass)', expect: 'force-approval' },
  { cmd: 'node -e "console.log(1)"', scenario: 'node -e (known bypass)', expect: 'force-approval' },
  { cmd: 'python setup.py', scenario: 'python script', expect: 'narrow' },
  // ── indirect exec (force-approval by design) ──
  { cmd: 'eval "$CMD"', scenario: 'eval (force-approval)', expect: 'force-approval' },
  { cmd: 'source ./setup.sh', scenario: 'source (force-approval)', expect: 'force-approval' },
  { cmd: 'sudo rm /var/log/syslog', scenario: 'sudo rm', expect: 'narrow' },
];

function verdictOf(s: ParsedSubcommand): 'narrow' | 'broad' | 'force-approval' | 'missed' {
  return s.category;
}

function renderPaths(paths: readonly ParsedPath[]): string {
  if (paths.length === 0) return '—';
  return paths.map((p) => `${p.op}:${p.raw}${p.sensitive ? ' ⚠SENSITIVE' : ''}`).join(', ');
}

export function analyze(cmd: string): string[] {
  const r = parseCommand(cmd);
  const lines: string[] = [];
  for (const s of r.subcommands) {
    const cat = verdictOf(s);
    const icon =
      cat === 'narrow' ? '✓' : cat === 'broad' ? '◔' : cat === 'force-approval' ? '⛔' : '✗';
    lines.push(
      `    ${icon} [${cat}] ${s.verb}${s.gitSub ? ` ${s.gitSub}` : ''} → ${renderPaths(s.paths)}${s.note ? `  (${s.note})` : ''}`,
    );
  }
  lines.push(`    => ${r.fullyParseable ? 'FULLY PARSEABLE ✓' : 'NOT fully parseable ✗'}`);
  return lines;
}

function runBenchmark(): void {
  let narrow = 0,
    broad = 0,
    force = 0,
    missed = 0;
  const failLines: string[] = [];
  const lines: string[] = [];

  for (const c of BENCH) {
    const r = parseCommand(c.cmd);
    const cats = r.subcommands.map(verdictOf);
    const isMissed = cats.includes('missed');
    const isForce = cats.every((x) => x === 'force-approval');
    // compound command: narrow if ANY subcommand extracted resource access
    // (echo hi; rm x → rm is the point; echo being broad is correct)
    const isNarrow = !isMissed && !isForce && cats.includes('narrow');
    const isBroad = !isMissed && !isForce && !isNarrow;
    if (isMissed) missed++;
    else if (isForce) force++;
    else if (isBroad) broad++;
    else narrow++;

    const mark = isMissed ? '✗ MISSED' : isForce ? '⛔ force' : isBroad ? '◔ broad' : '✓ narrow';
    const ok =
      (!isMissed && c.expect === 'force-approval' && isForce) ||
      (!isMissed && c.expect === 'broad' && (isBroad || isNarrow)) ||
      (!isMissed && c.expect === 'narrow' && isNarrow);
    lines.push(`${ok ? 'PASS' : 'DIFF'} ${mark.padEnd(14)} | ${c.scenario.padEnd(34)} | ${c.cmd}`);
    for (const l of analyze(c.cmd)) lines.push(l);
    if (isMissed) failLines.push(`  ✗ ${c.cmd}  — ${c.scenario}`);
    if (!ok)
      failLines.push(
        `  ! expected ${c.expect}, got ${isMissed ? 'missed' : isForce ? 'force-approval' : isBroad ? 'broad' : 'narrow'}: ${c.cmd} — ${c.scenario}`,
      );
  }

  const total = BENCH.length;
  const covered = narrow + broad + force;
  const pct = ((covered / total) * 100).toFixed(1);
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  PRD-0031 PR1-0a-spike — shell-decompose coverage benchmark ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n${lines.join('\n')}`);
  console.log(`\n── summary (n=${total}) ──────────────────────────────────────────`);
  console.log(`  narrow:           ${String(narrow).padStart(2)}`);
  console.log(`  broad:            ${String(broad).padStart(2)}`);
  console.log(`  force-approval:   ${String(force).padStart(2)}`);
  console.log(`  missed (GAP):     ${String(missed).padStart(2)}`);
  console.log(`\n  covered = ${covered}/${total} = ${pct}%  (gate: ≥80% → GO)`);
  if (missed > 0) {
    console.log(`\n  gaps:`);
    for (const f of failLines.filter((l) => l.startsWith('  ✗'))) console.log(f);
  }
  if (failLines.some((l) => l.startsWith('  !'))) {
    console.log(`\n  unexpected verdicts:`);
    for (const f of failLines.filter((l) => l.startsWith('  !'))) console.log(f);
  }
  console.log(
    `\n${pct.startsWith('8') || pct.startsWith('9') || pct === '100.0' ? 'VERDICT: GO ✅ (≥80%)' : 'VERDICT: NO-GO ❌ (<80%) — re-evaluate (tree-sitter or accept + document)'}`,
  );
}

function main(): void {
  const single = process.argv[2];
  if (single) {
    console.log(`parse: ${single}\n`);
    for (const l of analyze(single)) console.log(l);
    // also surface sensitive hits
    const r = parseCommand(single);
    const hits = r.subcommands.flatMap((s) => s.paths).filter((p) => p.sensitive);
    if (hits.length > 0)
      console.log(
        `\n⚠ sensitive files: ${hits.map((p) => p.raw).join(', ')} → 硬拒 (PATH_SENSITIVE)`,
      );
    return;
  }
  runBenchmark();
}

main();
