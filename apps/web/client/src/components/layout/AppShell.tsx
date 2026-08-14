import { PanelLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '#/components/ui/button';
import { cn } from '#/lib/utils';

import { SessionSidebar } from './SessionSidebar';

const COLLAPSED_KEY = 'byf.sidebar.collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * 应用骨架(对齐 deepseek harness):无顶栏,两栏 Grid —— 左会话侧边栏
 * (可折叠为 56px 图标 rail)+ 右主区。容器查询:容器宽 < @4xl(56rem)时
 * 侧边栏折叠,主区左上角浮动按钮唤出 overlay(非模态导航面板)。
 */
export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed());
  const [navOpen, setNavOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const openNav = (): void => {
    setNavOpen(true);
  };

  const closeNav = (): void => {
    setNavOpen(false);
    toggleRef.current?.focus();
  };

  const toggleCollapsed = (): void => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // 忽略持久化失败
      }
      return next;
    });
  };

  // 打开时把焦点移入面板(非模态:背景仍可达,因此不承诺 aria-modal)
  useEffect(() => {
    if (navOpen) panelRef.current?.focus();
  }, [navOpen]);

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeNav();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [navOpen]);

  return (
    <div className="@container flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <div
          className={cn(
            'grid h-full min-h-0 grid-cols-1',
            collapsed
              ? '@4xl:grid-cols-[56px_minmax(0,1fr)]'
              : '@4xl:grid-cols-[264px_minmax(0,1fr)]',
          )}
        >
          <SessionSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
          <main className="relative min-h-0 min-w-0">
            {children}
            <Button
              ref={toggleRef}
              type="button"
              variant="outline"
              size="icon-sm"
              className="@4xl:hidden absolute top-3 left-3 z-30"
              onClick={openNav}
              aria-label="打开侧边栏"
              aria-expanded={navOpen}
            >
              <PanelLeft aria-hidden />
            </Button>
          </main>
        </div>
      </div>
      {navOpen && (
        <div className="@4xl:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-scrim" onClick={closeNav} aria-hidden />
          <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-label="会话侧边栏"
            className="overlay-in absolute inset-y-0 left-0 w-[264px] outline-none shadow-3"
          >
            <SessionSidebar variant="overlay" onNavigate={closeNav} />
          </div>
        </div>
      )}
    </div>
  );
}
