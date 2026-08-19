/**
 * AppFrame —— 两栏工作台骨架（前身为 deepseek 式三栏 PRD-0035 R-C3；details
 * 列已改为非模态浮动抽屉 DetailsDrawer，不再参与网格布局）。
 *
 * 几何契约见 `lib/columns.ts`（computeColumns 纯函数）：sidebar | center
 * 两列，拖拽把手（pointer capture + rAF 节流）、<1024 自动折叠 sidebar。
 * 列宽偏好持久化到 localStorage（R-C6：UI 偏好不入 config.toml）。
 *
 * 本组件只负责骨架：两栏内容（sidebar 树、center 会话视图）由调用方以
 * children 注入。
 */
import { ChevronRight, Menu } from 'lucide-react';
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import {
  SIDEBAR_AUTO_COLLAPSE,
  SIDEBAR_COLLAPSED,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clampWidth,
  computeColumns,
} from '#/lib/columns';

const LS_SIDEBAR = 'byf.layout.sidebar';

interface AppFrameProps {
  readonly sidebar: ReactNode;
  readonly center: ReactNode;
}

function readPref(key: string, fallback: number): number {
  try {
    const raw = Number(localStorage.getItem(key));
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // localStorage 不可用时列宽偏好仅会话内有效
  }
}

/** 一个拖拽把手：pointer capture + rAF 节流的 dx 上报（对标 deepseek
 *  AppFrame DragHandle）。 */
function DragHandle(props: {
  readonly left: number;
  readonly onStart: () => void;
  readonly onDrag: (dx: number) => void;
  readonly onEnd: () => void;
}) {
  const origin = useRef(0);
  const latest = useRef(0);
  const frame = useRef<number | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    origin.current = e.clientX;
    latest.current = e.clientX;
    callbacks.current.onStart();
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    latest.current = e.clientX;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      callbacks.current.onDrag(latest.current - origin.current);
    });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    callbacks.current.onEnd();
  }, []);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="absolute top-0 bottom-0 z-20 -ml-1 w-2 cursor-col-resize touch-none"
      style={{ left: props.left }}
    />
  );
}

export function AppFrame({ sidebar, center }: AppFrameProps) {
  const [sidebarPref, setSidebarPref] = useState(() => readPref(LS_SIDEBAR, SIDEBAR_DEFAULT));
  const [viewport, setViewport] = useState(() => window.innerWidth);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ start: number; pref: number } | null>(null);
  const [narrowExpanded, setNarrowExpanded] = useState(false);

  useLayoutEffect(() => {
    const onResize = (): void => setViewport(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isNarrow = viewport < SIDEBAR_AUTO_COLLAPSE;
  // 窄屏自动折叠 sidebar（手动展开覆盖，narrowExpanded）
  const effectiveSidebar = isNarrow && !narrowExpanded ? 0 : sidebarPref;
  const { sidebar: s } = computeColumns(viewport, effectiveSidebar);

  const beginDrag = useCallback(() => {
    dragRef.current = { start: viewport, pref: effectiveSidebar };
    setDragging(true);
  }, [viewport, effectiveSidebar]);

  const onDrag = useCallback((dx: number) => {
    const drag = dragRef.current;
    if (drag === null) return;
    const next = clampWidth(drag.pref + dx, SIDEBAR_MIN, SIDEBAR_MAX);
    setSidebarPref(next);
    writePref(LS_SIDEBAR, next);
    setNarrowExpanded(true);
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  const toggleSidebar = useCallback(() => {
    if (isNarrow) {
      setNarrowExpanded((v) => !v);
    } else {
      const next = sidebarPref === 0 ? readPref(LS_SIDEBAR, SIDEBAR_DEFAULT) : 0;
      setSidebarPref(next);
      writePref(LS_SIDEBAR, next === 0 ? 0 : next);
    }
  }, [isNarrow, sidebarPref]);

  return (
    <div
      className="relative grid h-full overflow-hidden"
      style={{
        gridTemplateColumns: `${s}px minmax(0, 1fr)`,
        // 行高钉死为视口高度:缺省 auto 会让列被内容撑开(会话多时侧栏
        // 高度 > 视口),底部设置被 overflow-hidden 裁剪、nav 滚动失效。
        gridTemplateRows: 'minmax(0, 1fr)',
        transition: dragging ? 'none' : 'grid-template-columns 320ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Sidebar 列 */}
      <div className="min-w-0 overflow-hidden border-r border-border bg-sidebar">
        {s > SIDEBAR_COLLAPSED + 1 ? (
          sidebar
        ) : (
          <div className="flex h-full flex-col items-center gap-2 py-3">
            <button
              type="button"
              onClick={toggleSidebar}
              className="rounded-md p-2 text-fg-muted hover:bg-hover hover:text-fg"
              aria-label="展开侧边栏"
              title="展开侧边栏"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>

      {/* Center 列 */}
      <div className="relative flex min-w-0 flex-col overflow-hidden">
        {/* 折叠 rail 展开按钮（窄屏/折叠时显示） */}
        {s === SIDEBAR_COLLAPSED && (
          <button
            type="button"
            onClick={toggleSidebar}
            className="absolute left-1 top-2 z-10 rounded-md p-1.5 text-fg-muted hover:bg-hover hover:text-fg"
            aria-label="展开侧边栏"
            title="展开侧边栏"
          >
            <Menu className="size-4" aria-hidden />
          </button>
        )}
        {center}
      </div>

      <DragHandle left={s} onStart={beginDrag} onDrag={onDrag} onEnd={endDrag} />
    </div>
  );
}
