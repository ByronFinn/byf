import { AsyncLocalStorage } from 'node:async_hooks';

import type { Kaos } from './kaos';
import { localKaos } from './local';

const kaosStorage = new AsyncLocalStorage<Kaos>();

function getDefaultKaos(): Kaos {
  return localKaos;
}

/**
 * 返回当前异步上下文的 {@link Kaos} 实例。
 *
 * 若 {@link runWithKaos} 已为此上下文绑定实例则返回之;否则使用惰性创建
 * 的 {@link LocalKaos} 默认实例。
 */
export function getCurrentKaos(): Kaos {
  return kaosStorage.getStore() ?? getDefaultKaos();
}

export function runWithKaos<T>(kaos: Kaos, fn: () => T): T {
  return kaosStorage.run(kaos, fn);
}

/**
 * setCurrentKaos 返回的 token,用于恢复先前的实例。
 * 镜像 Python 的 ContextVar Token 模式。
 */
export interface KaosToken {
  readonly previousKaos: Kaos | null;
}

/**
 * 设置当前 kaos 实例,返回用于恢复先前实例的 token。
 *
 * 与普通模块级全局不同,它把覆盖绑定到当前异步上下文,使并发任务不会
 * 互相污染。返回的 token 之后可传给 {@link resetCurrentKaos} 恢复此前
 * 可见的实例,镜像 Python 的 ContextVar token 模式。
 */
export function setCurrentKaos(kaos: Kaos): KaosToken {
  const token: KaosToken = { previousKaos: getCurrentKaos() };
  kaosStorage.enterWith(kaos);
  return token;
}

export function resetCurrentKaos(token: KaosToken): void {
  kaosStorage.enterWith(token.previousKaos ?? getDefaultKaos());
}
