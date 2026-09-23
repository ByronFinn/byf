import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ContentPart, TokenUsage } from '@byfriends/kosong';

import { ByfConfigSchema } from '../../src/config/schema';
import {
  assertEngineFormatCompatible,
  createV2EngineHarness,
  EngineFormatMismatchError,
  resolveSessionEngine,
} from '../../src/harness/engine';
import { JsonlSessionStorage } from '../../src/harness/storage/jsonl';
import type { LLM, LLMChatParams, LLMChatResponse } from '../../src/loop/llm';
import { SessionStore } from '../../src/session/store';

/**
 * PRD-0037 #327：实验开关 engine=v2（ADR-0041）。
 *
 * - config engine 字段解析（默认 legacy——现网行为零变化）
 * - engine=v2 创建 2.0 格式会话并跑通完整 prompt（dogfood 入口）
 * - 引擎 ↔ 会话格式路由守卫：legacy×2.0 与 v2×1.1 均明确报错
 */

const text = (t: string): ContentPart => ({ type: 'text', text: t });
const usage = (): TokenUsage => ({
  inputOther: 1,
  output: 1,
  inputCacheRead: 0,
  inputCacheCreation: 0,
});

const scriptedLLM: LLM = {
  systemPrompt: 'v2 dogfood',
  modelName: 'scripted',
  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    await params.onTextPart?.({ type: 'text', text: 'v2 engine works' });
    return { toolCalls: [], providerFinishReason: 'completed', usage: usage() };
  },
};

function unwrap<T>(r: { ok: true; value: T } | { ok: false; code: string; message: string }): T {
  if (!r.ok) throw new Error('unexpected lane error: ' + r.code + ' ' + r.message);
  return r.value;
}

describe('config engine field (PRD-0037 #327)', () => {
  it('defaults to legacy when absent', () => {
    expect(resolveSessionEngine({})).toBe('legacy');
    expect(resolveSessionEngine({ engine: undefined })).toBe('legacy');
  });

  it('parses engine = v2 from config schema', () => {
    const config = ByfConfigSchema.parse({ providers: {}, engine: 'v2' });
    expect(config.engine).toBe('v2');
    expect(resolveSessionEngine(config)).toBe('v2');
  });

  it('rejects unknown engine values', () => {
    expect(() => ByfConfigSchema.parse({ providers: {}, engine: 'v3' })).toThrow();
  });
});

function capture(fn: () => void): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('engine-format routing guard (PRD-0037 #327)', () => {
  it('clearly errors when legacy engine opens a 2.0 session', () => {
    const error = capture(() => assertEngineFormatCompatible('legacy', '2.0'));
    expect(error).toBeInstanceOf(EngineFormatMismatchError);
    expect((error as Error).message).toContain('engine = "v2"');
  });

  it('clearly errors when v2 engine opens a 1.1 session', () => {
    const error = capture(() => assertEngineFormatCompatible('v2', '1.1'));
    expect(error).toBeInstanceOf(EngineFormatMismatchError);
    expect((error as Error).message).toContain('wire 1.1');
  });

  it('allows matching pairs and unknown formats pass through', () => {
    expect(() => assertEngineFormatCompatible('v2', '2.0')).not.toThrow();
    expect(() => assertEngineFormatCompatible('legacy', '1.1')).not.toThrow();
    expect(() => assertEngineFormatCompatible('legacy', undefined)).not.toThrow();
  });
});

describe('v2 engine dogfood entry (PRD-0037 #327)', () => {
  it('creates a 2.0-format session and runs a complete prompt', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'byf-engine-'));
    try {
      const store = new SessionStore(homeDir);
      // engine=v2 的会话创建路径：2.0 格式 index + 会话级 wire.jsonl
      const summary = await store.create({
        id: 'dogfood-1',
        workDir: '/test/wd',
        formatVersion: '2.0',
      });
      expect(summary.formatVersion).toBe('2.0');
      const storage = await JsonlSessionStorage.open(join(summary.sessionDir, 'wire.jsonl'));
      const harness = await createV2EngineHarness({
        providerManager: undefined as never, // llm 注入时不会触碰 providerManager
        systemPrompt: 'v2 dogfood',
        storage,
        llm: scriptedLLM,
      });
      const outcome = unwrap(await harness.lane().prompt([text('hello v2')]));
      expect(outcome.outcome).toBe('completed');
      expect(outcome.stopReason).toBe('end_turn');
      // 磁盘上是 2.0 header 的会话级单文件
      const wire = await readFile(join(summary.sessionDir, 'wire.jsonl'), 'utf8');
      expect(wire.startsWith('{"kind":"header","formatVersion":"2.0"')).toBe(true);
      // 会话列表：2.0 过滤可见、1.1 过滤不可见（#322 联动）
      const listed = await store.list({ workDir: '/test/wd', formatVersion: '2.0' });
      expect(listed.map((s) => s.id)).toContain('dogfood-1');
      await harness.close();
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it('legacy creation path keeps 1.1 format and zero behavior change', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'byf-engine-legacy-'));
    try {
      const store = new SessionStore(homeDir);
      const summary = await store.create({ id: 'legacy-1', workDir: '/test/wd' });
      expect(summary.formatVersion).toBeUndefined(); // 空 dir 无 wire = 未定（legacy 打开时建 1.1）
      const index = await readFile(join(homeDir, 'session_index.jsonl'), 'utf8');
      expect(index).toContain('"formatVersion":"1.1"');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});
