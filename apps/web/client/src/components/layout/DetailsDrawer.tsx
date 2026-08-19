/**
 * 详情侧滑抽屉（非模态，agent-0 / shadcn Sheet 形态）：满高贴边右滑面板，
 * 统一承载原 details 列、子代理深看、文件预览等所有详情弹窗。
 *
 * 关键契约：
 * - 非模态——无遮罩、不困焦点，弹出期间主窗口（会话流、Composer 等）
 *   始终可操作；Esc / 关闭按钮 / tab 栏开关收起。分层靠 border-l +
 *   shadow-3 表达（VS Code / Linear 非模态面板惯例）。
 * - 浮动不回流——fixed 定位 + transform 滑入滑出（退场比入场快，符合
 *   「到达减速、离开加速」），收起时内容卸载（StateLive 等轮询随卸载停止），
 *   展开按 context 内容重挂。
 * - 宽度可拖（左缘把手，360–768px 钳制，默认 576 对齐 max-w-xl），与开合
 *   状态、头部标题一起由 context / localStorage 持久化（R-C6：UI 偏好不入
 *   config.toml）。
 * - 动效细节见 theme.css `.drawer-panel`；prefers-reduced-motion 时退化为
 *   无动画直接显隐。
 */
import { Bot, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { clampWidth } from '#/lib/columns';

import { useDetails } from './details-context';

const DRAWER_MIN = 360;
const DRAWER_MAX = 768;
/** 退场动画时长 + 余量；超过后卸载内容。 */
const EXIT_MS = 240;

export function DetailsDrawer({ children }: { children: ReactNode }): React.JSX.Element | null {
  const { open, close, title, width, setWidth, setResizing } = useDetails();
  // 挂载状态机：open=true 先挂载再下一帧置 shown（入场过渡）；
  // open=false 先收起、EXIT_MS 后卸载（退场过渡跑完）。
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // 入场过渡需要起始帧先提交再置 shown；rAF 在隐藏页签会被节流到
      // 不触发，兜一个短定时器（幂等），避免面板卡在「挂载但未显示」。
      const reveal = (): void => {
        setShown(true);
      };
      const raf = requestAnimationFrame(reveal);
      const fallback = window.setTimeout(reveal, 64);
      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(fallback);
      };
    }
    setShown(false);
    const timer = window.setTimeout(() => {
      setMounted(false);
    }, EXIT_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  // 左缘拖宽：pointer capture + rAF 节流（把手在左缘，dx 为负 = 变宽）。
  // 拖宽期间置 resizing=true：AppFrame 关闭列宽过渡，让 center 与抽屉左缘
  // 逐帧同步（松开后恢复 320ms 过渡）。
  const origin = useRef(0);
  const base = useRef(0);
  const latest = useRef(0);
  const frame = useRef<number | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      origin.current = e.clientX;
      base.current = width;
      latest.current = e.clientX;
      setResizing(true);
    },
    [width, setResizing],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      latest.current = e.clientX;
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const next = clampWidth(
          base.current - (latest.current - origin.current),
          DRAWER_MIN,
          DRAWER_MAX,
        );
        setWidth(next);
      });
    },
    [setWidth],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setResizing(false);
    },
    [setResizing],
  );

  if (!mounted) return null;

  return (
    <aside
      role="complementary"
      aria-label={title ?? '详情面板'}
      data-open={shown}
      className="drawer-panel fixed inset-y-0 right-0 z-30 flex h-full w-full flex-col border-l border-border bg-popover shadow-3"
      style={{ width: `min(${width}px, 92vw)` }}
    >
      <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3">
        <Bot className="size-4 shrink-0 text-fg-subtle" aria-hidden />
        <p
          className="min-w-0 flex-1 truncate text-sm font-semibold text-fg"
          title={title ?? undefined}
        >
          {title ?? '详情'}
        </p>
        <button
          type="button"
          aria-label="关闭"
          title="关闭"
          onClick={close}
          className="rounded p-1 text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整详情面板宽度"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-y-0 left-0 -ml-1.5 w-3 cursor-col-resize touch-none"
      />
    </aside>
  );
}
