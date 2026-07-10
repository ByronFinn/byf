// Slash command handler registry.
//
// Replaces the 27-case `handleBuiltInSlashCommand` switch with a Map-based
// dispatch. Each builtin command registers its handler here; the dispatch
// is a single `Map.get(name)(args)` lookup.
//
// PR1 (this file): the registry mechanism + SlashCommandHost interface.
// Handlers are still ByfTui methods, registered at construction time.
// PR2: handlers migrate to `commands/handlers/<group>.ts` modules that
// receive a `SlashCommandHost` — this interface defines the seam.

import type { BuiltinSlashCommandName } from './registry';

/**
 * The narrow capability surface a slash command handler may use.
 *
 * Only members used by ≥2 handlers are promoted here. Single-use capabilities
 * (fork rewind chain, init turn lifecycle, create-new-session orchestration,
 * individual picker methods) stay on ByfTui — handlers that need them remain
 * on ByfTui as thin wrappers until PR2 extracts them with richer host access.
 *
 * This interface is the target shape for PR2 command-modules. In PR1 it is
 * declared but not yet consumed — handlers still bind to ByfTui methods.
 */
export interface SlashCommandHost {
  /** Show a transient status message in the footer. */
  showStatus(message: string): void;
  /** Show an error message in the footer. */
  showError(message: string): void;
  /** Request a re-render of the TUI. */
  requestRender(): void;
}

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
