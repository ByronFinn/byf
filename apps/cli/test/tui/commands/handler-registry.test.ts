import { describe, expect, it, vi } from 'vitest';

import { SlashCommandHandlerRegistry } from '#/tui/commands/handler-registry';
import { registerBuiltinSlashHandlers } from '#/tui/commands/handlers';
import { BUILTIN_SLASH_COMMANDS } from '#/tui/commands/registry';

import { createMockHost } from './helpers';

describe('SlashCommandHandlerRegistry', () => {
  it('registers a handler and retrieves it by name', async () => {
    const registry = new SlashCommandHandlerRegistry();
    const handler = vi.fn(async () => {});
    registry.register('help', handler);
    expect(registry.get('help')).toBe(handler);
    await registry.get('help')?.('args');
    expect(handler).toHaveBeenCalledWith('args');
  });

  it('throws on double registration', () => {
    const registry = new SlashCommandHandlerRegistry();
    registry.register('exit', async () => {});
    expect(() => {
      registry.register('exit', async () => {});
    }).toThrow(/already registered for \/exit/);
  });

  it('returns undefined for an unregistered name', () => {
    const registry = new SlashCommandHandlerRegistry();
    expect(registry.get('help')).toBeUndefined();
  });
});

describe('registerBuiltinSlashHandlers', () => {
  it('registers every BuiltinSlashCommandName', () => {
    const registry = new SlashCommandHandlerRegistry();
    registerBuiltinSlashHandlers(registry, createMockHost());

    const names = BUILTIN_SLASH_COMMANDS.map((c) => c.name);
    const unique = new Set(names);
    for (const name of unique) {
      expect(registry.get(name)).toBeDefined();
    }
  });

  it('routes /version through showStatus', async () => {
    const showStatus = vi.fn();
    const registry = new SlashCommandHandlerRegistry();
    registerBuiltinSlashHandlers(registry, createMockHost({ showStatus }));
    await registry.get('version')?.('');
    expect(showStatus).toHaveBeenCalledWith('Byf Code v9.9.9-test');
  });

  it('guards /tasks and /agent when no session', async () => {
    const showError = vi.fn();
    const showTasksBrowser = vi.fn();
    const showSubagentsViewer = vi.fn();
    const registry = new SlashCommandHandlerRegistry();
    registerBuiltinSlashHandlers(
      registry,
      createMockHost({ showError, showTasksBrowser, showSubagentsViewer }),
    );

    await registry.get('tasks')?.('');
    await registry.get('agent')?.('');

    expect(showError).toHaveBeenCalledTimes(2);
    expect(showError).toHaveBeenCalledWith('No active session.');
    expect(showTasksBrowser).not.toHaveBeenCalled();
    expect(showSubagentsViewer).not.toHaveBeenCalled();
  });

  it('opens help via dialogManager accessor', async () => {
    const host = createMockHost();
    const registry = new SlashCommandHandlerRegistry();
    registerBuiltinSlashHandlers(registry, host);
    await registry.get('help')?.('');
    expect(host.dialogManager.showHelpPanel).toHaveBeenCalled();
  });
});
