import type { ContentPart } from '@byfriends/kosong';
import { z } from 'zod';

import { ToolInputDisplaySchema } from '../tools/display';
import type { RPCMethods } from './client';
import type { AgentEvent } from './events';
import type { WithAgentId, WithSessionId } from './types';

/**
 * 反向 RPC 载荷（审批 / 提问）的 **zod 单一真源**（PRD-0038 AC-6.1）。
 *
 * 这些载荷跨三个表面流动（agent-core → node-sdk → TUI / web-server / web-client）。
 * 此前它们是手写 interface：kind 的覆盖由各表面的 `default` 分支兜底，新增 kind
 * 即静默降级。改为 schema 定义、类型由 `z.infer` 派生后：
 * - 消费方拿到的是同一份派生类型（编译期收窄，不再需要 `as` / `unknown` 嗅探）；
 * - kind 全集可从 schema 运行时导出（`TOOL_INPUT_DISPLAY_KINDS`），契约测试据此
 *   断言每个表面都处理了每个 kind。
 */

export const ApprovalDecisionSchema = z.enum(['approved', 'rejected', 'cancelled']);
export const ApprovalScopeSchema = z.enum(['session']);

export const ApprovalResponseSchema = z
  .object({
    decision: ApprovalDecisionSchema,
    scope: ApprovalScopeSchema.optional(),
    feedback: z.string().optional(),
    selectedLabel: z.string().optional(),
  })
  .readonly();

export const ApprovalRequestSchema = z
  .object({
    turnId: z.number().optional(),
    toolCallId: z.string(),
    toolName: z.string(),
    action: z.string(),
    display: ToolInputDisplaySchema,
  })
  .readonly();

export const QuestionOptionSchema = z
  .object({
    label: z.string(),
    description: z.string().optional(),
  })
  .readonly();

export const QuestionItemSchema = z
  .object({
    question: z.string(),
    header: z.string().optional(),
    body: z.string().optional(),
    options: z.array(QuestionOptionSchema).readonly(),
    multiSelect: z.boolean().optional(),
    otherLabel: z.string().optional(),
    otherDescription: z.string().optional(),
  })
  .readonly();

export const QuestionAnswerMethodSchema = z.enum(['enter', 'space', 'number_key']);

export const QuestionAnswersSchema = z.record(z.string(), z.union([z.string(), z.literal(true)]));

export const QuestionResponseSchema = z
  .object({
    answers: QuestionAnswersSchema,
    method: QuestionAnswerMethodSchema.optional(),
  })
  .readonly();

export const QuestionResultSchema = z.union([
  z.null(),
  QuestionAnswersSchema,
  QuestionResponseSchema,
]);

export const QuestionRequestSchema = z
  .object({
    turnId: z.number().optional(),
    toolCallId: z.string().optional(),
    questions: z.array(QuestionItemSchema).readonly(),
  })
  .readonly();

// 类型一律由 schema 派生（`z.infer`），不再手写——这是三表面共同的契约来源。
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
export type ApprovalScope = z.infer<typeof ApprovalScopeSchema>;
export type ApprovalResponse = z.infer<typeof ApprovalResponseSchema>;
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
export type QuestionOption = z.infer<typeof QuestionOptionSchema>;
export type QuestionItem = z.infer<typeof QuestionItemSchema>;
export type QuestionAnswerMethod = z.infer<typeof QuestionAnswerMethodSchema>;
export type QuestionAnswers = z.infer<typeof QuestionAnswersSchema>;
export type QuestionResponse = z.infer<typeof QuestionResponseSchema>;
export type QuestionResult = z.infer<typeof QuestionResultSchema>;
export type QuestionRequest = z.infer<typeof QuestionRequestSchema>;

export interface ToolCallRequest {
  readonly turnId?: number;
  readonly toolCallId: string;
  readonly args: unknown;
}

export interface ToolCallResponse {
  readonly output: string | ContentPart[];
  readonly isError?: boolean;
}

export interface SDKAgentAPI {
  emitEvent: (event: AgentEvent) => void;
  requestApproval: (request: ApprovalRequest) => Promise<ApprovalResponse>;
  requestQuestion: (request: QuestionRequest) => Promise<QuestionResult>;
  toolCall: (request: ToolCallRequest) => Promise<ToolCallResponse>;
}
export type SDKAgentRPC = RPCMethods<SDKAgentAPI>;

export type SDKSessionAPI = WithAgentId<SDKAgentAPI>;
export type SDKSessionRPC = RPCMethods<SDKSessionAPI>;

export type SDKAPI = WithSessionId<SDKSessionAPI>;
export type SDKRPC = RPCMethods<SDKAPI>;
