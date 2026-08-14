import { describe, expect, test } from 'bun:test';

import { normalizeLang } from '../src/lib/highlighter';

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
