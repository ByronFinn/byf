import { describe, expect, it } from 'vitest';

import type { AgentRecordEvents } from '../../../src/agent/records/types';
// import 触发全部业务 Op 注册（import = register）—— per-file 隔离进程下必须显式
// 导入（否则 OP_REGISTRY 为空，drift guard 失效）。
import '../../../src/agent/wire/ops';
import { OP_REGISTRY } from '../../../src/agent/wire';

describe('AgentRecords facade — record type restore coverage (drift guard)', () => {
  // Phase 1 Facade 的路由模型：每个 record 类型由以下之一覆盖——
  // 1. OP_REGISTRY：7 个纯 reducer 子系统（goal/usage/tools/turn/permission/config/
  //    full_compaction）+ background 的 Op 已注册，restore 走 silent apply。
  // 2. legacyRoute：context.*（Phase 5 深水区前保留）走 restoreRecord。
  // 3. metadata：wire 协议信封，restore 时直接处理。
  // 新增 record 类型时必须落入其中一类，否则 restore 会按 replay tolerance 静默跳过。
  const LEGACY_ROUTED_PREFIXES: ReadonlySet<string> = new Set(['context']);

  // 所有 AgentRecordEvents key 必须出现在这里。赋值强制 TS 求值 Missing ——
  // 仅声明未使用的 type alias 不会触发 typecheck。
  const ALL_RECORD_TYPES = [
    'metadata',
    'turn.prompt',
    'turn.steer',
    'turn.cancel',
    'config.update',
    'permission.set_mode',
    'permission.record_approval_result',
    'full_compaction.begin',
    'full_compaction.cancel',
    'full_compaction.complete',
    'tools.register_user_tool',
    'tools.unregister_user_tool',
    'tools.set_active_tools',
    'tools.update_store',
    'background.stop',
    'usage.record',
    'context.append_message',
    'context.mark_last_user_prompt_blocked',
    'context.append_loop_event',
    'context.clear',
    'context.apply_compaction',
    'context.observation_masking',
    'context.output_offloaded',
    'context.pruning',
    'goal.create',
    'goal.update',
    'goal.clear',
  ] as const;
  type Missing = Exclude<keyof AgentRecordEvents, (typeof ALL_RECORD_TYPES)[number]>;
  const _exhaustive: [Missing] extends [never] ? true : Missing = true;
  void _exhaustive;

  it('every record type is a registered Op, legacy-routed, or metadata', () => {
    const unaccounted = ALL_RECORD_TYPES.filter((type) => {
      if (type === 'metadata') return false; // wire 协议信封，restore 直接处理
      const prefix = type.split('.')[0] ?? '';
      if (LEGACY_ROUTED_PREFIXES.has(prefix)) return false; // context.* → legacyRoute
      return !OP_REGISTRY.has(type); // 其余必须是已注册 Op
    });
    expect(unaccounted).toEqual([]);
  });

  it('all pure-reducer subsystems are registered as Ops (non-legacy, non-metadata)', () => {
    // 除 context.*（8 个）legacy 与 metadata（协议）外，全部在 OP_REGISTRY。
    const registered = ALL_RECORD_TYPES.filter((type) => {
      if (type === 'metadata') return false;
      const prefix = type.split('.')[0] ?? '';
      if (LEGACY_ROUTED_PREFIXES.has(prefix)) return false;
      return OP_REGISTRY.has(type);
    });
    expect(registered).toHaveLength(ALL_RECORD_TYPES.length - 8 - 1);
  });
});
