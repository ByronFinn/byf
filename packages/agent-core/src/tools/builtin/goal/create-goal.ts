/**
 * CreateGoalTool — declare a new autonomous goal (PRD-0019 #202).
 *
 * Calls `agent.goal.createGoal(objective, { replace, budget })`. The driver
 * (#201) takes over at the end of the current turn — this tool only mutates
 * goal state and returns a plain success.
 *
 * Visibility is gated at two layers (PRD R7):
 *   - Registration: only main agents register this tool.
 *   - loopTools: this tool is always visible to the main agent when registered.
 */

import { z } from 'zod';

import type { Agent } from '../../../agent';
import type { BuiltinTool } from '../../../agent/tool';
import type { ExecutableToolResult, ToolExecution } from '../../../loop/types';
import { toInputJsonSchema } from '../../support/input-schema';
import DESCRIPTION from './create-goal.md';

const BudgetSchema = z
  .object({
    turn_budget: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Maximum number of continuation turns the driver will run.'),
    token_budget: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Maximum cumulative input+output tokens the driver will spend.'),
    wall_clock_budget_ms: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Maximum wall-clock milliseconds while the goal is active.'),
  })
  .optional()
  .describe('Optional hard limits on how far the goal may run.');

export interface CreateGoalInput {
  readonly objective: string;
  readonly replace?: boolean | undefined;
  readonly budget?:
    | {
        readonly turn_budget?: number | undefined;
        readonly token_budget?: number | undefined;
        readonly wall_clock_budget_ms?: number | undefined;
      }
    | undefined;
}

export const CreateGoalInputSchema: z.ZodType<CreateGoalInput> = z.object({
  objective: z
    .string()
    .min(1)
    .describe('A single concrete verifiable sentence describing what "done" looks like.'),
  replace: z
    .boolean()
    .optional()
    .describe('If true, discard any current goal and start fresh. Default false.'),
  budget: BudgetSchema,
});

const MUTATION_TOOL_NAMES = new Set(['SetGoalBudget', 'UpdateGoal']);

export class CreateGoalTool implements BuiltinTool<CreateGoalInput> {
  readonly name = 'CreateGoal' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(CreateGoalInputSchema);

  constructor(private readonly agent: Agent) {}

  resolveExecution(args: CreateGoalInput): ToolExecution {
    return {
      description: args.replace ? 'Replacing goal' : 'Creating goal',
      execute: async (): Promise<ExecutableToolResult> => {
        try {
          this.agent.goal.createGoal(args.objective, {
            replace: args.replace ?? false,
            budget: normalizeBudget(args.budget),
          });
          return {
            isError: false,
            output: `Goal created: ${this.agent.goal.getSnapshot()?.objective ?? ''}`,
          };
        } catch (error) {
          return toErrorResult(error);
        }
      },
    };
  }
}

/** Convert snake_case tool input to GoalBudgetLimits (camelCase). */
export function normalizeBudget(budget: CreateGoalInput['budget']):
  | {
      readonly turnBudget?: number | undefined;
      readonly tokenBudget?: number | undefined;
      readonly wallClockBudgetMs?: number | undefined;
    }
  | undefined {
  if (budget === undefined) return undefined;
  const out: {
    turnBudget?: number | undefined;
    tokenBudget?: number | undefined;
    wallClockBudgetMs?: number | undefined;
  } = {};
  if (budget.turn_budget !== undefined) out.turnBudget = budget.turn_budget;
  if (budget.token_budget !== undefined) out.tokenBudget = budget.token_budget;
  if (budget.wall_clock_budget_ms !== undefined)
    out.wallClockBudgetMs = budget.wall_clock_budget_ms;
  return out;
}

/** Shared error → tool result helper for the four goal tools. */
export function toErrorResult(error: unknown): ExecutableToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, output: message };
}

/**
 * Names of the goal tools that mutate an existing goal. Used by the
 * ToolManager loopTools gate to hide these tools when no goal is present.
 */
export const GOAL_MUTATION_TOOL_NAMES = MUTATION_TOOL_NAMES;
