// 从分组模块注册全部内置斜杠处理器。
// 穷尽性经 `satisfies Record<BuiltinSlashCommandName, …>` 强制。

import type { SlashCommandHandler, SlashCommandHandlerRegistry } from '../handler-registry';
import type { BuiltinSlashCommandName } from '../registry';
import { createAddDirHandlers } from './add-dir';
import { createAuthHandlers } from './auth';
import { createConfigHandlers } from './config';
import { createCronHandlers } from './cron';
import { createDialogHandlers } from './dialog';
import { createEditorHandlers } from './editor';
import { createGoalHandlers } from './goal';
import { createSessionHandlers } from './session';
import type { SlashCommandHost } from './slash-host';

export type { SlashCommandHost } from './slash-host';

/**
 * 向注册表注册每个 BuiltinSlashCommandName。
 * 仅当合并后的映射覆盖完整名称联合时才可编译。
 */
export function registerBuiltinSlashHandlers(
  registry: SlashCommandHandlerRegistry,
  host: SlashCommandHost,
): void {
  const handlers = {
    ...createSessionHandlers(host),
    ...createDialogHandlers(host),
    ...createEditorHandlers(host),
    ...createAuthHandlers(host),
    ...createGoalHandlers(host),
    ...createCronHandlers(host),
    ...createConfigHandlers(host),
    ...createAddDirHandlers(host),
  } satisfies Record<BuiltinSlashCommandName, SlashCommandHandler>;

  for (const [name, handler] of Object.entries(handlers)) {
    registry.register(name as BuiltinSlashCommandName, handler);
  }
}
