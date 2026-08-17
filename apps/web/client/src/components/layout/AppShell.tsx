import { PanelLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '#/components/ui/button';

import { AppFrame } from './AppFrame';
import { DetailsProvider, useDetails } from './details-context';
import { SessionSidebar } from './SessionSidebar';

/**
 * 应用骨架(PRD-0035 R-C3):deepseek 式三栏 AppFrame —— sidebar(会话侧边栏)
 * | center(会话视图)| details(详情宿主)。列宽拖拽/折叠由 AppFrame 管理
 * (localStorage 持久化);窄屏下 sidebar 自动折叠,左上浮动按钮唤出 overlay
 * 导航面板;details 放不下时自动关闭,窄屏为 overlay drawer(detailsOverlay)。
 */
export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
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
    <DetailsProvider>
      <AppFrame
        sidebar={<SessionSidebar />}
        center={
          <main className="relative h-full min-w-0">
            {children}
            <Button
              ref={toggleRef}
              type="button"
              variant="outline"
              size="icon-sm"
              className="absolute top-3 left-3 z-30 md:hidden"
              onClick={openNav}
              aria-label="打开侧边栏"
              aria-expanded={navOpen}
            >
              <PanelLeft aria-hidden />
            </Button>
          </main>
        }
        details={<DetailsHost />}
        detailsOverlay
      />
      {navOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
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
    </DetailsProvider>
  );
}

/** 统一 details 宿主：渲染 context 内容，空时显示 deepseek 同款空态（R-D2）。 */
function DetailsHost(): React.JSX.Element {
  const { content } = useDetails();
  if (content !== null) {
    return <div className="flex h-full flex-col overflow-y-auto">{content}</div>;
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm leading-7 text-fg-muted">
        <div>
          <p className="font-medium text-fg">Click a tool row in the message flow</p>
          <p>to view its details — 工具详情、子 Agent 轨迹、文件预览、wire/state JSON</p>
        </div>
      </div>
    </div>
  );
}
