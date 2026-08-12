/**
 * `wire/ops/background` —— background 子系统的 Op 定义（特例）。
 *
 * background.* 维持双轨（PRD / ADR-0032 决议#5）：进程状态（PID、文件句柄）无法
 * event-source，任务状态重建仍走 `<sessionDir>/tasks/*.json`（loadFromDisk /
 * reconcile）。wire 仅作审计日志。故 `background.stop` 注册为**空 Model + no-op
 * apply 的 Persisted Op**（对标 kimi v2 `llm.request` 模式）—— 落盘是为了审计/
 * 可观测，restore 时 no-op（状态从 tasks/*.json 重建，不进 reducer）。
 */

import { z } from 'zod';

import { defineModel } from '#/agent/wire';

/** 空 Model：background 不持有 reducer 可重建的状态。 */
export interface BackgroundModelState {}

export const backgroundModel = defineModel('background', (): BackgroundModelState => ({}));

export const backgroundStop = backgroundModel.defineOp('background.stop', {
  schema: z.object({ taskId: z.string() }),
  // no-op apply：进程状态由 tasks/*.json 重建，wire 仅审计。
  apply: (state) => state,
});

declare module '#/agent/wire/types' {
  interface PersistedOpMap {
    'background.stop': typeof backgroundStop;
  }
}
