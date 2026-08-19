/** 把工具的 ToolInputDisplay 摘要成一两行可读文本(纯展示,非安全判断)。 */
function str(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function joinNonEmpty(parts: readonly string[]): string {
  return parts.filter((p) => p.length > 0).join(' — ');
}

/**
 * command 类 display 的完整命令文本(展开体「查看/复制命令」用;非 command 类或
 * 无命令时返回 null)。被拒绝/取消的调用没有结果输出,命令只能从这里取。
 */
export function displayCommand(display: unknown): string | null {
  if (display === null || typeof display !== 'object') return null;
  const d = display as Record<string, unknown>;
  if (d['kind'] !== 'command') return null;
  return typeof d['command'] === 'string' && d['command'].length > 0 ? d['command'] : null;
}

export function summarizeDisplay(display: unknown): string | null {
  if (display === null || typeof display !== 'object') return null;
  const d = display as Record<string, unknown>;
  const kind = str(d, 'kind');
  switch (kind) {
    case 'command':
      return joinNonEmpty([str(d, 'description'), str(d, 'command')]);
    case 'file_io':
      return `${str(d, 'operation')} ${str(d, 'path')}`.trim();
    case 'diff':
      return `edit ${str(d, 'path')}`;
    case 'search':
      return `${str(d, 'scope')} ${str(d, 'query')}`.trim();
    case 'url_fetch':
      return `${str(d, 'method') || 'GET'} ${str(d, 'url')}`;
    case 'agent_call':
      return `agent ${str(d, 'agent_name')}`;
    case 'skill_call':
      return `skill ${str(d, 'skill_name')}`;
    case 'todo_list':
      return 'todo list';
    case 'background_task':
      return `${str(d, 'task_kind') || 'task'} ${str(d, 'description')}`.trim();
    case 'task_stop':
      return `stop ${str(d, 'task_description')}`;
    case 'plan_review':
      return 'plan review';
    case 'generic': {
      const summary = d['summary'];
      return typeof summary === 'string' ? summary : null;
    }
    default:
      return null;
  }
}
