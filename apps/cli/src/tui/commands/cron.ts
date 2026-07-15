/**
 * /cron slash command parser (PRD-0024).
 *
 * Grammar:
 *   /cron              → list
 *   /cron list         → list
 *   /cron delete <id>  → delete (id = 8 lowercase hex)
 *   anything else      → usage error
 */

export type CronCommand =
  | { readonly kind: 'list' }
  | { readonly kind: 'delete'; readonly id: string }
  | { readonly kind: 'error'; readonly message: string };

const ID_PATTERN = /^[0-9a-f]{8}$/;

const USAGE = 'Usage: /cron [list] | /cron delete <id>';

export function parseCronCommand(rawArgs: string): CronCommand {
  const input = rawArgs.trim();
  if (input.length === 0) {
    return { kind: 'list' };
  }

  const tokens = input.split(/\s+/);
  const head = tokens[0]?.toLowerCase();

  if (head === 'list') {
    if (tokens.length > 1) {
      return { kind: 'error', message: USAGE };
    }
    return { kind: 'list' };
  }

  if (head === 'delete') {
    if (tokens.length !== 2) {
      return { kind: 'error', message: USAGE };
    }
    const id = tokens[1] ?? '';
    if (!ID_PATTERN.test(id)) {
      return {
        kind: 'error',
        message: `Invalid cron job id ${JSON.stringify(id)} — must be 8 lowercase hex characters.`,
      };
    }
    return { kind: 'delete', id };
  }

  return { kind: 'error', message: USAGE };
}
