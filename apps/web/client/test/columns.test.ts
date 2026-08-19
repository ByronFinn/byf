import { describe, expect, test } from 'vitest';

import {
  CENTER_PUSH_FLOOR,
  CENTER_MIN,
  SIDEBAR_AUTO_COLLAPSE,
  SIDEBAR_COLLAPSED,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clampWidth,
  computeColumns,
  resolveDrawerPush,
} from '../src/lib/columns';

/**
 * 两栏几何契约回归（前身为三栏 PRD-0035 R-C3 / AC-A9；details 列已改为
 * 非模态浮动抽屉，不参与网格，仅展开时经 resolveDrawerPush 让位）。sidebar
 * 永不让步；center 吸收剩余缺口。
 */
describe('computeColumns', () => {
  test('wide viewport: preferred sidebar, center absorbs the rest', () => {
    const c = computeColumns(1600, SIDEBAR_DEFAULT);
    expect(c.sidebar).toBe(SIDEBAR_DEFAULT);
    expect(c.center).toBe(1600 - SIDEBAR_DEFAULT);
  });

  test('preferences are clamped into contract ranges', () => {
    const c = computeColumns(3000, 9999);
    expect(c.sidebar).toBe(SIDEBAR_MAX);
    expect(c.center).toBe(3000 - SIDEBAR_MAX);
  });

  test('closed sidebar resolves to the fixed collapsed rail and never concedes', () => {
    const c = computeColumns(1200, 0);
    expect(c.sidebar).toBe(SIDEBAR_COLLAPSED);
    expect(c.center).toBe(1200 - SIDEBAR_COLLAPSED);
  });

  test('narrow viewport: center falls below CENTER_MIN as the last resort', () => {
    const c = computeColumns(SIDEBAR_DEFAULT + 100, SIDEBAR_DEFAULT);
    expect(c.sidebar).toBe(SIDEBAR_DEFAULT);
    expect(c.center).toBe(100);
  });

  test('re-widening restores the sidebar preference (no hysteresis)', () => {
    const tight = computeColumns(SIDEBAR_DEFAULT + 100, SIDEBAR_DEFAULT);
    expect(tight.center).toBe(100);
    const wide = computeColumns(2000, SIDEBAR_DEFAULT);
    expect(wide.sidebar).toBe(SIDEBAR_DEFAULT);
    expect(wide.center).toBe(2000 - SIDEBAR_DEFAULT);
  });
});

describe('resolveDrawerPush', () => {
  test('spacious viewport: center concedes the full drawer width', () => {
    expect(resolveDrawerPush(1600, SIDEBAR_DEFAULT, 576)).toBe(576);
  });

  test('drawer wider than remaining room is clamped to the room', () => {
    // 1440 - 280 - 800 后 center=360 仍 ≥ floor:按抽屉宽度让位(800)。
    expect(resolveDrawerPush(1440, SIDEBAR_DEFAULT, 800)).toBe(800);
  });

  test('too tight for center floor: falls back to overlay (reserve 0)', () => {
    // CLOVER: sidebar+drawer 吃掉后 center < floor → 0。
    expect(resolveDrawerPush(900, SIDEBAR_DEFAULT, 576)).toBe(0);
  });

  test('exactly at the floor boundary still pushes', () => {
    const viewport = SIDEBAR_DEFAULT + 576 + CENTER_PUSH_FLOOR;
    expect(resolveDrawerPush(viewport, SIDEBAR_DEFAULT, 576)).toBe(576);
  });

  test('just under the floor boundary falls back to overlay', () => {
    const viewport = SIDEBAR_DEFAULT + 576 + CENTER_PUSH_FLOOR - 1;
    expect(resolveDrawerPush(viewport, SIDEBAR_DEFAULT, 576)).toBe(0);
  });
});

describe('clampWidth', () => {
  test('clamps into range and rounds', () => {
    expect(clampWidth(100, 264, 420)).toBe(264);
    expect(clampWidth(9999, 264, 420)).toBe(420);
    expect(clampWidth(294.6, 264, 420)).toBe(295);
  });
});

describe('geometry constants (contract frozen)', () => {
  test('deepseek geometry contract (PRD-0035 T1)', () => {
    expect(SIDEBAR_DEFAULT).toBe(280);
    expect(SIDEBAR_MIN).toBe(264);
    expect(SIDEBAR_MAX).toBe(420);
    expect(SIDEBAR_COLLAPSED).toBe(56);
    expect(CENTER_MIN).toBe(640);
    expect(SIDEBAR_AUTO_COLLAPSE).toBe(1024);
    expect(CENTER_PUSH_FLOOR).toBe(360);
  });
});
