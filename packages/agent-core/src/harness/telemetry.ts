import type { LaneId } from './storage/types';

/**
 * telemetry span 树（PRD-0037 #338，v2 §17）：独立于 events/hooks 的第三通道。
 *
 * - span 名：pi.harness.run/step/task/tool/checkpoint/hook +
 *   pi.harness.compaction/navigation/resume + pi.ai.request + pi.session.append；
 * - 每个 span 携带 lane 与公共 id（runId/stepId/toolCallId）——与 events/records
 *   零翻译关联；
 * - vendor 中立：核心包只发结构化 span 事件，订阅者转 OTel/日志/指标
 *   （本模块零依赖、无 Node-only API import）；
 * - 安全默认：载荷只有标识符/计数/时长/停止原因/状态码——绝无 prompt、
 *   补全、工具参数、输出、header；内容捕获仅经订阅者侧脱敏 hook 显式开启；
 * - 订阅者被动，异常吞掉。
 */

export type SpanName =
  | 'pi.harness.run'
  | 'pi.harness.step'
  | 'pi.harness.task'
  | 'pi.harness.tool'
  | 'pi.harness.checkpoint'
  | 'pi.harness.hook'
  | 'pi.harness.compaction'
  | 'pi.harness.navigation'
  | 'pi.harness.resume'
  | 'pi.ai.request'
  | 'pi.session.append';

/** 安全载荷：标识符/计数/时长/停止原因/状态码——无内容字段（默认脱敏）。 */
export interface SpanAttributes {
  readonly runId?: string;
  readonly stepId?: string;
  readonly toolCallId?: string;
  readonly stopReason?: string;
  readonly outcome?: string;
  readonly attempt?: number;
  readonly steps?: number;
  readonly durationMs?: number;
  readonly recovery?: boolean;
  readonly [key: string]: string | number | boolean | undefined;
}

export interface Span {
  readonly name: SpanName;
  readonly spanId: string;
  readonly parentSpanId: string | undefined;
  readonly laneId: LaneId;
  readonly startedAt: number;
  readonly attributes: SpanAttributes;
}

export type SpanListener = (span: Span) => void;

let spanCounter = 0;

/** span 发射器：树形（parent 关联）、订阅者异常吞掉、默认载荷零内容。 */
export class SpanTree {
  private readonly listeners = new Set<SpanListener>();

  subscribe(listener: SpanListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(
    name: SpanName,
    laneId: LaneId,
    parentSpanId: string | undefined,
    attributes: SpanAttributes = {},
  ): SpanHandle {
    const spanId = `sp-${++spanCounter}`;
    const startedAt = Date.now();
    this.emit({ name, spanId, parentSpanId, laneId, startedAt, attributes });
    return {
      spanId,
      end: (endAttributes: SpanAttributes = {}) => {
        this.emit({
          name,
          spanId: `${spanId}:end`,
          parentSpanId: spanId,
          laneId,
          startedAt: Date.now(),
          attributes: { ...attributes, ...endAttributes, durationMs: Date.now() - startedAt },
        });
      },
    };
  }

  private emit(span: Span): void {
    for (const listener of this.listeners) {
      try {
        listener(span);
      } catch {
        // 订阅者被动：异常吞掉不影响执行路径
      }
    }
  }
}

export interface SpanHandle {
  readonly spanId: string;
  end(attributes?: SpanAttributes): void;
}
