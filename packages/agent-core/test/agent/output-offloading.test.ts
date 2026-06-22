import { describe, expect, it, vi } from 'vitest';

import {
  buildPreview,
  DEFAULT_OFFLOADING_CONFIG,
  offloadOutput,
  shouldOffload,
} from '../../src/agent/context/output-offloading';
import { ScratchManager } from '../../src/agent/context/scratch-manager';
import { createFakeKaos } from '../tools/fixtures/fake-kaos';

describe('shouldOffload', () => {
  it('returns true when output exceeds token threshold', () => {
    // ~8000 tokens of ASCII text = ~32000 chars; need slightly more to exceed threshold
    const largeOutput = 'a'.repeat(32_001);
    expect(shouldOffload(largeOutput, DEFAULT_OFFLOADING_CONFIG)).toBe(true);
  });

  it('returns false when output is below token threshold', () => {
    const smallOutput = 'short output';
    expect(shouldOffload(smallOutput, DEFAULT_OFFLOADING_CONFIG)).toBe(false);
  });

  it('respects custom threshold', () => {
    const output = 'a'.repeat(400); // ~100 tokens
    expect(shouldOffload(output, { threshold: 50, previewChars: 100 })).toBe(true);
    expect(shouldOffload(output, { threshold: 200, previewChars: 100 })).toBe(false);
  });
});

describe('buildPreview', () => {
  it('includes file path and Read hint', () => {
    const preview = buildPreview('hello world', 'Read', '/scratch/call_1.txt', 100);
    expect(preview).toContain('/scratch/call_1.txt');
    expect(preview).toContain('Read');
    expect(preview).toContain('Use Read(path="/scratch/call_1.txt")');
    expect(preview).toContain('hello world');
  });

  it('truncates output to previewChars', () => {
    const longOutput = 'a'.repeat(200);
    const preview = buildPreview(longOutput, 'Bash', '/scratch/call_2.txt', 50);
    expect(preview.length).toBeLessThan(longOutput.length + 100);
    expect(preview).toContain('a'.repeat(50));
    expect(preview).not.toContain('a'.repeat(51));
  });
});

describe('offloadOutput', () => {
  function createScratchManager() {
    const written = new Map<string, string>();
    const kaos = createFakeKaos({
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeText: vi.fn().mockImplementation(async (path: string, content: string) => {
        written.set(path, content);
        return content.length;
      }),
      readText: vi.fn().mockImplementation(async (path: string) => {
        const content = written.get(path);
        if (content === undefined) throw new Error('ENOENT');
        return content;
      }),
      stat: vi.fn().mockRejectedValue(new Error('ENOENT')),
    });
    const manager = new ScratchManager(kaos, {
      scratchDir: '/scratch',
      maxSessionSize: 50_000_000,
      maxFileCount: 100,
    });
    return { manager, written };
  }

  it('offloads large output and returns preview', async () => {
    const { manager, written } = createScratchManager();
    const largeOutput = 'a'.repeat(32_001);

    const result = await offloadOutput('call_1', 'Read', { output: largeOutput }, manager);

    expect(result.offloaded).toBe(true);
    expect(result.filePath).toBe('/scratch/call_1.txt');
    expect(written.get('/scratch/call_1.txt')).toBe(largeOutput);
    expect(result.output).toContain('/scratch/call_1.txt');
    expect(result.output).toContain('Tool output offloaded');
  });

  it('does not offload small output', async () => {
    const { manager } = createScratchManager();
    const smallOutput = 'short output';

    const result = await offloadOutput('call_1', 'Read', { output: smallOutput }, manager);

    expect(result.offloaded).toBe(false);
    expect(result.output).toBeUndefined();
    expect(result.filePath).toBeUndefined();
  });

  it('does not offload non-string output', async () => {
    const { manager } = createScratchManager();
    const result = await offloadOutput(
      'call_1',
      'Read',
      { output: [{ type: 'text', text: 'image data' }] },
      manager,
    );
    expect(result.offloaded).toBe(false);
  });

  it('offloads large error output', async () => {
    const { manager, written } = createScratchManager();
    const largeError = 'error '.repeat(10_000);

    const result = await offloadOutput(
      'call_1',
      'Bash',
      { output: largeError, isError: true },
      manager,
    );

    expect(result.offloaded).toBe(true);
    expect(written.get('/scratch/call_1.txt')).toBe(largeError);
    expect(result.output).toContain('error');
  });
});
