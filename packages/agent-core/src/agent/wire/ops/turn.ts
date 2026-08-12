/**
 * `wire/ops/turn` —— turn 子系统的 Op 定义（纯 reducer）。
 *
 * reducer 状态 = `{ turnId }`（初始 -1，对标 turn/index.ts:66）。**每次** turn.prompt /
 * turn.steer 都使 turnId +1：restoreRecord 在调 restorePrompt/restoreSteer 前总把
 * `activeTurn` 从 'resuming' 清回 null（turn/index.ts:820-822/827-829），故二者的
 * 「if activeTurn 则不增」早返回分支在 restore 期永不命中。turn.cancel 是 no-op。
 *
 * `activeTurn` / `steerBuffer` 是运行态（由 finishResume → onDidRestore 收尾），
 * telemetry Map 同理（PRD：telemetry 不进 reducer），均不在 reducer 状态里。
 *
 * input / origin 的 schema 故意宽松（replay tolerance 只校验结构，不深验 ContentPart）。
 */

import { z } from 'zod';

import { defineModel } from '#/agent/wire';

const promptInputSchema = z.array(z.unknown()).readonly();
const promptOriginSchema = z.unknown();

// —— Model ——

export interface TurnModelState {
  /** 当前 turn 计数（初始 -1，对标 turn/index.ts:66）。 */
  readonly turnId: number;
}

export const turnModel = defineModel('turn', (): TurnModelState => ({ turnId: -1 }));

// —— Ops ——

export const turnPrompt = turnModel.defineOp('turn.prompt', {
  schema: z.object({ input: promptInputSchema, origin: promptOriginSchema }),
  apply: (state) => ({ turnId: state.turnId + 1 }),
});

export const turnSteer = turnModel.defineOp('turn.steer', {
  schema: z.object({ input: promptInputSchema, origin: promptOriginSchema }),
  apply: (state) => ({ turnId: state.turnId + 1 }),
});

export const turnCancel = turnModel.defineOp('turn.cancel', {
  schema: z.object({ turnId: z.number().optional() }),
  apply: (state) => state,
});

declare module '#/agent/wire/types' {
  interface PersistedOpMap {
    'turn.prompt': typeof turnPrompt;
    'turn.steer': typeof turnSteer;
    'turn.cancel': typeof turnCancel;
  }
}
