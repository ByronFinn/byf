// 把 wire 时间线中的每个「出问题」信号聚合为 Issues 抽屉可消费的扁平
// 列表。纯函数——无 React。
//
// 新 agent-core wire 协议的检测规则:
//   - tool.call 无配对的 tool.result(孤儿 tool.call)
//   - tool.result 无前导的 tool.call(孤儿 tool.result)
//   - step.begin 无配对的 step.end(未完成 step)
//   - full_compaction.begin 无 complete/cancel(未完成压缩)
//   - permission.record_approval_result 且 decision='rejected'(信息)
//
// Wire 文件解析警告作为无 lineNo 的信息级条目追加。

import type { WireEntry } from '../types';

export type IssueSeverity = 'error' | 'warning' | 'info';

export type IssueKind =
  | 'orphan_tool_call'
  | 'missing_tool_result'
  | 'incomplete_step'
  | 'incomplete_compaction'
  | 'rejected_approval'
  | 'wire_warning';

export interface Issue {
  severity: IssueSeverity;
  kind: IssueKind;
  /** Line number of the offending record. `null` for file-level warnings. */
  lineNo: number | null;
  /** Short summary shown on a single line. */
  summary: string;
  /** Optional second line / tooltip detail. */
  detail?: string;
}

const SEVERITY_ORDER: Record<IssueSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/** 扫描 `records` + `warnings`,产生有序问题列表。
 *  先按严重度排序,再按 lineNo 升序。警告(无 lineNo)排在最后。 */
export function computeIssues(entries: readonly WireEntry[], warnings: readonly string[]): Issue[] {
  const out: Issue[] = [];

  // Track in-flight tool calls keyed by toolCallId, step begins by uuid,
  // and compaction begin lineNo.
  const toolCallById = new Map<string, { lineNo: number; name: string }>();
  const stepBeginByUuid = new Map<string, { lineNo: number; step: number; turnId: string }>();
  let lastCompactionBegin: { lineNo: number; source: string } | null = null;

  for (const entry of entries) {
    const r = entry.data;
    const lineNo = entry.lineNo;
    // oxlint-disable-next-line typescript(switch-exhaustiveness-check) -- lint pass inspects only a subset of record kinds
    switch (r.type) {
      case 'context.append_loop_event': {
        const ev = r.event;
        if (ev.type === 'tool.call') {
          // New in-flight tool call.
          toolCallById.set(ev.toolCallId, { lineNo, name: ev.name });
        } else if (ev.type === 'tool.result') {
          const open = toolCallById.get(ev.toolCallId);
          if (open !== undefined) {
            toolCallById.delete(ev.toolCallId);
          } else {
            out.push({
              severity: 'warning',
              kind: 'missing_tool_result',
              lineNo,
              summary: `orphan tool.result for #${ev.toolCallId.slice(-8)}`,
              detail: 'no preceding tool.call seen',
            });
          }
        } else if (ev.type === 'step.begin') {
          stepBeginByUuid.set(ev.uuid, {
            lineNo,
            step: ev.step,
            turnId: ev.turnId,
          });
        } else if (ev.type === 'step.end') {
          stepBeginByUuid.delete(ev.uuid);
        }
        break;
      }

      case 'full_compaction.begin':
        lastCompactionBegin = { lineNo, source: r.source };
        break;
      case 'full_compaction.complete':
      case 'full_compaction.cancel':
        lastCompactionBegin = null;
        break;

      case 'permission.record_approval_result':
        if (r.result.decision === 'rejected') {
          out.push({
            severity: 'info',
            kind: 'rejected_approval',
            lineNo,
            summary: `${r.toolName}#${r.toolCallId.slice(-8)} rejected`,
            detail: r.result.feedback,
          });
        }
        break;

      default:
        break;
    }
  }

  // Drain unmatched in-flight entries.
  for (const [id, info] of toolCallById) {
    out.push({
      severity: 'warning',
      kind: 'orphan_tool_call',
      lineNo: info.lineNo,
      summary: `${info.name}#${id.slice(-8)} has no tool.result`,
      detail: 'tool.call recorded but no matching tool.result found',
    });
  }
  for (const [uuid, info] of stepBeginByUuid) {
    out.push({
      severity: 'warning',
      kind: 'incomplete_step',
      lineNo: info.lineNo,
      summary: `step ${info.step} (turn ${info.turnId}) has no step.end`,
      detail: `uuid ${uuid.slice(-8)}`,
    });
  }
  if (lastCompactionBegin !== null) {
    out.push({
      severity: 'warning',
      kind: 'incomplete_compaction',
      lineNo: lastCompactionBegin.lineNo,
      summary: `${lastCompactionBegin.source} compaction never completed`,
    });
  }

  for (const w of warnings) {
    out.push({
      severity: 'info',
      kind: 'wire_warning',
      lineNo: null,
      summary: firstLine(w),
    });
  }

  out.sort((a, b) => {
    const d = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (d !== 0) return d;
    const sa = a.lineNo ?? Number.POSITIVE_INFINITY;
    const sb = b.lineNo ?? Number.POSITIVE_INFINITY;
    return sa - sb;
  });

  return out;
}

/** 工具栏药丸使用的顶层摘要色调——「最差者胜」。 */
export function topSeverity(issues: readonly Issue[]): IssueSeverity | null {
  if (issues.length === 0) return null;
  for (const i of issues) if (i.severity === 'error') return 'error';
  for (const i of issues) if (i.severity === 'warning') return 'warning';
  return 'info';
}

function firstLine(s: string): string {
  const trimmed = s.trim();
  const nl = trimmed.indexOf('\n');
  const one = nl === -1 ? trimmed : trimmed.slice(0, nl);
  return one.length > 120 ? one.slice(0, 120) + '…' : one;
}
