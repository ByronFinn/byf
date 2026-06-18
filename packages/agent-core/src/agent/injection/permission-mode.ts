import { DynamicInjector } from './injector';

const AUTO_MODE_REMINDER = [
  'Auto permission mode is active. Tool approvals will be handled automatically while this mode remains enabled.',
  '  - Continue normally without pausing for approval prompts.',
  '  - Do NOT call AskUserQuestion while auto mode is active. Make a reasonable decision and continue without asking the user.',
].join('\n');

/**
 * Ephemeral injector for permission mode state.
 *
 * Emits the current permission mode as an ephemeral injection placed at
 * the `'before_user'` position. Unlike the previous persistent approach
 * (which recorded transition events into history), the ephemeral approach
 * always reflects the current state — surviving compaction and avoiding
 * history pollution.
 *
 * Only auto mode produces an injection; in all other modes the absence
 * of a reminder signals that normal approval prompts apply.
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
