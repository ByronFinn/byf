/**
 * `wire/ops/config` —— config 子系统的 Op 定义（纯 reducer）。
 *
 * reducer 状态 = 6 个标量字段（cwd / additionalDirs / modelAlias / profileName /
 * thinkingLevel / systemPrompt），对标 ConfigState 的 `_cwd` 等私有字段。apply 复刻
 * `update()` 里**纯状态突变**部分（config/index.ts:47-55）：cwd/additionalDirs/
 * thinkingLevel/systemPrompt 用 `!== undefined` 判定；modelAlias/profileName 用
 * `Object.hasOwn` 判定（显式 undefined 即清除）。
 *
 * **副作用不进 reducer**（PRD Phase 3 坑点）：`initializeBuiltinTools()`、
 * `emitStatusUpdated()`、`replayBuilder.push` 是 service 层 effect。其中
 * `initializeBuiltinTools` 须外提为 onDidRestore hook（下轮 turn 需要工具实例）。
 */

import { z } from 'zod';

import type { AgentConfigUpdateData } from '#/agent/config';
import { defineModel } from '#/agent/wire';

const configUpdateSchema = z.object({
  cwd: z.string().optional(),
  additionalDirs: z.array(z.string()).optional(),
  modelAlias: z.string().optional(),
  profileName: z.string().optional(),
  thinkingLevel: z.string().optional(),
  systemPrompt: z.string().optional(),
}) satisfies z.ZodType<AgentConfigUpdateData>;

// —— Model ——

export interface ConfigModelState {
  readonly cwd: string | undefined;
  readonly additionalDirs: readonly string[] | undefined;
  readonly modelAlias: string | undefined;
  readonly profileName: string | undefined;
  readonly thinkingLevel: string | undefined;
  readonly systemPrompt: string | undefined;
}

export const configModel = defineModel(
  'config',
  (): ConfigModelState => ({
    cwd: undefined,
    additionalDirs: undefined,
    modelAlias: undefined,
    profileName: undefined,
    thinkingLevel: undefined,
    systemPrompt: undefined,
  }),
);

// —— Op ——

export const configUpdate = configModel.defineOp('config.update', {
  schema: configUpdateSchema,
  apply: (state, payload) => ({
    cwd: payload.cwd ?? state.cwd,
    additionalDirs: payload.additionalDirs ?? state.additionalDirs,
    // modelAlias / profileName 用 Object.hasOwn：显式 undefined 即清除。
    modelAlias: Object.hasOwn(payload, 'modelAlias')
      ? (payload.modelAlias ?? undefined)
      : state.modelAlias,
    profileName: Object.hasOwn(payload, 'profileName') ? payload.profileName : state.profileName,
    thinkingLevel: payload.thinkingLevel ?? state.thinkingLevel,
    systemPrompt: payload.systemPrompt ?? state.systemPrompt,
  }),
});

declare module '#/agent/wire/types' {
  interface PersistedOpMap {
    'config.update': typeof configUpdate;
  }
}
