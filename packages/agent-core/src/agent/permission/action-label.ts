/**
 * describeApprovalAction — coarse action label for approve_for_session.
 *
 * The label is the key used by `auto_approve_actions` set (session-level
 * approve-for-session cache). It must be **coarse** enough that the user
 * pressing "approve for session" on one request also unlocks *semantically
 * equivalent* future requests — otherwise approve-for-session degrades
 * into approve-once.
 *
 * Derivation priority:
 *   1. `ApprovalDisplay.kind` mapping (the display already carries the
 *      semantic classification the UI renders):
 *        command    → "run command"
 *        diff       → "edit file"
 *        file_write → "write file"
 *        task_stop  → "stop background task"
 *        generic    → tool-name fallback
 *   2. Hard-coded toolName → action map for tools that emit `generic`
 *      display.
 *   3. Last resort: `call <toolName>`.
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

export function describeApprovalAction(
  toolName: string,
  _args: unknown,
  display: ToolInputDisplay,
  override?: string,
): string {
  // Highest priority: explicit override from a hook.
  if (override !== undefined && override.length > 0) {
    return override;
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
 * Inverse mapping from an approve_for_session action label to the
 * permission-rule pattern that should gate future same-action calls.
 *
 * When no entry matches, fall back to the concrete tool name. A `null`
 * table entry means the action should be cached by action label only,
 * without creating a broad PermissionRule.
 */
export function actionToRulePattern(
  action: string,
  fallbackToolName: string,
): string | undefined {
  const mapped = ACTION_TO_PATTERN[action];
  if (mapped !== undefined) return mapped ?? undefined;
  return fallbackToolName;
}
