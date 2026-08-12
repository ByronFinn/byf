/**
 * `wire/ops/permission` —— permission 子系统的 Op 定义（纯 reducer）。
 *
 * reducer 状态 = `{ modeOverride, sessionApprovedActions }`（对标 permission/index.ts:32
 * 与 `parent`/`policies` 构造注入，不进 reducer）。set_mode 覆写 modeOverride；
 * record_approval_result 把 action 加入 sessionApprovedActions（已存在则 no-op，
 * 对标 permission/index.ts:86-89）。`replayBuilder.push` 是 CLI resume 渲染用的运行态
 * 收集，不在 reducer 状态里。
 */

import { z } from 'zod';

import type { PermissionMode } from '#/agent/permission/types';
import { defineModel } from '#/agent/wire';

const permissionModeSchema = z.enum(['manual', 'yolo', 'auto']) satisfies z.ZodType<PermissionMode>;

// —— Model ——

export interface PermissionModelState {
  readonly modeOverride: PermissionMode | undefined;
  readonly sessionApprovedActions: ReadonlySet<string>;
}

export const permissionModel = defineModel(
  'permission',
  (): PermissionModelState => ({
    modeOverride: undefined,
    sessionApprovedActions: new Set(),
  }),
);

// —— Ops ——

export const permissionSetMode = permissionModel.defineOp('permission.set_mode', {
  schema: z.object({ mode: permissionModeSchema }),
  apply: (state, payload) => ({ ...state, modeOverride: payload.mode }),
});

export const permissionRecordApprovalResult = permissionModel.defineOp(
  'permission.record_approval_result',
  {
    schema: z.object({
      turnId: z.number(),
      toolCallId: z.string(),
      toolName: z.string(),
      action: z.string(),
      // ApprovalResponse —— reducer 只用 action，result 结构宽松即可（replay tolerance）。
      result: z.unknown(),
    }),
    apply: (state, payload) => {
      if (state.sessionApprovedActions.has(payload.action)) return state;
      return {
        ...state,
        sessionApprovedActions: new Set([...state.sessionApprovedActions, payload.action]),
      };
    },
  },
);

declare module '#/agent/wire/types' {
  interface PersistedOpMap {
    'permission.set_mode': typeof permissionSetMode;
    'permission.record_approval_result': typeof permissionRecordApprovalResult;
  }
}
