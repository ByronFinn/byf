/**
 * 会话内 cron `cron.fired` TUI 通知卡片的纯格式化器(PRD-0023 #244)。
 *
 * 留在 ByfTui 之外,使标题 / 详情规则无需启动完整交互宿主即可单元测试。
 */

export interface CronFiredNoticeOrigin {
  readonly jobId: string;
  readonly stale: boolean;
  readonly coalescedCount: number;
}

export interface CronFiredNotice {
  readonly title: string;
  readonly detail: string;
}

const DETAIL_MAX = 200;

/**
 * 为 `cron.fired` wire 事件构建通知标题 + 详情。
 * 详情超过 200 字符时以省略号截断。
 */
export function formatCronFiredNotice(
  origin: CronFiredNoticeOrigin,
  prompt: string,
): CronFiredNotice {
  const stale = origin.stale ? ' · stale' : '';
  const coalesce = origin.coalescedCount > 1 ? ` · coalesced×${String(origin.coalescedCount)}` : '';
  return {
    title: `Cron ${origin.jobId} fired${stale}${coalesce}`,
    detail: prompt.length > DETAIL_MAX ? `${prompt.slice(0, DETAIL_MAX)}…` : prompt,
  };
}
