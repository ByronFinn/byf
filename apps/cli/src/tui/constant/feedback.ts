/**
 * /feedback 命令的常量——端点、遥测键,以及反馈提交流程周围显示的状态消息。
 *
 * 对话框内部文案(框标题、副标题、页脚)与对话框组件本体相邻,
 * 因为它是该组件视觉契约的一部分。
 */

import { FEEDBACK_VERSION_PREFIX } from '#/constant/app';

export { FEEDBACK_ISSUE_URL, FEEDBACK_VERSION_PREFIX } from '#/constant/app';

export const FEEDBACK_STATUS_SUBMITTING = 'Submitting feedback…';
export const FEEDBACK_STATUS_SUCCESS = 'Feedback submitted, thank you!';
export const FEEDBACK_STATUS_CANCELLED = 'Feedback cancelled.';
export const FEEDBACK_STATUS_NETWORK_ERROR = 'Network error, failed to submit feedback.';
export const FEEDBACK_STATUS_FALLBACK = 'Opening GitHub Issues as fallback…';
export const FEEDBACK_STATUS_NOT_SIGNED_IN =
  "You're not signed in. Opening GitHub Issues for feedback…";

export function feedbackHttpErrorMessage(status: number): string {
  return `Failed to submit feedback (HTTP ${String(status)}).`;
}

export function feedbackSessionLine(sessionId: string): string {
  return `Session: ${sessionId}`;
}

// Hint shown beneath session-level error messages in the TUI to point users
// at the `byf export` workflow so they can share diagnostics with us.
export function errorReportHintLine(sessionId: string): string {
  return `If this persists, run \`byf export ${sessionId}\` and share the file with us for diagnosis. Please don't share it publicly.`;
}

export function withFeedbackVersionPrefix(version: string): string {
  return `${FEEDBACK_VERSION_PREFIX}${version}`;
}
