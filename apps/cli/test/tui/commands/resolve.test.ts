import { describe, expect, it } from 'vitest';

import {
  resolveSkillCommand,
  resolveSlashCommandInput,
  slashBusyMessage,
  slashCommandBusyReason,
} from '#/tui/commands/index';

function resolve(
  input: string,
  overrides: Partial<Parameters<typeof resolveSlashCommandInput>[0]> = {},
) {
  return resolveSlashCommandInput({
    input,
    skillCommandMap: new Map<string, string>(),
    isStreaming: false,
    isCompacting: false,
    ...overrides,
  });
}

describe('resolveSlashCommandInput', () => {
  it('returns not-command for normal text', () => {
    expect(resolve('hello')).toEqual({ kind: 'not-command' });
  });

  it('resolves built-in commands by name and alias', () => {
    expect(resolve('/help')).toMatchObject({ kind: 'builtin', name: 'help', args: '' });
    expect(resolve('/quit')).toMatchObject({ kind: 'builtin', name: 'exit', args: '' });
    expect(resolve('/clear')).toMatchObject({ kind: 'builtin', name: 'new', args: '' });
    expect(resolve('/fork')).toMatchObject({ kind: 'builtin', name: 'fork', args: '' });
    expect(resolve('/connect provider')).toMatchObject({
      kind: 'builtin',
      name: 'connect',
      args: 'provider',
    });
    expect(resolve('/title New title')).toMatchObject({
      kind: 'builtin',
      name: 'title',
      args: 'New title',
    });
    expect(resolve('/init')).toMatchObject({ kind: 'builtin', name: 'init', args: '' });
    expect(resolve('/q')).toEqual({
      kind: 'message',
      input: '/q',
    });
  });

  it('blocks idle-only built-ins while streaming', () => {
    expect(resolve('/new', { isStreaming: true })).toEqual({
      kind: 'blocked',
      commandName: 'new',
      reason: 'streaming',
    });
    expect(resolve('/init', { isStreaming: true })).toEqual({
      kind: 'blocked',
      commandName: 'init',
      reason: 'streaming',
    });
    expect(resolve('/model', { isStreaming: true })).toEqual({
      kind: 'blocked',
      commandName: 'model',
      reason: 'streaming',
    });
    expect(resolve('/sessions', { isStreaming: true })).toEqual({
      kind: 'blocked',
      commandName: 'sessions',
      reason: 'streaming',
    });
    expect(resolve('/resume', { isStreaming: true })).toEqual({
      kind: 'blocked',
      commandName: 'resume',
      reason: 'streaming',
    });
  });

  it('blocks model and session pickers while compacting', () => {
    expect(resolve('/model', { isCompacting: true })).toEqual({
      kind: 'blocked',
      commandName: 'model',
      reason: 'compacting',
    });
    expect(resolve('/sessions', { isCompacting: true })).toEqual({
      kind: 'blocked',
      commandName: 'sessions',
      reason: 'compacting',
    });
    expect(resolve('/resume', { isCompacting: true })).toEqual({
      kind: 'blocked',
      commandName: 'resume',
      reason: 'compacting',
    });
  });

  it('allows always-available built-ins while streaming', () => {
    expect(resolve('/mcp', { isStreaming: true })).toMatchObject({
      kind: 'builtin',
      name: 'mcp',
      args: '',
    });
    expect(resolve('/mcp', { isCompacting: true })).toMatchObject({
      kind: 'builtin',
      name: 'mcp',
      args: '',
    });
  });

  it('resolves /btw as a builtin that passes its args through', () => {
    expect(resolve('/btw where is the config file?')).toMatchObject({
      kind: 'builtin',
      name: 'btw',
      args: 'where is the config file?',
    });
  });

  it('allows /btw while streaming and compacting (always-available)', () => {
    expect(resolve('/btw quick question', { isStreaming: true })).toMatchObject({
      kind: 'builtin',
      name: 'btw',
      args: 'quick question',
    });
    expect(resolve('/btw quick question', { isCompacting: true })).toMatchObject({
      kind: 'builtin',
      name: 'btw',
      args: 'quick question',
    });
  });

  it('resolves skill commands and blocks them while busy', () => {
    const skillCommandMap = new Map([['skill:review', 'review']]);

    expect(resolve('/skill:review src/app.ts', { skillCommandMap })).toEqual({
      kind: 'skill',
      commandName: 'skill:review',
      skillName: 'review',
      args: 'src/app.ts',
    });
    expect(resolve('/skill:review src/app.ts', { skillCommandMap, isStreaming: true })).toEqual({
      kind: 'blocked',
      commandName: 'skill:review',
      reason: 'streaming',
    });
  });

  it('returns message for unknown slash input', () => {
    expect(resolve('/does-not-exist arg')).toEqual({
      kind: 'message',
      input: '/does-not-exist arg',
    });
  });
});

describe('slash command busy helpers', () => {
  it('resolves skill command aliases with and without skill prefix', () => {
    const map = new Map([['skill:review', 'review']]);

    expect(resolveSkillCommand(map, 'skill:review')).toBe('review');
    expect(resolveSkillCommand(map, 'review')).toBe('review');
  });

  it('formats busy messages', () => {
    expect(slashCommandBusyReason({ isStreaming: true, isCompacting: false })).toBe('streaming');
    expect(slashCommandBusyReason({ isStreaming: false, isCompacting: true })).toBe('compacting');
    expect(slashBusyMessage('new', 'streaming')).toContain('Cannot /new while streaming');
    expect(slashBusyMessage('new', 'compacting')).toContain('Cannot /new while compacting');
  });
});
