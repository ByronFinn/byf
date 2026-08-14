import { Terminal } from 'lucide-react';
import { Link } from 'react-router-dom';

import { SessionSidebar } from './SessionSidebar';
import { ThemeToggle } from './ThemeToggle';

/**
 * 应用骨架(R7):顶栏(品牌 + 主题三态)+ 两栏 Grid —— 左常驻会话侧边栏,
 * 右主区。容器查询:容器宽 < @4xl(56rem)时侧边栏自动折叠隐藏。
 */
export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-1 px-4 py-2.5">
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
      <div className="@container min-h-0 flex-1">
        <div className="grid h-full min-h-0 grid-cols-1 @4xl:grid-cols-[264px_minmax(0,1fr)]">
          <SessionSidebar />
          <main className="min-h-0 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
