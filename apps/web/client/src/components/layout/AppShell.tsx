import { Link } from 'react-router-dom';

import { ThemeToggle } from './ThemeToggle';

export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border bg-surface-1 px-4 py-2.5">
        <Link to="/" className="flex items-center gap-2 font-semibold text-fg">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand" aria-hidden />
          byf <span className="text-xs font-normal text-fg-muted">web client</span>
        </Link>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
