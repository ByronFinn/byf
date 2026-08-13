import { DynamicInjector } from './injector';

const AUTO_MODE_REMINDER = [
  'Auto permission mode is active. Tool approvals will be handled automatically while this mode remains enabled.',
  '  - Continue normally without pausing for approval prompts.',
  '  - Do NOT call AskUserQuestion while auto mode is active. Make a reasonable decision and continue without asking the user.',
].join('\n');

/**
 * 权限模式状态的 ephemeral 注入器。
 *
 * 把当前权限模式作为置于 `'before_user'` 位置的 ephemeral 注入发出。与旧的
 * 持久化做法(把转换事件记录进历史)不同,ephemeral 做法始终反映当前状态——
 * 扛住压缩,避免历史污染。
 *
 * 只有 auto 模式产生注入;其他模式下提醒的缺席即表示常规审批提示适用。
 */
export class PermissionModeInjector extends DynamicInjector {
  protected override readonly injectionVariant = 'permission_mode';

  protected override getInjection(): undefined {
    return undefined;
  }

  override getEphemeral() {
    if (this.agent.permission.mode !== 'auto') return [];
    return [
      {
        kind: 'system_reminder' as const,
        content: AUTO_MODE_REMINDER,
        position: 'before_user' as const,
      },
    ];
  }
}
