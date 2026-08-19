import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

import { dismissToast, useToasts, type ToastKind } from '#/lib/toast';

const KIND_ICON: Record<ToastKind, React.JSX.Element> = {
  success: <CheckCircle2 className="size-4 shrink-0 text-state-success" aria-hidden />,
  error: <TriangleAlert className="size-4 shrink-0 text-state-error" aria-hidden />,
  info: <Info className="size-4 shrink-0 text-brand" aria-hidden />,
};

/**
 * 全局 toast 容器(内嵌于输入卡片,`bottom-full` 浮在输入框上方)。
 * 定位跟随输入卡片:输入框自动增高时 toast 同步上移,不会遮挡输入区;
 * 样式走三层 token,aria-live 让读屏器在无焦点打断时播报操作结果。
 */
export function Toaster(): React.JSX.Element {
  const toasts = useToasts();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 bottom-full z-[60] mb-2 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex max-w-md items-start gap-2 rounded-lg border border-border bg-popover px-3 py-2 text-sm text-fg shadow-3"
        >
          {KIND_ICON[t.kind]}
          <span className="min-w-0 flex-1 break-words">{t.message}</span>
          <button
            type="button"
            aria-label="关闭提示"
            className="shrink-0 text-fg-subtle transition-colors hover:text-fg"
            onClick={() => {
              dismissToast(t.id);
            }}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
