import { DynamicInjector } from './injector';

/**
 * 在请求时提供当前时间戳的 ephemeral 注入器。
 *
 * 时间戳在每一步都重新渲染(不冻结),置于 `'before_user'` 位置,
 * 因此永不破坏缓存前缀。这符合提示缓存的最佳实践:把每请求的动态内容
 * 移出可缓存的 system-prompt 块。
 */
export class TimestampInjector extends DynamicInjector {
  protected override readonly injectionVariant = 'timestamp';

  protected override getInjection(): undefined {
    return undefined;
  }

  override getEphemeral() {
    return [
      {
        kind: 'system_reminder' as const,
        content: `The current date and time in ISO format is \`${new Date().toISOString()}\`. This is only a reference for you when searching the web or checking file modification time, etc. If you need the exact time, use Bash tool with proper command.`,
        position: 'before_user' as const,
      },
    ];
  }
}
