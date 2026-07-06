/**
 * /goal slash command parser (PRD-0019 #204).
 *
 * `parseGoalCommand(rawArgs)` returns a tagged union over the six goal
 * sub-commands. The parser is intentionally pure (string in → union out);
 * side effects live in `apps/cli/src/tui/actions/goal.ts`.
 *
 * Grammar (PRD R2):
 *   /goal                                → status
 *   /goal status                         → status
 *   /goal pause                          → pause (soft stop)
 *   /goal resume                         → resume
 *   /goal cancel                         → cancel (hard stop)
 *   /goal <objective>                    → create
 *   /goal <objective> --max-turns N ...  → create with budget
 *   /goal replace <objective> [--flags]  → create with replace:true
 *   /goal -- <objective...>              → create; "--" escapes a leading
 *                                           reserved word (status/pause/...)
 *
 * Budget flags (only valid on `create` / `replace`):
 *   --max-turns N        integer turns
 *   --max-tokens N       integer tokens
 *   --max-seconds N      integer seconds (internally converted to ms)
 *
 * Objective length is capped at MAX_GOAL_OBJECTIVE_LENGTH (4000) characters.
 */

import { MAX_GOAL_OBJECTIVE_LENGTH } from '@byfriends/sdk';

export type GoalCommand =
  | { readonly kind: 'status' }
  | { readonly kind: 'pause' }
  | { readonly kind: 'resume' }
  | { readonly kind: 'cancel' }
  | {
      readonly kind: 'create';
      readonly objective: string;
      readonly replace: boolean;
      readonly budget?: GoalCommandBudget | undefined;
    }
  | { readonly kind: 'error'; readonly message: string; readonly severity?: 'warn' | 'error' };

export interface GoalCommandBudget {
  readonly turnBudget?: number | undefined;
  readonly tokenBudget?: number | undefined;
  readonly wallClockBudgetMs?: number | undefined;
}

const BUDGET_FLAGS = new Set(['--max-turns', '--max-tokens', '--max-seconds']);

export function parseGoalCommand(rawArgs: string): GoalCommand {
  const input = rawArgs.trim();

  // No args = status.
  if (input.length === 0) {
    return { kind: 'status' };
  }

  // "-- <objective...>" escape: drop the marker and treat the rest verbatim
  // as an objective (so "/goal -- status the deploy" creates instead of
  // running the status sub-command).
  if (input.startsWith('-- ')) {
    return parseCreate(input.slice(3).trim(), false);
  }
  // Bare "--" with nothing after is an empty objective.
  if (input === '--') {
    return { kind: 'error', message: 'Goal objective must not be empty.' };
  }

  const firstToken = firstWord(input);
  if (firstToken === 'status') return { kind: 'status' };
  if (firstToken === 'pause') return { kind: 'pause' };
  if (firstToken === 'resume') return { kind: 'resume' };
  if (firstToken === 'cancel') return { kind: 'cancel' };
  if (firstToken === 'replace') {
    const rest = input.slice(firstToken.length).trim();
    return parseCreate(rest, true);
  }

  return parseCreate(input, false);
}

function parseCreate(objectiveAndFlags: string, replace: boolean): GoalCommand {
  if (objectiveAndFlags.length === 0) {
    return {
      kind: 'error',
      message: replace
        ? 'Usage: /goal replace [--max-turns N] [--max-tokens N] [--max-seconds N] <objective>'
        : 'Usage: /goal [--max-turns N] [--max-tokens N] [--max-seconds N] <objective>',
    };
  }

  const { objective, budget, error } = splitObjectiveAndBudget(objectiveAndFlags);
  if (error !== undefined) return { kind: 'error', message: error };

  if (objective.length === 0) {
    return { kind: 'error', message: 'Goal objective must not be empty.' };
  }
  if (objective.length > MAX_GOAL_OBJECTIVE_LENGTH) {
    return {
      kind: 'error',
      message: `Goal objective exceeds ${MAX_GOAL_OBJECTIVE_LENGTH} characters.`,
    };
  }

  return {
    kind: 'create',
    objective,
    replace,
    budget,
  };
}

/**
 * Pull trailing budget flags off the raw input, leaving the objective as the
 * leading text. Flags may appear in any order after the objective; the first
 * non-flag token sequence is treated as the objective. If a flag appears
 * before any objective token, the objective is built from the remaining
 * non-flag tokens.
 *
 * Returns an `error` if a flag is missing its value or a value is not a
 * positive integer.
 */
function splitObjectiveAndBudget(input: string): {
  objective: string;
  budget: GoalCommandBudget | undefined;
  error: string | undefined;
} {
  const tokens = input.split(/\s+/).filter((t) => t.length > 0);
  const objectiveTokens: string[] = [];
  let turnBudget: number | undefined;
  let tokenBudget: number | undefined;
  let wallClockBudgetMs: number | undefined;
  let hasBudget = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (!BUDGET_FLAGS.has(token)) {
      objectiveTokens.push(token);
      continue;
    }
    const rawValue = tokens[i + 1];
    if (rawValue === undefined || rawValue.startsWith('--')) {
      return {
        objective: '',
        budget: undefined,
        error: `Flag ${token} requires an integer value.`,
      };
    }
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed) || String(parsed) !== rawValue || parsed < 0) {
      return {
        objective: '',
        budget: undefined,
        error: `Flag ${token} requires a non-negative integer (got "${rawValue}").`,
      };
    }
    i += 1;
    hasBudget = true;
    switch (token) {
      case '--max-turns':
        turnBudget = parsed;
        break;
      case '--max-tokens':
        tokenBudget = parsed;
        break;
      case '--max-seconds':
        wallClockBudgetMs = parsed * 1000;
        break;
    }
  }

  return {
    objective: objectiveTokens.join(' ').trim(),
    budget: hasBudget ? { turnBudget, tokenBudget, wallClockBudgetMs } : undefined,
    error: undefined,
  };
}

function firstWord(input: string): string {
  const match = input.match(/^(\S+)/);
  return match === null ? '' : match[1]!;
}
