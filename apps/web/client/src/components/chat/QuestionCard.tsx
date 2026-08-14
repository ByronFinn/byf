import { useState } from 'react';

import { api } from '#/api';
import type { QuestionAnswers, QuestionRequest } from '#/types';

const OTHER_LABEL_DEFAULT = 'Other';

export function QuestionCard(props: {
  sessionId: string;
  requestId: string;
  request: QuestionRequest;
}): React.JSX.Element {
  const { sessionId, requestId, request } = props;
  const [single, setSingle] = useState<Record<number, string>>({});
  const [multi, setMulti] = useState<Record<number, Set<string>>>({});
  const [useOther, setUseOther] = useState<Record<number, boolean>>({});
  const [otherText, setOtherText] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async (): Promise<void> => {
    const answers: Record<string, string> = {};
    request.questions.forEach((q, i) => {
      const otherLabel = q.otherLabel ?? OTHER_LABEL_DEFAULT;
      let value: string | undefined;
      if (q.multiSelect) {
        const labels = new Set(multi[i] ?? []);
        const ot = otherText[i]?.trim();
        if (useOther[i] && ot !== undefined && ot.length > 0) labels.add(`${otherLabel}: ${ot}`);
        value = [...labels].join(', ');
      } else {
        const s = single[i];
        if (useOther[i]) {
          const ot = otherText[i]?.trim();
          value = ot !== undefined && ot.length > 0 ? `${otherLabel}: ${ot}` : otherLabel;
        } else {
          value = s;
        }
      }
      if (value !== undefined && value.length > 0) answers[String(i)] = value;
    });
    setSubmitting(true);
    try {
      await api.resolveQuestion(sessionId, requestId, { answers: answers as QuestionAnswers });
    } catch {
      setSubmitting(false);
    }
  };

  const dismiss = async (): Promise<void> => {
    setSubmitting(true);
    try {
      await api.resolveQuestion(sessionId, requestId, { answers: {} as QuestionAnswers });
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-state-info/40 bg-state-info/5 p-3">
      {request.questions.map((item, i) => (
        <div key={i}>
          {item.header !== undefined && (
            <div className="mb-0.5 text-sm font-semibold text-fg">{item.header}</div>
          )}
          {item.question !== undefined && item.question !== item.header && (
            <div className="mb-1 text-sm text-fg">{item.question}</div>
          )}
          {item.body !== undefined && (
            <div className="mb-1.5 text-xs text-fg-muted">{item.body}</div>
          )}
          <div className="space-y-1">
            {item.options.map((opt) => {
              const checked = item.multiSelect
                ? (multi[i] ?? new Set<string>()).has(opt.label)
                : single[i] === opt.label;
              return (
                <label
                  key={opt.label}
                  className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-sm hover:bg-hover"
                >
                  <input
                    type={item.multiSelect ? 'checkbox' : 'radio'}
                    name={`q-${requestId}-${i}`}
                    checked={checked}
                    onChange={() => {
                      if (item.multiSelect) {
                        setMulti((prev) => {
                          const set = new Set(prev[i] ?? []);
                          if (set.has(opt.label)) set.delete(opt.label);
                          else set.add(opt.label);
                          return { ...prev, [i]: set };
                        });
                      } else {
                        setSingle((prev) => ({ ...prev, [i]: opt.label }));
                        setUseOther((prev) => ({ ...prev, [i]: false }));
                      }
                    }}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="text-fg">{opt.label}</span>
                    {opt.description !== undefined && (
                      <span className="block text-xs text-fg-muted">{opt.description}</span>
                    )}
                  </span>
                </label>
              );
            })}
            {/* Other */}
            <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-sm hover:bg-hover">
              <input
                type={item.multiSelect ? 'checkbox' : 'radio'}
                name={`q-${requestId}-${i}`}
                checked={useOther[i] === true}
                onChange={() => {
                  if (item.multiSelect) {
                    setUseOther((prev) => ({ ...prev, [i]: !prev[i] }));
                  } else {
                    setUseOther((prev) => ({ ...prev, [i]: true }));
                    setSingle((prev) => ({ ...prev, [i]: '' }));
                  }
                }}
                className="mt-0.5"
              />
              <span className="flex-1">
                <span className="text-fg">{item.otherLabel ?? OTHER_LABEL_DEFAULT}</span>
                {item.otherDescription !== undefined && (
                  <span className="block text-xs text-fg-muted">{item.otherDescription}</span>
                )}
                {useOther[i] === true && (
                  <input
                    type="text"
                    value={otherText[i] ?? ''}
                    onChange={(e) => {
                      setOtherText((prev) => ({ ...prev, [i]: e.target.value }));
                    }}
                    placeholder="Type a custom answer…"
                    className="mt-1 w-full rounded border border-border-strong bg-input-fill px-2 py-1 text-sm outline-none focus:border-state-info"
                  />
                )}
              </span>
            </label>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={() => void submit()}
          className="rounded-md bg-state-info px-3 py-1 text-sm text-on-brand hover:opacity-90 disabled:opacity-50"
        >
          Submit
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void dismiss()}
          className="rounded-md border border-border-strong px-3 py-1 text-sm text-fg-muted hover:bg-hover disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
