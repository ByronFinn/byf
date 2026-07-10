import { describe, expect, it, vi } from 'vitest';

import { ScratchManager } from '../../src/agent/context/scratch-manager';
import { createFakeKaos } from '../tools/fixtures/fake-kaos';

describe('ScratchManager', () => {
  it('writes output to a file and returns the path', async () => {
    const written = new Map<string, string>();
    const kaos = createFakeKaos({
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeText: vi.fn().mockImplementation(async (path: string, content: string) => {
        written.set(path, content);
        return content.length;
      }),
      stat: vi.fn().mockRejectedValue(new Error('ENOENT')),
    });

    const manager = new ScratchManager(kaos, {
      scratchDir: '/scratch',
      maxSessionSize: 50_000_000,
      maxFileCount: 100,
    });

    const path = await manager.writeOutput('call_1', 'hello world');
    expect(path).toBe('/scratch/call_1.txt');
    expect(written.get(path)).toBe('hello world');
  });

  it('reads output from a file', async () => {
    const kaos = createFakeKaos({
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeText: vi.fn().mockResolvedValue(11),
      readText: vi.fn().mockResolvedValue('hello world'),
      stat: vi.fn().mockRejectedValue(new Error('ENOENT')),
    });

    const manager = new ScratchManager(kaos, {
      scratchDir: '/scratch',
      maxSessionSize: 50_000_000,
      maxFileCount: 100,
    });

    await manager.writeOutput('call_1', 'hello world');
    const content = await manager.readOutput('/scratch/call_1.txt');
    expect(content).toBe('hello world');
  });

  it('evicts oldest file when maxFileCount is exceeded', async () => {
    const files = new Map<string, { content: string; mtime: number }>();
    let now = 1_000_000;

    const kaos = createFakeKaos({
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeText: vi.fn().mockImplementation(async (path: string, content: string) => {
        files.set(path, { content, mtime: now });
        return content.length;
      }),
      readText: vi.fn().mockImplementation(async (path: string) => {
        const f = files.get(path);
        if (f === undefined) throw new Error('ENOENT');
        return f.content;
      }),
      stat: vi.fn().mockImplementation(async (path: string) => {
        const f = files.get(path);
        if (f === undefined) throw new Error('ENOENT');
        return { size: f.content.length, mtime: f.mtime };
      }),
      exec: vi.fn().mockImplementation(async (...args: string[]) => {
        if (args[0] === 'rm' && args.length === 2) {
          files.delete(args[1]);
        }
        return {
          stdin: { write: vi.fn(), end: vi.fn() },
          stdout: { [Symbol.asyncIterator]: async function* () {} },
          stderr: { [Symbol.asyncIterator]: async function* () {} },
          pid: 1,
          exitCode: 0,
          wait: vi.fn().mockResolvedValue(0),
          kill: vi.fn().mockResolvedValue(undefined),
        };
      }),
    });

    const manager = new ScratchManager(kaos, {
      scratchDir: '/scratch',
      maxSessionSize: 50_000_000,
      maxFileCount: 3,
    });

    await manager.writeOutput('call_1', 'first');
    now += 1_000;
    await manager.writeOutput('call_2', 'second');
    now += 1_000;
    await manager.writeOutput('call_3', 'third');
    now += 1_000;
    await manager.writeOutput('call_4', 'fourth');

    expect(files.has('/scratch/call_1.txt')).toBe(false);
    expect(files.has('/scratch/call_2.txt')).toBe(true);
    expect(files.has('/scratch/call_3.txt')).toBe(true);
    expect(files.has('/scratch/call_4.txt')).toBe(true);
  });

  it('evicts oldest files when maxSessionSize is exceeded', async () => {
    const files = new Map<string, { content: string; mtime: number }>();
    let now = 1_000_000;

    const kaos = createFakeKaos({
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeText: vi.fn().mockImplementation(async (path: string, content: string) => {
        files.set(path, { content, mtime: now });
        return content.length;
      }),
      readText: vi.fn().mockImplementation(async (path: string) => {
        const f = files.get(path);
        if (f === undefined) throw new Error('ENOENT');
        return f.content;
      }),
      stat: vi.fn().mockImplementation(async (path: string) => {
        const f = files.get(path);
        if (f === undefined) throw new Error('ENOENT');
        return { size: f.content.length, mtime: f.mtime };
      }),
      exec: vi.fn().mockImplementation(async (...args: string[]) => {
        if (args[0] === 'rm' && args.length === 2) {
          files.delete(args[1]);
        }
        return {
          stdin: { write: vi.fn(), end: vi.fn() },
          stdout: { [Symbol.asyncIterator]: async function* () {} },
          stderr: { [Symbol.asyncIterator]: async function* () {} },
          pid: 1,
          exitCode: 0,
          wait: vi.fn().mockResolvedValue(0),
          kill: vi.fn().mockResolvedValue(undefined),
        };
      }),
    });

    const manager = new ScratchManager(kaos, {
      scratchDir: '/scratch',
      maxSessionSize: 15,
      maxFileCount: 100,
    });

    await manager.writeOutput('call_1', '12345'); // 5 bytes
    now += 1_000;
    await manager.writeOutput('call_2', '67890'); // 5 bytes, total 10
    now += 1_000;
    await manager.writeOutput('call_3', 'abcde'); // 5 bytes, total 15
    now += 1_000;
    await manager.writeOutput('call_4', 'fghij'); // 5 bytes, total 20
    now += 1_000;
    await manager.writeOutput('call_5', 'klmno'); // evicts oldest files to stay under 15

    expect(files.has('/scratch/call_1.txt')).toBe(false);
    expect(files.has('/scratch/call_2.txt')).toBe(false);
    expect(files.has('/scratch/call_3.txt')).toBe(true);
    expect(files.has('/scratch/call_4.txt')).toBe(true);
    expect(files.has('/scratch/call_5.txt')).toBe(true);
  });

  it('cleans up all files and directory', async () => {
    const execCalls: string[][] = [];
    const kaos = createFakeKaos({
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeText: vi.fn().mockResolvedValue(5),
      stat: vi.fn().mockRejectedValue(new Error('ENOENT')),
      exec: vi.fn().mockImplementation(async (...args: string[]) => {
        execCalls.push(args);
        return {
          stdin: { write: vi.fn(), end: vi.fn() },
          stdout: { [Symbol.asyncIterator]: async function* () {} },
          stderr: { [Symbol.asyncIterator]: async function* () {} },
          pid: 1,
          exitCode: 0,
          wait: vi.fn().mockResolvedValue(0),
          kill: vi.fn().mockResolvedValue(undefined),
        };
      }),
    });

    const manager = new ScratchManager(kaos, {
      scratchDir: '/scratch',
      maxSessionSize: 50_000_000,
      maxFileCount: 100,
    });

    await manager.writeOutput('call_1', 'first');
    await manager.writeOutput('call_2', 'second');
    await manager.cleanup();

    const rmCalls = execCalls.filter((args) => args[0] === 'rm');
    expect(rmCalls.length).toBeGreaterThan(0);
    expect(rmCalls.some((args) => args.includes('/scratch'))).toBe(true);
  });
});
