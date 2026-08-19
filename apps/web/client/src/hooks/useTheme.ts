import { useCallback, useEffect, useState } from 'react';

/** 三态主题选择(用户偏好)与落地后的具体主题。 */
export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'byf.theme';

function readStored(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore quota/permission errors */
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * 把具体主题落到 DOM:<html class> 切 token、同步 color-scheme,并把
 * `<meta name="theme-color">` 同步为当前 --bg token(地址栏 / 系统 chrome 跟随)。
 * 与 index.html 的防闪烁 boot 脚本保持同步。
 */
function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle('theme-dark', resolved === 'dark');
  root.classList.toggle('theme-light', resolved === 'light');
  root.style.colorScheme = resolved;
  syncThemeColorMeta();
}

/** 读 --bg token 值写入 meta;样式表尚未就绪(读到空串)时下帧重试,封顶 30 帧。 */
function syncThemeColorMeta(retriesLeft = 30): void {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (value.length === 0) {
    if (retriesLeft <= 0) return;
    requestAnimationFrame(() => {
      syncThemeColorMeta(retriesLeft - 1);
    });
    return;
  }
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta === null) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  meta.content = value;
}

/**
 * 三态主题(light / dark / system):选择持久化在 localStorage `byf.theme`,
 * 缺省 system;system 态监听 prefers-color-scheme 变化实时跟随。
 */
export function useTheme(): {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  set: (c: ThemeChoice) => void;
} {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => readStored());
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark());

  useEffect(() => {
    const m = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (): void => {
      setSystemDark(m.matches);
    };
    m.addEventListener('change', handler);
    return () => {
      m.removeEventListener('change', handler);
    };
  }, []);

  const resolved: ResolvedTheme = choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const set = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {
      /* ignore */
    }
  }, []);

  return { choice, resolved, set };
}
