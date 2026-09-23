import type { ContentPart, Message } from '@byfriends/kosong';

import type { LaneId } from './storage/types';

/**
 * v2 hooks 目录（PRD-0037 #332，R7）。
 *
 * 语义：
 * - 注册 harness 全局、按注册顺序串行、payload 带 lane；
 * - before_tool fail-closed：handler 抛错即阻断（工具不执行）；
 * - 其余 hook 抛错跳过并报 handler_error，不影响执行；
 * - transform_context 变换链：多 handler 依次看到前一 handler 输出
 *   （per-request ephemeral——塑形 provider 所见，不改会话所存）；
 * - 喂持久状态的 hook（before_run 的 persisted 输出、before_tool 的
 *   effective args）输出先落盘再执行；重放矩阵：fresh 跑、retry 不重跑
 *   persisted 类、resume 幂等（before_resume 重建进程内扩展态）。
 */

export type V2HookPoint =
  | 'before_run'
  | 'before_resume'
  | 'before_run_end'
  | 'transform_context'
  | 'before_request'
  | 'before_payload'
  | 'after_response'
  | 'before_tool'
  | 'after_tool'
  | 'before_compaction'
  | 'before_navigation';

export interface V2HookContext {
  readonly laneId: LaneId;
  readonly hookPoint: V2HookPoint;
}

export interface BeforeRunInput extends V2HookContext {
  readonly hookPoint: 'before_run';
  readonly input: readonly ContentPart[];
}
export interface BeforeRunEndInput extends V2HookContext {
  readonly hookPoint: 'before_run_end';
  readonly outcome: 'completed' | 'aborted' | 'failed';
}
export interface TransformContextInput extends V2HookContext {
  readonly hookPoint: 'transform_context';
  /** 前一 handler 的输出（首个 handler 看到原始投影）。 */
  readonly messages: readonly Message[];
}
export interface BeforeToolInput extends V2HookContext {
  readonly hookPoint: 'before_tool';
  readonly toolCallId: string;
  readonly name: string;
  readonly args: unknown;
}
export interface AfterToolInput extends V2HookContext {
  readonly hookPoint: 'after_tool';
  readonly toolCallId: string;
  readonly name: string;
  readonly isError: boolean;
}
export interface BeforeCompactionInput extends V2HookContext {
  readonly hookPoint: 'before_compaction';
}
export interface BeforeNavigationInput extends V2HookContext {
  readonly hookPoint: 'before_navigation';
  readonly targetEntryId: string;
}
export interface GenericHookInput extends V2HookContext {
  readonly hookPoint: 'before_resume' | 'before_request' | 'before_payload' | 'after_response';
}

export type V2HookInput =
  | BeforeRunInput
  | BeforeRunEndInput
  | TransformContextInput
  | BeforeToolInput
  | AfterToolInput
  | BeforeCompactionInput
  | BeforeNavigationInput
  | GenericHookInput;

export interface BeforeRunOutput {
  /** persisted：随 operation_started 落盘（重放不重算）。 */
  readonly persisted?: unknown;
  /** 拒绝本次 run。 */
  readonly block?: boolean;
  readonly reason?: string;
}
export interface BeforeRunEndOutput {
  /** goal 续跑等场景：返回 followUp 继续 run（#331 driver 消费）。 */
  readonly followUp?: boolean;
}
export interface TransformContextOutput {
  readonly messages: readonly Message[];
}
export interface BeforeToolOutput {
  /** effective args（persisted 进 tool_started）。 */
  readonly args?: unknown;
  /** fail-closed 拒绝：工具不执行，合成错误结果。 */
  readonly block?: boolean;
  readonly reason?: string;
}
export interface AfterToolOutput {
  /** 补丁语义：可改写结果文本。 */
  readonly patchedOutput?: string;
}
export interface BeforeCompactionOutput {
  /** declined：跳过本次压缩。 */
  readonly decline?: boolean;
  readonly reason?: string;
}

export type V2HookResult =
  | BeforeRunOutput
  | BeforeRunEndOutput
  | TransformContextOutput
  | BeforeToolOutput
  | AfterToolOutput
  | BeforeCompactionOutput
  | void;

export type V2HookHandler = (input: V2HookInput) => Promise<V2HookResult> | V2HookResult;

export interface HookHandlerErrorEvent {
  readonly kind: 'handler_error';
  readonly hookPoint: V2HookPoint;
  readonly laneId: LaneId;
  readonly message: string;
}

/**
 * hooks 注册表。同一 hook 点多 handler 串行；transform_context 链式
 * （前一 handler 输出作后一输入）；before_tool fail-closed。
 */
export class V2HookRegistry {
  private readonly handlers = new Map<V2HookPoint, V2HookHandler[]>();
  /** handler_error 出口（事件目录 #334 消费；吞掉不影响执行）。 */
  onHandlerError: ((event: HookHandlerErrorEvent) => void) | undefined;

  register(point: V2HookPoint, handler: V2HookHandler): void {
    const list = this.handlers.get(point) ?? [];
    list.push(handler);
    this.handlers.set(point, list);
  }

  /**
   * 串行执行一个 hook 点。返回最后非空输出（transform_context 链式除外——
   * 它逐 handler 链式传递）。before_tool 的 fail-closed：任一 handler 抛错
   * 即返回 block（阻断）；其余 hook 点抛错 → handler_error 事件 + 跳过。
   */
  async run(point: V2HookPoint, input: V2HookInput): Promise<V2HookResult> {
    const handlers = this.handlers.get(point) ?? [];
    let chained = input;
    let last: V2HookResult | undefined;
    for (const handler of handlers) {
      try {
        const result = await handler(chained);
        if (point === 'transform_context' && result && 'messages' in result) {
          chained = { ...(chained as TransformContextInput), messages: result.messages };
          last = result;
          continue;
        }
        if (result !== undefined && result !== null) {
          // block 类输出立即短路返回
          if ('block' in result && result.block === true) return result;
          if ('decline' in result && result.decline === true) return result;
          last = result;
        }
      } catch (error) {
        if (point === 'before_tool') {
          // fail-closed：handler 抛错即阻断
          return {
            block: true,
            reason: `before_tool handler error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
        this.onHandlerError?.({
          kind: 'handler_error',
          hookPoint: point,
          laneId: input.laneId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return (
      last ??
      (point === 'transform_context'
        ? { messages: (chained as TransformContextInput).messages }
        : undefined)
    );
  }

  /** 变换链便捷入口（#332 AC：多 handler 依次看到前一 handler 输出）。 */
  async transform(laneId: LaneId, messages: readonly Message[]): Promise<readonly Message[]> {
    const result = (await this.run('transform_context', {
      laneId,
      hookPoint: 'transform_context',
      messages,
    })) as TransformContextOutput | undefined;
    return result?.messages ?? messages;
  }

  has(point: V2HookPoint): boolean {
    return (this.handlers.get(point) ?? []).length > 0;
  }
}
