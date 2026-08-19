/**
 * AppFrame —— deepseek 式三栏工作台骨架（PRD-0035 R-C3 / ADR-0037 D5）。
 *
 * 几何契约见 `lib/columns.ts`（computeColumns 纯函数）：sidebar | center |
 * details 三列，拖拽把手（pointer capture + rAF 节流）、<1024 自动折叠
 * sidebar、details 放不下自动关闭（派生零宽——恢复窗口后按偏好回来）。
 * 列宽偏好持久化到 localStorage（R-C6：UI 偏好不入 config.toml）。
 *
 * 本组件只负责骨架：三栏内容（sidebar 树、center 会话视图、details 宿主）
 * 由调用方以 children 注入，PR4 接入 Inspector 与详情面板。
 */
import { ChevronRight, Menu } from 'lucide-react';
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import {
  DETAILS_DEFAULT,
  DETAILS_MAX,
  DETAILS_MIN,
  SIDEBAR_AUTO_COLLAPSE,
  SIDEBAR_COLLAPSED,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clampWidth,
  computeColumns,
} from '#/lib/columns';

const LS_SIDEBAR = 'byf.layout.sidebar';
const LS_DETAILS = 'byf.layout.details';

interface AppFrameProps {
  readonly sidebar: ReactNode;
  readonly center: ReactNode;
  readonly details: ReactNode;
  /** 窄屏（details 自动关闭）时把 details 内容渲染为 fixed overlay drawer。 */
  readonly detailsOverlay?: boolean;
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
  readonly side: 'sidebar' | 'details';
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

export function AppFrame({ sidebar, center, details, detailsOverlay }: AppFrameProps) {
  const [sidebarPref, setSidebarPref] = useState(() => readPref(LS_SIDEBAR, SIDEBAR_DEFAULT));
  const [detailsPref, setDetailsPref] = useState(() => readPref(LS_DETAILS, DETAILS_DEFAULT));
  const [viewport, setViewport] = useState(() => window.innerWidth);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ side: 'sidebar' | 'details'; start: number; pref: number } | null>(null);
  const [narrowExpanded, setNarrowExpanded] = useState(false);

  useLayoutEffect(() => {
    const onResize = (): void => setViewport(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isNarrow = viewport < SIDEBAR_AUTO_COLLAPSE;
  // 窄屏自动折叠 sidebar（手动展开覆盖，narrowExpanded）
  const effectiveSidebar = isNarrow && !narrowExpanded ? 0 : sidebarPref;
  const {
    sidebar: s,
    center: c,
    details: d,
  } = computeColumns(viewport, effectiveSidebar, detailsPref);
  const detailsClosed = d === 0;

  const beginDrag = useCallback(
    (side: 'sidebar' | 'details') => {
      dragRef.current = {
        side,
        start: viewport,
        pref: side === 'sidebar' ? effectiveSidebar : detailsPref,
      };
      setDragging(true);
    },
    [viewport, effectiveSidebar, detailsPref],
  );

  const onDrag = useCallback((dx: number) => {
    const drag = dragRef.current;
    if (drag === null) return;
    if (drag.side === 'sidebar') {
      const next = clampWidth(drag.pref + dx, SIDEBAR_MIN, SIDEBAR_MAX);
      setSidebarPref(next);
      writePref(LS_SIDEBAR, next);
      setNarrowExpanded(true);
    } else {
      const next = clampWidth(drag.pref - dx, DETAILS_MIN, DETAILS_MAX);
      setDetailsPref(next);
      writePref(LS_DETAILS, next);
    }
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

  const toggleDetails = useCallback(() => {
    const next = detailsPref === 0 ? readPref(LS_DETAILS, DETAILS_DEFAULT) : 0;
    setDetailsPref(next);
    writePref(LS_DETAILS, next === 0 ? 0 : next);
  }, [detailsPref]);

  return (
    <div
      className="relative grid h-full overflow-hidden"
      style={{
        gridTemplateColumns: `${s}px minmax(0, 1fr) ${detailsClosed ? 0 : d}px`,
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

      {/* Details 列：零宽时保持挂载（不卸载子树），border 隐藏防 1px 缝 */}
      <div
        className={`min-w-0 overflow-hidden ${detailsClosed ? '' : 'border-l border-border'}`}
        style={{ width: detailsClosed ? 0 : d }}
      >
        <div className="h-full" style={{ width: d }}>
          {details}
        </div>
      </div>

      {!detailsClosed && (
        <DragHandle
          side="details"
          left={s + c}
          onStart={() => beginDrag('details')}
          onDrag={onDrag}
          onEnd={endDrag}
        />
      )}
      <DragHandle
        side="sidebar"
        left={s}
        onStart={() => beginDrag('sidebar')}
        onDrag={onDrag}
        onEnd={endDrag}
      />

      {/* 窄屏 details overlay drawer（R-C3：narrow 下 details 为 overlay drawer） */}
      {detailsOverlay && isNarrow && detailsPref !== 0 && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-scrim/50" onClick={toggleDetails} />
          <div className="absolute inset-y-0 right-0 w-[min(360px,92vw)] overflow-hidden border-l border-border bg-bg shadow-3">
            {details}
          </div>
        </div>
      )}
    </div>
  );
}
