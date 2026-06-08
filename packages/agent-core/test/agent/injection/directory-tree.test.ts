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

  it('uses the same timestamp on first and subsequent injections', async () => {
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

    // Extract timestamp from first injection
    const timestampMatch = first!.match(/`([^`]+)`/);
    expect(timestampMatch).not.toBeNull();
    const firstTimestamp = timestampMatch![1];

    // Wait a bit to ensure Date.now() would be different
    await new Promise(resolve => setTimeout(resolve, 10));

    // Change tree to trigger re-injection
    hasNewFile = true;
    const second = await injector['getInjection']();
    expect(second).toBeDefined();
    expect(second).toContain('new.md');

    // Extract timestamp from second injection
    const secondTimestampMatch = second!.match(/`([^`]+)`/);
    const secondTimestamp = secondTimestampMatch![1];

    // Timestamps should be identical
    expect(secondTimestamp).toBe(firstTimestamp);
  });

  it('captures timestamp on first injection even when tree stays the same', async () => {
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

    const timestampMatch = first!.match(/`([^`]+)`/);
    expect(timestampMatch).not.toBeNull();
    // Should contain a valid ISO timestamp
    expect(timestampMatch![1]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
