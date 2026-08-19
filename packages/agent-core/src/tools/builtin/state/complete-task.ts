/**
 * CompleteTaskTool — 完成语义泛化（PRD-0031 2b）。
 *
 * goal 模式的类型化完成契约（`UpdateGoal(status:'complete')` →
 * `GoalChange{kind:'completion'}`）此前只服务 goal 模式；普通 turn 退化为
 * 「无工具调用 = end_turn」启发式（`loop/turn-step.ts`）。本工具把声明式
 * 完成契约推广到普通 turn：模型调用即宣告任务完成并结束当前 turn
 * （`stopTurn` 循环控制提示，非「无工具调用」启发式）。
 *
 * completion guard（提前收工 nudge）：仍有运行中的后台任务时，收工是
 * 过早的——工具不停止 turn，回传 nudge 让模型先处理后台任务
 * （TaskOutput / TaskStop）再宣告完成。
 */

import { z } from 'zod';

import type { BuiltinTool } from '../../../agent/tool';
import type { ExecutableToolResult, ToolExecution } from '../../../loop/types';
import type { BackgroundProcessManager } from '../../background/manager';
import { toInputJsonSchema } from '../../support/input-schema';

export const CompleteTaskInputSchema = z.object({});

export type CompleteTaskInput = z.infer<typeof CompleteTaskInputSchema>;

const DESCRIPTION = [
  'Declare that the current task is complete and end the turn.',
  '',
  'Call this ONLY when the task you were asked to do is genuinely finished and verified. ' +
    'Do NOT call it to stop early, to hand off unfinished work, or while background tasks are ' +
    'still running — wait for them (TaskOutput) or cancel them (TaskStop) first.',
  '',
  'Prefer this over simply producing a final message: a declared completion is the explicit ' +
    'completion contract; without it the turn may continue for another model step.',
].join('\n');

export class CompleteTaskTool implements BuiltinTool<CompleteTaskInput> {
  readonly name = 'CompleteTask' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(CompleteTaskInputSchema);

  constructor(private readonly background?: BackgroundProcessManager) {}

  resolveExecution(_args: CompleteTaskInput): ToolExecution {
    return {
      description: 'Declaring task complete',
      execute: async (): Promise<ExecutableToolResult> => {
        const runningCount = this.background?.list().length ?? 0;
        if (runningCount > 0) {
          return {
            isError: false,
            output:
              `Task completion is premature: ${String(runningCount)} background task(s) are still running. ` +
              `Use TaskOutput to inspect them or TaskStop to cancel before declaring completion. ` +
              `Do not declare completion while background work is pending.`,
          };
        }
        // 声明式完成契约：isError + stopTurn 是 loop 的 turn 停止信号
        // （`toolResultStopsTurn`）；output 为正向完成宣告，模型读到的是
        // 完成语义而非失败语义。
        return {
          isError: true,
          stopTurn: true,
          output: 'Task complete.',
        };
      },
    };
  }
}
