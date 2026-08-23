import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ContentPart, TokenUsage } from '@byfriends/kosong';
import { describe, expect, it } from 'vitest';

import { readSessionInspection2 } from '../../src/harness/inspection2';
import { operationRecordId } from '../../src/harness/records';
import { JsonlSessionStorage } from '../../src/harness/storage/jsonl';

/**
 * PRD-0037 #341：Inspector 2.0 投影——entries 树 / records 时间轴 / lanes 渲染。
 */

const text = (t: string): ContentPart => ({ type: 'text', text: t });
const usage = (): TokenUsage => ({
  inputOther: 1,
  output: 1,
  inputCacheRead: 0,
  inputCacheCreation: 0,
});

async function buildSampleSession(dir: string): Promise<void> {
  const storage = await JsonlSessionStorage.create(join(dir, 'wire.jsonl'), 'inspect-me');
  await storage.createLane({ laneId: 'main', name: 'main' });
  await storage.appendRecord({
    laneId: 'main',
    kind: 'operation_started',
    id: operationRecordId('op-1'),
    payload: { opId: 'op-1', kind: 'prompt', startedAt: 1 },
  });
  const user = await storage.appendEntry({
    laneId: 'main',
    kind: 'message',
    message: { role: 'user', content: [text('hello world')] },
  });
  await storage.appendEntry({
    laneId: 'main',
    kind: 'message',
    message: {
      role: 'assistant',
      content: [text('hi')],
      toolCalls: [{ type: 'function', id: 'tc-1', name: 'bash', arguments: '{}' }],
    },
  });
  await storage.appendEntry({
    laneId: 'main',
    kind: 'message',
    message: { role: 'tool', toolCallId: 'tc-1', content: [text('result')] },
  });
  // 旁支：从 user 分叉
  await storage.createLane({ laneId: 'side', fromEntryId: user.id });
  await storage.appendEntry({
    laneId: 'side',
    kind: 'message',
    message: { role: 'user', content: [text('side branch')] },
  });
  await storage.appendRecord({
    laneId: 'main',
    kind: 'operation_finished',
    payload: { opId: 'op-1', outcome: 'completed', finishedAt: 2 },
  });
  await storage.close();
}

describe('Inspector 2.0 projection (PRD-0037 #341)', () => {
  it('renders entry tree, lanes, and record timeline for 2.0 sessions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'byf-inspect2-'));
    try {
      await buildSampleSession(dir);
      const inspection = await readSessionInspection2(dir);
      expect(inspection.formatVersion).toBe('2.0');
      expect(inspection.sessionId).toBe('inspect-me');
      // lanes：main + side
      expect(inspection.lanes.map((lane) => lane.laneId).toSorted()).toEqual(['main', 'side']);
      // 树：根 = user；主链 3 深度；旁支挂在 user 下
      expect(inspection.roots.length).toBe(1);
      const root = inspection.roots[0]!;
      expect(root.role).toBe('user');
      expect(root.textPreview).toContain('hello world');
      // user 有两个子节点（主链 assistant + 旁支 user）
      expect(root.children.length).toBe(2);
      const assistantChild = root.children.find((child) => child.role === 'assistant');
      expect(assistantChild?.toolCalls?.[0]?.name).toBe('bash');
      // 时间轴：operation_started → operation_finished（seq 序）
      expect(inspection.timeline.map((r) => r.kind)).toEqual([
        'operation_started',
        'operation_finished',
      ]);
      expect(inspection.timeline[0]!.summary).toContain('op-1');
      // 调试日志含全部四类行
      expect(inspection.log.length).toBeGreaterThan(4);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('readonly open does not physically truncate a torn tail (live writer safe)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'byf-inspect2-ro-'));
    try {
      await buildSampleSession(dir);
      const wirePath = join(dir, 'wire.jsonl');
      const { appendFile, readFile } = await import('node:fs/promises');
      await appendFile(wirePath, '{"kind":"entry","seq":99'); // 模拟 live 写者半行
      const before = await readFile(wirePath, 'utf8');
      await readSessionInspection2(dir); // 只读打开
      const after = await readFile(wirePath, 'utf8');
      expect(after).toBe(before); // 不截断
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
