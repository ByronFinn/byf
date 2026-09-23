import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { GUARDED_PAIRS, analyzeContrast } from '../scripts/check-contrast';

/**
 * AA 对比度自动化守护(#307 项 4)纳入 bun test:
 * 1. 真 theme.css 的守护矩阵必须全绿(改色回归在测试层就有信号);
 * 2. 负例——故意把深色主题 --fg-muted 压暗后,同一检查器必须报红,
 *    证明守护不是永真式。
 * (同一逻辑另有独立 CLI: `bun scripts/check-contrast.ts`,失败 exit 1。)
 */
const themeCss = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8');

describe('theme.css AA 对比度守护(#307 项 4)', () => {
  test('全部守护组合 ≥4.5:1(深浅两主题)', () => {
    const guarded = analyzeContrast(themeCss).filter((r) => r.guarded);
    expect(guarded.length).toBe(GUARDED_PAIRS.length * 2);
    const failures = guarded.filter((r) => !r.pass);
    expect(failures).toEqual([]);
  });

  test('已知设计债组合保持可见(WARN 清单非空,不计入判红)', () => {
    const debt = analyzeContrast(themeCss).filter((r) => !r.guarded);
    expect(debt.length).toBeGreaterThan(0);
    // 其中未达标的债项(深色 brand/bubble、light state-* × surface-3)必须被
    // 如实枚举;若某天全部修到达标,应把它们上移进 GUARDED_PAIRS 而非删清单。
    expect(debt.some((d) => !d.pass)).toBe(true);
  });

  test('负例:把深色 --fg-muted 压暗一档(与深底趋近),守护必须报红', () => {
    const mutated = themeCss.replace(
      '--fg-muted: oklch(0.68 0.008 255);',
      '--fg-muted: oklch(0.45 0.008 255);',
    );
    expect(mutated).not.toBe(themeCss); // 替换必须命中,否则负例是空转
    const red = analyzeContrast(mutated).filter((r) => r.guarded && !r.pass);
    expect(red.length).toBeGreaterThan(0);
    // 压暗影响的是深色主题的 fg-muted 行
    expect(red.every((r) => r.theme === 'dark' && r.fg === '--fg-muted')).toBe(true);
  });

  test('var 间接引用链可解析(--fg → --color-neutral-200 → oklch 字面量)', () => {
    const results = analyzeContrast(themeCss);
    const darkFg = results.find((r) => r.theme === 'dark' && r.fg === '--fg' && r.bg === '--bg');
    expect(darkFg).toBeDefined();
    // neutral-200 on neutral-950:注释记录的 15.1:1 量级(允许实现层微小出入)
    expect(darkFg!.ratio).toBeGreaterThan(14);
  });
});
