import bash from '@shikijs/langs/bash';
import json from '@shikijs/langs/json';
import typescript from '@shikijs/langs/typescript';
import githubDark from '@shikijs/themes/github-dark';
import githubLight from '@shikijs/themes/github-light';
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

/**
 * Shiki 高亮单例(R6)。boot 语法(typescript / json / shell)静态打入本模块,
 * 其余语言按需懒加载(每个语法一个异步 chunk)—— curated 清单覆盖 agent
 * 输出的常见语言,清单外回退纯文本,避免引入全量 200+ 语法。
 * 引擎用 JS regex(forgiving):免 wasm、体积小,个别不兼容 pattern 会被跳过。
 *
 * 本模块经 CodeBlock 动态导入,首次渲染代码块时才加载(独立 vendor chunk)。
 */

/**
 * 双主题高亮:token 颜色以 --shiki-light / --shiki-dark CSS 变量输出
 * (defaultColor: false,不内联单侧颜色),由 theme.css 按 <html> 的
 * theme-light / theme-dark 类切换——切换主题无需重新高亮。
 */
const THEMES = { light: 'github-light', dark: 'github-dark' } as const;

type LangLoader = () => Promise<{ default: Parameters<HighlighterCore['loadLanguage']>[0] }>;

/** 懒加载语言清单:lang id → 静态可分析的动态 import。 */
const LAZY_LANGS: Record<string, LangLoader> = {
  javascript: () => import('@shikijs/langs/javascript'),
  tsx: () => import('@shikijs/langs/tsx'),
  jsx: () => import('@shikijs/langs/jsx'),
  python: () => import('@shikijs/langs/python'),
  rust: () => import('@shikijs/langs/rust'),
  go: () => import('@shikijs/langs/go'),
  java: () => import('@shikijs/langs/java'),
  kotlin: () => import('@shikijs/langs/kotlin'),
  swift: () => import('@shikijs/langs/swift'),
  c: () => import('@shikijs/langs/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs/csharp'),
  css: () => import('@shikijs/langs/css'),
  html: () => import('@shikijs/langs/html'),
  vue: () => import('@shikijs/langs/vue'),
  svelte: () => import('@shikijs/langs/svelte'),
  yaml: () => import('@shikijs/langs/yaml'),
  toml: () => import('@shikijs/langs/toml'),
  markdown: () => import('@shikijs/langs/markdown'),
  mdx: () => import('@shikijs/langs/mdx'),
  sql: () => import('@shikijs/langs/sql'),
  diff: () => import('@shikijs/langs/diff'),
  dockerfile: () => import('@shikijs/langs/dockerfile'),
  graphql: () => import('@shikijs/langs/graphql'),
  lua: () => import('@shikijs/langs/lua'),
  ruby: () => import('@shikijs/langs/ruby'),
  php: () => import('@shikijs/langs/php'),
  protobuf: () => import('@shikijs/langs/protobuf'),
  ini: () => import('@shikijs/langs/ini'),
  powershell: () => import('@shikijs/langs/powershell'),
  batch: () => import('@shikijs/langs/batch'),
};

/**
 * 常见别名归一;空返回 null。导出供测试守护「别名输出 ⊆ boot ∪ LAZY_LANGS」。
 */
export function normalizeLang(lang: string): string | null {
  const l = lang.trim().toLowerCase();
  if (l.length === 0) return null;
  if (l === 'ts') return 'typescript';
  if (l === 'js') return 'javascript';
  if (l === 'py') return 'python';
  if (l === 'sh' || l === 'shell' || l === 'zsh') return 'bash';
  if (l === 'yml') return 'yaml';
  if (l === 'rs') return 'rust';
  if (l === 'c++') return 'cpp';
  if (l === 'cs' || l === 'c#') return 'csharp';
  if (l === 'golang') return 'go';
  if (l === 'md') return 'markdown';
  if (l === 'docker') return 'dockerfile';
  if (l === 'bat') return 'batch';
  return l;
}

let highlighterPromise: Promise<HighlighterCore> | null = null;
const loadedLangs = new Set<string>(['typescript', 'json', 'bash']);

function createHighlighter(): Promise<HighlighterCore> {
  return createHighlighterCore({
    themes: [githubLight, githubDark],
    langs: [typescript, json, bash],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
}

export async function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighter().catch((error: unknown) => {
    highlighterPromise = null;
    throw error;
  });
  return highlighterPromise;
}

/** 懒加载非 boot 语言;未知语言返回 false(调用方回退纯文本)。 */
async function ensureLanguage(lang: string): Promise<boolean> {
  if (loadedLangs.has(lang)) return true;
  const loader = LAZY_LANGS[lang];
  if (loader === undefined) return false;
  const highlighter = await getHighlighter();
  const mod = await loader();
  await highlighter.loadLanguage(mod.default);
  loadedLangs.add(lang);
  return true;
}

/** 高亮为 HTML;语言不可用 / 出错时返回 null(调用方渲染纯文本)。 */
export async function highlightCode(code: string, lang: string): Promise<string | null> {
  const alias = normalizeLang(lang);
  if (alias === null) return null;
  try {
    if (!(await ensureLanguage(alias))) return null;
    const highlighter = await getHighlighter();
    return highlighter.codeToHtml(code, { lang: alias, themes: THEMES, defaultColor: false });
  } catch {
    return null;
  }
}
