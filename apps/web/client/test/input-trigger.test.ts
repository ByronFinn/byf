import { describe, expect, test } from 'bun:test';

import {
  listboxScrollTop,
  mentionInsertText,
  replaceToken,
  resolveSlashSubmit,
  tokenAt,
} from '../src/lib/input-trigger';

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

describe('listboxScrollTop', () => {
  // 弹窗可视高 256(max-h-64)、行高 32:约 8 行可见
  test('↓ 越过可视区底部:滚到恰好露出该项底', () => {
    expect(
      listboxScrollTop({ itemTop: 300, itemHeight: 32, listScrollTop: 0, listClientHeight: 256 }),
    ).toBe(300 + 32 - 256);
  });

  test('↑ 越过可视区顶部:scrollTop 对齐到该项顶', () => {
    expect(
      listboxScrollTop({ itemTop: 40, itemHeight: 32, listScrollTop: 120, listClientHeight: 256 }),
    ).toBe(40);
  });

  test('仍在可视区内:保持原 scrollTop 不动', () => {
    expect(
      listboxScrollTop({ itemTop: 100, itemHeight: 32, listScrollTop: 64, listClientHeight: 256 }),
    ).toBe(64);
  });
});

describe('mentionInsertText', () => {
  test('文件:@path + 尾空格结束 token', () => {
    expect(mentionInsertText('src/a.ts', false)).toBe('@src/a.ts ');
  });

  test('文件夹:尾斜杠标记目录(TUI @dir/ 同约定)', () => {
    expect(mentionInsertText('src', true)).toBe('@src/ ');
    expect(mentionInsertText('apps/web/client', true)).toBe('@apps/web/client/ ');
  });
});

describe('resolveSlashSubmit(submit 统一解析)', () => {
  const known = new Set(['debug', 'theme']);

  test('行首命中已知名:返回命令与参数(含多行参数)', () => {
    expect(resolveSlashSubmit('/debug 排查 报错', known)).toEqual({
      name: 'debug',
      args: '排查 报错',
    });
    expect(resolveSlashSubmit('/theme', known)).toEqual({ name: 'theme', args: '' });
    expect(resolveSlashSubmit('/debug 第一行\n第二行', known)).toEqual({
      name: 'debug',
      args: '第一行\n第二行',
    });
  });

  test('未知命令与非 / 开头:null(按普通消息发送)', () => {
    expect(resolveSlashSubmit('/etc/hosts 里有什么', known)).toBeNull();
    expect(resolveSlashSubmit('x /theme', known)).toBeNull();
    expect(resolveSlashSubmit('普通消息', known)).toBeNull();
  });
});
