import { useQuery } from '@tanstack/react-query';
import { MessageSquarePlus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { api } from '#/api';
import { Button } from '#/components/ui/button';
import { useDebouncedValue } from '#/hooks/useDebouncedValue';
import { useWorkDir } from '#/hooks/useWorkDir';
import type { SessionSummary } from '#/types';

/** 会话列表 query key(workDir + 搜索词;首页与侧边栏共享缓存)。 */
export function sessionListKey(dir: string, q: string): readonly unknown[] {
  return ['sessions', dir, q];
}

/**
 * 常驻会话侧边栏(R7):新建 + 后端搜索(?q=)+ 会话列表;窄屏(<@4xl 容器)
 * 由 AppShell 的容器查询折叠隐藏。
 */
export function SessionSidebar(): React.JSX.Element | null {
  const location = useLocation();
  const activeId = /^\/sessions\/([^/]+)/.exec(location.pathname)?.[1];
  const { dir } = useWorkDir();
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q.trim(), 250);

  const { data: sessions, isFetching } = useQuery({
    queryKey: sessionListKey(dir ?? '', debouncedQ),
    queryFn: () => api.listSessions(dir as string, debouncedQ),
    enabled: dir !== null && dir.length > 0,
  });

  return (
    <aside className="hidden @4xl:flex min-h-0 flex-col border-r border-border bg-sidebar">
      <div className="p-2 pb-1">
        <Button variant="outline" asChild className="w-full justify-start">
          <Link to="/">
            <MessageSquarePlus aria-hidden />
            New session
          </Link>
        </Button>
      </div>
      <div className="px-2 pb-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-fg-subtle"
            aria-hidden
          />
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
            }}
            placeholder="Search sessions…"
            aria-label="Search sessions"
            className="w-full rounded-md border border-border bg-input-fill py-1.5 pr-2 pl-7 text-sm outline-none placeholder:text-fg-subtle focus:border-brand"
          />
        </div>
      </div>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2" aria-label="Sessions">
        {dir === null && (
          <p className="px-2 py-4 text-xs leading-relaxed text-fg-subtle">
            Set a working directory on the home page to list sessions here.
          </p>
        )}
        {dir !== null && sessions !== undefined && sessions.length === 0 && (
          <p className="px-2 py-4 text-xs text-fg-subtle">
            {debouncedQ.length > 0 ? 'No matching sessions.' : 'No sessions in this directory yet.'}
          </p>
        )}
        {sessions?.map((s) => (
          <SidebarRow key={s.id} session={s} active={s.id === activeId} />
        ))}
        {isFetching &&
          sessions === undefined &&
          [0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-surface-2" aria-hidden />
          ))}
      </nav>
    </aside>
  );
}

function SidebarRow(props: { session: SessionSummary; active: boolean }): React.JSX.Element {
  const { session, active } = props;
  const updated = new Date(session.updatedAt);
  return (
    <Link
      to={`/sessions/${session.id}`}
      aria-current={active ? 'page' : undefined}
      className={`block rounded-md border border-transparent px-2.5 py-2 text-sm transition-colors ${
        active ? 'border-border bg-active text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg'
      }`}
    >
      <span className="block truncate">{session.title ?? session.lastPrompt ?? session.id}</span>
      <span className="mt-0.5 block text-xs text-fg-subtle">
        {updated.toLocaleDateString()}{' '}
        {updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </Link>
  );
}
