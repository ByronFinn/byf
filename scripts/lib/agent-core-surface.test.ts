import { describe, expect, it } from 'vitest';

import {
  compareSurface,
  parseBarrel,
  readBarrel,
  readSnapshot,
} from './check-agent-core-surface.mjs';

const REPO_ROOT = process.cwd();

describe('AC-2.4 agent-core published surface', () => {
  it('matches the reviewed snapshot — widening public API is an explicit edit', async () => {
    const current = await readBarrel(REPO_ROOT);
    const snapshot = await readSnapshot(REPO_ROOT);
    const result = compareSurface(current, snapshot);
    expect(
      result.detail,
      `agent-core's root barrel changed shape. Every name it forwards is published npm API, ` +
        `so this must be a reviewed decision: update scripts/lib/agent-core-surface.json ` +
        `intentionally (and treat removals as breaking).\n` +
        result.detail.map((d) => `  - ${d}`).join('\n'),
    ).toEqual([]);
  });

  it('records the star-exported modules that make whole surfaces public', async () => {
    const snapshot = await readSnapshot(REPO_ROOT);
    // Each entry here is a module whose entire export list is npm-visible.
    expect(snapshot.starFrom).toEqual([
      './agent',
      './config',
      './errors',
      './harness',
      './rpc',
      './session',
      './session/export',
    ]);
  });

  it('flags a newly star-exported module', () => {
    const snapshot = { starFrom: ['./agent'], named: [] };
    const current = { starFrom: ['./agent', './tools'], named: [] };
    const result = compareSurface(current, snapshot);
    expect(result.ok).toBe(false);
    expect(result.added).toEqual(['./tools']);
  });

  it('flags a removed named export as a breaking change, not as silence', () => {
    const snapshot = { starFrom: [], named: [{ from: './errors', name: 'ByfError' }] };
    const current = { starFrom: [], named: [] };
    const result = compareSurface(current, snapshot);
    expect(result.detail).toEqual(['removed named export ./errors#ByfError']);
  });
});

describe('AC-2.4 barrel parser', () => {
  it('ignores commented-out exports', () => {
    const parsed = parseBarrel(
      [
        "export * from './agent';",
        "// export * from './retired';",
        "/* export { Ghost } from './ghost'; */",
      ].join('\n'),
    );
    expect(parsed.starFrom).toEqual(['./agent']);
    expect(parsed.named).toEqual([]);
  });

  it('publishes the alias, not the original name', () => {
    const parsed = parseBarrel("export { startWebServer as startVisServer } from './x';");
    expect(parsed.named).toEqual([{ from: './x', name: 'startVisServer', aliased: true }]);
  });

  it('keeps local re-exports distinct from module re-exports', () => {
    const parsed = parseBarrel(['export { Foo };', "export { Bar } from './b';"].join('\n'));
    expect(parsed.named.map((n) => n.from)).toEqual(['./b', '(local)']);
  });
});
