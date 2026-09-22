import { describe, expect, test } from 'bun:test';

import { LEGACY_TOKEN_STORAGE_KEYS, TOKEN_STORAGE_KEY, readAuthToken } from '../src/api';

/**
 * #307 项 5:auth token 存储键统一到 `byf.*` 点命名空间,旧连字符键必须保持
 * 可读(懒迁移)——重命名不得让任何已登录用户丢 token。
 */
function fakeStore(initial: Record<string, string> = {}): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  dump(): Record<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    dump: () => Object.fromEntries(data),
  };
}

describe('readAuthToken — 键统一 + 懒迁移(#307 项 5)', () => {
  test('新键命中:直接返回,不触碰旧键', () => {
    const store = fakeStore({ [TOKEN_STORAGE_KEY]: 'tok-new' });
    expect(readAuthToken(store)).toBe('tok-new');
    expect(store.dump()).toEqual({ [TOKEN_STORAGE_KEY]: 'tok-new' });
  });

  test('仅旧键命中:返回旧值并写入新键;旧键原样保留(可回退)', () => {
    const legacy = LEGACY_TOKEN_STORAGE_KEYS[0];
    const store = fakeStore({ [legacy]: 'tok-legacy' });
    expect(readAuthToken(store)).toBe('tok-legacy');
    expect(store.dump()).toEqual({ [legacy]: 'tok-legacy', [TOKEN_STORAGE_KEY]: 'tok-legacy' });
    // 第二次读取走新键路径,结果不变(迁移幂等)
    expect(readAuthToken(store)).toBe('tok-legacy');
  });

  test('新旧同值共存时以新键为准', () => {
    const legacy = LEGACY_TOKEN_STORAGE_KEYS[0];
    const store = fakeStore({ [legacy]: 'tok-legacy', [TOKEN_STORAGE_KEY]: 'tok-current' });
    expect(readAuthToken(store)).toBe('tok-current');
  });

  test('两键皆无 / 空串都视为无 token(不产生垃圾写入)', () => {
    expect(readAuthToken(fakeStore())).toBeNull();
    const empty = fakeStore({ [LEGACY_TOKEN_STORAGE_KEYS[0]]: '' });
    expect(readAuthToken(empty)).toBeNull();
    expect(empty.dump()).toEqual({ [LEGACY_TOKEN_STORAGE_KEYS[0]]: '' });
  });

  test('统一后的键沿用 `byf.` 点命名空间', () => {
    expect(TOKEN_STORAGE_KEY.startsWith('byf.')).toBe(true);
  });
});
