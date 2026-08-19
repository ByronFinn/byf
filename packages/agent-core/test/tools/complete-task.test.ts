/**
 * CompleteTask 测试（PRD-0031 2b：完成语义泛化）。
 *
 * - 工具级：无后台任务 → 声明式完成（isError + stopTurn，loop 停 turn 信号）；
 *   有运行中的后台任务 → completion guard nudge（不停止，提示先处理）。
 * - turn 级：模型调用 CompleteTask 后 turn 结束（非「无工具调用」启发式）。
 */
import { Readable, type Writable } from 'node:stream';

import type { KaosProcess } from '@byfriends/kaos';
import { describe, expect, it, vi } from 'vitest';

import { BackgroundProcessManager } from '../../src/tools/background/manager';
import { CompleteTaskTool } from '../../src/tools/builtin/state/complete-task';
import { testAgent } from '../agent/harness/agent';
import { executeTool } from '../tools/fixtures/execute-tool';
import { createFakeKaos } from '../tools/fixtures/fake-kaos';

function context() {
  return {
    turnId: '0',
    toolCallId: 'call_complete',
    args: {},
    signal: new AbortController().signal,
  };
}

function pendingProcess(): KaosProcess {
  let resolveWait: (code: number) => void = () => {};
  const waitPromise = new Promise<number>((res) => {
    resolveWait = res;
  });
  let currentExitCode: number | null = null;
  const proc: KaosProcess = {
    stdin: { write: vi.fn(), end: vi.fn() } as unknown as Writable,
    stdout: Readable.from([]),
    stderr: Readable.from([]),
    pid: 42_042,
    get exitCode(): number | null {
      return currentExitCode;
    },
    wait: () => waitPromise,
    kill: vi.fn(async () => {
      if (currentExitCode === null) {
        currentExitCode = 143;
        resolveWait(143);
      }
    }) as unknown as KaosProcess['kill'],
  };
  return proc;
}

describe('CompleteTaskTool (PRD-0031 2b)', () => {
  it('无后台任务：声明式完成契约（isError + stopTurn）', async () => {
    const tool = new CompleteTaskTool();
    const execution = tool.resolveExecution({});
    const result = await execution.execute({
      ...context(),
      kaos: createFakeKaos(),
      runtime: {} as never,
    });
    expect(result.isError).toBe(true);
    expect((result as { stopTurn?: boolean }).stopTurn).toBe(true);
    const output = typeof result.output === 'string' ? result.output : '';
    expect(output).toContain('Task complete');
  });

  it('有运行中的后台任务：guard nudge，不停止 turn', async () => {
    const background = new BackgroundProcessManager(createFakeKaos(), {});
    const reservation = background.reserveSlot();
    background.register(pendingProcess(), 'sleep 100', 'running job', { reservation });
    expect(background.list().length).toBeGreaterThan(0);

    const tool = new CompleteTaskTool(background);
    const execution = tool.resolveExecution({});
    const result = await execution.execute({
      ...context(),
      kaos: createFakeKaos(),
      runtime: {} as never,
    });
    expect(result.isError).toBe(false);
    const output = typeof result.output === 'string' ? result.output : '';
    expect(output).toContain('premature');
    expect(output).toContain('background task');
    expect((result as { stopTurn?: boolean }).stopTurn).toBeUndefined();
  });
});

describe('CompleteTask 集成（PRD-0031 2b）', () => {
  it('模型调用 CompleteTask 后 turn 结束（声明式完成契约）', async () => {
    const ctx = testAgent();
    ctx.configure({ tools: ['CompleteTask'] });
    ctx.mockNextResponse(
      { type: 'text', text: 'Done.' },
      {
        type: 'function',
        id: 'call_done',
        name: 'CompleteTask',
        arguments: '{}',
      },
    );
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'Do the thing' }] });
    const snapshot = await ctx.untilTurnEnd();
    // turn 在工具批次后结束：无第二个模型 step
    expect(snapshot).not.toContain('step.begin');
    expect(ctx.llmInputs().inputs).toHaveLength(1);
  });
});
