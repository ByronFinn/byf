/**
 * UpdateGoalTool — change the lifecycle status of the current goal
 * (PRD-0019 #202, ADR-0024).
 *
 * Returns a plain success — does **not** set stopTurn. The driver (#201)
 * reads the resulting goal status at the next turn boundary and stops
 * looping when the status is no longer `active`. The current turn is
 * allowed to finish its in-flight tool work.
 *
 * loopTools gate: hidden when no goal is present.
 */

import { z } from 'zod';

import type { Agent } from '../../../agent';
import type { BuiltinTool } from '../../../agent/tool';
import { ByfError, ErrorCodes } from '../../../errors';
import type { ExecutableToolResult, ToolExecution } from '../../../loop/types';
import { toInputJsonSchema } from '../../support/input-schema';
import { toErrorResult } from './create-goal';
import { renderCompletionSummary, renderBlockedReason } from './outcome-prompts';
import DESCRIPTION from './update-goal.md';

const VALID_STATUSES = ['active', 'complete', 'paused', 'blocked'] as const;
type UpdateGoalStatus = (typeof VALID_STATUSES)[number];

export interface UpdateGoalInput {
  readonly status: UpdateGoalStatus;
  readonly reason?: string;
}

export const UpdateGoalInputSchema: z.ZodType<UpdateGoalInput> = z.object({
  status: z
    .enum(VALID_STATUSES)
    .describe("Lifecycle status to apply. One of 'active', 'complete', 'paused', 'blocked'."),
  reason: z
    .string()
    .optional()
    .describe(
      'Short justification. Required for blocked, recommended for complete (this becomes the completion summary text).',
    ),
});

export class UpdateGoalTool implements BuiltinTool<UpdateGoalInput> {
  readonly name = 'UpdateGoal' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(UpdateGoalInputSchema);

  constructor(private readonly agent: Agent) {}

  resolveExecution(args: UpdateGoalInput): ToolExecution {
    return {
      description: describeTransition(args.status),
      execute: async (): Promise<ExecutableToolResult> => {
        try {
          const result = this.applyTransition(args);
          return result;
        } catch (error) {
          return toErrorResult(error);
        }
      },
    };
  }

  private applyTransition(args: UpdateGoalInput): ExecutableToolResult {
    const snapshot = this.agent.goal.getSnapshot();
    if (snapshot === null) {
      throw new ByfError(ErrorCodes.GOAL_NOT_FOUND, 'No active goal.');
    }
    if (args.status === snapshot.status) {
      return { isError: false, output: `Goal is already ${args.status}.` };
    }
    switch (args.status) {
      case 'complete': {
        this.agent.goal.markComplete(args.reason);
        const after = this.agent.goal.getSnapshot();
        if (after === null) {
          return { isError: false, output: 'Goal complete.' };
        }
        return { isError: false, output: renderCompletionSummary(after, args.reason) };
      }
      case 'blocked': {
        const reason = args.reason ?? 'unspecified blocker';
        this.agent.goal.markBlocked(reason);
        const after = this.agent.goal.getSnapshot();
        if (after === null) {
          return { isError: false, output: `Goal blocked: ${reason}` };
        }
        return { isError: false, output: renderBlockedReason(after) };
      }
      case 'paused': {
        this.agent.goal.markPaused(args.reason ?? 'paused by model');
        return { isError: false, output: 'Goal paused.' };
      }
      case 'active': {
        // resume() requires paused/blocked; reject otherwise.
        this.agent.goal.resume();
        return { isError: false, output: 'Goal resumed.' };
      }
      default: {
        const _exhaustive: never = args.status;
        return { isError: true, output: `Unknown status: ${String(_exhaustive)}` };
      }
    }
  }
}

function describeTransition(status: UpdateGoalStatus): string {
  switch (status) {
    case 'complete':
      return 'Marking goal complete';
    case 'blocked':
      return 'Marking goal blocked';
    case 'paused':
      return 'Pausing goal';
    case 'active':
      return 'Resuming goal';
    default: {
      const _exhaustive: never = status;
      return `Updating goal (${String(_exhaustive)})`;
    }
  }
}
