import { useCallback, useEffect, useState } from 'react';

const WORKDIR_KEY = 'byf-web-workdir';
/** 同标签页内跨组件同步的自定义事件(storage 事件只跨标签页)。 */
const CHANGE_EVENT = 'byf:workdir-change';

function readStored(): string | null {
  return localStorage.getItem(WORKDIR_KEY);
}

/**
 * 当前工作目录(会话列表的分组键,与 CLI 一致)。持久化在 localStorage
 * `byf-web-workdir`,侧边栏与首页共享;同标签页经自定义事件即时同步。
 */
export function useWorkDir(): {
  dir: string | null;
  setDir: (dir: string) => void;
} {
  const [dir, setDirState] = useState<string | null>(() => readStored());

  useEffect(() => {
    const sync = (): void => {
      setDirState(readStored());
    };
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setDir = useCallback((next: string) => {
    localStorage.setItem(WORKDIR_KEY, next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { dir, setDir };
}
