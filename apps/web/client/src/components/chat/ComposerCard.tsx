import { ArrowUp, Square } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

import { Button } from '#/components/ui/button';

export const COMPOSER_MIN_HEIGHT_PX = 40;
export const COMPOSER_MAX_HEIGHT_PX = 192;

/**
 * 输入卡片(对齐 deepseek 的浮动胶囊输入):单一容器、唯一一道边框,textarea
 * 无内边框,底部一行 tools(左)/ trailing(右)。hero 与会话内共用;差异只在
 * 外层宿主(hero 上方另有工作区 chip 行)与传入的底栏 chips。
 */
export function ComposerCard(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onSend: (text: string) => void;
  /** busy 时发送换成 Stop(仍可输入,仅不可发送)。 */
  busy?: boolean;
  onCancel?: () => void;
  /** 底栏左侧 chips 区(权限 chip 等)。 */
  leading?: React.ReactNode;
  /** 底栏右侧模型 chip。 */
  model?: string;
  /** 附加禁用发送条件(如 hero 未选工作区)。 */
  sendDisabled?: boolean;
  error?: string | null;
  minHeightPx?: number;
  maxHeightPx?: number;
}): React.JSX.Element {
  const {
    value,
    onChange,
    placeholder,
    onSend,
    busy = false,
    onCancel,
    leading,
    model,
    sendDisabled = false,
    error,
    minHeightPx = COMPOSER_MIN_HEIGHT_PX,
    maxHeightPx = COMPOSER_MAX_HEIGHT_PX,
  } = props;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** mirror 式自动增高:内容变化时按 scrollHeight 收缩/增高,夹在 min/max。 */
  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (el === null) return;
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, minHeightPx), maxHeightPx);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeightPx ? 'auto' : 'hidden';
  }, [minHeightPx, maxHeightPx]);

  useEffect(() => {
    resize();
  }, [value, resize]);

  const submit = (): void => {
    const text = value.trim();
    if (text.length === 0 || busy || sendDisabled) return;
    onSend(text);
  };

  const canSend = value.trim().length > 0 && !busy && !sendDisabled;

  return (
    <div className="rounded-2xl border border-border bg-input-fill px-3 pt-2.5 pb-1.5 shadow-1 transition-colors focus-within:border-brand">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          // IME 组合态的 Enter(确认候选词)不发送
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        aria-label="Message"
        placeholder={placeholder}
        className="block w-full resize-none border-0 bg-transparent text-base leading-relaxed outline-none placeholder:text-fg-subtle"
        style={{ height: minHeightPx }}
      />
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {leading}
          {error !== null && error !== undefined && (
            <span className="min-w-0 truncate text-xs text-state-error">{error}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {model !== undefined && (
            <span
              className="flex h-7 max-w-40 items-center truncate rounded-full px-2 font-mono text-xs text-fg-muted"
              title={`model: ${model}`}
            >
              {model}
            </span>
          )}
          {busy ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="gap-1.5 text-state-error"
            >
              <Square aria-hidden />
              Stop
            </Button>
          ) : (
            <Button
              type="button"
              size="icon-sm"
              onClick={submit}
              disabled={!canSend}
              aria-label="发送消息"
              className="rounded-full"
            >
              <ArrowUp aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
