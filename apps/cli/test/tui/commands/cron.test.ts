/**
 * /cron parser + action handler (PRD-0024).
 */
import { describe, expect, it, vi } from 'vitest';

import {
  formatCronList,
  handleCronCommand,
  truncatePrompt,
  type CronSession,
} from '#/tui/actions/cron';
import { parseCronCommand } from '#/tui/commands/cron';
import { SlashCommandHandlerRegistry } from '#/tui/commands/handler-registry';
import { registerBuiltinSlashHandlers } from '#/tui/commands/handlers';
import { findBuiltInSlashCommand } from '#/tui/commands/registry';

import { createMockHost } from './helpers';

describe('parseCronCommand', () => {
  it('treats empty and list as list', () => {
    expect(parseCronCommand('')).toEqual({ kind: 'list' });
    expect(parseCronCommand('  ')).toEqual({ kind: 'list' });
    expect(parseCronCommand('list')).toEqual({ kind: 'list' });
  });

  it('parses delete with valid 8-hex id', () => {
    expect(parseCronCommand('delete deadbeef')).toEqual({
      kind: 'delete',
      id: 'deadbeef',
    });
  });

  it('rejects invalid delete usage', () => {
    expect(parseCronCommand('delete').kind).toBe('error');
    expect(parseCronCommand('delete deadbeef extra').kind).toBe('error');
    expect(parseCronCommand('delete DEADBEEF').kind).toBe('error');
    expect(parseCronCommand('delete not-hex').kind).toBe('error');
    expect(parseCronCommand('unknown').kind).toBe('error');
  });
});

describe('formatCronList / truncatePrompt', () => {
  it('renders empty state', () => {
    expect(formatCronList([])).toContain('No cron jobs scheduled');
  });

  it('renders task fields and truncates long prompts', () => {
    const long = 'x'.repeat(100);
    const text = formatCronList([
      {
        id: 'deadbeef',
        cron: '0 9 * * *',
        humanSchedule: 'At 09:00',
        prompt: long,
        recurring: true,
        createdAt: 0,
        lastFiredAt: undefined,
        nextFireAt: null,
      },
    ]);
    expect(text).toContain('id: deadbeef');
    expect(text).toContain('humanSchedule: At 09:00');
    expect(text).toContain('nextFireAt: none');
    expect(text).toContain(truncatePrompt(long));
    expect(truncatePrompt(long).endsWith('…')).toBe(true);
  });
});

describe('handleCronCommand', () => {
  function session(overrides: Partial<CronSession> = {}): CronSession {
    return {
      getCronTasks: vi.fn(async () => ({ tasks: [] })),
      deleteCronTask: vi.fn(async () => ({ deleted: false })),
      ...overrides,
    };
  }

  it('list appends transcript', async () => {
    const appendTranscriptLine = vi.fn();
    await handleCronCommand(
      session(),
      { kind: 'list' },
      {
        showStatus: vi.fn(),
        showError: vi.fn(),
        appendTranscriptLine,
      },
    );
    expect(appendTranscriptLine).toHaveBeenCalledWith(expect.stringContaining('No cron jobs'));
  });

  it('delete success uses status toast', async () => {
    const showStatus = vi.fn();
    await handleCronCommand(
      session({ deleteCronTask: vi.fn(async () => ({ deleted: true })) }),
      { kind: 'delete', id: 'deadbeef' },
      { showStatus, showError: vi.fn(), appendTranscriptLine: vi.fn() },
    );
    expect(showStatus).toHaveBeenCalledWith('Deleted cron job deadbeef.');
  });

  it('delete miss uses error', async () => {
    const showError = vi.fn();
    await handleCronCommand(
      session(),
      { kind: 'delete', id: 'deadbeef' },
      {
        showStatus: vi.fn(),
        showError,
        appendTranscriptLine: vi.fn(),
      },
    );
    expect(showError).toHaveBeenCalledWith('No cron job with id deadbeef.');
  });
});

describe('/cron registry + handler', () => {
  it('registers cron with schedule alias and always availability', () => {
    const cmd = findBuiltInSlashCommand('cron');
    expect(cmd?.name).toBe('cron');
    expect(cmd?.aliases).toContain('schedule');
    expect(cmd?.availability).toBe('always');
    expect(findBuiltInSlashCommand('schedule')?.name).toBe('cron');
  });

  it('guards when no session', async () => {
    const showError = vi.fn();
    const registry = new SlashCommandHandlerRegistry();
    registerBuiltinSlashHandlers(
      registry,
      createMockHost({ showError, getSession: () => undefined }),
    );
    await registry.get('cron')?.('');
    expect(showError).toHaveBeenCalledWith(
      'No active session. Use /login or /connect to configure a provider.',
    );
  });

  it('list with session calls getCronTasks', async () => {
    const getCronTasks = vi.fn(async () => ({ tasks: [] }));
    const appendTranscriptStatus = vi.fn();
    const registry = new SlashCommandHandlerRegistry();
    registerBuiltinSlashHandlers(
      registry,
      createMockHost({
        getSession: () => ({ getCronTasks, deleteCronTask: vi.fn() }) as never,
        appendTranscriptStatus,
      }),
    );
    await registry.get('cron')?.('');
    expect(getCronTasks).toHaveBeenCalled();
    expect(appendTranscriptStatus).toHaveBeenCalled();
  });
});
