import { useState } from 'react';

import { Button } from '#/components/ui/button';

export function Composer(props: {
  disabled: boolean;
  onSend: (text: string) => void;
}): React.JSX.Element {
  const { disabled, onSend } = props;
  const [text, setText] = useState('');

  const submit = (): void => {
    const value = text.trim();
    if (value.length === 0 || disabled) return;
    onSend(value);
    setText('');
  };

  return (
    <div className="border-t border-border bg-surface-2 px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={
            disabled
              ? 'Agent is working… (Ctrl-C via Cancel)'
              : 'Message byf…  (Enter to send, Shift+Enter for newline)'
          }
          className="max-h-48 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-border-strong bg-input-fill px-3 py-2 text-sm outline-none placeholder:text-fg-subtle focus:border-brand"
        />
        <Button
          type="button"
          onClick={submit}
          disabled={disabled || text.trim().length === 0}
          className="h-10 shrink-0 rounded-xl px-4 disabled:opacity-40"
        >
          Send
        </Button>
      </div>
    </div>
  );
}
