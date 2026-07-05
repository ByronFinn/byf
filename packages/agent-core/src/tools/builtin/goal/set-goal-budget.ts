/**
 * SetGoalBudgetTool — partial budget update for the current goal (PRD-0019 #202).
 *
 * Calls `agent.goal.setBudget(patch)`. Omitted fields keep their current
 * value (not cleared to zero). Mutates only the budget; status/objective/
 * usage are untouched.
 *
 * loopTools gate: hidden when no goal is present.
 */

import { z } from 'zod';

import type { Agent } from '../../../agent';
import type { BuiltinTool } from '../../../agent/tool';
import type { ExecutableToolResult, ToolExecution } from '../../../loop/types';
import { toInputJsonSchema } from '../../support/input-schema';
import { normalizeBudget, toErrorResult } from './create-goal';
import DESCRIPTION from './set-goal-budget.md';

const BudgetPatchSchema = z
  .object({
    turn_budget: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('New cap on continuation turns. Omit to keep current value.'),
    token_budget: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('New cap on cumulative input+output tokens. Omit to keep current value.'),
    wall_clock_budget_ms: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('New cap on wall-clock milliseconds while active. Omit to keep current value.'),
  })
  .describe(
    'Budget patch. Only the fields you include are updated; omitted fields keep their current value.',
  );

export interface SetGoalBudgetInput {
  readonly turn_budget?: number | undefined;
  readonly token_budget?: number | undefined;
  readonly wall_clock_budget_ms?: number | undefined;
}

export const SetGoalBudgetInputSchema: z.ZodType<SetGoalBudgetInput> = z.object({
  turn_budget: BudgetPatchSchema.shape.turn_budget,
  token_budget: BudgetPatchSchema.shape.token_budget,
  wall_clock_budget_ms: BudgetPatchSchema.shape.wall_clock_budget_ms,
});

export class SetGoalBudgetTool implements BuiltinTool<SetGoalBudgetInput> {
  readonly name = 'SetGoalBudget' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(SetGoalBudgetInputSchema);

  constructor(private readonly agent: Agent) {}

  resolveExecution(args: SetGoalBudgetInput): ToolExecution {
    return {
      description: 'Updating goal budget',
      execute: async (): Promise<ExecutableToolResult> => {
        if (
          args.turn_budget === undefined &&
          args.token_budget === undefined &&
          args.wall_clock_budget_ms === undefined
        ) {
          return {
            isError: true,
            output:
              'SetGoalBudget requires at least one of turn_budget, token_budget, wall_clock_budget_ms.',
          };
        }
        try {
          this.agent.goal.setBudget(normalizeBudget(args) ?? {});
          return { isError: false, output: 'Goal budget updated.' };
        } catch (error) {
          return toErrorResult(error);
        }
      },
    };
  }
}
