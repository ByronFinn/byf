// Registers all builtin slash handlers from group modules.
// Exhaustiveness is enforced via `satisfies Record<BuiltinSlashCommandName, …>`.

import type { SlashCommandHandler, SlashCommandHandlerRegistry } from '../handler-registry';
import type { BuiltinSlashCommandName } from '../registry';
import { createAddDirHandlers } from './add-dir';
import { createAuthHandlers } from './auth';
import { createConfigHandlers } from './config';
import { createCronHandlers } from './cron';
import { createDialogHandlers } from './dialog';
import { createEditorHandlers } from './editor';
import { createGoalHandlers } from './goal';
import { createSessionHandlers } from './session';
import type { SlashCommandHost } from './slash-host';

export type { SlashCommandHost } from './slash-host';

/**
 * Register every BuiltinSlashCommandName against the registry.
 * Compiles only when the merged map covers the full name union.
 */
export function registerBuiltinSlashHandlers(
  registry: SlashCommandHandlerRegistry,
  host: SlashCommandHost,
): void {
  const handlers = {
    ...createSessionHandlers(host),
    ...createDialogHandlers(host),
    ...createEditorHandlers(host),
    ...createAuthHandlers(host),
    ...createGoalHandlers(host),
    ...createCronHandlers(host),
    ...createConfigHandlers(host),
    ...createAddDirHandlers(host),
  } satisfies Record<BuiltinSlashCommandName, SlashCommandHandler>;

  for (const [name, handler] of Object.entries(handlers)) {
    registry.register(name as BuiltinSlashCommandName, handler);
  }
}
