/**
 * 语义文字 token 的 WCAG AA 对比度回归守护(#307 项 4)。
 *
 * PRD-0033 R15 的 AA 达标此前靠一次性脚本 + theme.css 注释记录,token 改色
 * 没有任何回归信号。本脚本从 src/theme.css 解析 Layer 1(@theme 静态注册)与
 * Layer 2(:root 深色基线 / :root.theme-light 浅色覆盖)的语义颜色 token,
 * 按 OKLCH → 线性 sRGB → WCAG 相对亮度公式计算对比度,断言受守护的
 * 「文字 token × 背景 token」组合 ≥4.5:1(正常文字 AA 阈值)。
 *
 * 用法(仓库无外部依赖,纯 Bun 运行时):
 *   bun scripts/check-contrast.ts            # 检查 src/theme.css
 *   bun scripts/check-contrast.ts <css 路径> # 检查指定副本(调试破坏性改动用)
 * 失败时逐行打印未达标组合并 exit 1。同一逻辑由 test/contrast.test.ts 纳入
 * bun test(含负例:故意改色的 CSS 字符串必须报红)。
 *
 * 已知边界(有意不守护):
 * - cat-* / user / assistant 等 Inspector 事件类别色:按 have-a-try 2026-08-19
 *   裁决以「solid 色块 + --color-on-accent 前景」形态使用,非行内文字 token;
 * - --fg-subtle 的 color-mix 变体(--color-fg-3)等纯装饰性弱化文字;
 * - 大字号/粗体文字适用 3:1 宽松档,本脚本统一按 4.5:1 从严。
 */
import { readFileSync } from 'node:fs';

// ── 颜色模型 ───────────────────────────────────────────────────────────────

/** 线性 sRGB 通道(0 已钳制;gamma 编码前的值)+ alpha(0–1)。 */
interface LinearColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/** OKLCH → 线性 sRGB(Björn Ottosson 的标准矩阵;色域外的通道钳制到 [0,1])。 */
function oklchToLinear(L: number, C: number, Hdeg: number, alpha: number): LinearColor {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377773761749 * a + 0.2158037573101034 * b;
  const m_ = L - 0.1055613458156586 * a - 0.0638541728253133 * b;
  const s_ = L - 0.0894841775298112 * a - 1.2914855480194099 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const clamp = (v: number): number => Math.min(Math.max(v, 0), 1);
  return {
    r: clamp(4.076741661347994 * l - 3.3077115907752503 * m + 0.2309699287294386 * s),
    g: clamp(-1.2684380040921767 * l + 2.6097574009287576 * m - 0.34131939653908113 * s),
    b: clamp(-0.00419608660684048 * l - 0.7034186144619299 * m + 1.7076147000363488 * s),
    a: alpha,
  };
}

/** WCAG 2.x 相对亮度(线性光加权和)。 */
function relativeLuminance(c: LinearColor): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** 半透明前景按线性通道合成到背景上(alpha compositing)。 */
function composite(fg: LinearColor, bg: LinearColor): LinearColor {
  if (fg.a >= 1) return fg;
  const k = fg.a;
  return {
    r: k * fg.r + (1 - k) * bg.r,
    g: k * fg.g + (1 - k) * bg.g,
    b: k * fg.b + (1 - k) * bg.b,
    a: 1,
  };
}

/** WCAG 对比度((L1+0.05)/(L2+0.05),L1 为较亮侧)。 */
function contrast(fg: LinearColor, bg: LinearColor): number {
  const f = relativeLuminance(composite(fg, bg));
  const b = relativeLuminance(bg);
  const [hi, lo] = f >= b ? [f, b] : [b, f];
  return (hi + 0.05) / (lo + 0.05);
}

// ── theme.css 解析 ─────────────────────────────────────────────────────────

type TokenScope = ReadonlyMap<string, string>;

interface ThemeCss {
  readonly dark: TokenScope;
  readonly light: TokenScope;
}

/** 剥注释后按「@theme → :root → :root.theme-light」三层收集自定义属性。 */
export function parseThemeCss(css: string): ThemeCss {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const theme = new Map<string, string>();
  const root = new Map<string, string>();
  const light = new Map<string, string>();
  const blockRe = /(@theme|:root\.theme-light|:root)\s*\{([^{}]*)\}/g;
  const declRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
  for (const block of stripped.matchAll(blockRe)) {
    const selector = block[1];
    const body = block[2] ?? '';
    const target = selector === '@theme' ? theme : selector === ':root.theme-light' ? light : root;
    for (const decl of body.matchAll(declRe)) {
      const name = decl[1];
      const value = decl[2];
      if (name !== undefined && value !== undefined) target.set(name, value.trim());
    }
  }
  // 层叠:@theme 全局输出到 :root;深色 = @theme + :root;浅色再叠 theme-light。
  return {
    dark: new Map([...theme, ...root]),
    light: new Map([...theme, ...root, ...light]),
  };
}

/** 解析颜色值:var 间接引用 / oklch(...) / color-mix(in oklab, X p%, transparent)。 */
function resolveColor(value: string, scope: TokenScope, seen: Set<string>): LinearColor {
  const v = value.trim();
  const varRef = /^var\(\s*(--[\w-]+)\s*\)$/.exec(v);
  if (varRef?.[1] !== undefined) {
    if (seen.has(varRef[1])) throw new Error(`token 循环引用:${varRef[1]}`);
    seen.add(varRef[1]);
    const target = scope.get(varRef[1]);
    if (target === undefined) throw new Error(`未知 token:${varRef[1]}`);
    return resolveColor(target, scope, seen);
  }
  const oklch =
    /^oklch\(\s*(?<L>[\d.]+)\s+(?<C>-?[\d.]+)\s+(?<H>-?[\d.]+)(?:\s*\/\s*(?<alpha>[\d.]+%?))?\s*\)$/.exec(
      v,
    );
  if (oklch?.groups !== undefined) {
    const alphaRaw = oklch.groups['alpha'];
    const alpha =
      alphaRaw === undefined
        ? 1
        : alphaRaw.endsWith('%')
          ? Number.parseFloat(alphaRaw) / 100
          : Number.parseFloat(alphaRaw);
    return oklchToLinear(
      Number.parseFloat(oklch.groups['L'] ?? ''),
      Number.parseFloat(oklch.groups['C'] ?? ''),
      Number.parseFloat(oklch.groups['H'] ?? ''),
      alpha,
    );
  }
  const mix = /^color-mix\(\s*in oklab,\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\)$/.exec(v);
  if (mix?.[1] !== undefined && mix[2] !== undefined) {
    const inner = resolveColor(mix[1], scope, seen);
    return { r: inner.r, g: inner.g, b: inner.b, a: inner.a * (Number(mix[2]) / 100) };
  }
  throw new Error(`无法解析颜色值(未覆盖的 CSS 语法):${v}`);
}

// ── 守护矩阵:语义文字 token × 背景 token ───────────────────────────────────

/** AA 阈值:正常文字 ≥4.5:1(WCAG 2.x)。 */
export const AA_NORMAL_TEXT = 4.5;

interface Pair {
  readonly fg: string;
  readonly bg: string;
}

/** 正文/次级/三级文字在全部页面背景面上的组合(侧栏/卡片/浮层共用这组背景)。 */
const SURFACES = ['--bg', '--surface-1', '--surface-2', '--surface-3'] as const;

const TEXT_TOKENS = ['--fg', '--fg-muted', '--fg-subtle'] as const;

/** 强调/状态色作为行内文字时的守护背景(达标组合;其余见 DEBT_PAIRS)。 */
const ACCENT_BG_SURFACES = ['--bg', '--surface-1'] as const;

/** 固定守护对(前景 token,背景 token)——新增 token 先补进这里再谈其它豁免。 */
export const GUARDED_PAIRS: readonly Pair[] = [
  ...TEXT_TOKENS.flatMap((fg): Pair[] => SURFACES.map((bg) => ({ fg, bg }))),
  ...['--brand', '--state-success', '--state-warning', '--state-error', '--state-info'].flatMap(
    (fg): Pair[] => ACCENT_BG_SURFACES.map((bg) => ({ fg, bg })),
  ),
  { fg: '--code-fg', bg: '--code-bg' },
  { fg: '--on-brand', bg: '--brand' },
];

/**
 * 已知未达标组合:如实报告(WARN)但不判红——守护建立时这些就低于 4.5:1,
 * 修它们 = 改视觉,属设计裁决(PRD-0033 R15 只承诺了语义文字 token 族)。
 * 任何一项被改到 ≥4.5 应把它上移到 GUARDED_PAIRS,而不是删行了事。
 */
export const DEBT_PAIRS: readonly Pair[] = [
  // 深色主题品牌蓝在次级表面上低于 AA(4.35 / 3.95)。
  { fg: '--brand', bg: '--surface-2' },
  { fg: '--brand', bg: '--surface-3' },
  // 深色用户气泡正文(#307 项 4 实测 3.82:1;浅色侧 neutral-0/blue-600 达标)。
  { fg: '--bubble-fg', bg: '--bubble' },
  // 浅色主题状态色落在 surface-3(3.96–4.42:1)。
  ...['--state-success', '--state-warning', '--state-error', '--state-info'].map(
    (fg): Pair => ({ fg, bg: '--surface-3' }),
  ),
];

export interface PairResult {
  readonly theme: 'dark' | 'light';
  readonly fg: string;
  readonly bg: string;
  readonly ratio: number;
  readonly pass: boolean;
  /** true = 守护对(未达标即判红);false = 已知债(仅 WARN 报告)。 */
  readonly guarded: boolean;
}

/** 对一份 theme.css 文本跑守护矩阵 + 债清单;CSS 语法不支持时抛错(同样是非零退出)。 */
export function analyzeContrast(css: string): readonly PairResult[] {
  const { dark, light } = parseThemeCss(css);
  const results: PairResult[] = [];
  const evaluate = (
    pairs: readonly Pair[],
    guarded: boolean,
    scope: TokenScope,
    theme: 'dark' | 'light',
  ): void => {
    for (const pair of pairs) {
      const fgDecl = scope.get(pair.fg);
      const bgDecl = scope.get(pair.bg);
      if (fgDecl === undefined || bgDecl === undefined) {
        throw new Error(`${theme} 作用域缺少 token:${fgDecl === undefined ? pair.fg : pair.bg}`);
      }
      const fg = resolveColor(fgDecl, scope, new Set([pair.fg]));
      const bg = resolveColor(bgDecl, scope, new Set([pair.bg]));
      const ratio = contrast(fg, bg);
      results.push({
        theme,
        fg: pair.fg,
        bg: pair.bg,
        ratio,
        guarded,
        pass: ratio >= AA_NORMAL_TEXT,
      });
    }
  };
  evaluate(GUARDED_PAIRS, true, dark, 'dark');
  evaluate(DEBT_PAIRS, false, dark, 'dark');
  evaluate(GUARDED_PAIRS, true, light, 'light');
  evaluate(DEBT_PAIRS, false, light, 'light');
  return results;
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const cssPath = process.argv[2] ?? new URL('../src/theme.css', import.meta.url);
  const css = readFileSync(cssPath, 'utf8');
  const results = analyzeContrast(css);
  const failures = results.filter((r) => r.guarded && !r.pass);
  const minGuarded = Math.min(...results.filter((r) => r.guarded).map((r) => r.ratio));
  for (const r of results) {
    if (!r.guarded && !r.pass) {
      console.log(
        `WARN ${r.theme} ${r.fg} on ${r.bg}: ${r.ratio.toFixed(2)}:1 (已知未达标,见 DEBT_PAIRS)`,
      );
    }
  }
  if (failures.length > 0) {
    for (const f of failures) {
      console.error(
        `FAIL ${f.theme} ${f.fg} on ${f.bg}: ${f.ratio.toFixed(2)}:1 (AA 要求 ≥${AA_NORMAL_TEXT}:1)`,
      );
    }
    console.error(`共 ${failures.length} 个守护组合未达标`);
    process.exit(1);
  }
  console.log(
    `PASS: ${GUARDED_PAIRS.length * 2} 个守护组合全部 ≥${AA_NORMAL_TEXT}:1(最低 ${minGuarded.toFixed(2)}:1)`,
  );
}
