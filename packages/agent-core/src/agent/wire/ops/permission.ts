/**
 * `wire/ops/permission` —— permission 子系统的 Op 定义（纯 reducer）。
 *
 * reducer 状态 = `{ modeOverride, sessionApproved }`（对标 permission/index.ts 的
 * `_modeOverride` / `sessionApprovedActions` 持久部分；`parent`/`policies` 构造注入，
 * 不进 reducer）。set_mode 覆写 modeOverride；record_approval_result 仅当
 * `approved + scope='session'` 时把 `action → toolName` 记入 sessionApproved
 * （已存在则 no-op）—— sync 时据此重建 sessionApprovedActions 与 session-runtime
 * rules（actionToRulePattern 需要 toolName，Phase 3 从旧 legacy 路径迁入）。
 *
 * `replayBuilder.push`（approval_result / permission_updated）是 CLI resume 渲染用
 * 的派生事件，不在 reducer 状态里 —— approval_result 由 TUI 视为 no-op（Phase 1
 * 核实 projectReplayRecord 直接 return），permission_updated 由 Agent 的
 * onReplayRecord 按最终 mode 派生。
 */

import { z } from 'zod';

import type { PermissionMode } from '#/agent/permission/types';
import { defineModel } from '#/agent/wire';

const permissionModeSchema = z.enum(['manual', 'yolo', 'auto']) satisfies z.ZodType<PermissionMode>;

// —— Model ——

export interface PermissionModelState {
  readonly modeOverride: PermissionMode | undefined;
  /** action → toolName（仅 approved + session 的审批；重建 session rules 用）。 */
  readonly sessionApproved: ReadonlyMap<string, string>;
}

export const permissionModel = defineModel(
  'permission',
  (): PermissionModelState => ({
    modeOverride: undefined,
    sessionApproved: new Map(),
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
      // ApprovalResponse —— reducer 只用 decision/scope，其余结构宽松即可（replay tolerance）。
      result: z.unknown(),
    }),
    apply: (state, payload) => {
      const result = payload.result as { decision?: string; scope?: string } | undefined;
      if (result?.decision !== 'approved' || result?.scope !== 'session') return state;
      if (state.sessionApproved.has(payload.action)) return state;
      return {
        ...state,
        sessionApproved: new Map([...state.sessionApproved, [payload.action, payload.toolName]]),
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
