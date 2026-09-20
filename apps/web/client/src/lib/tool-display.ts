import type { ToolInputDisplay } from '#/types';

/**
 * 工具展示载荷（`ToolInputDisplay`）的 web 表面消费层。
 *
 * 类型来自 `@byfriends/web-shared` ← `@byfriends/sdk` ← agent-core 的 zod 真源
 * （PRD-0038 AC-6.1）。本文件不再用 `unknown` + `as Record<string, unknown>` 嗅探
 * `kind`：每个 `switch` 都覆盖 kind 全集且以 `never` 哨兵收尾，上游新增一种 kind
 * 时 `bun run typecheck` 直接报错（编译期）；运行时侧由
 * `test/tool-display.test.ts` 拿 SDK 导出的 kind 全集逐项断言（测试期）。
 *
 * 分层代价：浏览器运行时不能直引 `@byfriends/agent-core` / `@byfriends/sdk`
 * （ADR-0006 + `apps/web/AGENTS.md`），所以这里*不* import 真源的 schema 值，只
 * import 由真源派生的**类型**；穷尽性靠类型（`ToolInputDisplay` 联合 + `never`
 * 哨兵 + `Record<ToolInputDisplay['kind'], …>` 全键表）达成，不复制载荷定义。
 */

function str(value: string | undefined): string {
  return value ?? '';
}

/**
 * 穷尽性哨兵：只有当 switch 漏掉某个 kind 时才会被调用（届时 `display` 不再收窄
 * 为 `never`，编译期即失败）。运行期返回 `null` 而不是抛错——一张工具卡不该把整条
 * 时间线渲染崩掉；静默降级的口子由 kind 全集的契约测试堵住。
 */
function unhandledDisplay(_display: never): null {
  return null;
}

function joinNonEmpty(parts: readonly string[]): string {
  return parts.filter((p) => p.length > 0).join(' — ');
}

/**
 * command 类 display 的完整命令文本（展开体「查看/复制命令」用；其余 kind 无命令
 * 可查看）。被拒绝/取消的调用没有结果输出,命令只能从这里取。
 */
export function displayCommand(display: ToolInputDisplay | null | undefined): string | null {
  if (display === null || display === undefined) return null;
  switch (display.kind) {
    case 'command':
      return str(display.command).length > 0 ? display.command : null;
    case 'file_io':
    case 'diff':
    case 'search':
    case 'url_fetch':
    case 'agent_call':
    case 'skill_call':
    case 'todo_list':
    case 'background_task':
    case 'task_stop':
    case 'plan_review':
    case 'generic':
      return null;
    default:
      return unhandledDisplay(display);
  }
}

/** file_io / diff display 携带的可查看路径（R-C3；其余 kind 无可查看路径）。 */
export function displayFilePath(display: ToolInputDisplay | null | undefined): string | null {
  if (display === null || display === undefined) return null;
  switch (display.kind) {
    case 'file_io':
    case 'diff':
      return str(display.path).length > 0 ? display.path : null;
    case 'command':
    case 'search':
    case 'url_fetch':
    case 'agent_call':
    case 'skill_call':
    case 'todo_list':
    case 'background_task':
    case 'task_stop':
    case 'plan_review':
    case 'generic':
      return null;
    default:
      return unhandledDisplay(display);
  }
}

/** 结果区是否需要按 diff 的 +/- 着色（此前是 `['kind'] === 'diff'` 手工嗅探）。 */
export function isDiffDisplay(display: ToolInputDisplay | null | undefined): boolean {
  if (display === null || display === undefined) return false;
  switch (display.kind) {
    case 'diff':
      return true;
    case 'command':
    case 'file_io':
    case 'search':
    case 'url_fetch':
    case 'agent_call':
    case 'skill_call':
    case 'todo_list':
    case 'background_task':
    case 'task_stop':
    case 'plan_review':
    case 'generic':
      return false;
    default:
      // 编译期哨兵（见 `unhandledDisplay`）；运行期不可达，着色判定为 false。
      unhandledDisplay(display);
      return false;
  }
}

/** 把工具的 ToolInputDisplay 摘要成一两行可读文本（纯展示，非安全判断）。 */
export function summarizeDisplay(display: ToolInputDisplay | null | undefined): string | null {
  if (display === null || display === undefined) return null;
  switch (display.kind) {
    case 'command':
      return joinNonEmpty([str(display.description), str(display.command)]);
    case 'file_io':
      return `${str(display.operation)} ${str(display.path)}`.trim();
    case 'diff':
      return `edit ${str(display.path)}`;
    case 'search':
      return `${str(display.scope)} ${str(display.query)}`.trim();
    case 'url_fetch':
      return `${str(display.method) || 'GET'} ${str(display.url)}`;
    case 'agent_call':
      return `agent ${str(display.agent_name)}`;
    case 'skill_call':
      return `skill ${str(display.skill_name)}`;
    case 'todo_list':
      return 'todo list';
    case 'background_task':
      return `${str(display.task_kind) || 'task'} ${str(display.description)}`.trim();
    case 'task_stop':
      return `stop ${str(display.task_description)}`;
    case 'plan_review':
      return 'plan review';
    case 'generic':
      return str(display.summary) || null;
    default:
      return unhandledDisplay(display);
  }
}
