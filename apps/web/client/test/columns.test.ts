import { describe, expect, test } from 'vitest';

import {
  CENTER_MIN,
  DETAILS_DEFAULT,
  DETAILS_MAX,
  DETAILS_MIN,
  SIDEBAR_AUTO_COLLAPSE,
  SIDEBAR_COLLAPSED,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clampWidth,
  computeColumns,
} from '../src/lib/columns';

/**
 * 三栏几何契约回归（PRD-0035 R-C3 / AC-A9，移植自 deepseek columns.ts）。
 * 折叠链：center ≥ CENTER_MIN 优先（收缩 details → 自动关 details），
 * sidebar 永不让步；窗口变宽后偏好自动恢复（纯函数无迟滞）。
 */
describe('computeColumns', () => {
  test('wide viewport: all preferred widths', () => {
    const c = computeColumns(1600, SIDEBAR_DEFAULT, DETAILS_DEFAULT);
    expect(c.sidebar).toBe(SIDEBAR_DEFAULT);
    expect(c.details).toBe(DETAILS_DEFAULT);
    expect(c.center).toBe(1600 - SIDEBAR_DEFAULT - DETAILS_DEFAULT);
  });

  test('preferences are clamped into contract ranges', () => {
    const c = computeColumns(3000, 9999, 9999);
    expect(c.sidebar).toBe(SIDEBAR_MAX);
    expect(c.details).toBe(DETAILS_MAX);
    expect(c.center).toBe(3000 - SIDEBAR_MAX - DETAILS_MAX);
  });

  test('tight viewport: details shrinks toward its minimum first', () => {
    // 恰好装不下 DETAILS_DEFAULT，但装得下 DETAILS_MIN
    const viewport = SIDEBAR_DEFAULT + CENTER_MIN + DETAILS_MIN + 40;
    const c = computeColumns(viewport, SIDEBAR_DEFAULT, DETAILS_DEFAULT);
    expect(c.center).toBe(CENTER_MIN);
    expect(c.details).toBe(viewport - SIDEBAR_DEFAULT - CENTER_MIN);
    expect(c.details).toBeGreaterThanOrEqual(DETAILS_MIN);
  });

  test('too tight: details auto-closes (derived zero) and center absorbs the deficit', () => {
    const viewport = SIDEBAR_DEFAULT + CENTER_MIN + 100; // 装不下 DETAILS_MIN
    const c = computeColumns(viewport, SIDEBAR_DEFAULT, DETAILS_DEFAULT);
    expect(c.details).toBe(0);
    expect(c.center).toBe(viewport - SIDEBAR_DEFAULT);
  });

  test('closed sidebar resolves to the fixed collapsed rail and never concedes', () => {
    const c = computeColumns(1200, 0, 0);
    expect(c.sidebar).toBe(SIDEBAR_COLLAPSED);
    expect(c.details).toBe(0);
    expect(c.center).toBe(1200 - SIDEBAR_COLLAPSED);
  });

  test('closed details preference stays zero even with spare space', () => {
    const c = computeColumns(2000, SIDEBAR_DEFAULT, 0);
    expect(c.details).toBe(0);
    expect(c.center).toBe(2000 - SIDEBAR_DEFAULT);
  });

  test('re-widening restores the details preference (no hysteresis)', () => {
    const tight = computeColumns(
      SIDEBAR_DEFAULT + CENTER_MIN + 100,
      SIDEBAR_DEFAULT,
      DETAILS_DEFAULT,
    );
    expect(tight.details).toBe(0);
    const wide = computeColumns(2000, SIDEBAR_DEFAULT, DETAILS_DEFAULT);
    expect(wide.details).toBe(DETAILS_DEFAULT);
  });
});

describe('clampWidth', () => {
  test('clamps into range and rounds', () => {
    expect(clampWidth(100, DETAILS_MIN, DETAILS_MAX)).toBe(DETAILS_MIN);
    expect(clampWidth(9999, DETAILS_MIN, DETAILS_MAX)).toBe(DETAILS_MAX);
    expect(clampWidth(330.6, DETAILS_MIN, DETAILS_MAX)).toBe(331);
  });
});

describe('geometry constants (contract frozen)', () => {
  test('deepseek geometry contract (PRD-0035 T1)', () => {
    expect(SIDEBAR_DEFAULT).toBe(280);
    expect(SIDEBAR_MIN).toBe(264);
    expect(SIDEBAR_MAX).toBe(420);
    expect(SIDEBAR_COLLAPSED).toBe(56);
    expect(CENTER_MIN).toBe(640);
    expect(DETAILS_DEFAULT).toBe(360);
    expect(DETAILS_MIN).toBe(300);
    expect(DETAILS_MAX).toBe(520);
    expect(SIDEBAR_AUTO_COLLAPSE).toBe(1024);
  });
});
