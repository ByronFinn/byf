import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { localKaos } from '@byfriends/kaos';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadAgentsMd } from '../../src/profile/context';

let homeDir: string;
let workDir: string;

beforeEach(async () => {
  homeDir = await mkdtemp(join(tmpdir(), 'byf-agents-home-'));
  workDir = await mkdtemp(join(tmpdir(), 'byf-agents-work-'));
  vi.spyOn(localKaos, 'gethome').mockReturnValue(homeDir);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(homeDir, { recursive: true, force: true });
  await rm(workDir, { recursive: true, force: true });
});

describe('loadAgentsMd user-level discovery', () => {
  it('loads user-level branded and generic files before project-level', async () => {
    await mkdir(join(homeDir, '.byf'), { recursive: true });
    await writeFile(join(homeDir, '.byf', 'AGENTS.md'), 'user branded', 'utf-8');
    await mkdir(join(homeDir, '.agents'), { recursive: true });
    await writeFile(join(homeDir, '.agents', 'AGENTS.md'), 'user generic', 'utf-8');
    await writeFile(join(workDir, 'AGENTS.md'), 'project instructions', 'utf-8');

    const result = await loadAgentsMd(localKaos, workDir);

    expect(result).toContain('user branded');
    expect(result).toContain('user generic');
    expect(result).toContain('project instructions');
    expect(result.indexOf('user branded')).toBeLessThan(result.indexOf('user generic'));
    expect(result.indexOf('user generic')).toBeLessThan(result.indexOf('project instructions'));
  });

  it('loads generic user-level .agents/AGENTS.md', async () => {
    await mkdir(join(homeDir, '.agents'), { recursive: true });
    await writeFile(join(homeDir, '.agents', 'AGENTS.md'), 'dot-agents generic', 'utf-8');

    const result = await loadAgentsMd(localKaos, workDir);

    expect(result).toContain('dot-agents generic');
  });

  it('falls back to project-level only when no user-level files exist', async () => {
    await writeFile(join(workDir, 'AGENTS.md'), 'project only', 'utf-8');

    const result = await loadAgentsMd(localKaos, workDir);

    expect(result).toContain('project only');
    expect(result).not.toContain(homeDir);
  });

  it('does not load the same file twice when the work dir is the home dir', async () => {
    await mkdir(join(homeDir, '.byf'), { recursive: true });
    await writeFile(join(homeDir, '.byf', 'AGENTS.md'), 'home branded', 'utf-8');

    const result = await loadAgentsMd(localKaos, homeDir);

    expect(result.split('home branded').length - 1).toBe(1);
  });
});

describe('loadAgentsMd byte-budget truncation', () => {
  it('appends a visible truncation marker when AGENTS.md exceeds the 32KB budget', async () => {
    // 40KB of content — well over the 32KB budget. Use a distinctive sentinel
    // repeated enough to exceed the cap so the truncation path is exercised.
    const filler = 'X'.repeat(40 * 1024);
    await writeFile(join(workDir, 'AGENTS.md'), filler, 'utf-8');

    const result = await loadAgentsMd(localKaos, workDir);

    // The marker must be visible so the model knows its context is incomplete.
    expect(result).toContain('truncated');
    expect(result).toContain('32KB');
    // Some filler survives (the project file is budgeted last-to-first, so the
    // project file is protected until the budget is actually consumed).
    expect(result).toContain('X');
  });

  it('does not add a truncation marker when content fits the budget', async () => {
    await writeFile(join(workDir, 'AGENTS.md'), 'small project instructions', 'utf-8');

    const result = await loadAgentsMd(localKaos, workDir);

    expect(result).not.toContain('truncated');
    expect(result).toContain('small project instructions');
  });

  it('returns empty string with no marker when no AGENTS.md files exist', async () => {
    const result = await loadAgentsMd(localKaos, workDir);
    expect(result).toBe('');
  });
});
