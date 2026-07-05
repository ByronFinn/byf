/**
 * GetGoalTool — read the current goal snapshot (PRD-0019 #202).
 *
 * Always visible to the main agent; never mutates state. Throws
 * `goal.not_found` if no goal is present (surfaced as a tool error result).
 */

import { z } from 'zod';

import type { Agent } from '../../../agent';
import type { BuiltinTool } from '../../../agent/tool';
import type { ExecutableToolResult, ToolExecution } from '../../../loop/types';
import { toInputJsonSchema } from '../../support/input-schema';
import DESCRIPTION from './get-goal.md';
import { renderStatusLine } from './outcome-prompts';

export interface GetGoalInput {}

export const GetGoalInputSchema: z.ZodType<GetGoalInput> = z.object({});

export class GetGoalTool implements BuiltinTool<GetGoalInput> {
  readonly name = 'GetGoal' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(GetGoalInputSchema);

  constructor(private readonly agent: Agent) {}

  resolveExecution(_args: GetGoalInput): ToolExecution {
    return {
      description: 'Reading goal',
      execute: async (): Promise<ExecutableToolResult> => {
        const snapshot = this.agent.goal.getSnapshot();
        if (snapshot === null) {
          return { isError: true, output: 'No active goal.' };
        }
        return { isError: false, output: renderStatusLine(snapshot) };
      },
    };
  }
}
