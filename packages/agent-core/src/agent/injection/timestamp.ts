import { DynamicInjector } from './injector';

/**
 * Ephemeral injector that provides the current timestamp at request time.
 *
 * The timestamp is rendered fresh on every step (not frozen) and placed
 * at the `'before_user'` position so it never breaks the cached prefix.
 * This aligns with the prompt-cache best practice of keeping per-request
 * dynamic content out of the cacheable system-prompt blocks.
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
