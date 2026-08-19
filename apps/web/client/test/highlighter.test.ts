import { describe, expect, test } from 'bun:test';

import { highlightCode, normalizeLang } from '../src/lib/highlighter';

/**
 * 别名映射守护(R6):normalizeLang 的输出必须落在 boot 语法(typescript/json/bash)
 * 或 LAZY_LANGS 懒加载清单内——别名 miss 会让代码块静默降级为纯文本。
 */

const BOOT = new Set(['typescript', 'json', 'bash']);

describe('normalizeLang', () => {
  test('常见别名均可归一(不返回 null)', () => {
    const inputs = [
      'ts',
      'typescript',
      'js',
      'javascript',
      'jsx',
      'tsx',
      'py',
      'python',
      'sh',
      'shell',
      'zsh',
      'bash',
      'yml',
      'yaml',
      'rs',
      'rust',
      'c++',
      'cpp',
      'cs',
      'c#',
      'csharp',
      'golang',
      'go',
      'md',
      'markdown',
      'docker',
      'dockerfile',
      'bat',
      'batch',
    ];
    for (const input of inputs) {
      const out = normalizeLang(input);
      expect(out, `normalizeLang(${input})`).not.toBeNull();
    }
  });

  test('空串与纯空白返回 null', () => {
    expect(normalizeLang('')).toBeNull();
    expect(normalizeLang('   ')).toBeNull();
  });

  test('大小写不敏感;清单外语言原样保留(走纯文本回退)', () => {
    expect(normalizeLang('TypeScript')).toBe('typescript');
    expect(normalizeLang('Brainfuck')).toBe('brainfuck');
  });

  test('shell 族别名落 boot bash', () => {
    for (const input of ['sh', 'shell', 'zsh', 'bash']) {
      expect(normalizeLang(input)).toBe('bash');
    }
  });
});

/**
 * 双主题守护:高亮 HTML 必须同时携带 --shiki-light / --shiki-dark CSS 变量且
 * 不内联单侧颜色(defaultColor: false)——theme.css 按主题类取用变量实现
 * 亮暗切换。退回单主题(内联 color)会让代码块在某主题下不可读。
 */
describe('highlightCode dual theme', () => {
  test('输出双主题 CSS 变量,不内联颜色', async () => {
    const html = await highlightCode('echo hi', 'bash');
    expect(html).not.toBeNull();
    expect(html).toContain('--shiki-light');
    expect(html).toContain('--shiki-dark');
    // shiki 内联颜色恒为十六进制(color:#… / background-color:#…),双主题输出不应存在
    expect(html).not.toContain('color:#');
  });
});
