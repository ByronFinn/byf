import { HelpCircle } from 'lucide-react';
import { useState } from 'react';

import { api } from '#/api';
import { Button } from '#/components/ui/button';
import { Checkbox } from '#/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '#/components/ui/radio-group';
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
    <div className="space-y-3 rounded-xl border border-state-info/40 bg-state-info/5 p-3 shadow-1">
      {request.questions.map((item, i) => (
        <div key={i}>
          {item.header !== undefined && (
            <div className="mb-0.5 flex items-center gap-1.5 text-sm font-semibold text-fg">
              <HelpCircle className="size-3.5 text-state-info" aria-hidden />
              {item.header}
            </div>
          )}
          {item.question !== undefined && item.question !== item.header && (
            <div className="mb-1 text-sm text-fg">{item.question}</div>
          )}
          {item.body !== undefined && (
            <div className="mb-1.5 text-xs text-fg-muted">{item.body}</div>
          )}
          <div className="space-y-1">
            {item.multiSelect ? (
              item.options.map((opt) => {
                const checked = (multi[i] ?? new Set<string>()).has(opt.label);
                return (
                  <label
                    key={opt.label}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-sm hover:bg-hover"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={checked}
                      onCheckedChange={() => {
                        setMulti((prev) => {
                          const set = new Set(prev[i] ?? []);
                          if (set.has(opt.label)) set.delete(opt.label);
                          else set.add(opt.label);
                          return { ...prev, [i]: set };
                        });
                      }}
                    />
                    <OptionBody label={opt.label} description={opt.description} />
                  </label>
                );
              })
            ) : (
              <RadioGroup
                value={useOther[i] === true ? '__other__' : (single[i] ?? '')}
                onValueChange={(value) => {
                  if (value === '__other__') {
                    setUseOther((prev) => ({ ...prev, [i]: true }));
                    setSingle((prev) => ({ ...prev, [i]: '' }));
                  } else {
                    setSingle((prev) => ({ ...prev, [i]: value }));
                    setUseOther((prev) => ({ ...prev, [i]: false }));
                  }
                }}
                className="gap-1"
              >
                {item.options.map((opt) => (
                  <label
                    key={opt.label}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-sm hover:bg-hover"
                  >
                    <RadioGroupItem className="mt-0.5" value={opt.label} />
                    <OptionBody label={opt.label} description={opt.description} />
                  </label>
                ))}
                {/* Other:radio 变体须在 RadioGroup 内注册 */}
                <OtherRow
                  otherLabel={item.otherLabel}
                  otherDescription={item.otherDescription}
                  multiSelect={false}
                  active={useOther[i] === true}
                  otherText={otherText[i] ?? ''}
                  onOtherText={(v) => {
                    setOtherText((prev) => ({ ...prev, [i]: v }));
                  }}
                />
              </RadioGroup>
            )}
            {item.multiSelect && (
              <OtherRow
                otherLabel={item.otherLabel}
                otherDescription={item.otherDescription}
                multiSelect={true}
                active={useOther[i] === true}
                otherText={otherText[i] ?? ''}
                onOtherText={(v) => {
                  setOtherText((prev) => ({ ...prev, [i]: v }));
                }}
                onToggle={(checked) => {
                  setUseOther((prev) => ({ ...prev, [i]: checked }));
                }}
              />
            )}
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={submitting} onClick={() => void submit()}>
          Submit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={submitting}
          onClick={() => void dismiss()}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function OtherRow(props: {
  otherLabel: string | undefined;
  otherDescription: string | undefined;
  multiSelect: boolean;
  active: boolean;
  otherText: string;
  onOtherText: (v: string) => void;
  onToggle?: (checked: boolean) => void;
}): React.JSX.Element {
  const { otherLabel, otherDescription, multiSelect, active, otherText, onOtherText, onToggle } =
    props;
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-sm hover:bg-hover">
      {multiSelect ? (
        <Checkbox
          className="mt-0.5"
          checked={active}
          onCheckedChange={(checked) => {
            onToggle?.(checked === true);
          }}
        />
      ) : (
        <RadioGroupItem className="mt-0.5" value="__other__" />
      )}
      <span className="min-w-0 flex-1">
        <span className="text-fg">{otherLabel ?? OTHER_LABEL_DEFAULT}</span>
        {otherDescription !== undefined && (
          <span className="block text-xs text-fg-muted">{otherDescription}</span>
        )}
        {active && (
          <input
            type="text"
            value={otherText}
            onChange={(e) => {
              onOtherText(e.target.value);
            }}
            placeholder="Type a custom answer…"
            className="mt-1 w-full rounded-md border border-border-strong bg-input-fill px-2 py-1 text-sm outline-none focus:border-state-info"
          />
        )}
      </span>
    </label>
  );
}

function OptionBody(props: { label: string; description?: string }): React.JSX.Element {
  const { label, description } = props;
  return (
    <span className="min-w-0">
      <span className="text-fg">{label}</span>
      {description !== undefined && (
        <span className="block text-xs text-fg-muted">{description}</span>
      )}
    </span>
  );
}
