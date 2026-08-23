import { describe, expect, it } from 'vitest';

import { SpanTree } from '../../src/harness/telemetry';
import type { Span } from '../../src/harness/telemetry';

/**
 * PRD-0037 #338：telemetry span 树——零翻译关联、默认载荷零内容、
 * 订阅者异常吞掉。
 */
describe('span tree (#338)', () => {
  it('spans correlate with events/records via common ids (runId/toolCallId)', () => {
    const tree = new SpanTree();
    const spans: Span[] = [];
    tree.subscribe((s) => spans.push(s));
    const run = tree.start('pi.harness.run', 'main', undefined, { runId: 'op-1' });
    const tool = tree.start('pi.harness.tool', 'main', run.spanId, {
      runId: 'op-1',
      toolCallId: 'tc-9',
    });
    tool.end({ outcome: 'completed' });
    run.end({ outcome: 'completed', steps: 2 });
    // 公共 id 关联：run/step/tool 经 runId 无需翻译层
    expect(
      spans.every((s) => s.attributes['runId'] === 'op-1' || s.name === 'pi.harness.tool'),
    ).toBe(true);
    expect(spans.filter((s) => s.name === 'pi.harness.tool')[0]!.attributes['toolCallId']).toBe(
      'tc-9',
    );
    // 树形：tool 的 parent 是 run
    const toolSpan = spans.find((s) => s.name === 'pi.harness.tool')!;
    expect(toolSpan.parentSpanId).toBe(run.spanId);
  });

  it('default payloads carry zero content (no prompt/args/output fields)', () => {
    const tree = new SpanTree();
    const spans: Span[] = [];
    tree.subscribe((s) => spans.push(s));
    tree.start('pi.ai.request', 'main', undefined, {
      runId: 'op-1',
      durationMs: 42,
      stopReason: 'end_turn',
    });
    const serialized = JSON.stringify(spans.map((s) => s.attributes));
    for (const forbidden of ['prompt', 'completion', 'arguments', 'output', 'header', 'apiKey']) {
      expect(serialized.includes(forbidden)).toBe(false);
    }
  });

  it('throwing or blocking subscribers do not affect emission', () => {
    const tree = new SpanTree();
    let secondReceived = false;
    tree.subscribe(() => {
      throw new Error('subscriber exploded');
    });
    tree.subscribe(() => {
      secondReceived = true;
    });
    expect(() => tree.start('pi.harness.checkpoint', 'main', undefined)).not.toThrow();
    expect(secondReceived).toBe(true);
  });
});
