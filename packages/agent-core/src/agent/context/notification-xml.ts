/**
 * 通知 XML 渲染——生成 live ContextMemory 与 projector 共享的
 * 会话历史注入文本。
 *
 * 输出形态:
 *   <notification id="..." category="..." type="..." source_kind="..." source_id="...">
 *   Title: ...
 *   Severity: ...
 *   <body>
 *   <task-notification>   (仅当 source_kind === 'background_task' 且 tail_output 非空)
 *   <截断的尾部>
 *   </task-notification>
 *   </notification>
 *
 * 开标签名(`<notification ` / `<task-notification>`)对 projector 的
 * `mergeAdjacentUserMessages` 检测器负有承重作用——改名必须同步更新检测器。
 */

export function renderNotificationXml(data: Record<string, unknown>): string {
  const id = stringAttr(data['id'], 'unknown');
  const category = stringAttr(data['category'], 'unknown');
  const type = stringAttr(data['type'], 'unknown');
  const sourceKind = stringAttr(data['source_kind'], 'unknown');
  const sourceId = stringAttr(data['source_id'], 'unknown');
  const title = typeof data['title'] === 'string' ? data['title'] : '';
  const severity = typeof data['severity'] === 'string' ? data['severity'] : '';
  const body = typeof data['body'] === 'string' ? data['body'] : '';

  const lines: string[] = [
    `<notification id="${id}" category="${category}" type="${type}" source_kind="${sourceKind}" source_id="${sourceId}">`,
  ];
  if (title.length > 0) lines.push(`Title: ${title}`);
  if (severity.length > 0) lines.push(`Severity: ${severity}`);
  if (body.length > 0) lines.push(body);

  if (data['source_kind'] === 'background_task') {
    const tailRaw = typeof data['tail_output'] === 'string' ? data['tail_output'] : '';
    if (tailRaw.length > 0) {
      const truncated = truncateTailOutput(tailRaw, 20, 3000);
      lines.push('<task-notification>');
      lines.push(truncated);
      lines.push('</task-notification>');
    }
  }

  lines.push('</notification>');
  return lines.join('\n');
}

/**
 * Truncate tail output to at most `maxLines` lines and `maxChars`
 * characters. Takes the *last* N lines, then trims from the front if
 * the character budget is exceeded.
 */
function truncateTailOutput(raw: string, maxLines: number, maxChars: number): string {
  const allLines = raw.split('\n');
  const tailLines = allLines.length > maxLines ? allLines.slice(-maxLines) : allLines;
  let result = tailLines.join('\n');
  if (result.length > maxChars) {
    result = result.slice(-maxChars);
  }
  return result;
}

function stringAttr(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  // Attribute boundary safety: escape `&` and `"`. Body-text `<` / `>`
  // stay untouched — the injection target is an LLM-visible transcript
  // where double-escaping would be noisier than literal punctuation.
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}
