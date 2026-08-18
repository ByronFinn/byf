import { Button } from '#/components/ui/button';

/** 通用二次确认弹窗(删除工作区 / MCP server / skill 等共用)。 */
export function ConfirmDialog(props: {
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}): React.JSX.Element {
  const { title, message, confirmLabel, busy, error, onCancel, onConfirm } = props;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-scrim" onClick={onCancel} aria-hidden />
      <div
        role="dialog"
        aria-label={title}
        className="relative w-80 rounded-lg border border-border bg-popover p-4 shadow-3"
      >
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{message}</p>
        {error !== null && <p className="mt-2 text-sm text-state-error">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <Button type="button" size="sm" variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? '处理中…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
