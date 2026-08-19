import type { ContentPart, Message } from '@byfriends/kosong';

import type { SkillSource } from '../../skill';
import type { BackgroundTaskStatus } from '../../tools/background';

export interface UserPromptOrigin {
  readonly kind: 'user';
  readonly blockedByHook?: string;
}

export const USER_PROMPT_ORIGIN: UserPromptOrigin = { kind: 'user' };

export interface SkillActivationOrigin {
  readonly kind: 'skill_activation';
  readonly activationId: string;
  readonly skillName: string;
  readonly skillArgs?: string;
  readonly trigger: 'user-slash' | 'model-tool' | 'nested-skill';
  readonly skillType?: string;
  readonly skillPath?: string;
  readonly skillSource?: SkillSource;
}

export interface InjectionOrigin {
  readonly kind: 'injection';
  readonly variant: string;
}

export interface CompactionSummaryOrigin {
  readonly kind: 'compaction_summary';
}

export interface SystemTriggerOrigin {
  readonly kind: 'system_trigger';
  readonly name: string;
}

export interface BackgroundTaskOrigin {
  readonly kind: 'background_task';
  readonly taskId: string;
  readonly status: BackgroundTaskStatus;
  readonly notificationId: string;
}

export interface HookResultOrigin {
  readonly kind: 'hook_result';
  readonly event: string;
  readonly blocked?: boolean;
}

/** 经 steer 注入的会话内 cron 触发来源(PRD-0023 R3)。 */
export interface CronJobOrigin {
  readonly kind: 'cron_job';
  readonly jobId: string;
  readonly cron: string;
  readonly recurring: boolean;
  readonly coalescedCount: number;
  readonly stale: boolean;
}

/** 显式错过-cron 横幅的来源(保留;coalesce 覆盖大多数情况)。 */
export interface CronMissedOrigin {
  readonly kind: 'cron_missed';
  readonly count: number;
}

export type PromptOrigin =
  | UserPromptOrigin
  | SkillActivationOrigin
  | InjectionOrigin
  | CompactionSummaryOrigin
  | SystemTriggerOrigin
  | BackgroundTaskOrigin
  | HookResultOrigin
  | CronJobOrigin
  | CronMissedOrigin;

export type ContextMessage = Message & {
  readonly origin?: PromptOrigin;
  readonly isError?: boolean;
};

export interface UserMessageRecord {
  content: readonly ContentPart[];
  origin: PromptOrigin;
}

export interface SystemReminderRecord {
  content: string;
  origin: PromptOrigin;
}

export interface AgentContextData {
  history: readonly ContextMessage[];
  tokenCount: number;
}
