import { Link } from 'react-router-dom';

export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-white/10 bg-[#11151a] px-4 py-2.5">
        <Link to="/" className="flex items-center gap-2 font-semibold text-zinc-100">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-400" aria-hidden />
          byf <span className="text-xs font-normal text-zinc-500">web client</span>
        </Link>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
