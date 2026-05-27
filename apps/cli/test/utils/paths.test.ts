import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDataDir, getInputHistoryFile, getLogDir, getUpdateStateFile } from '#/utils/paths';

const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env['BYF_HOME'];
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('getDataDir', () => {
  it('returns ~/.byf when BYF_HOME is not set', () => {
    expect(getDataDir()).toBe(join(homedir(), '.byf'));
  });

  it('returns BYF_HOME when set', () => {
    process.env['BYF_HOME'] = '/tmp/kimi-test-data';
    expect(getDataDir()).toBe('/tmp/kimi-test-data');
  });

  it('returns BYF_HOME even if it is a relative path', () => {
    process.env['BYF_HOME'] = 'relative/path';
    expect(getDataDir()).toBe('relative/path');
  });
});

describe('getLogDir', () => {
  it('returns <dataDir>/logs', () => {
    expect(getLogDir()).toBe(join(homedir(), '.byf', 'logs'));
  });

  it('respects BYF_HOME', () => {
    process.env['BYF_HOME'] = '/z';
    expect(getLogDir()).toBe(join('/z', 'logs'));
  });
});

describe('getUpdateStateFile', () => {
  it('returns <dataDir>/updates/latest.json', () => {
    expect(getUpdateStateFile()).toBe(join(homedir(), '.byf', 'updates', 'latest.json'));
  });

  it('respects BYF_HOME', () => {
    process.env['BYF_HOME'] = '/updates-home';
    expect(getUpdateStateFile()).toBe(join('/updates-home', 'updates', 'latest.json'));
  });
});

describe('getInputHistoryFile', () => {
  it('returns <dataDir>/user-history/<md5(workDir)>.jsonl', () => {
    const workDir = '/home/user/project';
    const hash = createHash('md5').update(workDir, 'utf-8').digest('hex');
    expect(getInputHistoryFile(workDir)).toBe(
      join(homedir(), '.byf', 'user-history', `${hash}.jsonl`),
    );
  });

  it('respects BYF_HOME', () => {
    process.env['BYF_HOME'] = '/custom/data';
    const hash = createHash('md5').update('/proj', 'utf-8').digest('hex');
    expect(getInputHistoryFile('/proj')).toBe(
      join('/custom/data', 'user-history', `${hash}.jsonl`),
    );
  });
});
