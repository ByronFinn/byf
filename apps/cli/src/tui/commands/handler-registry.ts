// 斜杠命令处理器注册表。
//
// 用基于 Map 的分发取代 27 分支的 `handleBuiltInSlashCommand` switch。
// 每个内置命令在此注册其处理器;分发就是一次 `Map.get(name)(args)` 查找。
//
// `SlashCommandHost` 接口位于 `handlers/slash-host.ts`。
// `handlers/` 下的分组模块向本注册表注册。

import type { BuiltinSlashCommandName } from './registry';

/**
 * 斜杠命令处理器:接收原始参数字符串并执行其工作。
 */
export type SlashCommandHandler = (args: string) => Promise<void>;

/**
 * 内置命令名到其处理器的注册表映射。
 *
 * 穷尽性在注册点强制——注册器必须为每个 `BuiltinSlashCommandName`
 * 提供处理器。
 */
export class SlashCommandHandlerRegistry {
  private readonly handlers = new Map<BuiltinSlashCommandName, SlashCommandHandler>();

  /**
   * Register a handler for a builtin command name.
   * Throws if the name already has a handler (double-registration is a bug).
   */
  register(name: BuiltinSlashCommandName, handler: SlashCommandHandler): void {
    if (this.handlers.has(name)) {
      throw new Error(`Slash command handler already registered for /${name}`);
    }
    this.handlers.set(name, handler);
  }

  /**
   * Look up the handler for a command name.
   * Returns `undefined` if no handler is registered (should not happen for
   * builtin commands — `registerBuiltinSlashHandlers` covers them all).
   */
  get(name: BuiltinSlashCommandName): SlashCommandHandler | undefined {
    return this.handlers.get(name);
  }
}
