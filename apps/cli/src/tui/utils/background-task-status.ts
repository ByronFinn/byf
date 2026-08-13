/**
 * 把 `BackgroundTaskInfo` 快照格式化为
 * `BackgroundAgentStatusComponent` 消费的 transcript 卡片数据。
 *
 * 后台任务有六种状态(running / awaiting_approval / completed / failed /
 * killed / lost),但 transcript 卡片只渲染三个视觉阶段
 * (started / completed / failed)。该映射把额外的细微信息——退出码、
 * 终止原因、丢失原因——压进暗色详情行,使用户仍能看到。
 */

import type { BackgroundTaskInfo, BackgroundTaskStatus } from '@byfriends/sdk';

import type { BackgroundAgentStatusData, BackgroundAgentStatusPhase } from '../types';

const MAX_DETAIL_LENGTH = 240;

function truncate(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const collapsed = value.trim().replaceAll(/\s+/g, ' ');
  if (collapsed.length === 0) return undefined;
  if (collapsed.length <= MAX_DETAIL_LENGTH) return collapsed;
  return `${collapsed.slice(0, MAX_DETAIL_LENGTH - 3)}...`;
}

export type BackgroundTaskTranscriptPhase = 'started' | 'updated' | 'terminal';

function phaseFromStatus(status: BackgroundTaskStatus): BackgroundAgentStatusPhase {
  switch (status) {
    case 'running':
    case 'awaiting_approval':
      return 'started';
    case 'completed':
      return 'completed';
    case 'failed':
    case 'killed':
    case 'lost':
      return 'failed';
  }
}

function subjectFor(taskId: string): string {
  return taskId.startsWith('agent-') ? 'agent task' : 'bash task';
}

function headlineFor(info: BackgroundTaskInfo): string {
  const subject = subjectFor(info.taskId);
  switch (info.status) {
    case 'running':
      return `${subject} started in background`;
    case 'awaiting_approval':
      return `${subject} awaiting approval`;
    case 'completed':
      return `${subject} completed in background`;
    case 'failed':
      return `${subject} failed in background`;
    case 'killed':
      return `${subject} stopped`;
    case 'lost':
      return `${subject} lost`;
  }
}

function detailFor(info: BackgroundTaskInfo): string | undefined {
  const parts: string[] = [];
  const description = truncate(info.description);
  if (description !== undefined) parts.push(description);

  if (info.status === 'completed' || info.status === 'failed') {
    if (info.exitCode !== null && info.exitCode !== undefined) {
      parts.push(`exit ${info.exitCode}`);
    }
  }
  if (info.status === 'killed') {
    const reason = truncate(info.stopReason);
    parts.push(reason !== undefined ? `stopped — ${reason}` : 'stopped');
  }
  if (info.status === 'awaiting_approval') {
    const reason = truncate(info.approvalReason);
    if (reason !== undefined) parts.push(`awaiting: ${reason}`);
  }
  if (info.status === 'lost') {
    parts.push('session restarted before completion');
  }
  if (info.timedOut === true) parts.push('timed out');

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/**
 * 为后台任务生命周期快照构建 transcript 卡片负载。返回的阶段驱动渲染器
 * (`BackgroundAgentStatusComponent`)中的圆点颜色;详情行携带额外状态
 * 细微信息(退出码、终止原因等)。
 */
export function formatBackgroundTaskTranscript(
  info: BackgroundTaskInfo,
): BackgroundAgentStatusData {
  return {
    phase: phaseFromStatus(info.status),
    headline: headlineFor(info),
    detail: detailFor(info),
  };
}
