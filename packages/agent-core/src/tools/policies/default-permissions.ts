/**
 * Default permission posture for built-in tools.
 *
 * This table captures the Python-parity distinction between tools that
 * call Approval.request() and tools that run without an approval prompt.
 * The rule layer still applies explicit deny rules before consulting this
 * table.
 */

export type BuiltinToolDefaultPermission = 'auto_allow' | 'ask';
export type KnownBuiltinToolName =
  | 'Read'
  | 'Grep'
  | 'Glob'
  | 'ReadMediaFile'
  | 'Think'
  | 'TodoList'
  | 'TaskList'
  | 'TaskOutput'
  | 'CronList'
  | 'CronCreate'
  | 'CronDelete'
  | 'WebSearch'
  | 'FetchURL'
  | 'Agent'
  | 'AskUserQuestion'
  | 'Skill'
  | 'Bash'
  | 'Write'
  | 'Edit'
  | 'TaskStop';

type BuiltinToolDefaultPermissionTable = Readonly<
  Record<KnownBuiltinToolName, BuiltinToolDefaultPermission>
>;

const BUILTIN_TOOL_DEFAULT_PERMISSION_TABLE: BuiltinToolDefaultPermissionTable = {
  Read: 'auto_allow',
  Grep: 'auto_allow',
  Glob: 'auto_allow',
  ReadMediaFile: 'auto_allow',
  Think: 'auto_allow',
  TodoList: 'auto_allow',
  TaskList: 'auto_allow',
  TaskOutput: 'auto_allow',
  CronList: 'auto_allow',
  CronCreate: 'ask',
  CronDelete: 'ask',
  WebSearch: 'auto_allow',
  FetchURL: 'auto_allow',
  Agent: 'auto_allow',
  AskUserQuestion: 'auto_allow',
  Skill: 'auto_allow',
  Bash: 'ask',
  Write: 'ask',
  Edit: 'ask',
  TaskStop: 'ask',
};

export const BUILTIN_TOOL_DEFAULT_PERMISSIONS: BuiltinToolDefaultPermissionTable =
  BUILTIN_TOOL_DEFAULT_PERMISSION_TABLE;

export function getBuiltinToolDefaultPermission(
  toolName: string,
): BuiltinToolDefaultPermission | undefined {
  return BUILTIN_TOOL_DEFAULT_PERMISSIONS[toolName as KnownBuiltinToolName];
}

export function isDefaultAutoAllowTool(toolName: string): boolean {
  return getBuiltinToolDefaultPermission(toolName) === 'auto_allow';
}
