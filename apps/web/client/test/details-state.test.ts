import { describe, expect, test } from 'vitest';

import {
  readDetailsOpenPref,
  resolveDetailsTitle,
  shouldRevealOnPush,
} from '../src/lib/details-state';

/**
 * 详情抽屉纯状态逻辑（details-context 可测部分）：
 * reveal 契约 = 仅「用户显式查看」且内容非 null 才唤出；title 契约 =
 * 推 null / 未带 title 时回到默认。
 */
describe('resolveDetailsTitle', () => {
  test('内容为 null 时清空标题（回到「详情」默认）', () => {
    expect(resolveDetailsTitle(null, '轨迹 · 第 2 行')).toBeNull();
  });

  test('未带 title 时清空标题', () => {
    expect(resolveDetailsTitle({ kind: 'node' }, undefined)).toBeNull();
  });

  test('内容与 title 齐备时原样返回', () => {
    expect(resolveDetailsTitle({ kind: 'node' }, '子代理 · agent-0')).toBe('子代理 · agent-0');
  });
});

describe('shouldRevealOnPush', () => {
  test('reveal=true 且内容非 null → 唤出', () => {
    expect(shouldRevealOnPush(true, { kind: 'node' })).toBe(true);
  });

  test('reveal=true 但内容为 null → 不唤出（推空不弹窗）', () => {
    expect(shouldRevealOnPush(true, null)).toBe(false);
  });

  test('静默更新（无 reveal）→ 即使内容非 null 也不唤出', () => {
    expect(shouldRevealOnPush(undefined, { kind: 'node' })).toBe(false);
  });
});

describe('readDetailsOpenPref', () => {
  test("localStorage '1' → 开", () => {
    expect(readDetailsOpenPref(() => '1')).toBe(true);
  });

  test("localStorage '0' / 其它 → 关", () => {
    expect(readDetailsOpenPref(() => '0')).toBe(false);
    expect(readDetailsOpenPref(() => null)).toBe(false);
  });

  test('读取抛异常（隐私模式）→ 关并安全降级', () => {
    expect(
      readDetailsOpenPref(() => {
        throw new Error('denied');
      }),
    ).toBe(false);
  });
});
