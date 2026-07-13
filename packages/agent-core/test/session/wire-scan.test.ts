import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { scanSessionWire } from '#/session/export/wire-scan';

/**
 * wire-scan 读取磁盘 wire.jsonl，识别 user turn（turn.prompt + origin.kind === 'user'），
 * 提取首条用户输入与时间戳，供导出 manifest 使用。
 *
 * 历史上匹配的是已废弃的 `turn_begin`（字段 userInput）——迁移到 turn.prompt 后这条
 * 路径静默失效。本测试钉住新形状。
 */
describe('scanSessionWire', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'byf-wire-scan-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('empty / missing wire.jsonl returns empty scan', async () => {
    expect(await scanSessionWire(dir)).toEqual({});
  });

  test('identifies user turn.prompt and extracts firstUserInput / lastUserMessageMs', async () => {
    const metadata = { type: 'metadata', protocol_version: '1.1', created_at: 1_700_000_000_000 };
    const userPrompt = {
      type: 'turn.prompt',
      time: 1_700_000_500_000,
      input: [{ type: 'text', text: 'hello world' }],
      origin: { kind: 'user' },
    };
    const assistantStep = {
      type: 'context.append_loop_event',
      time: 1_700_000_600_000,
      event: { type: 'step.end', usage: { input: 10 } },
    };
    await writeFile(
      join(dir, 'wire.jsonl'),
      `${JSON.stringify(metadata)}\n${JSON.stringify(userPrompt)}\n${JSON.stringify(assistantStep)}\n`,
    );

    const scan = await scanSessionWire(dir);
    expect(scan.firstUserInput).toBe('hello world');
    expect(scan.lastUserMessageMs).toBe(1_700_000_500_000);
    // metadata has no `time` field (only created_at), so first activity is the prompt
    expect(scan.firstActivityMs).toBe(1_700_000_500_000);
    expect(scan.lastActivityMs).toBe(1_700_000_600_000);
  });

  test('ignores non-user origins (skill_activation / system_trigger)', async () => {
    const skillPrompt = {
      type: 'turn.prompt',
      time: 1_700_000_500_000,
      input: [{ type: 'text', text: '/init' }],
      origin: {
        kind: 'skill_activation',
        activationId: 'a1',
        skillName: 'init',
        trigger: 'user-slash',
      },
    };
    await writeFile(join(dir, 'wire.jsonl'), `${JSON.stringify(skillPrompt)}\n`);

    const scan = await scanSessionWire(dir);
    // skill activation is not a user message
    expect(scan.firstUserInput).toBeUndefined();
    expect(scan.lastUserMessageMs).toBeUndefined();
    // but its time still counts as activity
    expect(scan.firstActivityMs).toBe(1_700_000_500_000);
  });

  test('concatenates multiple text parts with newline', async () => {
    const userPrompt = {
      type: 'turn.prompt',
      time: 1_700_000_500_000,
      input: [
        { type: 'text', text: 'line one' },
        { type: 'text', text: 'line two' },
      ],
      origin: { kind: 'user' },
    };
    await writeFile(join(dir, 'wire.jsonl'), `${JSON.stringify(userPrompt)}\n`);

    const scan = await scanSessionWire(dir);
    expect(scan.firstUserInput).toBe('line one\nline two');
  });

  test('turn.steer with user origin also counts as a user message', async () => {
    const steer = {
      type: 'turn.steer',
      time: 1_700_000_900_000,
      input: [{ type: 'text', text: 'steered' }],
      origin: { kind: 'user' },
    };
    await writeFile(join(dir, 'wire.jsonl'), `${JSON.stringify(steer)}\n`);

    const scan = await scanSessionWire(dir);
    expect(scan.firstUserInput).toBe('steered');
    expect(scan.lastUserMessageMs).toBe(1_700_000_900_000);
  });

  test('only first user prompt populates firstUserInput; later prompts update lastUserMessageMs', async () => {
    const first = {
      type: 'turn.prompt',
      time: 1_700_000_001_000,
      input: [{ type: 'text', text: 'first' }],
      origin: { kind: 'user' },
    };
    const second = {
      type: 'turn.prompt',
      time: 1_700_000_002_000,
      input: [{ type: 'text', text: 'second' }],
      origin: { kind: 'user' },
    };
    await writeFile(
      join(dir, 'wire.jsonl'),
      `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`,
    );

    const scan = await scanSessionWire(dir);
    expect(scan.firstUserInput).toBe('first');
    expect(scan.lastUserMessageMs).toBe(1_700_000_002_000);
  });

  test('tolerates malformed JSON lines (crash recovery)', async () => {
    const broken = '{not json';
    const userPrompt = {
      type: 'turn.prompt',
      time: 1_700_000_005_000,
      input: [{ type: 'text', text: 'ok' }],
      origin: { kind: 'user' },
    };
    await writeFile(join(dir, 'wire.jsonl'), `${broken}\n${JSON.stringify(userPrompt)}\n`);

    const scan = await scanSessionWire(dir);
    expect(scan.firstUserInput).toBe('ok');
  });

  test('ignores legacy turn_begin (already-migrated wires should not produce phantom user input)', async () => {
    // A wire that still carries the old shape must not populate firstUserInput
    // from the legacy `userInput` field — that field no longer exists on current records.
    const legacy = { type: 'turn_begin', time: 1_700_000_009_000, userInput: 'legacy' };
    await writeFile(join(dir, 'wire.jsonl'), `${JSON.stringify(legacy)}\n`);

    const scan = await scanSessionWire(dir);
    expect(scan.firstUserInput).toBeUndefined();
    expect(scan.lastUserMessageMs).toBeUndefined();
    // activity time still recorded
    expect(scan.lastActivityMs).toBe(1_700_000_009_000);
  });

  test('skips prompt with empty/whitespace input text', async () => {
    const userPrompt = {
      type: 'turn.prompt',
      time: 1_700_000_001_000,
      input: [{ type: 'text', text: '   ' }],
      origin: { kind: 'user' },
    };
    await writeFile(join(dir, 'wire.jsonl'), `${JSON.stringify(userPrompt)}\n`);

    const scan = await scanSessionWire(dir);
    expect(scan.firstUserInput).toBeUndefined();
    // time still counts as a user message (it was a user-origin prompt)
    expect(scan.lastUserMessageMs).toBe(1_700_000_001_000);
  });
});
