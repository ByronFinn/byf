import type { Kaos } from '@byfriends/kaos';
import { describe, expect, it } from 'vitest';

import { DirectoryTreeInjector } from '../../../src/agent/injection/directory-tree';
import { testAgent } from '../harness/agent';
import { createFakeKaos } from '../../tools/fixtures/fake-kaos';

describe('DirectoryTreeInjector', () => {
  it('injects a directory tree on first call', async () => {
    const kaos = createFakeKaos({
      getcwd: () => '/w',
      iterdir: async function* (p: string) {
        if (p === '/w') {
          yield '/w/src';
          yield '/w/README.md';
        } else if (p === '/w/src') {
          yield '/w/src/index.ts';
        }
      } as unknown as Kaos['iterdir'],
      stat: (async (p: string) => ({
        stMode: p.endsWith('src') ? 0o040_755 : 0o100_644,
        stIno: 1,
        stDev: 1,
        stNlink: 1,
        stUid: 0,
        stGid: 0,
        stSize: 1,
        stAtime: 0,
        stMtime: 0,
        stCtime: 0,
      })) as unknown as Kaos['stat'],
    });

    const ctx = testAgent({ kaos });
    ctx.configure();
    ctx.agent.config.update({ cwd: '/w' });
    const injector = new DirectoryTreeInjector(ctx.agent);

    const injection = await injector['getInjection']();

    expect(injection).toBeDefined();
    expect(injection).toContain('src/');
    expect(injection).toContain('README.md');
    expect(injection).toContain('index.ts');
  });

  it('excludes node_modules and build directories', async () => {
    const kaos = createFakeKaos({
      getcwd: () => '/w',
      iterdir: async function* (p: string) {
        if (p === '/w') {
          yield '/w/node_modules';
          yield '/w/dist';
          yield '/w/src';
        } else if (p === '/w/src') {
          yield '/w/src/index.ts';
        }
      } as unknown as Kaos['iterdir'],
      stat: (async (p: string) => ({
        stMode: p.endsWith('src') || p.endsWith('node_modules') || p.endsWith('dist') ? 0o040_755 : 0o100_644,
        stIno: 1,
        stDev: 1,
        stNlink: 1,
        stUid: 0,
        stGid: 0,
        stSize: 1,
        stAtime: 0,
        stMtime: 0,
        stCtime: 0,
      })) as unknown as Kaos['stat'],
    });

    const ctx = testAgent({ kaos });
    ctx.configure();
    ctx.agent.config.update({ cwd: '/w' });
    const injector = new DirectoryTreeInjector(ctx.agent);

    const injection = await injector['getInjection']();

    expect(injection).toBeDefined();
    expect(injection).toContain('src/');
    expect(injection).not.toContain('node_modules');
    expect(injection).not.toContain('dist');
  });

  it('excludes hidden directories except whitelisted ones', async () => {
    const kaos = createFakeKaos({
      getcwd: () => '/w',
      iterdir: async function* (p: string) {
        if (p === '/w') {
          yield '/w/.github';
          yield '/w/.git';
          yield '/w/.vscode';
          yield '/w/src';
        } else if (p === '/w/.github') {
          yield '/w/.github/workflows';
        } else if (p === '/w/src') {
          yield '/w/src/index.ts';
        }
      } as unknown as Kaos['iterdir'],
      stat: (async (p: string) => ({
        stMode:
          p.endsWith('.github') || p.endsWith('.git') || p.endsWith('.vscode') || p.endsWith('src') || p.endsWith('workflows')
            ? 0o040_755
            : 0o100_644,
        stIno: 1,
        stDev: 1,
        stNlink: 1,
        stUid: 0,
        stGid: 0,
        stSize: 1,
        stAtime: 0,
        stMtime: 0,
        stCtime: 0,
      })) as unknown as Kaos['stat'],
    });

    const ctx = testAgent({ kaos });
    ctx.configure();
    ctx.agent.config.update({ cwd: '/w' });
    const injector = new DirectoryTreeInjector(ctx.agent);

    const injection = await injector['getInjection']();

    expect(injection).toBeDefined();
    expect(injection).toContain('.github/');
    expect(injection).not.toMatch(/[├└]── \.git\/$/m);
    expect(injection).not.toMatch(/[├└]── \.vscode\/$/m);
  });

  it('returns undefined when the tree has not changed since last injection', async () => {
    const kaos = createFakeKaos({
      getcwd: () => '/w',
      iterdir: async function* (p: string) {
        if (p === '/w') {
          yield '/w/src';
        } else if (p === '/w/src') {
          yield '/w/src/index.ts';
        }
      } as unknown as Kaos['iterdir'],
      stat: (async (p: string) => ({
        stMode: p.endsWith('src') ? 0o040_755 : 0o100_644,
        stIno: 1,
        stDev: 1,
        stNlink: 1,
        stUid: 0,
        stGid: 0,
        stSize: 1,
        stAtime: 0,
        stMtime: 0,
        stCtime: 0,
      })) as unknown as Kaos['stat'],
    });

    const ctx = testAgent({ kaos });
    ctx.configure();
    ctx.agent.config.update({ cwd: '/w' });
    const injector = new DirectoryTreeInjector(ctx.agent);

    const first = await injector['getInjection']();
    expect(first).toBeDefined();

    const second = await injector['getInjection']();
    expect(second).toBeUndefined();
  });

  it('re-injects when the tree changes', async () => {
    let hasNewFile = false;
    const kaos = createFakeKaos({
      getcwd: () => '/w',
      iterdir: async function* (p: string) {
        if (p === '/w') {
          yield '/w/src';
          if (hasNewFile) yield '/w/new.md';
        } else if (p === '/w/src') {
          yield '/w/src/index.ts';
        }
      } as unknown as Kaos['iterdir'],
      stat: (async (p: string) => ({
        stMode: p.endsWith('src') ? 0o040_755 : 0o100_644,
        stIno: 1,
        stDev: 1,
        stNlink: 1,
        stUid: 0,
        stGid: 0,
        stSize: 1,
        stAtime: 0,
        stMtime: 0,
        stCtime: 0,
      })) as unknown as Kaos['stat'],
    });

    const ctx = testAgent({ kaos });
    ctx.configure();
    ctx.agent.config.update({ cwd: '/w' });
    const injector = new DirectoryTreeInjector(ctx.agent);

    const first = await injector['getInjection']();
    expect(first).toBeDefined();
    expect(first).not.toContain('new.md');

    hasNewFile = true;
    const second = await injector['getInjection']();
    expect(second).toBeDefined();
    expect(second).toContain('new.md');
  });
});
