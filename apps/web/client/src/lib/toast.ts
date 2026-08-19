import { useSyncExternalStore } from 'react';

/**
 * 全局 toast 通知:模块级 store + `useSyncExternalStore` 订阅。
 * 不依赖 context——任何组件(chip/弹层/页面)都可直接 `toast.success(...)`。
 */

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  readonly id: number;
  readonly kind: ToastKind;
  readonly message: string;
}

/** 自动消失时长(与 deepseek harness 的 toast 观感一致:短暂停留,不抢焦点)。 */
const TOAST_DURATION_MS = 4000;

const listeners = new Set<() => void>();
let toasts: readonly ToastItem[] = [];
let nextId = 1;

function emit(): void {
  for (const listener of listeners) listener();
}

export function pushToast(kind: ToastKind, message: string): void {
  const item: ToastItem = { id: nextId++, kind, message };
  toasts = [...toasts, item];
  emit();
  setTimeout(() => {
    dismissToast(item.id);
  }, TOAST_DURATION_MS);
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts(): readonly ToastItem[] {
  return toasts;
}

/** 统一错误文案:Error 取 message,其余 stringify。 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const toast = {
  success: (message: string): void => {
    pushToast('success', message);
  },
  error: (message: string): void => {
    pushToast('error', message);
  },
  info: (message: string): void => {
    pushToast('info', message);
  },
};

/** React 订阅入口(Toaster 组件使用)。 */
export function useToasts(): readonly ToastItem[] {
  return useSyncExternalStore(subscribeToasts, getToasts);
}
