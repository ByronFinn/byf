import { describe, expect, test } from 'bun:test';

import { replaceToken, tokenAt } from '../src/lib/input-trigger';

describe('tokenAt', () => {
  test('行首 / 与 @ 触发;无参数时 args 为空', () => {
    expect(tokenAt('/theme', 6)).toEqual({ token: '/theme', args: '' });
    expect(tokenAt('@src', 4)).toEqual({ token: '@src', args: '' });
  });

  test('空白后触发,光标在 token 中间取 token 前缀', () => {
    expect(tokenAt('x /theme', 8)).toEqual({ token: '/theme', args: '' });
    expect(tokenAt('x /the', 6)).toEqual({ token: '/the', args: '' });
  });

  test('slash 带参数:token 后的行内文本为 args', () => {
    expect(tokenAt('/research web 实测参数', 18)).toEqual({
      token: '/research',
      args: 'web 实测参数',
    });
    expect(tokenAt('x /debug 排查 报错', 15)).toEqual({ token: '/debug', args: '排查 报错' });
  });

  test('行尾不是 /@ 开头时不触发', () => {
    expect(tokenAt('hello world', 11)).toBeNull();
  });

  test('slash 命令后跟正文视为带参命令(整行以 / 开头)', () => {
    expect(tokenAt('x /theme 后接正文', 16)).toEqual({
      token: '/theme',
      args: '后接正文',
    });
  });
});

describe('replaceToken', () => {
  test('行首无参命令:替换为空即整行清除', () => {
    expect(replaceToken('/theme', 6, '')).toEqual({ value: '', caret: 0 });
  });

  test('行首带参命令:token 连同参数一并清除', () => {
    expect(replaceToken('/research web 实测参数', 18, '')).toEqual({ value: '', caret: 0 });
  });

  test('空白后命令:保留空白前内容', () => {
    expect(replaceToken('x /theme', 8, '')).toEqual({ value: 'x ', caret: 2 });
    expect(replaceToken('x /debug 排查', 11, '')).toEqual({ value: 'x ', caret: 2 });
  });

  test('光标不在行尾时保留光标后文本', () => {
    expect(replaceToken('/research 参数 后文', 12, '')).toEqual({ value: ' 后文', caret: 0 });
  });

  test('无触发时原样返回', () => {
    expect(replaceToken('hello', 5, '')).toEqual({ value: 'hello', caret: 5 });
  });
});
