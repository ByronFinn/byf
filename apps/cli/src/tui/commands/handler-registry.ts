// Slash command handler registry.
//
// Replaces the 27-case `handleBuiltInSlashCommand` switch with a Map-based
// dispatch. Each builtin command registers its handler here; the dispatch
// is a single `Map.get(name)(args)` lookup.
//
// The `SlashCommandHost` interface (the narrow capability surface handlers
// may use) lives in `handlers/session-handlers.ts` — co-located with the
// handler implementations that consume it.

import type { BuiltinSlashCommandName } from './registry';

/**
 * A slash command handler: receives the raw args string, does its work.
 */
export type SlashCommandHandler = (args: string) => Promise<void>;

/**
 * Registry mapping builtin command names to their handlers.
 *
 * Exhaustiveness is enforced at the registration site — the registrar must
 * provide a handler for every `BuiltinSlashCommandName`.
 */
export class SlashCommandHandlerRegistry {
  private readonly handlers = new Map<BuiltinSlashCommandName, SlashCommandHandler>();

  /**
   * Register a handler for a builtin command name.
   * Throws if the name already has a handler (double-registration is a bug).
   */
  register(name: BuiltinSlashCommandName, handler: SlashCommandHandler): void {
    if (this.handlers.has(name)) {
      throw new Error(`Slash command handler already registered for /${name}`);
    }
    this.handlers.set(name, handler);
  }

  /**
   * Look up the handler for a command name.
   * Returns `undefined` if no handler is registered (should not happen for
   * builtin commands — `registerBuiltInSlashHandlers` covers them all).
   */
  get(name: BuiltinSlashCommandName): SlashCommandHandler | undefined {
    return this.handlers.get(name);
  }
}
