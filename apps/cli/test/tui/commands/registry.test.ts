import {
  BUILTIN_SLASH_COMMANDS,
  buildAutocompleteSlashCommands,
  findBuiltInSlashCommand,
  parseShellCommand,
  parseSlashInput,
  resolveSlashCommandAvailability,
  sortSlashCommands,
  type ByfSlashCommand,
} from '#/tui/commands/index';
import { describe, expect, it } from 'vitest';

describe('parseSlashInput', () => {
  it('parses command names and trimmed args', () => {
    expect(parseSlashInput('/help')).toEqual({ name: 'help', args: '' });
    expect(parseSlashInput('/model   byf-k2  ')).toEqual({
      name: 'model',
      args: 'byf-k2',
    });
  });

  it('returns null for non-commands and path-like input', () => {
    expect(parseSlashInput('hello')).toBeNull();
    expect(parseSlashInput('/')).toBeNull();
    expect(parseSlashInput('/   ')).toBeNull();
    expect(parseSlashInput('/some/path')).toBeNull();
    expect(parseSlashInput('/some/path with args')).toBeNull();
  });

  describe('parseShellCommand', () => {
    it('parses shell commands prefixed with exclamation and whitespace', () => {
      expect(parseShellCommand('! ls -la')).toBe('ls -la');
      expect(parseShellCommand('!\tgrep foo src/')).toBe('grep foo src/');
      expect(parseShellCommand('!   echo ok   ')).toBe('echo ok');
    });

    it('returns null for non-shell input or empty commands', () => {
      expect(parseShellCommand('/help')).toBeNull();
      expect(parseShellCommand('hello world')).toBeNull();
      expect(parseShellCommand('!')).toBeNull();
      expect(parseShellCommand('!   ')).toBeNull();
      expect(parseShellCommand('!echo')).toBeNull();
    });
  });
});

describe('built-in slash command registry', () => {
  it('finds built-ins by name or alias', () => {
    expect(findBuiltInSlashCommand('exit')?.name).toBe('exit');
    expect(findBuiltInSlashCommand('quit')?.name).toBe('exit');
    expect(findBuiltInSlashCommand('q')).toBeUndefined();
    expect(findBuiltInSlashCommand('clear')?.name).toBe('new');
    expect(findBuiltInSlashCommand('mcp')?.name).toBe('mcp');
    expect(findBuiltInSlashCommand('status')?.name).toBe('status');
    expect(findBuiltInSlashCommand('usage')?.aliases).not.toContain('status');
    expect(findBuiltInSlashCommand('unknown')).toBeUndefined();
  });

  it('defaults commands without explicit availability to idle-only', () => {
    const command: ByfSlashCommand = {
      name: 'example',
      aliases: [],
      description: 'Example command',
    };

    expect(resolveSlashCommandAvailability(command, '')).toBe('idle-only');
  });

  it('sorts commands by priority descending and name ascending', () => {
    const commands: ByfSlashCommand[] = [
      { name: 'zebra', aliases: [], description: 'Z', priority: 100 },
      { name: 'alpha', aliases: [], description: 'A', priority: 100 },
      { name: 'middle', aliases: [], description: 'M', priority: 50 },
      { name: 'plain', aliases: [], description: 'P' },
    ];

    expect(sortSlashCommands(commands).map((command) => command.name)).toEqual([
      'alpha',
      'zebra',
      'middle',
      'plain',
    ]);
  });

  it('contains the expected command names once', () => {
    const names = BUILTIN_SLASH_COMMANDS.map((command) => command.name);

    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        'agent',
        'compact',
        'editor',
        'exit',
        'fork',
        'help',
        'init',
        'login',
        'logout',
        'mcp',
        'model',
        'new',
        'permission',
        'sessions',
        'settings',
        'status',
        'theme',
        'title',
        'usage',
        'version',
        'yolo',
      ]),
    );
  });

  it('builds autocomplete entries including aliases like /quit', () => {
    const entries = buildAutocompleteSlashCommands(BUILTIN_SLASH_COMMANDS);
    expect(entries.some((entry) => entry.name === 'exit')).toBe(true);
    expect(entries.some((entry) => entry.name === 'quit')).toBe(true);
  });

  it('finds the agent command by name', () => {
    const agent = findBuiltInSlashCommand('agent');
    expect(agent).toBeDefined();
    expect(agent!.name).toBe('agent');
    expect(agent!.description).toBeTruthy();
  });

  it('includes agent in autocomplete entries', () => {
    const entries = buildAutocompleteSlashCommands(BUILTIN_SLASH_COMMANDS);
    expect(entries.some((entry) => entry.name === 'agent')).toBe(true);
  });
});
