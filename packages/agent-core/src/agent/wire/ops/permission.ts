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

import type { ApprovalGrantAuthority, PermissionMode } from '#/agent/permission/types';
import { defineModel } from '#/agent/wire';

const permissionModeSchema = z.enum(['manual', 'yolo', 'auto']) satisfies z.ZodType<PermissionMode>;

/** 与 `ApprovalGrantAuthority` 一一对应（#345）。 */
const approvalGrantAuthoritySchema = z.union([
  z.object({ kind: z.literal('user-verdict') }),
  z.object({ kind: z.literal('restored-user-verdict') }),
  z.object({ kind: z.literal('audit-only'), from: z.enum(['mode-auto-approve', 'policy']) }),
]) satisfies z.ZodType<ApprovalGrantAuthority>;

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
      // #345：授权来源随记录一起持久化，否则"谁能扩大本会话同类放行"这件事在
      // 恢复后就无人记得（reducer 只看得到 decision + scope）。
      authority: approvalGrantAuthoritySchema.optional(),
    }),
    apply: (state, payload) => {
      const result = payload.result as { decision?: string; scope?: string } | undefined;
      if (result?.decision !== 'approved' || result?.scope !== 'session') return state;
      // 审计-only 的来源（模式自动放行、policy 上报）落记录但不 mint 会话规则。
      // `authority` 缺失只可能是 #345 之前写入的 journal：那时还没有来源概念，
      // 无从复审判定，所以按当时语义入账。该默认值只影响历史数据，且不会比改动
      // 前更宽松——新写入的记录一定带 authority。
      if (payload.authority?.kind === 'audit-only') return state;
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
