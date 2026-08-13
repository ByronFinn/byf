/**
 * describeApprovalAction — approve_for_session 的粗粒度动作标签。
 *
 * 该标签是 `auto_approve_actions` 集合(会话级 approve-for-session 缓存)
 * 使用的键。它必须**足够粗**,使用户在一次请求上按「批准本会话」也能解锁
 * *语义等价*的未来请求——否则 approve-for-session 会退化为 approve-once。
 *
 * 推导优先级:
 *   1. `ApprovalDisplay.kind` 映射(display 已携带 UI 渲染的语义分类):
 *        command    → "run command"
 *        diff       → "edit file"
 *        file_write → "write file"
 *        task_stop  → "stop background task"
 *        generic    → 工具名回退
 *   2. 硬编码 toolName → 动作映射,服务于发出 `generic` display 的工具。
 *   3. 最后手段:`call <toolName>`。
 */

import type { ToolInputDisplay } from '../../tools/display/schemas';

/**
 * Hard-coded toolName → action label map. Consulted as a fallback so
 * tools that carry `generic` displays still get a sensible label. Keys
 * match the tool names currently wired in
 * `packages/agent-core/src/tools/`.
 */
const TOOL_NAME_TO_ACTION: Readonly<Record<string, string>> = {
  Bash: 'run command',
  Shell: 'run command',
  BackgroundRun: 'run background command',
  BackgroundStop: 'stop background task',
  Write: 'edit file',
  Edit: 'edit file',
  StrReplace: 'edit file',
};

/** Inverse table — action label → the representative tool-name pattern. */
const ACTION_TO_PATTERN: Readonly<Record<string, string | null>> = {
  'run command': 'Bash',
  'run background command': 'BackgroundRun',
  'stop background task': 'BackgroundStop',
  'edit file': 'Write',
  'edit file outside of working directory': 'Write',
  'write file': 'Write',
};

/**
 * CronCreate 动作标签的前缀,标签内嵌完整 create 负载。会话批准必须是
 * 负载作用域的:批准一个调度不得解锁日后任意的 CronCreate 调用(PRD-0023 #244)。
 */
export const CRON_CREATE_ACTION_PREFIX = 'call CronCreate ';

/**
 * CronCreate 的稳定动作标签,包含 cron/prompt/recurring。
 * 相同负载 → 相同标签(重新批准本会话继续有效);不同负载 → 不同标签。
 */
export function describeCronCreateApprovalAction(args: unknown): string {
  return `${CRON_CREATE_ACTION_PREFIX}${serializeCronCreatePayload(args)}`;
}

function serializeCronCreatePayload(args: unknown): string {
  const rec = args !== null && typeof args === 'object' ? (args as Record<string, unknown>) : {};
  const cron = typeof rec['cron'] === 'string' ? rec['cron'] : '';
  const prompt = typeof rec['prompt'] === 'string' ? rec['prompt'] : '';
  const recurring = rec['recurring'] !== false;
  return JSON.stringify({ cron, prompt, recurring });
}

export function describeApprovalAction(
  toolName: string,
  args: unknown,
  display: ToolInputDisplay,
  override?: string,
): string {
  // Highest priority: explicit override from a hook.
  if (override !== undefined && override.length > 0) {
    return override;
  }

  // CronCreate is intentionally payload-scoped (not coarse like Bash).
  // Display kind may be generic; still pin the full create tuple so a
  // single "approve for session" cannot authorize every future schedule.
  if (toolName === 'CronCreate') {
    return describeCronCreateApprovalAction(args);
  }

  // Display-driven derivation: the display kind already captures the
  // coarse semantic class the UI renders.
  switch (display.kind) {
    case 'command':
      return 'run command';
    case 'diff':
      return 'edit file';
    case 'file_io':
      switch (display.operation) {
        case 'write':
          return 'write file';
        case 'edit':
          return 'edit file';
        case 'read':
          return 'read file';
        case 'glob':
          return 'list files';
        case 'grep':
          return 'search files';
      }
      break;
    case 'task_stop':
      return 'stop background task';
    case 'plan_review':
      return 'review plan';
    case 'agent_call':
      return 'spawn agent';
    case 'skill_call':
      return 'invoke skill';
    case 'url_fetch':
      return 'fetch URL';
    case 'search':
      return 'search';
    case 'todo_list':
      return 'update todo list';
    case 'background_task':
      return 'run background task';
    case 'generic':
      // fall through to tool-name map
      break;
  }

  const mapped = TOOL_NAME_TO_ACTION[toolName];
  if (mapped !== undefined) return mapped;

  // MCP tool naming: `mcp__<server>__<tool>` gets a coarse
  // `"call MCP tool: <server>:<tool>"` label so one approve-for-session
  // click unlocks every future call to the same server+tool combo. The
  // server name is preserved to prevent cross-server privilege escalation.
  if (toolName.startsWith('mcp__')) {
    const rest = toolName.slice('mcp__'.length);
    const sep = rest.indexOf('__');
    if (sep >= 0) {
      const serverName = rest.slice(0, sep);
      const innerTool = rest.slice(sep + 2);
      if (innerTool.length > 0) {
        return `call MCP tool: ${serverName}:${innerTool}`;
      }
    }
  }

  return `call ${toolName}`;
}

/**
 * approve_for_session 动作标签到权限规则模式的逆向映射,该规则将门控未来的
 * 同类动作调用。
 *
 * 无条目匹配时回退到具体工具名。`null` 表项表示该动作只按动作标签缓存,
 * 不创建宽泛的 PermissionRule。
 *
 * 负载作用域的 CronCreate 动作同样跳过规则创建:裸的 `CronCreate` 模式会匹配
 * 每次未来的 create(matchesRule 仅按名称匹配)。同负载的重新批准仅由
 * `sessionApprovedActions` 处理。
 */
export function actionToRulePattern(action: string, fallbackToolName: string): string | undefined {
  if (action.startsWith(CRON_CREATE_ACTION_PREFIX)) {
    return undefined;
  }
  const mapped = ACTION_TO_PATTERN[action];
  if (mapped !== undefined) return mapped ?? undefined;
  return fallbackToolName;
}
