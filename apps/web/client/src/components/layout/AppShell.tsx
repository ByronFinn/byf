import { PanelLeft, Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '#/components/ui/button';

import { SessionSidebar } from './SessionSidebar';
import { ThemeToggle } from './ThemeToggle';

/**
 * 应用骨架(R7):顶栏(品牌 + 主题三态)+ 两栏 Grid —— 左常驻会话侧边栏,
 * 右主区。容器查询:容器宽 < @4xl(56rem)时侧边栏折叠为头部按钮唤出的
 * overlay(点击链接 / 遮罩 / Esc 关闭)。
 */
export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = (): void => {
    setNavOpen(false);
  };

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
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-1 px-4 py-2.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="@4xl:hidden"
          onClick={() => {
            setNavOpen(true);
          }}
          aria-label="Open sessions sidebar"
          aria-expanded={navOpen}
        >
          <PanelLeft aria-hidden />
        </Button>
        <Link to="/" className="flex items-center gap-2 font-semibold text-fg">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-on-brand"
            aria-hidden
          >
            <Terminal className="size-3.5" />
          </span>
          byf <span className="text-xs font-normal text-fg-muted">web client</span>
        </Link>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <div className="grid h-full min-h-0 grid-cols-1 @4xl:grid-cols-[264px_minmax(0,1fr)]">
          <SessionSidebar />
          <main className="min-h-0 min-w-0">{children}</main>
        </div>
      </div>
      {navOpen && (
        <div
          className="@4xl:hidden fixed inset-0 z-40"
          role="dialog"
          aria-modal="true"
          aria-label="Sessions sidebar"
        >
          <div className="absolute inset-0 bg-neutral-950/50" onClick={closeNav} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-[264px] shadow-3">
            <SessionSidebar variant="overlay" onNavigate={closeNav} />
          </div>
        </div>
      )}
    </div>
  );
}
