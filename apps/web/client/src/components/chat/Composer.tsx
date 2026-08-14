import { ArrowUp, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '#/components/ui/button';

const MIN_HEIGHT_PX = 40;
const MAX_HEIGHT_PX = 192;

/**
 * 输入区(R12):自动增高 textarea(mirror 量高,40–192px)+ 工具栏
 * (当前模型 chip + Send / Stop 切换)。Enter 发送,Shift+Enter 换行。
 */
export function Composer(props: {
  disabled: boolean;
  model: string | undefined;
  onSend: (text: string) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { disabled, model, onSend, onCancel } = props;
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** mirror 式自动增高:内容变化时按 scrollHeight 收缩/增高,夹在 min/max。 */
  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (el === null) return;
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, MIN_HEIGHT_PX), MAX_HEIGHT_PX);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT_PX ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    resize();
  }, [text, resize]);

  const submit = (): void => {
    const value = text.trim();
    if (value.length === 0 || disabled) return;
    onSend(value);
    setText('');
  };

  return (
    <div className="border-t border-border bg-surface-2 px-4 py-3">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-border-strong bg-input-fill px-3 py-2 shadow-1 transition-colors focus-within:border-brand">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
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
            placeholder={
              disabled
                ? 'Agent is working… (Stop to interrupt)'
                : 'Message byf…  (Enter to send, Shift+Enter for newline)'
            }
            className="block max-h-48 w-full resize-none border-0 bg-transparent text-base leading-relaxed outline-none placeholder:text-fg-subtle"
            style={{ height: MIN_HEIGHT_PX }}
          />
          <div className="mt-2 flex items-center gap-2">
            {model !== undefined && (
              <span
                className="max-w-[50%] truncate rounded-md border border-border bg-surface-3 px-2 py-0.5 font-mono text-xs text-fg-muted"
                title={`model: ${model}`}
              >
                {model}
              </span>
            )}
            {disabled ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCancel}
                className="ml-auto gap-1.5 text-state-error"
              >
                <Square aria-hidden />
                Stop
              </Button>
            ) : (
              <Button
                type="button"
                size="icon-sm"
                onClick={submit}
                disabled={text.trim().length === 0}
                aria-label="Send message"
                className="ml-auto rounded-lg"
              >
                <ArrowUp aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
